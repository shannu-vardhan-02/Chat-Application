import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import ChatHeader from "./ChatHeader";
import NoChatHistoryPlaceholder from "./NoChatHistoryPlaceholder";
import MessageInput from "./MessageInput";
import MessagesLoadingSkeleton from "./MessagesLoadingSkeleton";
import ImageLightbox from "./ImageLightbox";
import { Check, CheckCheck, Clock } from "lucide-react";

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

/**
 * MessageStatusIcon — renders the ✓ tick for outgoing messages.
 *
 * Status lifecycle (matches the server schema):
 *   "sending"   → Clock icon (grey)  — optimistic, not yet saved to DB
 *   "sent"      → Single ✓ (grey)    — saved to DB, receiver not yet notified
 *   "delivered" → Double ✓✓ (grey)  — receiver's device got it (Phase 2)
 *   "read"      → Double ✓✓ (cyan)  — receiver opened the chat (Phase 2)
 *
 * We only render this for sent messages (isSent = true).
 * The icon is intentionally tiny (size-3) to stay subtle.
 */
function MessageStatusIcon({ status }) {
  if (status === "sending") {
    return <Clock className="size-3 text-slate-400/70 inline-block ml-1" />;
  }
  if (status === "sent") {
    return <Check className="size-3 text-slate-400/70 inline-block ml-1" />;
  }
  if (status === "delivered") {
    return <CheckCheck className="size-3 text-slate-400/70 inline-block ml-1" />;
  }
  if (status === "read") {
    return <CheckCheck className="size-3 text-cyan-400 inline-block ml-1" />;
  }
  return null;
}


/**
 * Renders a chat image with a loading skeleton/blur-up effect.
 * Shows a pulsing grey placeholder while the Cloudinary image loads.
 */
function ChatImage({ src, alt, onClick }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  return (
    <div className="relative rounded-lg overflow-hidden mb-1.5 max-h-60">
      {/* Skeleton shown while image loads */}
      {!loaded && !error && (
        <div className="absolute inset-0 bg-slate-700/60 animate-pulse rounded-lg" />
      )}
      {error ? (
        <div className="flex items-center justify-center h-24 bg-slate-800/60 rounded-lg text-slate-500 text-xs">
          Image failed to load
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          onLoad={() => setLoaded(true)}
          onError={() => { setLoaded(true); setError(true); }}
          onClick={onClick}
          className={`w-full max-h-60 object-cover rounded-lg cursor-pointer
            transition-all duration-300 hover:brightness-90 hover:scale-[1.01]
            ${loaded ? "opacity-100" : "opacity-0"}`}
          title="Click to view full size"
        />
      )}
    </div>
  );
}

