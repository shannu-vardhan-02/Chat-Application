import express from "express";
import { protectRoute } from "../middlewares/auth.middleware.js";
import { getVapidPublicKey, subscribe, unsubscribe } from "../controllers/push.controller.js";

const router = express.Router();

/**
 * GET /api/push/vapid-public-key
 * Returns the VAPID public key for the client to create push subscriptions.
 * This endpoint is public (no auth required) — the key is not sensitive.
 */
router.get("/vapid-public-key", getVapidPublicKey);

/**
 * POST /api/push/subscribe
 * Saves a PushSubscription for the logged-in user (requires auth).
 */
router.post("/subscribe", protectRoute, subscribe);

/**
 * DELETE /api/push/unsubscribe
 * Removes a PushSubscription for the logged-in user (requires auth).
 */
router.delete("/unsubscribe", protectRoute, unsubscribe);

export default router;
