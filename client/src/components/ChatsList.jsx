import { useEffect, useState } from "react";
import { useChatStore } from "../store/useChatStore";
import UsersLoadingSkeleton from "./UsersLoadingSkeleton";
import NoChatsFound from "./NoChatsFound";
import { useAuthStore } from "../store/useAuthStore";
import { Trash2Icon } from "lucide-react";

/**
 * Formats a timestamp into a short relative label for the sidebar.
 *
 * Why do we do this here and not in the store?
 *   Because this is pure display logic — "2m ago", "Yesterday", "Mon" are
 *   only relevant in the UI, not in state management.
 *
 * Examples:
 *   < 1 min ago  → "Just now"
 *   < 60 min     → "5m"
 *   today        → "14:32"
 *   yesterday    → "Yesterday"
 *   this week    → "Mon"
 *   older        → "12 Jan"
 */
function formatSidebarTime(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();

  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m`;

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  if (isToday) {
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  // Yesterday
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  ) {
    return "Yesterday";
  }

  // Within last 7 days → show day name
  if (diffHours < 7 * 24) {
    return date.toLocaleDateString(undefined, { weekday: "short" });
  }

  // Older → show date
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function ChatsList() {
  const {
    getMyChatPartners,
    chats,
    isUsersLoading,
    setSelectedUser,
    selectedUser,
    searchQuery,
    deleteChat,
  } = useChatStore();
  const { onlineUsers } = useAuthStore();

  // Track which chat is showing its delete confirm button
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    getMyChatPartners();
  }, [getMyChatPartners]);

  if (isUsersLoading) return <UsersLoadingSkeleton />;
  if (chats.length === 0) return <NoChatsFound />;

  // Filter by search query
  const filteredChats = chats.filter((chat) =>
    chat.fullName.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  if (filteredChats.length === 0 && searchQuery) {
    return (
      <div className="py-8 text-center text-slate-500 text-xs">
        No conversations matching{" "}
        <span className="text-slate-400">&quot;{searchQuery}&quot;</span>
      </div>
    );
  }

  const handleDelete = (e, chatId) => {
    e.stopPropagation(); // don't open the chat
    if (deletingId === chatId) {
      // Second click — confirm delete
      deleteChat(chatId);
      setDeletingId(null);
    } else {
      // First click — show confirm state
      setDeletingId(chatId);
    }
  };

  return (
    <div className="space-y-0.5">
      {filteredChats.map((chat) => {
        const isOnline   = onlineUsers.includes(String(chat._id));
        const isSelected = selectedUser?._id && String(selectedUser._id) === String(chat._id);
        const isConfirm  = deletingId === chat._id;

        // Phase 1: last message preview + timestamp from Conversation doc
        const preview   = chat.lastMessageText || "";
        const timeLabel = formatSidebarTime(chat.lastMessageAt);
        // Unread badge count (Phase 1 data, badge UI added here too)
        const unread    = chat.unreadCount || 0;

        return (
          <div
            key={chat._id}
            id={`chat-item-${chat._id}`}
            onClick={() => {
              setDeletingId(null); // dismiss delete confirm on any chat click
              setSelectedUser(chat);
            }}
            className={`
              relative flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all group
              ${isSelected
                ? "bg-cyan-600/15 border border-cyan-500/25"
                : "hover:bg-slate-800/60 border border-transparent hover:border-slate-700/30"}
            `}
          >
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <img
                src={chat.profilePic || "/avatar.png"}
                alt={chat.fullName}
                className={`size-11 rounded-full object-cover border transition-all ${
                  isSelected ? "border-cyan-500/50" : "border-slate-700/50"
                }`}
              />
              <span
                className={`absolute bottom-0 right-0 size-3 rounded-full border-2 border-slate-900 transition-colors ${
                  isOnline ? "bg-emerald-400" : "bg-slate-600"
                }`}
              />
            </div>

            {/* Info — Phase 1: show last message preview and timestamp */}
            <div className="min-w-0 flex-1">
              {/* Row 1: name + time */}
              <div className="flex items-center justify-between gap-1">
                <h4
                  className={`font-medium text-sm truncate transition-colors ${
                    isSelected ? "text-cyan-400" : "text-slate-200"
                  }`}
                >
                  {chat.fullName}
                </h4>
                {/* Timestamp — hidden when delete confirm is showing */}
                {!isConfirm && timeLabel && (
                  <span className="text-[10px] text-slate-500 flex-shrink-0 ml-1">
                    {timeLabel}
                  </span>
                )}
              </div>

              {/* Row 2: last message preview + optional unread badge */}
              <div className="flex items-center justify-between gap-1 mt-0.5">
                {preview ? (
                  <p className="text-xs text-slate-500 truncate leading-snug">
                    {preview}
                  </p>
                ) : (
                  <p className="text-xs text-slate-600 truncate italic">
                    {isOnline ? "Active now" : "Tap to chat"}
                  </p>
                )}

                {/* Unread badge — only show if > 0 and not the selected chat */}
                {unread > 0 && !isSelected && (
                  <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-cyan-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </div>
            </div>

            {/* Delete button — shown on hover OR in confirm state */}
            <div
              className={`flex-shrink-0 flex items-center gap-1 transition-all ${
                isConfirm ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {isConfirm ? (
                <>
                  <button
                    onClick={(e) => handleDelete(e, chat._id)}
                    className="text-[10px] font-semibold px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-colors"
                    title="Confirm delete"
                  >
                    Delete
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeletingId(null); }}
                    className="text-[10px] font-semibold px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={(e) => handleDelete(e, chat._id)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                  title="Delete chat"
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ChatsList;
