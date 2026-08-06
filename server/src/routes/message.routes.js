import express from "express";
import {
  getAllContacts,
  getMessagesByUserId,
  sendMessage,
  getAllChats,
  deleteChat,
} from "../controllers/message.controller.js";
import { protectRoute } from "../middlewares/auth.middleware.js";
import { arcjetProtection } from "../middlewares/arcjet.middleware.js";

const router = express.Router();

// these middleware execute in order - so requests get rate-limited first, then authenticated
// this is more efficient since unauthenticated requests get blocked by rate limiting before hitting the auth middleware.
router.use(arcjetProtection, protectRoute);
// Apply authentication middleware to all routes in this router because all routes require the user to be logged in, because we cannot give these msgs to everyone. Only logged in users can see their contacts and messages.

router.get("/contacts", getAllContacts);
router.get("/chats", getAllChats);
router.get("/:id", getMessagesByUserId);

router.post("/send/:id", sendMessage); // Send a message to a user by their ID
router.delete("/chat/:id", deleteChat); // Delete all messages with a specific user
export default router;
