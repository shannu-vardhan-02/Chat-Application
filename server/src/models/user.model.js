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
  },
  {
    timestamps: true,
  },
);

const User = mongoose.model("User", userSchema);
export default User;

