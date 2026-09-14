import { useRef, useState, useCallback, useEffect } from "react";
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


  // ── Global keyboard-first UX ────────────────────────────────────────────────
  //
  // HOW IT WORKS:
  //   - Window-level keydown listener fires for every key press on the page
  //   - If the message input is already focused → do nothing (normal typing)
  //   - If the active element is another input/textarea/contenteditable → skip
  //     (don't hijack search bars, settings fields, etc.)
  //   - Ignore modifier combos (Ctrl+C, Cmd+Z, etc.) — these are browser shortcuts
  //   - For printable characters: focus the input and SET the character in state
  //     (the browser's native "key repeating into focused input" doesn't fire
  //      since we focus() programmatically, so we manually append the char)
  //   - For Enter/Backspace/Space: just focus the input, the key then fires again
  //     inside the focused input naturally
  //   - Escape: blurs the input so the user can navigate away
  //
  // WHY useEffect + window listener (not onKeyDown on the form):
  //   The form's onKeyDown only fires when the form or its children are focused.
  //   We need to intercept keypresses when focus is on the message list, avatar,
  //   or any non-form element — that requires a window-level listener.
  useEffect(() => {
    if (!selectedUser) return; // no listener when no chat is open

    const handleGlobalKeyDown = (e) => {
      // 1. Skip if already typing in the message input — let native input handle it
      if (document.activeElement === inputRef.current) return;

      // 2. Skip if focus is inside any other input, textarea, or contenteditable
      //    (search bar, settings modal, etc. — don't hijack those)
      const tag = document.activeElement?.tagName?.toLowerCase();
      const isEditable = document.activeElement?.isContentEditable;
      if (tag === "input" || tag === "textarea" || tag === "select" || isEditable) return;

      // 3. Skip modifier combos (Ctrl+C, Cmd+V, Alt+Tab, etc.)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // 4. Skip non-printable / navigation keys that shouldn't trigger focus
      const skipKeys = new Set([
        "Tab", "CapsLock", "Shift", "Control", "Alt", "Meta",
        "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
        "Home", "End", "PageUp", "PageDown",
        "Insert", "Delete", "ContextMenu", "Dead",
        "F1","F2","F3","F4","F5","F6","F7","F8","F9","F10","F11","F12",
        "PrintScreen", "ScrollLock", "Pause",
        "AudioVolumeMute", "AudioVolumeDown", "AudioVolumeUp",
        "MediaTrackNext", "MediaTrackPrevious", "MediaPlayPause",
      ]);
      if (skipKeys.has(e.key)) return;

      // 5. Escape → blur the input (let user navigate away with keyboard)
      if (e.key === "Escape") {
        inputRef.current?.blur();
        return;
      }

      // 6. Focus the input first
      inputRef.current?.focus();

      // 7. Printable characters (length === 1 means it's a single char, not "Enter" etc.)
      //    We need to manually insert the character because calling focus() after the
      //    keydown event fires means the browser doesn't route the keypress into the input.
      if (e.key.length === 1) {
        e.preventDefault(); // prevent double-insertion
        setText((prev) => prev + e.key);
        // Trigger typing indicator since the user is actively typing
        emitTyping();
        if (isSoundEnabled) playRandomKeyStrokeSound();
      }
      // For Enter, Backspace, Space — the browser will fire those into the
      // now-focused input naturally on the next event cycle (no manual handling needed)
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [selectedUser, emitTyping, isSoundEnabled, playRandomKeyStrokeSound]);

  // Enter = send (inside the focused input)
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
