import mongoose from "mongoose";

/**
 * Conversation Model
 * ------------------
 * A Conversation document represents the relationship (chat thread) between
 * exactly two users. It acts as a lightweight index so we never have to scan
 * the entire messages collection just to build the sidebar.
 *
 * Why is this better than the old approach?
 *   Old: Message.find({ $or: [senderId, receiverId] })  → O(N) full scan
 *   New: Conversation.find({ participants: userId })     → O(1) indexed lookup
 *
 * Fields:
 *   participants    — Array of exactly 2 User ObjectIds.
 *                     Indexed so we can quickly find "all conversations for user X".
 *
 *   lastMessage     — Reference to the most recent Message document.
 *                     Used to populate the preview text in the sidebar.
 *
 *   lastMessageText — Denormalized snapshot of the last message's text content.
 *                     We store this here so the sidebar render does NOT need a
 *                     second DB lookup (populate) just to show a preview.
 *                     If the last message is an image, this is "[Photo]".
 *
 *   lastMessageAt   — Timestamp of the last message. Used to sort the sidebar
 *                     by recency (newest conversation on top).
 *
 *   unreadCount     — A Map of { userId (string) → Number }.
 *                     Tracks how many unread messages each participant has.
 *                     Example: { "abc123": 3, "def456": 0 }
 *                     Phase 2 will use this to show unread badges.
 */
const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],

    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },

    // Denormalized preview text — avoids extra DB round-trip on sidebar render
    lastMessageText: {
      type: String,
      default: "",
    },

    // Used for sorting conversations by recency
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },

    // Map: userId (string) → unread message count for that user
    unreadCount: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

// Index so Conversation.find({ participants: userId }) is fast
conversationSchema.index({ participants: 1 });

// Compound index for sorting by recency within a user's conversations
conversationSchema.index({ participants: 1, lastMessageAt: -1 });

const Conversation = mongoose.model("Conversation", conversationSchema);
export default Conversation;
