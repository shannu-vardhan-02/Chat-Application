import { useEffect } from "react";
import { useChatStore } from "../store/useChatStore";
import UsersLoadingSkeleton from "./UsersLoadingSkeleton";
import NoChatsFound from "./NoChatsFound";
import { useAuthStore } from "../store/useAuthStore";

function ChatsList() {
  const { getMyChatPartners, chats, isUsersLoading, setSelectedUser, searchQuery } =
    useChatStore();
  const { onlineUsers } = useAuthStore();

  useEffect(() => {
    getMyChatPartners();
  }, [getMyChatPartners]);

  if (isUsersLoading) return <UsersLoadingSkeleton />;
  if (chats.length === 0) return <NoChatsFound />;

  // Filter chats by search query matching fullName
  const filteredChats = chats.filter((chat) =>
    chat.fullName.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  if (filteredChats.length === 0 && searchQuery) {
    return (
      <div className="py-8 text-center text-slate-400 text-xs">
        No conversations found matching &quot;{searchQuery}&quot;
      </div>
    );
  }

  return (
    <>
      {filteredChats.map((chat) => {
        const isOnline = onlineUsers.includes(chat._id);
        return (
          <div
            key={chat._id}
            className="bg-slate-800/40 border border-slate-700/30 hover:border-cyan-500/30 p-3 rounded-xl cursor-pointer hover:bg-slate-800/80 transition-all group"
            onClick={() => setSelectedUser(chat)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="relative flex-shrink-0">
                  <img
                    src={chat.profilePic || "/avatar.png"}
                    alt={chat.fullName}
                    className="size-11 rounded-full object-cover border border-slate-700/50"
                  />
                  <span
                    className={`absolute bottom-0 right-0 size-3 rounded-full border-2 border-slate-900 ${
                      isOnline ? "bg-emerald-500" : "bg-slate-500"
                    }`}
                  />
                </div>
                <div className="overflow-hidden">
                  <h4 className="text-slate-100 font-medium text-sm truncate group-hover:text-cyan-400 transition-colors">
                    {chat.fullName}
                  </h4>
                  <p className="text-xs text-slate-400 truncate">
                    {isOnline ? (
                      <span className="text-emerald-400">Online</span>
                    ) : (
                      "Offline"
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
export default ChatsList;

