import Message from "../models/message.model.js";
import User from "../models/user.model.js";
import Conversation from "../models/conversation.model.js";
import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Given a new message document, upsert the Conversation between sender and
 * receiver. This is the key Phase 1 change:
 *
 * BEFORE: getAllChats did a full Message scan (O(N)) to build the sidebar.
 * AFTER:  We keep a lightweight Conversation doc in sync, so getAllChats is
 *         a simple O(1) indexed lookup.
 *
 * The logic:
 *   1. Find a conversation where BOTH sender and receiver are participants.
 *   2. If it exists → update lastMessage, lastMessageText, lastMessageAt,
 *      and increment unreadCount for the receiver.
 *   3. If it doesn't exist → create one (first message between these users).
 *
 * We use findOneAndUpdate with upsert: true so this is a single atomic DB
 * operation regardless of whether it's a new or existing conversation.
 */
/**
 * Upserts the Conversation document after a message is sent.
 *
 * ── Why the old findOneAndUpdate + $setOnInsert approach failed ──────────────
 *
 *   Original code used:
 *     findOneAndUpdate(
 *       { participants: { $all: [A, B] } },   ← filter with $all operator
 *       { $setOnInsert: { participants: [A, B] } }  ← also sets participants
 *     )
 *
 *   MongoDB error: "path 'participants' is matched twice"
 *
 *   WHY: When doing an upsert, MongoDB synthesises the insert document from
 *   both the filter AND the update operators. Because $all is in the filter,
 *   MongoDB tries to infer `participants` from it. $setOnInsert ALSO tries to
 *   set `participants`. Two sources → conflict → error code 54.
 *
 * ── Fix: two-step find → update OR create ───────────────────────────────────
 *
 *   Step 1: findOne with $all (safe — read-only, no upsert inference)
 *   Step 2a: updateOne by _id (no field inference issue — _id is unambiguous)
 *   Step 2b: create() if no conversation exists yet (explicit, no inference)
 *
 *   Cost: one extra DB round-trip per message sent. At ≤1k users this is
 *   negligible. Phase 4 (Redis) removes the need for this pattern entirely
 *   by pre-caching conversation IDs.
 */
async function upsertConversation(message) {
  const { senderId, receiverId, text, _id } = message;

  // Denormalized preview text for the sidebar (avoids a JOIN on every render)
  const preview = text ? text.slice(0, 60) : "[Photo]";

  // Step 1: Find any existing conversation between these two users
  const existing = await Conversation.findOne({
    participants: { $all: [senderId, receiverId] },
  });

  if (existing) {
    // Step 2a: Conversation exists — update its last-message metadata
    // We update by _id so there is NO field-inference ambiguity.
    await Conversation.updateOne(
      { _id: existing._id },
      {
        $set: {
          lastMessage: _id,
          lastMessageText: preview,
          lastMessageAt: message.createdAt,
        },
        // Atomically increment the receiver's unread count.
        // Map field update uses dot notation: "unreadCount.<userId>"
        $inc: { [`unreadCount.${receiverId}`]: 1 },
      },
    );
  } else {
    // Step 2b: First message between these two users — create a Conversation.
    // Explicit create() is clean and unambiguous — no upsert inference.
    await Conversation.create({
      participants: [senderId, receiverId],
      lastMessage: _id,
      lastMessageText: preview,
      lastMessageAt: message.createdAt,
      unreadCount: new Map([[receiverId.toString(), 1]]),
    });
  }
}


// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * GET /api/messages/contacts
 * Returns every user except the logged-in user.
 * Used by the "Contacts" tab to start a new chat with anyone.
 */
