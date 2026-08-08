import express from "express";
import { generateUploadSignature } from "../controllers/upload.controller.js";
import { protectRoute } from "../middlewares/auth.middleware.js";

const router = express.Router();

// POST /api/upload/signature — returns a signed Cloudinary upload token
// Only authenticated users can request a signature
router.post("/signature", protectRoute, generateUploadSignature);

export default router;
