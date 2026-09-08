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

    /**
     * Client-generated idempotency key (UUID v4).
     *
     * WHY: When a send request fails due to a network error, we can't know
     * if the server processed it before the connection dropped. Without an
     * idempotency key, retrying creates a duplicate message.
     *
     * HOW: The client generates clientId = crypto.randomUUID() BEFORE the
     * HTTP request. On the server, if a message with the same clientId already
     * exists, we return the existing message instead of creating a new one.
     *
     * SPARSE INDEX: Old messages (before this field existed) have no clientId.
     * A sparse unique index only enforces uniqueness for documents that HAVE
     * the field — documents without it are simply skipped by the index.
     * This makes the migration fully backward-compatible.
     */
    clientId: {
      type: String,
      sparse: true, // ignore documents where clientId is absent
    },
  },
  {
    timestamps: true,
  },
);

// Index to efficiently fetch all messages between two users (cursor pagination)
messageSchema.index({ senderId: 1, receiverId: 1, createdAt: 1 });

// Sparse unique index for clientId — enforces idempotency without breaking old messages
messageSchema.index({ clientId: 1 }, { unique: true, sparse: true });

const Message = mongoose.model("Message", messageSchema);

export default Message;

