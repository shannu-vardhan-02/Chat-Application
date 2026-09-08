import User from "../models/user.model.js";
import { ENV } from "../lib/env.js";

/**
 * GET /api/push/vapid-public-key
 *
 * Returns the VAPID public key to the client.
 * The client needs this to create a PushSubscription via pushManager.subscribe().
 *
 * WHY AN ENDPOINT: We could put VITE_VAPID_PUBLIC_KEY in client .env, but
 * fetching it from the server means the client always has the latest key
 * without needing a client redeploy when keys rotate.
 */
export const getVapidPublicKey = (req, res) => {
  if (!ENV.VAPID_PUBLIC_KEY) {
    return res.status(503).json({ message: "Push notifications not configured" });
  }
  res.status(200).json({ publicKey: ENV.VAPID_PUBLIC_KEY });
};

/**
 * POST /api/push/subscribe
 *
 * Saves a PushSubscription to the logged-in user's account.
 * Called once after the browser grants notification permission.
 *
 * Request body: { subscription: PushSubscription }
 *
 * The PushSubscription object from the browser looks like:
 * {
 *   endpoint: "https://fcm.googleapis.com/fcm/send/...",
 *   expirationTime: null,
 *   keys: { p256dh: "...", auth: "..." }
 * }
 *
 * Dedup: if this endpoint is already stored, we don't add a duplicate.
 */
export const subscribe = async (req, res) => {
  try {
    const { subscription } = req.body;
    const userId = req.user._id;

    if (!subscription?.endpoint || !subscription?.keys) {
      return res.status(400).json({ message: "Invalid push subscription" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Check if this endpoint is already stored (prevents duplicates on re-subscribe)
    const alreadyExists = user.pushSubscriptions.some(
      (s) => s.endpoint === subscription.endpoint
    );

    if (!alreadyExists) {
      // Trim to last 10 subscriptions (LRU-style) if at the limit
      const subs = user.pushSubscriptions;
      if (subs.length >= 10) {
        user.pushSubscriptions = [...subs.slice(1), subscription];
      } else {
        user.pushSubscriptions.push(subscription);
      }
      await user.save();
    }

    res.status(201).json({ message: "Subscribed to push notifications" });
  } catch (error) {
    console.error("Error saving push subscription:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

/**
 * DELETE /api/push/unsubscribe
 *
 * Removes a PushSubscription when the user revokes notification permission
 * or explicitly opts out of push notifications.
 *
 * Request body: { endpoint: string }
 */
export const unsubscribe = async (req, res) => {
  try {
    const { endpoint } = req.body;
    const userId = req.user._id;

    if (!endpoint) {
      return res.status(400).json({ message: "endpoint is required" });
    }

    await User.findByIdAndUpdate(userId, {
      $pull: { pushSubscriptions: { endpoint } },
    });

    res.status(200).json({ message: "Unsubscribed from push notifications" });
  } catch (error) {
    console.error("Error removing push subscription:", error);
    res.status(500).json({ message: "Server Error" });
  }
};
