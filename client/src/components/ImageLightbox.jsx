import { useEffect, useCallback } from "react";
import { XIcon, DownloadIcon } from "lucide-react";

/**
 * Full-screen image lightbox.
 * Opens when the user clicks any image in the chat.
 * Close: click backdrop, press Escape, or click the ✕ button.
 */
function ImageLightbox({ src, alt = "Image", onClose }) {
  // Close on Escape key
  const handleKey = useCallback(
    (e) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    // Prevent background scroll while lightbox is open
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [handleKey]);

  // Download the image
  const handleDownload = async () => {
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `charchalu-image-${Date.now()}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // fallback: open in new tab
      window.open(src, "_blank");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
    >
      {/* Top controls */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-xs text-slate-400 select-none">Click outside or press Esc to close</span>
        <div className="flex items-center gap-2">
          {/* Download button */}
          <button
            onClick={handleDownload}
            className="p-2 rounded-lg bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            title="Download image"
          >
            <DownloadIcon className="size-4" />
          </button>
          {/* Close button */}
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800/80 text-slate-300 hover:bg-rose-600 hover:text-white transition-colors"
            title="Close (Esc)"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      </div>

      {/* Image container — stop propagation so clicking image itself doesn't close */}
      <div
        className="relative max-w-[90vw] max-h-[85vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt={alt}
          className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl select-none"
          draggable={false}
        />
      </div>
    </div>
  );
}

export default ImageLightbox;
