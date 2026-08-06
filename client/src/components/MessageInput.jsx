import { useRef, useState, useCallback } from "react";
import useKeyboardSound from "../hooks/useKeyboardSound";
import { useChatStore } from "../store/useChatStore";
import toast from "react-hot-toast";
import { ImageIcon, SendIcon, XIcon } from "lucide-react";

function MessageInput() {
  const { playRandomKeyStrokeSound } = useKeyboardSound();
  const [text, setText] = useState("");
  const [imagePreview, setImagePreview] = useState(null);

  const fileInputRef = useRef(null);
  const textareaRef  = useRef(null);

  const { sendMessage, isSoundEnabled } = useChatStore();

  const handleSendMessage = useCallback(
    (e) => {
      e?.preventDefault();
      if (!text.trim() && !imagePreview) return;
      if (isSoundEnabled) playRandomKeyStrokeSound();

      sendMessage({ text: text.trim(), image: imagePreview });
      setText("");
      setImagePreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      // Refocus textarea after send
      setTimeout(() => textareaRef.current?.focus(), 0);
    },
    [text, imagePreview, isSoundEnabled, playRandomKeyStrokeSound, sendMessage]
  );

  // Enter = send, Shift+Enter = newline
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be smaller than 5 MB");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const canSend = text.trim() || imagePreview;

  return (
    <div className="px-3 sm:px-4 pb-4 pt-2 bg-slate-900/70 border-t border-slate-800/50 flex-shrink-0">
      {/* Image preview */}
      {imagePreview && (
        <div className="mb-2 flex items-center gap-2 animate-fade-in-up">
          <div className="relative inline-block">
            <img
              src={imagePreview}
              alt="Preview"
              className="h-20 w-20 object-cover rounded-xl border border-slate-700 shadow-lg"
            />
            <button
              onClick={removeImage}
              type="button"
              className="absolute -top-2 -right-2 size-5 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-300 hover:bg-rose-600 hover:text-white transition-colors shadow"
              title="Remove image"
            >
              <XIcon className="size-3" />
            </button>
          </div>
          <span className="text-xs text-slate-400">Image attached</span>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2">
        {/* Attach image */}
        <button
          id="attach-image-btn"
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={`flex-shrink-0 p-2.5 rounded-xl transition-all ${
            imagePreview
              ? "bg-cyan-500/20 text-cyan-400"
              : "bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-700/80"
          }`}
          title="Attach image"
        >
          <ImageIcon className="size-5" />
        </button>

        {/* Hidden file input */}
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          onChange={handleImageChange}
          className="hidden"
        />

        {/* Textarea */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            id="message-input"
            rows={1}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (isSoundEnabled) playRandomKeyStrokeSound();
              // Auto-grow up to ~5 lines
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            }}
            onKeyDown={handleKeyDown}
            className="w-full bg-slate-800/80 border border-slate-700/60 focus:border-cyan-500/60 rounded-2xl py-2.5 px-4 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 resize-none transition-all leading-relaxed"
            placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
            style={{ minHeight: "42px", maxHeight: "120px" }}
          />
        </div>

        {/* Send button */}
        <button
          id="send-message-btn"
          type="button"
          onClick={handleSendMessage}
          disabled={!canSend}
          className={`flex-shrink-0 p-2.5 rounded-xl transition-all ${
            canSend
              ? "bg-gradient-to-br from-cyan-500 to-cyan-600 text-white hover:from-cyan-400 hover:to-cyan-500 shadow-lg shadow-cyan-500/20"
              : "bg-slate-800/60 text-slate-600 cursor-not-allowed"
          }`}
          title="Send message"
        >
          <SendIcon className="size-5" />
        </button>
      </div>

      {/* Hint */}
      <p className="text-[10px] text-slate-600 mt-1.5 pl-12 hidden sm:block">
        Enter to send · Shift+Enter for new line
      </p>
    </div>
  );
}

export default MessageInput;
