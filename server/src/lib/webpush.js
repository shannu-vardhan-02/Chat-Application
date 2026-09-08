/**
 * webpush.js — Web Push / VAPID configuration
 *
 * WHAT IS VAPID:
 *   Voluntary Application Server Identification. A public/private key pair
 *   that identifies our server to browser push services (Google FCM, Mozilla
 *   Autopush, Apple APNs, etc.). The public key is shared with the client to
 *   subscribe; the private key signs every push message we send.
 *
 * KEY GENERATION:
 *   Keys were generated once via `web-push generate-vapid-keys` and stored
 *   in .env. They should NOT be regenerated unless you're rotating credentials
 *   (rotation requires all existing push subscriptions to be re-created).
 *
 * HOW PUSH WORKS:
 *   1. Client subscribes: navigator.serviceWorker.pushManager.subscribe({
 *        userVisibleOnly: true,
 *        applicationServerKey: VAPID_PUBLIC_KEY
 *      })
 *   2. Browser returns a PushSubscription object containing:
 *        endpoint (a URL specific to this browser/device)
 *        keys.p256dh  (encryption key)
 *        keys.auth    (auth secret)
 *   3. Client POSTs subscription to our server → stored on User doc
 *   4. Server calls webpush.sendNotification(subscription, payload) to push
 *   5. Browser's push service delivers it to the device (even if app is closed)
 *   6. Service worker receives 'push' event → shows notification
 */

import webpush from "web-push";
import { ENV } from "./env.js";

if (ENV.VAPID_PUBLIC_KEY && ENV.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    ENV.VAPID_SUBJECT || "mailto:admin@charchalu.app",
    ENV.VAPID_PUBLIC_KEY,
    ENV.VAPID_PRIVATE_KEY
  );
} else {
  console.warn("[WebPush] VAPID keys not configured — push notifications disabled");
}

/**
 * Send a push notification to a single subscription.
 *
 * @param {Object} subscription  — PushSubscription from client (endpoint, keys)
 * @param {Object} payload       — Notification payload
 * @param {string} payload.title — Notification title
 * @param {string} payload.body  — Notification body text
 * @param {Object} [payload.data] — Extra data passed to notificationclick handler
 * @returns {Promise<void>}
 */
export async function sendPushNotification(subscription, payload) {
  if (!ENV.VAPID_PUBLIC_KEY) return; // push not configured in this environment

  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: payload.title || "Charchalu",
        body: payload.body || "New message",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: payload.tag || "chat-message", // collapses multiple notifications from same sender
        renotify: true, // vibrate/sound even if collapsed
        data: payload.data || {},
      }),
      {
        TTL: 60 * 60, // 1 hour — if device is offline, deliver within 1 hour
        urgency: "high", // delivers immediately (vs. "normal" which batches)
      }
    );
  } catch (err) {
    // 410 Gone = subscription expired/unsubscribed — caller should remove it from DB
    if (err.statusCode === 410 || err.statusCode === 404) {
      throw Object.assign(err, { subscriptionExpired: true });
    }
    // Other errors: log but don't crash the message flow
    console.warn("[WebPush] Push delivery failed:", err.message);
  }
}

export default webpush;
