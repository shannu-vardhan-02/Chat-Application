import { useRef, useState, useCallback } from "react";
import useKeyboardSound from "../hooks/useKeyboardSound";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import toast from "react-hot-toast";
import { ImageIcon, SendIcon, XIcon } from "lucide-react";
import BorderAnimatedContainer from "./BorderAnimatedContainer";
import { uploadToCloudinary } from "../lib/uploadImage";

function MessageInput() {
  const { playRandomKeyStrokeSound } = useKeyboardSound();
  const [text, setText] = useState("");

  // Local preview (object URL — lightweight, no base64 string in state)
  const [previewUrl, setPreviewUrl] = useState(null);
  // The actual File object (not base64)
  const [pendingFile, setPendingFile] = useState(null);

  // Upload progress: null = idle, 0-100 = uploading
  const [uploadProgress, setUploadProgress] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef(null);
  const inputRef = useRef(null);
  const previewUrlRef = useRef(null); // keep track to revoke

  /**
   * Phase 2: Typing indicator timer.
   * We use a ref (not state) so the timer ID doesn't trigger re-renders.
   * Strategy:
   *   - On every keystroke → emit "typing" + reset a 1.5s timer
   *   - When timer fires → emit "stopTyping"
   *   - On message send → immediately emit "stopTyping" and clear timer
   */
  const stopTypingTimer = useRef(null);

  const { sendMessage, isSoundEnabled, selectedUser } = useChatStore();
  const { socket } = useAuthStore();

  // Emit "typing" immediately and schedule "stopTyping" after 1.5s of silence
  const emitTyping = useCallback(() => {
    if (!socket || !selectedUser) return;
    socket.emit("typing", { receiverId: selectedUser._id });

    // Clear any existing timer so we don't send stopTyping prematurely
    clearTimeout(stopTypingTimer.current);
    stopTypingTimer.current = setTimeout(() => {
      socket.emit("stopTyping", { receiverId: selectedUser._id });
    }, 1500);
  }, [socket, selectedUser]);

  // Immediately emit "stopTyping" and clear pending timer
  const emitStopTyping = useCallback(() => {
    if (!socket || !selectedUser) return;
    clearTimeout(stopTypingTimer.current);
    socket.emit("stopTyping", { receiverId: selectedUser._id });
  }, [socket, selectedUser]);


  const handleSendMessage = useCallback(
    async (e) => {
      e?.preventDefault();
      if ((!text.trim() && !pendingFile) || isUploading) return;
      if (isSoundEnabled) playRandomKeyStrokeSound();

      // Phase 2: stop typing indicator immediately when message is sent
      emitStopTyping();

      let imageUrl = null;

      if (pendingFile) {
        setIsUploading(true);
        setUploadProgress(0);
        try {
          imageUrl = await uploadToCloudinary(pendingFile, "message", (p) =>
            setUploadProgress(p)
          );
        } catch (err) {
          toast.error(err.message || "Image upload failed");
          setIsUploading(false);
          setUploadProgress(null);
          return;
        } finally {
          setIsUploading(false);
          setUploadProgress(null);
        }
      }

      await sendMessage({ text: text.trim(), image: imageUrl });

      setText("");
      setPendingFile(null);
      // Revoke the object URL to free memory
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      setPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setTimeout(() => inputRef.current?.focus(), 0);
    },
    [text, pendingFile, isUploading, isSoundEnabled, playRandomKeyStrokeSound, sendMessage, emitStopTyping]
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
    // 15 MB raw limit (will be compressed before upload)
    if (file.size > 15 * 1024 * 1024) {
      toast.error("Image must be smaller than 15 MB");
      return;
    }

    // Revoke any previous preview URL
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }

    const objectUrl = URL.createObjectURL(file);
    previewUrlRef.current = objectUrl;
    setPreviewUrl(objectUrl);
    setPendingFile(file);
  };

  const removeImage = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
    setPendingFile(null);
    setUploadProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const canSend = (text.trim() || pendingFile) && !isUploading;

  return (
    <div className="px-3 sm:px-4 pb-4 pt-2 bg-slate-900/70 border-t border-slate-800/50 flex-shrink-0">
      {/* Image preview */}
      {previewUrl && (
        <div className="mb-2 flex items-center gap-3 animate-fade-in-up">
          <div className="relative inline-block">
            <img
              src={previewUrl}
              alt="Preview"
              className="h-16 w-16 object-cover rounded-xl border border-slate-700 shadow-lg"
            />
            {/* Upload progress overlay */}
            {isUploading && (
              <div className="absolute inset-0 rounded-xl bg-slate-900/70 flex items-center justify-center">
                <span className="text-[10px] font-bold text-cyan-400">
                  {uploadProgress ?? 0}%
                </span>
              </div>
            )}
            {!isUploading && (
              <button
                onClick={removeImage}
                type="button"
                className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-300 hover:bg-rose-600 hover:text-white transition-colors shadow"
              >
                <XIcon className="size-3" />
              </button>
            )}
          </div>

          {/* Progress bar */}
          <div className="flex-1">
            {isUploading ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-cyan-400 font-medium">Uploading…</span>
                  <span className="text-xs text-slate-400">{uploadProgress ?? 0}%</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full transition-all duration-200"
                    style={{ width: `${uploadProgress ?? 0}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-500">Compressing & uploading…</p>
              </div>
            ) : (
              <span className="text-xs text-slate-400">Image ready to send</span>
            )}
          </div>
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
            disabled={isUploading}
            className={`flex-shrink-0 p-2 rounded-xl transition-all ${
              previewUrl
                ? "bg-cyan-500/20 text-cyan-400"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/80"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
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
              // Phase 2: tell the receiver we're typing (debounced)
              emitTyping();
            }}
            onKeyDown={handleKeyDown}
            disabled={isUploading}
            className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 text-slate-200 placeholder-slate-500 text-sm py-1.5 disabled:opacity-50"
            placeholder={isUploading ? "Uploading image…" : "Type a message…"}
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
