import aj from "../lib/arcjet.js";
import { isSpoofedBot } from "@arcjet/inspect";
import { ENV } from "../lib/env.js";

const isDev = ENV.NODE_ENV === "development" || ENV.ARCJET_ENV === "development" || !ENV.ARCJET_KEY;

export const arcjetProtection = async (req, res, next) => {
  // In development: skip external Arcjet cloud API call to eliminate 1000ms network latency
  if (isDev) {
    return next();
  }

  try {
    // In production: guard with a 600ms timeout so external network latency NEVER freezes messages
    const arcjetPromise = aj.protect(req);
    const timeoutPromise = new Promise((resolve) =>
      setTimeout(() => resolve({ isTimeout: true }), 600)
    );

    const decision = await Promise.race([arcjetPromise, timeoutPromise]);

    if (decision?.isTimeout) {
      console.warn("Arcjet protection timed out (>600ms) - failing open to preserve responsiveness");
      return next();
    }

    if (decision.isDenied()) {
      if (decision.reason.isRateLimit()) {
        return res
          .status(429)
          .json({ message: "Too many requests. Please try again later." });
      } else if (decision.reason.isBot()) {
        return res
          .status(403)
          .json({ message: "Access denied. Bot traffic is not allowed." });
      } else {
        return res
          .status(403)
          .json({ message: "Access denied by security policy." });
      }
    }

    // check for spoofed bots : bots that try to mimic human
    if (decision.results?.some(isSpoofedBot)) {
      return res.status(403).json({
        message: "Access denied. Spoofed bot traffic is not allowed.",
      });
    }

    next();
  } catch (error) {
    console.error("Arcjet Protection Error (failing open):", error.message);
    return next(); // Fail-open so user messaging is not interrupted by third-party outages
  }
};

