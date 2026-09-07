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

/**
 * Multi-Socket Online Presence & Room Tracking
 * --------------------------------------------
 * A user may have multiple tabs open or switch between devices.
 * Storing only 1 socket ID per user caused disconnect race conditions
 * where closing 1 tab marked the user offline across all active tabs!
 *
 * Solution:
 *   - Map<userId, Set<socketId>> tracks all active sockets for each user.
 *   - socket.join(userId) allows io.to(userId).emit(...) to broadcast
 *     instantly to all tabs/devices belonging to that user.
 */
const userSockets = new Map(); // Map<string, Set<string>>

export function getOnlineUserIds() {
  return Array.from(userSockets.keys());
}

export function getTotalSocketCount() {
  let count = 0;
  for (const socketSet of userSockets.values()) {
    count += socketSet.size;
  }
  return count;
}

export function isUserOnline(userId) {
  const sockets = userSockets.get(String(userId));
  return Boolean(sockets && sockets.size > 0);
}

// Backward-compatible helper returning any active socket ID (or undefined)
export function getReceiverSocketId(userId) {
  const sockets = userSockets.get(String(userId));
  if (!sockets || sockets.size === 0) return undefined;
  return sockets.values().next().value;
}

io.on("connection", (socket) => {
  const userId = socket.userId;
  console.log(`[SOCKET CONNECT] User: ${socket.user.fullName} (${userId}) | Socket: ${socket.id}`);

  // Join the user's personal room so io.to(userId) reaches all their tabs
  socket.join(userId);

  // Track socket in our userSockets map
  const isFirstConnection = !userSockets.has(userId);
  if (isFirstConnection) {
    userSockets.set(userId, new Set());
  }
  userSockets.get(userId).add(socket.id);

  const onlineList = Array.from(userSockets.keys());

  // Guarantee the connecting socket gets the current online list immediately
  socket.emit("getOnlineUsers", onlineList);

  // If this user just came online, broadcast the updated list to all other clients
  if (isFirstConnection) {
    socket.broadcast.emit("getOnlineUsers", onlineList);
  }

  // ── Event: messageDelivered ─────────────────────────────────────────────────
  socket.on("messageDelivered", async ({ messageId, senderId }) => {
    try {
      const updated = await Message.findOneAndUpdate(
        { _id: messageId, status: "sent" },
        { status: "delivered" },
        { new: true }
      );

      if (!updated) return;

      // Notify ALL active sockets/tabs of the sender
      io.to(String(senderId)).emit("messageStatusUpdate", {
        messageId,
        status: "delivered",
      });
    } catch (err) {
      console.error("Error in messageDelivered:", err.message);
    }
  });

  // ── Event: markRead ──────────────────────────────────────────────────────────
  socket.on("markRead", async ({ senderId }) => {
    try {
      const receiverId = userId;

      // Bulk-update all unread messages from senderId → receiverId to "read"
      await Message.updateMany(
        {
          senderId,
          receiverId,
          status: { $ne: "read" },
        },
        { status: "read" }
      );

      // Reset the receiver's unread count in Conversation document
      await Conversation.findOneAndUpdate(
        { participants: { $all: [senderId, receiverId] } },
        { $set: { [`unreadCount.${receiverId}`]: 0 } }
      );

      // Tell all active tabs of the original sender that their messages are read
      io.to(String(senderId)).emit("messagesRead", {
        readBy: receiverId,
        senderId,
      });
    } catch (err) {
      console.error("Error in markRead:", err.message);
    }
  });

  // ── Event: typing ────────────────────────────────────────────────────────────
  socket.on("typing", ({ receiverId }) => {
    // Deliver to all tabs of the receiver
    socket.to(String(receiverId)).emit("typing", { senderId: userId });
  });

  // ── Event: stopTyping ────────────────────────────────────────────────────────
  socket.on("stopTyping", ({ receiverId }) => {
    socket.to(String(receiverId)).emit("stopTyping", { senderId: userId });
  });

  // ── Event: disconnect ────────────────────────────────────────────────────────
  socket.on("disconnect", async () => {
    console.log(`[SOCKET DISCONNECT] User: ${socket.user.fullName} (${userId}) | Socket: ${socket.id}`);

    const userSocketSet = userSockets.get(userId);
    if (userSocketSet) {
      userSocketSet.delete(socket.id);

      // Only mark the user offline when ALL of their sockets/tabs are closed
      if (userSocketSet.size === 0) {
        userSockets.delete(userId);

        // Persist lastSeen to DB
        User.findByIdAndUpdate(userId, { lastSeen: new Date() }).catch((err) =>
          console.warn("Failed to update lastSeen:", err.message)
        );

        // Broadcast to remaining connected users
        io.emit("getOnlineUsers", Array.from(userSockets.keys()));
      }
    }
  });
});

export { io, app, server };
