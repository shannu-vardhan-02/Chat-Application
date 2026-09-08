import mongoose from "mongoose";

/**
 * User Model
 * ----------
 * Phase 2 adds the `lastSeen` field.
 *
 * lastSeen:
 *   Stored as a Date. Updated every time the user's Socket.IO connection
 *   drops (i.e. they close the tab / go offline). When the user is online
 *   we show the green dot; when offline we show "last seen X ago" using
 *   this field.
 *
 *   Why NOT store "online: Boolean"?
 *   - A boolean goes stale if the server crashes (no disconnect event fires).
 *   - A timestamp lets us compute "last seen 5 min ago" for better UX.
 */
const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
    },
    fullName: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: true,
      minLength: 6,
    },
    profilePic: {
      type: String,
      default: "",
    },

    // Phase 2: updated to Date.now() on every socket disconnect
    lastSeen: {
      type: Date,
      default: null,
    },

    /**
     * Phase F: Web Push subscriptions for this user.
     *
     * Each entry is a PushSubscription object from the browser:
     * {
     *   endpoint: "https://fcm.googleapis.com/fcm/send/...",
     *   expirationTime: null,
     *   keys: {
     *     p256dh: "...",  // public key for payload encryption
     *     auth: "..."     // authentication secret
     *   }
     * }
     *
     * WHY AN ARRAY: Users can have multiple devices (phone, laptop, tablet).
     * Each device/browser has its own unique push subscription endpoint.
     * We send a notification to ALL subscriptions on message receipt.
     *
     * EXPIRY: When a push delivery returns 410 (Gone) or 404, the subscription
     * has expired and we remove it from this array.
     *
     * LIMIT: Capped at 10 subscriptions per user to prevent abuse.
     */
    pushSubscriptions: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
      validate: {
        validator: (arr) => arr.length <= 10,
        message: "Too many push subscriptions (max 10 per user)",
      },
    },
  },
  {
    timestamps: true,
  },
);

const User = mongoose.model("User", userSchema);
export default User;

