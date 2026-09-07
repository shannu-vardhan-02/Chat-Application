import { Server } from "socket.io";
import http from "http";
import express from "express";
import { ENV } from "./env.js";
import { socketAuthMiddleware } from "../middlewares/socket.auth.middleware.js";
import Message from "../models/message.model.js";
import Conversation from "../models/conversation.model.js";
import User from "../models/user.model.js";

const app = express();
const server = http.createServer(app);

// Allowed origins for Socket.IO (mirrors HTTP CORS in server.js)
const socketAllowedOrigins = [
  ENV.CLIENT_URL?.replace(/\/$/, ""),
  "http://localhost:5173",
  "https://chat-application-pearl-five.vercel.app",
].filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const cleanOrigin = origin.replace(/\/$/, "");
      if (
        socketAllowedOrigins.includes(cleanOrigin) ||
        cleanOrigin.endsWith(".vercel.app")
      ) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"), false);
    },
    credentials: true,
  },
});

// Apply JWT authentication middleware to all socket connections
io.use(socketAuthMiddleware);

// Map of userId → socketId for tracking online users.
// NOTE: This is in-memory — Phase 4 will replace with Redis for multi-instance.
const userSocketMap = {}; // { userId: socketId }

// Given a userId, return their current socketId (or undefined if offline)
export function getReceiverSocketId(userId) {
  return userSocketMap[userId];
}

io.on("connection", (socket) => {
  console.log("A user connected:", socket.user.fullName);

  const userId = socket.userId;
  userSocketMap[userId] = socket.id;

  // Broadcast updated online users list to all connected clients
  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  // ── Event: messageDelivered ─────────────────────────────────────────────────
  /**
   * Fired by the RECEIVER's client immediately after it receives a "newMessage"
   * socket event. This upgrades the message status from "sent" → "delivered".
   *
   * Flow:
   *   1. Receiver client gets "newMessage" → renders it → emits "messageDelivered"
   *   2. Server updates Message.status = "delivered" in DB
   *   3. Server emits "messageStatusUpdate" to the SENDER's socket
   *   4. Sender's UI ticks update: ✓ → ✓✓ (grey)
   *
   * Payload from client: { messageId, senderId }
   */
  socket.on("messageDelivered", async ({ messageId, senderId }) => {
    try {
      // Update in DB (only upgrade — never downgrade)
      const updated = await Message.findOneAndUpdate(
        { _id: messageId, status: "sent" }, // only upgrade from "sent"
        { status: "delivered" },
        { new: true },
      );

      if (!updated) return; // already delivered or read — nothing to do

      // Notify the sender so their UI can update the tick
      const senderSocketId = getReceiverSocketId(senderId);
      if (senderSocketId) {
        io.to(senderSocketId).emit("messageStatusUpdate", {
          messageId,
          status: "delivered",
        });
      }
    } catch (err) {
      console.error("Error in messageDelivered:", err.message);
    }
  });

  // ── Event: markRead ──────────────────────────────────────────────────────────
  /**
   * Fired by the RECEIVER's client when they open a conversation (i.e. they
   * are actively reading messages). Upgrades all unread messages from the
   * sender to "read".
   *
   * Flow:
   *   1. Receiver opens chat with User A → emits "markRead" { senderId: A._id }
   *   2. Server bulk-updates all messages (sender=A, receiver=me, status≠read)
   *   3. Server resets Conversation.unreadCount for the receiver to 0
   *   4. Server emits "messagesRead" to User A's socket (the sender)
   *   5. Sender's UI: grey ✓✓ → cyan ✓✓ for all read messages
   *
   * Why bulk-update? Because the receiver may have 20 unread messages —
   * emitting 20 individual "messageDelivered" events would be wasteful.
   * One "markRead" call handles them all atomically.
   *
   * Payload from client: { senderId }
   */
  socket.on("markRead", async ({ senderId }) => {
    try {
      const receiverId = userId; // the socket owner is the receiver

      // Bulk-update all unread messages from senderId → receiverId to "read"
      await Message.updateMany(
        {
          senderId,
          receiverId,
          status: { $ne: "read" }, // don't re-update already-read messages
        },
        { status: "read" },
      );

      // Reset the receiver's unread count in the Conversation document
      await Conversation.findOneAndUpdate(
        { participants: { $all: [senderId, receiverId] } },
        { $set: { [`unreadCount.${receiverId}`]: 0 } },
      );

      // Tell the original sender that their messages have been read
      const senderSocketId = getReceiverSocketId(senderId);
      if (senderSocketId) {
        io.to(senderSocketId).emit("messagesRead", {
          readBy: receiverId, // who read them
          senderId,           // which sender's messages were read
        });
      }
    } catch (err) {
      console.error("Error in markRead:", err.message);
    }
  });

  // ── Event: typing ────────────────────────────────────────────────────────────
  /**
   * Fired by the SENDER's client when they start typing in the input box.
   * The server simply relays this to the receiver — no DB writes needed.
   *
   * Typing indicators are ephemeral (in-memory only). If the server restarts
   * the indicator disappears — this is fine and expected behavior.
   *
   * Flow:
   *   1. Sender types in input → client emits "typing" { receiverId }
   *   2. Server relays "typing" { senderId } to receiver's socket
   *   3. Receiver's UI shows "Alice is typing…"
   *
   * Payload from client: { receiverId }
   */
  socket.on("typing", ({ receiverId }) => {
    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("typing", { senderId: userId });
    }
  });

  // ── Event: stopTyping ────────────────────────────────────────────────────────
  /**
   * Fired when the sender stops typing (input cleared, message sent, or
   * 1.5s debounce timeout reached on the client).
   * Relayed to the receiver so they can hide the typing indicator.
   *
   * Payload from client: { receiverId }
   */
  socket.on("stopTyping", ({ receiverId }) => {
    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("stopTyping", { senderId: userId });
    }
  });

  // ── Event: disconnect ────────────────────────────────────────────────────────
  /**
   * Phase 2 addition: on disconnect we persist the user's lastSeen timestamp
   * to the DB so the chat header can show "last seen X ago".
   */
  socket.on("disconnect", async () => {
    console.log("A user disconnected:", socket.user.fullName);
    delete userSocketMap[userId];

    // Persist lastSeen — fire-and-forget (don't block the disconnect handler)
    User.findByIdAndUpdate(userId, { lastSeen: new Date() }).catch((err) =>
      console.warn("Failed to update lastSeen:", err.message)
    );

    // Broadcast updated online users list
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  });
});

export { io, app, server };
