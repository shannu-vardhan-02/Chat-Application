import express from "express";
import mongoose from "mongoose";
import { recentRequests } from "../middlewares/requestTracker.middleware.js";
import { getOnlineUserIds, getTotalSocketCount } from "../lib/socket.js";

const router = express.Router();

/**
 * GET /api/diagnostics
 * Live developer telemetry & system health:
 *   - Database ping latency
 *   - Connected sockets & online user count
 *   - Recent request log with exact millisecond timings
 */
router.get("/", async (req, res) => {
  const startTime = Date.now();

  // 1. Measure database ping
  let dbStatus = "disconnected";
  let dbPingMs = null;
  try {
    if (mongoose.connection.readyState === 1) {
      const dbPingStart = Date.now();
      await mongoose.connection.db.admin().ping();
      dbPingMs = Date.now() - dbPingStart;
      dbStatus = "connected";
    } else {
      dbStatus = ["disconnected", "connected", "connecting", "disconnecting"][
        mongoose.connection.readyState
      ] || "unknown";
    }
  } catch (err) {
    dbStatus = `error: ${err.message}`;
  }

  // 2. Query socket metrics
  const onlineUsers = getOnlineUserIds();
  const totalSockets = getTotalSocketCount();

  const memoryUsage = process.memoryUsage();

  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      status: dbStatus,
      pingMs: dbPingMs,
      host: mongoose.connection.host || null,
      name: mongoose.connection.name || null,
    },
    sockets: {
      totalConnections: totalSockets,
      onlineUsersCount: onlineUsers.length,
      onlineUserIds: onlineUsers,
    },
    memory: {
      heapUsedMb: (memoryUsage.heapUsed / 1024 / 1024).toFixed(1),
      rssMb: (memoryUsage.rss / 1024 / 1024).toFixed(1),
    },
    recentRequests: [...recentRequests].reverse(), // Most recent first
    diagnosticsDurationMs: Date.now() - startTime,
  });
});

export default router;
