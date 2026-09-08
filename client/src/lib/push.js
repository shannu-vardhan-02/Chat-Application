/**
 * push.js — Client-side Web Push subscription management
 *
 * FLOW:
 *   1. User logs in → connectSocket() → subscribeToPush() is called
 *   2. We check if notifications are already granted
 *   3. If not denied/granted, we request permission
 *   4. We subscribe via pushManager.subscribe() using our VAPID public key
 *   5. We POST the PushSubscription to the server (deduplicated server-side)
 *   6. When a message arrives while the tab is closed, server sends push
 *   7. Service worker receives 'push' event → shows notification
 *   8. Clicking the notification → opens the app (handled in SW)
 *
 * COMPATIBILITY:
 *   - Chrome/Edge: full support
 *   - Firefox: full support
 *   - Safari 16.4+ (iOS 16.4+): supported with a user gesture first
 *   - Older Safari/iOS: not supported → gracefully skipped
 *
 * IMPORTANT: Push subscriptions only work on HTTPS (or localhost).
 *   In development on http://, permission will be denied by the browser.
 *   To test: use the Vite dev server (localhost counts as secure context).
 */

import { axiosInstance } from "./axios";

/**
 * Convert a VAPID public key string to the Uint8Array format
 * required by pushManager.subscribe({ applicationServerKey }).
 *
 * WHY: The browser's PushManager expects the key as a Uint8Array (raw bytes).
 * VAPID keys are stored as URL-safe base64 strings. This converts between the
 * two formats.
 */
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Subscribe this browser to push notifications and register the subscription
 * with our server.
 *
 * Safe to call multiple times — the server deduplicates by endpoint.
 *
 * @returns {Promise<boolean>} true if subscription succeeded, false otherwise
 */
export async function subscribeToPush() {
  // Check all prerequisites
  if (!("serviceWorker" in navigator)) return false;
  if (!("PushManager" in window)) return false;
  if (!("Notification" in window)) return false;

  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    console.warn("[Push] VITE_VAPID_PUBLIC_KEY not set in .env");
    return false;
  }

  try {
    // Step 1: Wait for service worker to be ready
    const registration = await navigator.serviceWorker.ready;

    // Step 2: Request notification permission if not already granted/denied
    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") {
      // User denied or dismissed — don't retry aggressively
      return false;
    }

    // Step 3: Check if we already have an active subscription for this browser
    const existingSubscription = await registration.pushManager.getSubscription();
    if (existingSubscription) {
      // Already subscribed — just make sure the server has it (re-POST for safety)
      await registerSubscriptionWithServer(existingSubscription);
      return true;
    }

    // Step 4: Create a new subscription using our VAPID public key
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true, // required by all browsers — push must show a notification
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    // Step 5: Send the subscription to our server
    await registerSubscriptionWithServer(subscription);

    console.log("[Push] Successfully subscribed to push notifications");
    return true;
  } catch (err) {
    console.warn("[Push] Subscription failed:", err.message);
    return false;
  }
}

/**
 * Register a PushSubscription with the server.
 * The server deduplicates by endpoint so re-calling is safe.
 *
 * @param {PushSubscription} subscription
 */
async function registerSubscriptionWithServer(subscription) {
  await axiosInstance.post("/push/subscribe", {
    subscription: subscription.toJSON(),
  });
}

/**
 * Unsubscribe this browser from push notifications.
 * Called on logout so the device doesn't receive pushes after sign-out.
 */
export async function unsubscribeFromPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      const endpoint = subscription.endpoint;
      // Unsubscribe browser-side first
      await subscription.unsubscribe();
      // Remove from server
      await axiosInstance.delete("/push/unsubscribe", { data: { endpoint } });
    }
  } catch (err) {
    console.warn("[Push] Unsubscribe failed:", err.message);
  }
}
