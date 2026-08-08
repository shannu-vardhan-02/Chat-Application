import { axiosInstance } from "./axios";

/**
 * Compresses an image file using the Canvas API (no external libraries needed).
 * Resizes to maxWidth if larger, converts to WebP for ~70% size savings.
 *
 * @param {File} file - The image file to compress
 * @param {number} maxWidth - Maximum width in pixels (default: 1200)
 * @param {number} quality - JPEG/WebP quality 0-1 (default: 0.82)
 * @returns {Promise<Blob>} - Compressed image blob
 */
export async function compressImage(file, maxWidth = 1200, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      // Calculate new dimensions maintaining aspect ratio
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      // Prefer WebP (smaller), fall back to JPEG
      const mimeType = "image/webp";
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Canvas compression failed"));
            return;
          }
          resolve(blob);
        },
        mimeType,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image for compression"));
    };

    img.src = objectUrl;
  });
}

/**
 * Full pipeline: compress → get signature → upload directly to Cloudinary.
 *
 * @param {File} file - The image file selected by the user
 * @param {"profile" | "message"} uploadType - Folder/purpose context
 * @param {(progress: number) => void} [onProgress] - Progress callback (0-100)
 * @returns {Promise<string>} - The Cloudinary secure URL
 */
export async function uploadToCloudinary(file, uploadType = "message", onProgress) {
  // Step 1: Validate input
  if (!file || !file.type.startsWith("image/")) {
    throw new Error("Please select a valid image file");
  }

  const maxSizeBytes = 15 * 1024 * 1024; // 15 MB raw limit before compression
  if (file.size > maxSizeBytes) {
    throw new Error("Image must be smaller than 15 MB");
  }

  onProgress?.(5); // Signal start

  // Step 2: Compress the image on the client side
  const maxWidth = uploadType === "profile" ? 600 : 1200;
  const compressed = await compressImage(file, maxWidth, 0.82);

  onProgress?.(25); // Compression done

  // Step 3: Get a signed upload token from our server (tiny request)
  const { data: sigData } = await axiosInstance.post("/upload/signature", {
    uploadType,
  });

  onProgress?.(30); // Signature received

  // Step 4: Upload the compressed blob directly to Cloudinary
  const formData = new FormData();
  formData.append("file", compressed, "upload.webp");
  formData.append("api_key", sigData.apiKey);
  formData.append("timestamp", sigData.timestamp);
  formData.append("signature", sigData.signature);
  formData.append("folder", sigData.folder);
  formData.append("quality", "auto");
  formData.append("fetch_format", "auto");

  const uploadUrl = `https://api.cloudinary.com/v1_1/${sigData.cloudName}/image/upload`;

  // Use XMLHttpRequest so we can track upload progress
  const secureUrl = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        // Map upload progress to 30-95% range
        const uploadPercent = Math.round((e.loaded / e.total) * 65);
        onProgress?.(30 + uploadPercent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const result = JSON.parse(xhr.responseText);
        onProgress?.(100);
        resolve(result.secure_url);
      } else {
        let errMsg = "Image upload failed";
        try {
          const errData = JSON.parse(xhr.responseText);
          errMsg = errData?.error?.message || errMsg;
        } catch {}
        reject(new Error(errMsg));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during image upload"));
    xhr.onabort = () => reject(new Error("Image upload was cancelled"));

    xhr.open("POST", uploadUrl);
    xhr.send(formData);
  });

  return secureUrl;
}
