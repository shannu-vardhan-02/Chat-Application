import crypto from "crypto";

// Circular in-memory buffer storing recent request metrics for /api/diagnostics
const MAX_RECENT_REQUESTS = 30;
export const recentRequests = [];

/**
 * Request Tracking & Developer Telemetry Middleware
 * ------------------------------------------------
 * Tracks every incoming HTTP request:
 *   1. Generates a unique requestId (e.g. req_8f2a1b)
 *   2. Attaches X-Request-Id and X-Response-Time headers safely before headers are sent
 *   3. Logs incoming request start and completion with exact millisecond duration
 *   4. Emits a bold warning if any request takes longer than 400ms
 *   5. Keeps an in-memory buffer of recent requests for the /api/diagnostics endpoint
 */
export const requestTracker = (req, res, next) => {
  // Generate concise unique request ID
  const reqId = `req_${crypto.randomBytes(4).toString("hex")}`;
  req.reqId = reqId;
  res.setHeader("X-Request-Id", reqId);

  const startTime = process.hrtime.bigint();
  const startTimestamp = new Date().toISOString();

  // Attach X-Response-Time right before headers are sent (handles res.writeHead & res.send)
  const setResponseTimeHeader = () => {
    if (!res.headersSent) {
      const endTime = process.hrtime.bigint();
      const durationMs = Number((endTime - startTime) / 1000000n);
      res.setHeader("X-Response-Time", `${durationMs.toFixed(2)}ms`);
    }
  };

  const originalWriteHead = res.writeHead;
  res.writeHead = function (...args) {
    setResponseTimeHeader();
    return originalWriteHead.apply(this, args);
  };

  const originalEnd = res.end;
  res.end = function (...args) {
    setResponseTimeHeader();
    return originalEnd.apply(this, args);
  };

  // Log incoming request
  console.log(`[REQ ->] ${req.method} ${req.originalUrl || req.url} (${reqId})`);

  // Intercept response completion for logging and metrics recording
  res.on("finish", () => {
    const endTime = process.hrtime.bigint();
    const durationMs = Number((endTime - startTime) / 1000000n);
    const status = res.statusCode;
    const isSlow = durationMs > 400;

    // Log completion
    const logPrefix = isSlow ? "⚠️ [SLOW REQ]" : "[REQ <-]";
    console.log(
      `${logPrefix} ${req.method} ${req.originalUrl || req.url} ${status} in ${durationMs.toFixed(
        1
      )}ms (${reqId})`
    );

    // Record into recent request buffer for developer inspection
    if (recentRequests.length >= MAX_RECENT_REQUESTS) {
      recentRequests.shift();
    }
    recentRequests.push({
      reqId,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: status,
      durationMs: Number(durationMs.toFixed(2)),
      timestamp: startTimestamp,
      isSlow,
    });
  });

  next();
};
