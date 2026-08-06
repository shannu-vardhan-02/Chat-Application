import { useRef, useState, useCallback } from "react";
import useKeyboardSound from "../hooks/useKeyboardSound";
import { useChatStore } from "../store/useChatStore";
import toast from "react-hot-toast";
import { ImageIcon, SendIcon, XIcon } from "lucide-react";
import BorderAnimatedContainer from "./BorderAnimatedContainer";

function MessageInput() {
  const { playRandomKeyStrokeSound } = useKeyboardSound();
  const [text, setText] = useState("");
  const [imagePreview, setImagePreview] = useState(null);

  const fileInputRef = useRef(null);
  const inputRef     = useRef(null);

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
      setTimeout(() => inputRef.current?.focus(), 0);
    },
    [text, imagePreview, isSoundEnabled, playRandomKeyStrokeSound, sendMessage]
  );

  // Enter = send
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
              className="h-16 w-16 object-cover rounded-xl border border-slate-700 shadow-lg"
            />
            <button
              onClick={removeImage}
              type="button"
              className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-300 hover:bg-rose-600 hover:text-white transition-colors shadow"
            >
              <XIcon className="size-3" />
            </button>
          </div>
          <span className="text-xs text-slate-400">Image ready to send</span>
        </div>
      )}

      {/* Animated border input row */}
      <BorderAnimatedContainer className="h-auto">
        <form
          onSubmit={handleSendMessage}
          className="w-full flex items-center gap-2 p-2 bg-slate-900/90 rounded-2xl"
        >
          {/* Hidden file input */}
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={handleImageChange}
            className="hidden"
          />

          {/* Attach image button */}
          <button
            id="attach-image-btn"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`flex-shrink-0 p-2 rounded-xl transition-all ${
              imagePreview
                ? "bg-cyan-500/20 text-cyan-400"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/80"
            }`}
            title="Attach image"
          >
            <ImageIcon className="size-5" />
          </button>

          {/* Text input */}
          <input
            ref={inputRef}
            id="message-input"
            type="text"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (isSoundEnabled) playRandomKeyStrokeSound();
            }}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 text-slate-200 placeholder-slate-500 text-sm py-1.5"
            placeholder="Type a message…"
          />

          {/* Send button */}
          <button
            id="send-message-btn"
            type="submit"
            disabled={!canSend}
            className={`flex-shrink-0 p-2 rounded-xl transition-all ${
              canSend
                ? "bg-gradient-to-br from-cyan-500 to-cyan-600 text-white hover:from-cyan-400 hover:to-cyan-500 shadow-md shadow-cyan-500/20"
                : "text-slate-600 cursor-not-allowed"
            }`}
            title="Send"
          >
            <SendIcon className="size-5" />
          </button>
        </form>
      </BorderAnimatedContainer>
    </div>
  );
}

export default MessageInput;