export const getAllContacts = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;

    // fetch all users except the logged-in user
    const filteredUsers = await User.find({
      _id: { $ne: loggedInUserId },
    }).select("-password"); // exclude password field

    res.status(200).json(filteredUsers);
  } catch (error) {
    console.log("Error fetching contacts:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

/**
 * GET /api/messages/chats
 * Returns the logged-in user's conversations sorted by most recent first.
 *
 * Phase 1 rewrite:
 *   OLD approach: Message.find({ $or: [senderId, receiverId] })
 *     → Full collection scan. Loads ALL messages. Returns sender info only.
 *
 *   NEW approach: Conversation.find({ participants: userId })
 *     → Single indexed lookup. Returns conversation metadata including:
 *       - lastMessageText (for sidebar preview)
 *       - lastMessageAt (for sorting)
 *       - unreadCount (for badges — Phase 2)
 *       - the other participant's user info (name, avatar, etc.)
 */
export const getAllChats = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;

    // Step 1: Find all conversations where the logged-in user is a participant.
    //         The index on `participants` makes this fast.
    const conversations = await Conversation.find({
      participants: loggedInUserId,
    })
      // Step 2: Populate both participant user objects (name, profilePic etc.)
      //         We exclude passwords — never send them to the client.
      .populate("participants", "-password")
      // Step 3: Sort by most recent message (newest conversation on top)
      .sort({ lastMessageAt: -1 });

    // Step 4: For each conversation, figure out which participant is the
    //         "other" user (not the logged-in user) and attach useful metadata.
    const formattedConversations = conversations
      .map((conv) => {
        const otherUser = conv.participants.find(
          (p) => p && p._id && p._id.toString() !== loggedInUserId.toString(),
        );

        if (!otherUser) return null;

        return {
          // Spread the other user's fields (fullName, profilePic, email, etc.)
          ...otherUser.toObject(),
          _id: otherUser._id.toString(),
          // Attach conversation-level metadata that the client needs
          conversationId: conv._id.toString(),
          lastMessageText: conv.lastMessageText,
          lastMessageAt: conv.lastMessageAt,
          // How many unread messages does the logged-in user have in this chat?
          unreadCount: conv.unreadCount?.get(loggedInUserId.toString()) || 0,
        };
      })
      .filter(Boolean);

    res.status(200).json(formattedConversations);
  } catch (error) {
    console.log("Error fetching chats:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

/**
 * GET /api/messages/:id?before=<ISO-timestamp>&limit=<n>
 *
 * Returns the most recent `limit` messages between the two users.
 * Supports cursor-based pagination via the `before` query param.
 *
 * ── Why cursor-based and not offset (skip)? ──────────────────────────────────
 *
 *   OFFSET approach:  Message.find(...).skip(page * 30).limit(30)
 *     ❌ MongoDB must scan and discard N skipped documents (O(N) work)
 *     ❌ If new messages arrive while paginating, page boundaries shift
 *        and you see duplicates or miss messages.
 *
 *   CURSOR approach:  Message.find({ ..., createdAt: { $lt: cursor } }).limit(30)
 *     ✅ Jumps directly to the cursor position using the index (O(log N))
 *     ✅ Stable: new messages at the bottom never affect older page results
 *     ✅ Works perfectly with our existing compound index:
 *        { senderId, receiverId, createdAt }
 *
 * ── How the cursor works ─────────────────────────────────────────────────────
 *
 *   1. Initial load (no `before` param):
 *      → Fetch the LATEST `limit` messages (sort DESC, take limit, reverse)
 *      → Return { messages: [...], hasMore: true/false }
 *
 *   2. Load more (scroll to top, `before` = createdAt of oldest visible msg):
 *      → Fetch the next `limit` messages BEFORE that timestamp
 *      → Prepend them to the existing list in the client
 *
 * ── Response format ───────────────────────────────────────────────────────────
 *   {
 *     messages: Message[],  // ascending order (oldest first), ready to render
 *     hasMore: boolean,     // true if there are older messages the client hasn't loaded
 *   }
 */
export const getMessagesByUserId = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const { id: userToChatId } = req.params;

    // Parse pagination params
    // `before` is the createdAt ISO string of the oldest message the client has.
    // `limit` defaults to 30, capped at 50 to prevent abuse.
    const { before } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 30, 50);

    // Build the base filter — find messages between these two users
    const filter = {
      $or: [
        { senderId: loggedInUserId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: loggedInUserId },
      ],
    };

    // If a cursor is provided, only fetch messages OLDER than that timestamp.
    // This is the core of cursor-based pagination:
    //   "Give me messages created before <timestamp>"
    if (before) {
      filter.createdAt = { $lt: new Date(before) };
    }

    // Step 1: Fetch `limit` messages in DESCENDING order (newest first).
    //         This is the most efficient query because we:
    //           a) Use the compound index (senderId + receiverId + createdAt)
    //           b) Immediately limit the result set — no large scan
    const rawMessages = await Message.find(filter)
      .sort({ createdAt: -1 }) // newest first (descending)
      .limit(limit);

    // Step 2: Reverse to ascending order (oldest first) for rendering.
    //         We can't sort ASC + limit because we'd always get the oldest N,
    //         not the newest N. So we sort DESC, take the page, then reverse.
    const messages = rawMessages.reverse();

    // Step 3: Determine if there are even older messages.
    //         hasMore = true means the client should show a "Load more" trigger.
    //         If we got exactly `limit` messages back, there are probably more.
    //         If we got fewer, we've reached the beginning of the conversation.
    const hasMore = rawMessages.length === limit;

    res.status(200).json({ messages, hasMore });
  } catch (error) {
    console.log("Error fetching messages:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

/**
 * POST /api/messages/send/:id
 * Saves a new message and keeps the Conversation document in sync.
 *
 * Phase 1 additions vs. the old version:
 *   1. message.status = "sent" automatically (from schema default)
 *   2. After saving, we call upsertConversation() to keep the sidebar data fresh
 *   3. Socket.IO delivery is unchanged — receiver gets the message in real time
 */
export const sendMessage = async (req, res) => {
  try {
    const { text, image } = req.body;
    const senderId = req.user._id;
    const { id: receiverId } = req.params;

    if (!text && !image) {
      return res.status(400).json({ message: "Message must have text or image" });
    }
    if (senderId.equals(receiverId)) {
      return res.status(400).json({ message: "Cannot send messages to yourself." });
    }

    // Validate receiver exists
    const receiverExists = await User.exists({ _id: receiverId });
    if (!receiverExists) {
      return res.status(404).json({ message: "Recipient not found" });
    }

    let imageUrl;
    if (image) {
      // The client now uploads directly to Cloudinary and sends us the URL.
      // We only accept a valid https:// Cloudinary URL — never raw base64.
      if (image.startsWith("https://res.cloudinary.com/")) {
        imageUrl = image;
      } else {
        return res.status(400).json({ message: "Invalid image URL" });
      }
    }

    // ── Step 1: Save the message ──────────────────────────────────────────
    const newMessage = new Message({
      senderId,
      receiverId,
      text,
      image: imageUrl,
      // status: "sent" is default in schema
    });

    await newMessage.save();

    // ── Step 2: Instant Real-time delivery ──────────────────────────────────
    // Deliver immediately to ALL active tabs of the receiver via their room.
    // Zero latency: does not wait for conversation upsert!
    io.to(String(receiverId)).emit("newMessage", newMessage);

    // ── Step 3: Immediate HTTP response to sender ──────────────────────────
    res.status(201).json(newMessage);

    // ── Step 4: Asynchronous Conversation Sync ─────────────────────────────
    // Run in background without blocking the HTTP response or socket emission.
    upsertConversation(newMessage).catch((err) =>
      console.error("Async upsertConversation error:", err.message)
    );
  } catch (error) {
    console.log("Error sending message:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

/**
 * DELETE /api/messages/chat/:id
 * Deletes all messages between the logged-in user and a contact.
 *
 * Phase 1 addition: also deletes the Conversation document, so it
 * disappears from the sidebar immediately.
 */
export const deleteChat = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const { id: contactId } = req.params;

    // Collect all Cloudinary image URLs from this chat before deleting
    const chatMessages = await Message.find({
      $or: [
        { senderId: loggedInUserId, receiverId: contactId },
        { senderId: contactId, receiverId: loggedInUserId },
      ],
      image: { $exists: true, $ne: null },
    }).select("image");

    // ── Step 1: Delete all messages from DB ───────────────────────────────
    await Message.deleteMany({
      $or: [
        { senderId: loggedInUserId, receiverId: contactId },
        { senderId: contactId, receiverId: loggedInUserId },
      ],
    });

    // ── Step 2: Delete the Conversation document ──────────────────────────
    // This removes the chat from the sidebar (getAllChats won't return it anymore).
    // Phase 1 addition — previously we only deleted messages.
    await Conversation.findOneAndDelete({
      participants: { $all: [loggedInUserId, contactId] },
    });

    // ── Step 3: Async Cloudinary image cleanup ────────────────────────────
    // Fire-and-forget so the response is fast. If Cloudinary cleanup fails
    // it logs a warning but doesn't affect the user.
    if (chatMessages.length > 0) {
      const publicIds = chatMessages
        .map((msg) => {
          try {
            // Extract public_id from URL: .../upload/vXXX/<folder/public_id>.ext
            const url = msg.image;
            const uploadIndex = url.indexOf("/upload/");
            if (uploadIndex === -1) return null;
            // Remove version segment (v12345/) if present
            const afterUpload = url.substring(uploadIndex + 8);
            const withoutVersion = afterUpload.replace(/^v\d+\//, "");
            // Remove file extension
            const publicId = withoutVersion.replace(/\.[^/.]+$/, "");
            return publicId;
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      if (publicIds.length > 0) {
        cloudinary.api.delete_resources(publicIds).catch((err) =>
          console.warn("Cloudinary cleanup warning:", err.message)
        );
      }
    }

    res.status(200).json({ message: "Chat deleted successfully" });
  } catch (error) {
    console.log("Error deleting chat:", error);
    res.status(500).json({ message: "Server Error" });
  }
};
