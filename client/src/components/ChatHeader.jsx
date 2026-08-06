import {
  ArrowLeftIcon,
  SearchIcon,
  PhoneIcon,
  VideoIcon,
  MoreVerticalIcon,
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

  // Allow closing the chat with the Escape key
  useEffect(() => {
    const handleEscKey = (event) => {
      if (event.key === "Escape") setSelectedUser(null);
    };

    window.addEventListener("keydown", handleEscKey);
    return () => window.removeEventListener("keydown", handleEscKey);
  }, [setSelectedUser]);

  return (
    <div className="flex justify-between items-center bg-slate-900/90 border-b border-slate-800/80 px-4 md:px-6 py-3 min-h-[64px] flex-shrink-0 z-10">
      <div className="flex items-center space-x-3">
        {/* MOBILE BACK BUTTON - WhatsApp / Telegram mobile navigation */}
        <button
          onClick={() => setSelectedUser(null)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors md:hidden"
          title="Back to chats"
        >
          <ArrowLeftIcon className="size-5" />
        </button>

        <div className="relative">
          <img
            src={selectedUser.profilePic || "/avatar.png"}
            alt={selectedUser.fullName}
            className="size-11 rounded-full object-cover border border-slate-700/60"
          />
          <span
            className={`absolute bottom-0 right-0 size-3 rounded-full border-2 border-slate-900 ${
              isOnline ? "bg-emerald-500" : "bg-slate-500"
            }`}
          />
        </div>

        <div>
          <h3 className="text-slate-100 font-semibold text-sm truncate max-w-[180px] sm:max-w-xs">
            {selectedUser.fullName}
          </h3>
          <p className="text-xs font-medium">
            {isOnline ? (
              <span className="text-emerald-400">Online</span>
            ) : (
              <span className="text-slate-400">Offline</span>
            )}
          </p>
        </div>
      </div>

      {/* RIGHT ACTION BUTTONS */}
      <div className="flex items-center space-x-1 sm:space-x-2">
        <button
          onClick={() => toast("Search in chat feature coming soon!")}
          className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-xl transition-colors hidden sm:block"
          title="Search messages"
        >
          <SearchIcon className="size-4" />
        </button>
        <button
          onClick={() => toast(`Calling ${selectedUser.fullName}...`)}
          className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-xl transition-colors hidden sm:block"
          title="Voice call"
        >
          <PhoneIcon className="size-4" />
        </button>
        <button
          onClick={() => toast(`Video call with ${selectedUser.fullName}...`)}
          className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-xl transition-colors hidden sm:block"
          title="Video call"
        >
          <VideoIcon className="size-4" />
        </button>
        <button
          onClick={() => setSelectedUser(null)}
          className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-xl transition-colors"
          title="Close chat"
        >
          <XIcon className="size-5" />
        </button>
      </div>
    </div>
  );
}
export default ChatHeader;

