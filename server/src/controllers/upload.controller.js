import { v2 as cloudinary } from "cloudinary";
import { ENV } from "../lib/env.js";

/**
 * Generates a short-lived signed upload signature so the browser can upload
 * directly to Cloudinary without routing large binary data through our server.
 *
 * The client calls this endpoint first, then POSTs the image file directly to
 * Cloudinary's upload API using the returned signature + timestamp.
 *
 * Route: POST /api/upload/signature
 */
export const generateUploadSignature = (req, res) => {
  try {
    const timestamp = Math.round(Date.now() / 1000);

    // Determine folder based on upload type sent by client ("profile" | "message")
    const uploadType = req.body?.uploadType || "message";
    const folder =
      uploadType === "profile"
        ? "charchalu/profile_pics"
        : "charchalu/messages";

    // Parameters that MUST be signed (must match what the client sends)
    const paramsToSign = {
      timestamp,
      folder,
      // Auto-select the best format (WebP for browsers that support it)
      quality: "auto",
      fetch_format: "auto",
    };

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      ENV.CLOUDINARY_API_SECRET
    );

    res.status(200).json({
      signature,
      timestamp,
      folder,
      cloudName: ENV.CLOUDINARY_CLOUD_NAME,
      apiKey: ENV.CLOUDINARY_API_KEY,
    });
  } catch (error) {
    console.error("Error generating upload signature:", error);
    res.status(500).json({ message: "Failed to generate upload signature" });
  }
};