function ChatContainer() {
  const {
    selectedUser,
    getMessagesByUserId,
    loadMoreMessages,
    messages,
    isMessagesLoading,
    isLoadingMoreMessages,
    hasMoreMessages,
    subscribeToMessages,
    unsubscribeFromMessages,
  } = useChatStore();
  const { authUser, socket } = useAuthStore();

  const messageEndRef = useRef(null);   // anchor at the bottom for auto-scroll
  const scrollRef     = useRef(null);   // ref to the scroll container div
  const prevLengthRef = useRef(0);      // tracks message count for scroll decisions

  /**
   * Scroll anchor — saves scroll state BEFORE a "load more" prepend happens.
   *
   * Why do we need this?
   *   When we prepend older messages at the TOP of the list, the browser's
   *   default behavior is to keep scrollTop fixed — which means the viewport
   *   jumps up to show the new messages instead of staying where the user was.
   *
   *   We save the scroll container's scrollHeight BEFORE the state update.
   *   Then in the messages useEffect, we restore:
   *     scrollTop = newScrollHeight - savedScrollHeight
   *   This keeps the viewport anchored to the same message.
   *
   * Format: { scrollHeight, scrollTop } | null
   */
  const scrollAnchorRef = useRef(null);

  // Lightbox state
  const [lightboxSrc, setLightboxSrc] = useState(null);

  useEffect(() => {
    getMessagesByUserId(selectedUser._id);
    subscribeToMessages();
    return () => unsubscribeFromMessages();
  }, [selectedUser, getMessagesByUserId, subscribeToMessages, unsubscribeFromMessages]);

  // Phase 2: Mark messages as read when chat opens or new messages arrive
  useEffect(() => {
    if (!socket || !selectedUser || messages.length === 0) return;
    const hasUnread = messages.some(
      (m) => m.senderId === selectedUser._id && m.status !== "read",
    );
    if (hasUnread) {
      socket.emit("markRead", { senderId: selectedUser._id });
    }
  }, [socket, selectedUser, messages]);

  /**
   * Scroll behaviour — runs every time `messages` changes.
   *
   * Three cases:
   *   1. Initial load (prevLength was 0): instant jump to bottom
   *   2. New message appended (length grew): smooth scroll to bottom
   *   3. Older messages prepended (scrollAnchorRef is set): restore position
   *      using the scroll anchor technique
   */
  useEffect(() => {
    if (!scrollRef.current || !messageEndRef.current) return;

    // Case 3: restoring position after "load more" prepend
    if (scrollAnchorRef.current) {
      const { scrollHeight: savedHeight } = scrollAnchorRef.current;
      const newScrollHeight = scrollRef.current.scrollHeight;
      // Pin the viewport: new scrollTop = how much height was added
      scrollRef.current.scrollTop = newScrollHeight - savedHeight;
      scrollAnchorRef.current = null;
      prevLengthRef.current = messages.length;
      return;
    }

    // Case 1 & 2: auto-scroll to bottom
    const isNew = messages.length > prevLengthRef.current && prevLengthRef.current !== 0;
    messageEndRef.current.scrollIntoView({ behavior: isNew ? "smooth" : "instant" });
    prevLengthRef.current = messages.length;
  }, [messages]);

  /**
   * Scroll-to-top detection — triggers "load more".
   *
   * We attach an onScroll handler to the scroll container. When the user
   * scrolls to within 80px of the top, we:
   *   1. Save the current scrollHeight (scroll anchor)
   *   2. Call loadMoreMessages — which prepends older messages to the list
   *   3. The messages useEffect then restores the viewport position
   *
   * Why 80px threshold and not exactly 0?
   *   A small threshold feels more responsive — the user doesn't have to
   *   physically hit the very top before more messages load.
   */
  const handleScroll = () => {
    if (!scrollRef.current) return;
    if (scrollRef.current.scrollTop <= 80 && hasMoreMessages && !isLoadingMoreMessages) {
      // Save scroll anchor BEFORE the state update causes a re-render
      scrollAnchorRef.current = {
        scrollHeight: scrollRef.current.scrollHeight,
      };
      loadMoreMessages(selectedUser._id);
    }
  };

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
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto py-4 px-2 sm:px-4 md:px-6"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(148,163,184,0.03) 1px, transparent 0)", backgroundSize: "28px 28px" }}
      >
        {/* ── Load-more top area ──────────────────────────────────────────── */}
        {isLoadingMoreMessages && (
          /**
           * Spinner shown while older messages are being fetched.
           * Appears at the very top of the scroll container.
           * The `sticky top-0` keeps it visible as long as the user is
           * near the top, without blocking the rest of the content.
           */
          <div className="flex justify-center py-3 sticky top-0 z-10">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/90 backdrop-blur-sm text-xs text-slate-400">
              <span className="size-3 rounded-full border-2 border-slate-500 border-t-cyan-400 animate-spin" />
              Loading older messages…
            </div>
          </div>
        )}

        {/* "You've reached the beginning" end-cap — only when no more to load */}
        {!hasMoreMessages && messages.length > 0 && (
          <div className="flex justify-center py-4">
            <span className="text-[10px] text-slate-600 px-3 py-1 rounded-full bg-slate-800/40">
              Beginning of conversation
            </span>
          </div>
        )}

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
                        {/* Image attachment with skeleton loading + lightbox on click */}
                        {msg.image && (
                          <ChatImage
                            src={msg.image}
                            alt="Shared image"
                            onClick={() => setLightboxSrc(msg.image)}
                          />
                        )}
                        {/* Text */}
                        {msg.text && (
                          <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                        )}
                        {/* Timestamp + status tick — only on last msg of a group */}
                        {isLast && (
                          <p className={`text-[10px] mt-1 select-none flex items-center gap-0.5 ${isSent ? "text-cyan-200/60 justify-end" : "text-slate-400/70"}`}>
                            {formatTime(msg.createdAt)}
                            {/* Status tick — only rendered for outgoing messages */}
                            {isSent && <MessageStatusIcon status={msg.status} />}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              });
            })}
            {/* Scroll anchor — auto-scroll to this on new messages */}
            <div ref={messageEndRef} />
          </div>
        )}
      </div>

      <MessageInput />

      {/* Full-screen image lightbox */}
      {lightboxSrc && (
        <ImageLightbox
          src={lightboxSrc}
          alt="Full-size image"
          onClose={() => setLightboxSrc(null)}
        />
      )}
    </div>
  );
}

export default ChatContainer;

