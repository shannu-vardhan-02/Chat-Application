import mongoose from "mongoose";

/**
 * Message Model
 * -------------
 * Represents a single message between two users.
 *
 * Status lifecycle:
 *   "sent"      — Default. Message has been saved to the DB.
 *                 The server confirmed it exists. (single ✓)
 *
 *   "delivered" — The receiver's Socket.IO client has received the event.
 *                 Set in Phase 2 via a socket ACK from the receiver. (grey ✓✓)
 *
 *   "read"      — The receiver has opened the conversation and seen the message.
 *                 Set in Phase 2 when the receiver emits a "markRead" event. (cyan ✓✓)
 */
const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: {
      type: String,
      trim: true,
      maxLength: 2000,
    },
    image: {
      type: String,
    },

    // Delivery/read tracking — drives ✓ tick UI in the client
    status: {
      type: String,
      enum: ["sent", "delivered", "read"],
      default: "sent",
    },
  },
  {
    timestamps: true,
  },
);

// Index to efficiently fetch all messages between two users
messageSchema.index({ senderId: 1, receiverId: 1, createdAt: 1 });

const Message = mongoose.model("Message", messageSchema);

export default Message;

