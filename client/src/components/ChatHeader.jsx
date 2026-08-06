import {
  ArrowLeftIcon,
  PhoneIcon,
  VideoIcon,
  XIcon,
} from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useEffect } from "react";
import { useAuthStore } from "../store/useAuthStore";
import toast from "react-hot-toast";

function ChatHeader() {
  const { selectedUser, setSelectedUser } = useChatStore();
  const { onlineUsers } = useAuthStore();
  const isOnline = onlineUsers.includes(selectedUser._id);

  // Escape key closes the chat
  useEffect(() => {
    const handleEscKey = (event) => {
      if (event.key === "Escape") setSelectedUser(null);
    };
    window.addEventListener("keydown", handleEscKey);
    return () => window.removeEventListener("keydown", handleEscKey);
  }, [setSelectedUser]);

  return (
    <div className="flex justify-between items-center bg-slate-900/80 backdrop-blur-md border-b border-slate-800/60 px-3 md:px-5 py-3 min-h-[60px] flex-shrink-0 z-10">
      {/* Left: Back btn + Avatar + Name */}
      <div className="flex items-center gap-2.5 min-w-0">
        {/* Mobile back button */}
        <button
          id="chat-back-btn"
          onClick={() => setSelectedUser(null)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors md:hidden flex-shrink-0"
          title="Back to chats"
        >
          <ArrowLeftIcon className="size-5" />
        </button>

        {/* Avatar with online indicator */}
        <div className="relative flex-shrink-0">
          <img
            src={selectedUser.profilePic || "/avatar.png"}
            alt={selectedUser.fullName}
            className="size-10 rounded-full object-cover border border-slate-700/60 ring-2 ring-slate-800"
          />
          <span
            className={`absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-slate-900 transition-colors ${
              isOnline ? "bg-emerald-400" : "bg-slate-500"
            }`}
          />
        </div>

        {/* Name + status */}
        <div className="min-w-0">
          <h3 className="text-slate-100 font-semibold text-sm leading-tight truncate max-w-[150px] sm:max-w-[220px]">
            {selectedUser.fullName}
          </h3>
          <p className="text-[11px] font-medium leading-tight mt-0.5">
            {isOnline ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <span className="inline-block size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Online
              </span>
            ) : (
              <span className="text-slate-500">Offline</span>
            )}
          </p>
        </div>
      </div>

      {/* Right: Action buttons */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          id="voice-call-btn"
          onClick={() => toast("Voice call coming soon! 📞")}
          className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-xl transition-all hidden sm:flex"
          title="Voice call"
        >
          <PhoneIcon className="size-4" />
        </button>
        <button
          id="video-call-btn"
          onClick={() => toast("Video call coming soon! 🎥")}
          className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-xl transition-all hidden sm:flex"
          title="Video call"
        >
          <VideoIcon className="size-4" />
        </button>
        <button
          id="close-chat-btn"
          onClick={() => setSelectedUser(null)}
          className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all"
          title="Close chat (Esc)"
        >
          <XIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}

export default ChatHeader;
