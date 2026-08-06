import { useEffect, useRef } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import ChatHeader from "./ChatHeader";
import NoChatHistoryPlaceholder from "./NoChatHistoryPlaceholder";
import MessageInput from "./MessageInput";
import MessagesLoadingSkeleton from "./MessagesLoadingSkeleton";

// Format timestamp: show time for today, date+time for older messages
function formatTime(dateStr) {
  const date = new Date(dateStr);
  const now  = new Date();
  const isToday =
    date.getDate()     === now.getDate() &&
    date.getMonth()    === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day:   "numeric",
  }) + " · " + date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// Group consecutive messages by sender so we only show one avatar per group
function groupMessages(messages) {
  const groups = [];
  messages.forEach((msg, i) => {
    const prev = messages[i - 1];
    const same = prev && prev.senderId === msg.senderId;
    if (same) {
      groups[groups.length - 1].push(msg);
    } else {
      groups.push([msg]);
    }
  });
  return groups;
}

function ChatContainer() {
  const {
    selectedUser,
    getMessagesByUserId,
    messages,
    isMessagesLoading,
    subscribeToMessages,
    unsubscribeFromMessages,
  } = useChatStore();
  const { authUser } = useAuthStore();
  const messageEndRef = useRef(null);
  const prevLengthRef = useRef(0);

  useEffect(() => {
    getMessagesByUserId(selectedUser._id);
    subscribeToMessages();
    return () => unsubscribeFromMessages();
  }, [selectedUser, getMessagesByUserId, subscribeToMessages, unsubscribeFromMessages]);

  // Scroll: instant jump on load, smooth scroll only for new messages
  useEffect(() => {
    if (!messageEndRef.current) return;
    const isNew = messages.length > prevLengthRef.current && prevLengthRef.current !== 0;
    messageEndRef.current.scrollIntoView({ behavior: isNew ? "smooth" : "instant" });
    prevLengthRef.current = messages.length;
  }, [messages]);

  if (isMessagesLoading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <ChatHeader />
        <div className="flex-1 px-4 md:px-6 overflow-y-auto py-6">
          <MessagesLoadingSkeleton />
        </div>
        <MessageInput />
      </div>
    );
  }

  const messageGroups = groupMessages(messages);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ChatHeader />

      {/* Messages area */}
      <div
        className="flex-1 overflow-y-auto py-4 px-2 sm:px-4 md:px-6"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(148,163,184,0.03) 1px, transparent 0)", backgroundSize: "28px 28px" }}
      >
        {messages.length === 0 ? (
          <NoChatHistoryPlaceholder name={selectedUser.fullName} />
        ) : (
          <div className="max-w-3xl mx-auto space-y-1 pb-2">
            {messageGroups.map((group) => {
              const isSent = group[0].senderId === authUser._id;
              return group.map((msg, idx) => {
                const isFirst = idx === 0;
                const isLast  = idx === group.length - 1;

                return (
                  <div
                    key={msg._id}
                    className={`flex items-end gap-2 ${isSent ? "flex-row-reverse" : "flex-row"} ${
                      isFirst ? "mt-3" : "mt-0.5"
                    } ${msg.isOptimistic ? "opacity-70" : ""}`}
                  >
                    {/* Avatar — only on last message in a received group */}
                    {!isSent && (
                      <div className="flex-shrink-0 w-7 h-7">
                        {isLast && (
                          <img
                            src={selectedUser.profilePic || "/avatar.png"}
                            alt={selectedUser.fullName}
                            className="w-7 h-7 rounded-full object-cover border border-slate-700/60"
                          />
                        )}
                      </div>
                    )}

                    {/* Bubble */}
                    <div
                      className={`
                        relative max-w-[70%] sm:max-w-[65%]
                        ${isSent ? "msg-in-right" : "msg-in-left"}
                      `}
                    >
                      <div
                        className={`
                          px-3.5 py-2 text-sm leading-relaxed
                          ${isSent ? "bubble-sent" : "bubble-received"}
                        `}
                      >
                        {/* Image attachment */}
                        {msg.image && (
                          <img
                            src={msg.image}
                            alt="Shared"
                            className="rounded-lg max-h-60 object-cover mb-1.5 w-full"
                          />
                        )}
                        {/* Text */}
                        {msg.text && (
                          <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                        )}
                        {/* Timestamp — only on last msg of a group */}
                        {isLast && (
                          <p className={`text-[10px] mt-1 select-none ${isSent ? "text-cyan-200/60 text-right" : "text-slate-400/70"}`}>
                            {formatTime(msg.createdAt)}
                            {msg.isOptimistic && " · Sending…"}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              });
            })}
            {/* Scroll anchor */}
            <div ref={messageEndRef} />
          </div>
        )}
      </div>

      <MessageInput />
    </div>
  );
}

export default ChatContainer;
