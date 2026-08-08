import Message from "../models/message.model.js";
import User from "../models/user.model.js";
import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";

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

// fetch all messages between the logged-in user and another user (identified by their ID in the route parameter)
// route : GET /api/messages/:id
export const getMessagesByUserId = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const { id: userToChatId } = req.params;

    const messages = await Message.find({
      $or: [
        // i send u msg
        { senderId: loggedInUserId, receiverId: userToChatId },
        // u send me msg
        { senderId: userToChatId, receiverId: loggedInUserId },
      ],
    }).sort({ createdAt: 1 }); // Sort messages by creation time (oldest first)
    res.status(200).json(messages);
  } catch (error) {
    console.log("Error fetching messages:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// send a message from the logged-in user to another user (identified by their ID in the route parameter)
// route : POST /api/messages/send/:id
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

    // create a new message document - this is the message model schema
    const newMessage = new Message({
      senderId,
      receiverId,
      text,
      image: imageUrl,
    });

    // save the message to the database
    await newMessage.save();

    // Real-time delivery: if receiver is online, emit the message directly to their socket
    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", newMessage);
    }

    res.status(201).json(newMessage);
  } catch (error) {
    console.log("Error sending message:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

export const getAllChats = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;

    // Fetch all messages where the logged-in user is either the sender or receiver
    const messages = await Message.find({
      $or: [{ senderId: loggedInUserId }, { receiverId: loggedInUserId }],
    }).sort({ createdAt: -1 }); // Sort messages by creation time (newest first)

    // Extract unique user IDs of chat partners from the messages
    // We do it by checking if the logged-in user is the sender or receiver and then taking the other ID as the chat partner
    const chatPartnerIds = [
      ...new Set(
        messages.map((msg) =>
          msg.senderId.toString() === loggedInUserId.toString()
            ? msg.receiverId.toString()
            : msg.senderId.toString(),
        ),
      ),
    ];

    // Fetch user details of the chat partners to display in the chat sidebar
    const chatPartners = await User.find({
      _id: { $in: chatPartnerIds },
    }).select("-password");

    res.status(200).json(chatPartners);
  } catch (error) {
    console.log("Error fetching chats:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// Delete all messages between the logged-in user and a specific contact
// route: DELETE /api/messages/chat/:id
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

    // Delete the messages from DB first
    await Message.deleteMany({
      $or: [
        { senderId: loggedInUserId, receiverId: contactId },
        { senderId: contactId, receiverId: loggedInUserId },
      ],
    });

    // Asynchronously clean up Cloudinary images (fire-and-forget so response is fast)
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
