import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import toast from "react-hot-toast";
import { useAuthStore } from "./useAuthStore";

export const useChatStore = create((set, get) => ({
  allContacts: [],
  chats: [],
  messages: [],
  // Cache: { [userId]: Message[] } — avoids re-fetching messages for already-loaded contacts
  messageCache: {},
  activeTab: "chats",
  selectedUser: null,
  isUsersLoading: false,
  isMessagesLoading: false,
  isSoundEnabled: JSON.parse(localStorage.getItem("isSoundEnabled")) === true,
  searchQuery: "",
  isSettingsOpen: false,
  // Phase 2: { [userId]: boolean } — true when that user is currently typing
  typingUsers: {},
  // Phase 3: pagination state for the current open conversation
  hasMoreMessages: false,       // true = there are older messages to load
  isLoadingMoreMessages: false, // true = "load more" request is in flight

  setSearchQuery: (query) => set({ searchQuery: query }),
  setIsSettingsOpen: (isOpen) => set({ isSettingsOpen: isOpen }),
  toggleSound: () => {
    localStorage.setItem("isSoundEnabled", !get().isSoundEnabled);
    set({ isSoundEnabled: !get().isSoundEnabled });
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedUser: (selectedUser) => set({ selectedUser }),

  getAllContacts: async () => {
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get("/messages/contacts");
      set({ allContacts: res.data });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load contacts");
    } finally {
      set({ isUsersLoading: false });
    }
  },

  /**
   * Fetches the logged-in user's conversation list from the server.
   *
   * Phase 1 change: the server now returns Conversation-enriched objects
   * instead of plain user documents. Each object now includes:
   *   - conversationId  — the Conversation doc _id
   *   - lastMessageText — preview text for the sidebar (e.g. "Hey!" or "[Photo]")
   *   - lastMessageAt   — timestamp for sorting / showing "5m ago"
   *   - unreadCount     — how many unread messages in this chat
   *
   * The client stores these as-is; ChatsList.jsx reads them to render the
   * last message preview and timestamp (like WhatsApp/Telegram).
   */
  getMyChatPartners: async () => {
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get("/messages/chats");
      set({ chats: res.data });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load chats");
    } finally {
      set({ isUsersLoading: false });
    }
  },

  /**
   * Fetch the MOST RECENT 30 messages for a conversation.
   *
   * Phase 3 changes:
   *   - Uses the in-memory cache as before (cache hit = instant, no network)
   *   - On cache miss: calls the new paginated API → GET /messages/:id?limit=30
   *   - API now returns { messages, hasMore } instead of a plain array
   *   - Stores hasMore in state so ChatContainer knows whether to show the
   *     "scroll to top → load more" trigger
   *
   * Cache note: the cache stores the FULL set of currently-loaded messages
   * (including any older pages already fetched). It is NOT invalidated when
   * we load more — we simply prepend older messages to the cached array.
   */
  getMessagesByUserId: async (userId) => {
    const cached = get().messageCache[userId];
    if (cached) {
      // Cache hit — load instantly, no network request.
      // Restore hasMoreMessages from cache metadata.
      set({
        messages: cached,
        hasMoreMessages: get().hasMoreCache?.[userId] ?? false,
      });
      return;
    }

    set({ isMessagesLoading: true, hasMoreMessages: false });
    try {
      const res = await axiosInstance.get(`/messages/${userId}?limit=30`);
      const { messages, hasMore } = res.data;

      set((state) => ({
        messages,
        messageCache: { ...state.messageCache, [userId]: messages },
        // Store hasMore in a separate cache map so it's restored on cache hit
        hasMoreCache: { ...state.hasMoreCache, [userId]: hasMore },
        hasMoreMessages: hasMore,
      }));
    } catch (error) {
      toast.error(error.response?.data?.message || "Something went wrong");
    } finally {
      set({ isMessagesLoading: false });
    }
  },

  /**
   * Load the NEXT PAGE of older messages for the current conversation.
   * Called when the user scrolls to the top of the chat.
   *
   * Phase 3: This is the second half of cursor-based pagination.
   *
   * How the cursor works:
   *   We take the createdAt of the OLDEST message we currently have
   *   (messages[0].createdAt) and pass it as `before=<ISO>` to the server.
   *   The server returns 30 messages with createdAt < that timestamp.
   *
   * Scroll position:
   *   ChatContainer saves the scrollHeight BEFORE this call, then after the
   *   state update it restores scrollTop = newScrollHeight - savedScrollHeight.
   *   This "scroll anchor" technique keeps the viewport pinned to the same
   *   message even as older messages are prepended above.
   */
  loadMoreMessages: async (userId) => {
    const { messages, isLoadingMoreMessages, hasMoreMessages } = get();

    // Guard: don't fire duplicate requests or load when nothing is left
    if (isLoadingMoreMessages || !hasMoreMessages) return;

    // The cursor is the createdAt of the oldest message we have
    const oldestMessage = messages[0];
    if (!oldestMessage) return;

    set({ isLoadingMoreMessages: true });
    try {
      // Pass the cursor timestamp so the server returns messages BEFORE it
      const cursor = encodeURIComponent(oldestMessage.createdAt);
      const res = await axiosInstance.get(`/messages/${userId}?before=${cursor}&limit=30`);
      const { messages: olderMessages, hasMore } = res.data;

      set((state) => {
        // Prepend older messages to the front of the list
        const updated = [...olderMessages, ...state.messages];
        return {
          messages: updated,
          // Update cache so the full list is preserved across chat switches
          messageCache: { ...state.messageCache, [userId]: updated },
          hasMoreCache: { ...state.hasMoreCache, [userId]: hasMore },
          hasMoreMessages: hasMore,
        };
      });
    } catch (error) {
      toast.error(error.response?.data?.message || "Something went wrong");
    } finally {
      set({ isLoadingMoreMessages: false });
    }
  },

  /**
   * Sends a message with an optimistic update.
   *
   * Phase 1 addition: the optimistic message now includes status: "sending"
   * so the UI can render a clock/dot icon while the request is in-flight.
   * Once the server confirms, the optimistic message is replaced with the
   * real message (which has status: "sent" from the DB).
   */
  sendMessage: async (messageData) => {
    const { selectedUser, messages } = get();
    const { authUser } = useAuthStore.getState();

    const tempId = `temp-${Date.now()}`;

    // Optimistic update: show message immediately before server confirms.
    // status: "sending" is a client-only state — it means "not yet confirmed by server".
    const optimisticMessage = {
      _id: tempId,
      senderId: authUser._id,
      receiverId: selectedUser._id,
      text: messageData.text,
      image: messageData.image || null,
      createdAt: new Date().toISOString(),
      status: "sending",   // client-only — shows a clock/dot icon
      isOptimistic: true,
    };
    set({ messages: [...messages, optimisticMessage] });

    try {
      const res = await axiosInstance.post(`/messages/send/${selectedUser._id}`, messageData);
      // Replace the optimistic message with the confirmed server message.
      // The server message has status: "sent" (saved to DB).
      set((state) => {
        const updated = state.messages.map((m) => (m._id === tempId ? res.data : m));
        return {
          messages: updated,
          // Update cache for this user too
          messageCache: { ...state.messageCache, [selectedUser._id]: updated },
        };
      });

      // Also refresh the chats sidebar so lastMessageText updates immediately
      // for the current conversation (the server just upserted the Conversation).
      get().getMyChatPartners();
    } catch (error) {
      // Revert optimistic update on failure
      set((state) => ({ messages: state.messages.filter((m) => m._id !== tempId) }));
      toast.error(error.response?.data?.message || "Something went wrong");
    }
  },

  /**
   * Delete all messages with a specific contact.
   * Removes the chat from the sidebar and clears the cache entry.
   */
  deleteChat: async (contactId) => {
    try {
      await axiosInstance.delete(`/messages/chat/${contactId}`);
      set((state) => {
        const updatedCache = { ...state.messageCache };
        delete updatedCache[contactId];
        return {
          chats: state.chats.filter((c) => c._id !== contactId),
          messages: state.selectedUser?._id === contactId ? [] : state.messages,
          selectedUser: state.selectedUser?._id === contactId ? null : state.selectedUser,
          messageCache: updatedCache,
        };
      });
      toast.success("Chat deleted");
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to delete chat");
    }
  },

  /**
   * Listen for real-time incoming messages and status updates via Socket.IO.
   *
   * Phase 2 additions vs Phase 1:
   *   1. "newMessage" → after appending, emit "messageDelivered" ACK back to server
   *      so the sender's tick upgrades from ✓ → ✓✓ (grey)
   *   2. "messageStatusUpdate" → a specific message's status changed
   *      (e.g. sent → delivered). Update it in local state.
   *   3. "messagesRead" → the OTHER person opened our chat and read all messages.
   *      Bulk-upgrade all our sent messages to "read" (grey ✓✓ → cyan ✓✓).
   *   4. "typing" / "stopTyping" → update typingUsers map in store
   */
  subscribeToMessages: () => {
    const { selectedUser, isSoundEnabled } = get();
    if (!selectedUser) return;

    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    // ── newMessage ────────────────────────────────────────────────────────────
    socket.on("newMessage", (newMessage) => {
      const isFromSelectedUser = newMessage.senderId === selectedUser._id;

      if (isFromSelectedUser) {
        // Append to the current chat view
        const currentMessages = get().messages;
        const updated = [...currentMessages, newMessage];
        set((state) => ({
          messages: updated,
          messageCache: { ...state.messageCache, [selectedUser._id]: updated },
        }));

        // Phase 2: ACK delivery so sender's tick goes ✓ → ✓✓
        // We tell the server "I (the receiver) got this message".
        socket.emit("messageDelivered", {
          messageId: newMessage._id,
          senderId: newMessage.senderId,
        });

        if (isSoundEnabled) {
          const notificationSound = new Audio("/sounds/notification.mp3");
          notificationSound.currentTime = 0;
          notificationSound.play().catch(() => {});
        }
      } else {
        // Message from a background contact — refresh sidebar
        get().getMyChatPartners();

        if (isSoundEnabled) {
          const notificationSound = new Audio("/sounds/notification.mp3");
          notificationSound.currentTime = 0;
          notificationSound.play().catch(() => {});
        }
      }
    });

    // ── messageStatusUpdate ───────────────────────────────────────────────────
    /**
     * Server sends this when a specific message's status changes.
     * Example: receiver ACK'd delivery → our sent message goes "sent" → "delivered".
     *
     * We update the message in both `messages` (visible chat) and `messageCache`
     * (so it's preserved when the user switches chats and comes back).
     */
    socket.on("messageStatusUpdate", ({ messageId, status }) => {
      set((state) => {
        // Helper to update a single message in an array
        const updateMsg = (msgs) =>
          msgs.map((m) => (m._id === messageId ? { ...m, status } : m));

        const updatedMessages = updateMsg(state.messages);

        // Also update cache for the selected user
        const selectedId = state.selectedUser?._id;
        const updatedCache = selectedId
          ? { ...state.messageCache, [selectedId]: updateMsg(state.messageCache[selectedId] || []) }
          : state.messageCache;

        return { messages: updatedMessages, messageCache: updatedCache };
      });
    });

    // ── messagesRead ──────────────────────────────────────────────────────────
    /**
     * Server sends this when the OTHER person opened our chat and read all messages.
     * Bulk-upgrades ALL our sent messages in this conversation to "read".
     * (grey ✓✓ → cyan ✓✓)
     *
     * We get { readBy, senderId } where:
     *   readBy  = the person who read (the receiver / other user)
     *   senderId = us (the original sender — we sent these messages)
     */
    socket.on("messagesRead", ({ readBy, senderId }) => {
      const { authUser } = useAuthStore.getState();
      // Only act if these are OUR messages being read by the current chat partner
      if (senderId !== authUser._id) return;
      if (readBy !== selectedUser._id) return;

      set((state) => {
        const updateMsg = (msgs) =>
          msgs.map((m) =>
            m.senderId === authUser._id && m.status !== "read"
              ? { ...m, status: "read" }
              : m,
          );

        const updatedMessages = updateMsg(state.messages);
        const selectedId = state.selectedUser?._id;
        const updatedCache = selectedId
          ? { ...state.messageCache, [selectedId]: updateMsg(state.messageCache[selectedId] || []) }
          : state.messageCache;

        return { messages: updatedMessages, messageCache: updatedCache };
      });
    });

    // ── typing / stopTyping ───────────────────────────────────────────────────
    /**
     * Server relays these events from the OTHER user typing in their input.
     * We store typing state as a map { userId: true/false } so the ChatHeader
     * can check if selectedUser._id is currently typing.
     */
    socket.on("typing", ({ senderId }) => {
      set((state) => ({
        typingUsers: { ...state.typingUsers, [senderId]: true },
      }));
    });

    socket.on("stopTyping", ({ senderId }) => {
      set((state) => ({
        typingUsers: { ...state.typingUsers, [senderId]: false },
      }));
    });
  },

  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (socket) {
      socket.off("newMessage");
      socket.off("messageStatusUpdate");
      socket.off("messagesRead");
      socket.off("typing");
      socket.off("stopTyping");
    }
  },
}));

