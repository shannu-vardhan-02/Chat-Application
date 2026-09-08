import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import toast from "react-hot-toast";
import { useAuthStore } from "./useAuthStore";
import {
  conversationKey,
  getLocalMessages,
  upsertLocalMessage,
  bulkUpsertMessages,
  getLocalConversation,
  upsertLocalConversation,
  getPendingMessages,
  updateMessageSyncStatus,
} from "../lib/db";

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
  // Phase D: true when there are messages queued for offline sync
  hasPendingMessages: false,

  setSearchQuery: (query) => set({ searchQuery: query }),
  setIsSettingsOpen: (isOpen) => set({ isSettingsOpen: isOpen }),
  toggleSound: () => {
    localStorage.setItem("isSoundEnabled", !get().isSoundEnabled);
    set({ isSoundEnabled: !get().isSoundEnabled });
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedUser: (selectedUser) => {
    set({ selectedUser });
    if (selectedUser) {
      // Clear unread count for this user in sidebar
      set((state) => ({
        chats: state.chats.map((c) =>
          String(c._id) === String(selectedUser._id) ? { ...c, unreadCount: 0 } : c
        ),
      }));

      // Immediately emit markRead to server so sender gets cyan ticks in real time
      const socket = useAuthStore.getState().socket;
      if (socket?.connected) {
        socket.emit("markRead", { senderId: selectedUser._id });
      }
    }
  },

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
   * Fetch messages for a conversation — IDB-first, then delta sync.
   *
   * ── Phase C: IDB-first load pattern ─────────────────────────────────────────
   *
   * How it works:
   *   1. READ from IndexedDB instantly → render immediately (0ms "load")
   *   2. Determine the newest cached message timestamp
   *   3. Fire GET /messages/:id?since=<timestamp> in the background
   *   4. Merge the delta (new messages only) into IDB + Zustand
   *
   * WHY: WhatsApp/Telegram feel instant because they show cached messages
   * while syncing in the background. Without this, every conversation open
   * shows a loading spinner while waiting for Atlas.
   *
   * FALLBACK: If IDB read fails or returns nothing, we fall back to the
   * original full HTTP fetch (identical to old behaviour).
   *
   * CACHE COMPATIBILITY: We keep the in-memory messageCache working so
   * existing code that reads it (loadMoreMessages, etc.) still works.
   */
  getMessagesByUserId: async (userId) => {
    const { authUser } = useAuthStore.getState();
    if (!authUser) return;

    const myId = String(authUser._id);
    const otherId = String(userId);
    const convKey = conversationKey(myId, otherId);

    // ── Step 1: Try IDB cache first ───────────────────────────────────────
    const localMessages = await getLocalMessages(convKey);

    if (localMessages.length > 0) {
      // Show cached messages instantly — no loading spinner!
      set({
        messages: localMessages,
        messageCache: { ...get().messageCache, [userId]: localMessages },
        isMessagesLoading: false,
        hasMoreMessages: get().hasMoreCache?.[userId] ?? false,
      });

      // ── Step 2: Delta sync in the background ─────────────────────────────
      // Find the newest message timestamp we have cached
      const newestMsg = localMessages[localMessages.length - 1];
      const since = encodeURIComponent(newestMsg.createdAt);

      try {
        const res = await axiosInstance.get(`/messages/${userId}?since=${since}`);
        const { messages: deltaMessages } = res.data;

        if (deltaMessages.length > 0) {
          // Write new messages to IDB
          await bulkUpsertMessages(deltaMessages, myId);

          // Merge into current state (append new messages, deduplicate by _id)
          set((state) => {
            const existingIds = new Set(state.messages.map((m) => String(m._id)));
            const trulyNew = deltaMessages.filter((m) => !existingIds.has(String(m._id)));
            if (trulyNew.length === 0) return state;

            const updated = [...state.messages, ...trulyNew];
            return {
              messages: updated,
              messageCache: { ...state.messageCache, [userId]: updated },
            };
          });
        }

        // Update last sync timestamp
        await upsertLocalConversation({
          conversationKey: convKey,
          lastSyncAt: new Date().toISOString(),
        });
      } catch {
        // Delta sync failed — cached data is still shown; user sees it instantly
        // They just might be missing a few recent messages until next sync
      }

      return;
    }

    // ── Step 3: No IDB cache — fall back to full HTTP fetch ───────────────
    // This is the original behaviour: show loading spinner, fetch 30 msgs
    const cached = get().messageCache[userId];
    if (cached) {
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

      // Write to IDB for future instant loads
      await bulkUpsertMessages(messages, myId);
      await upsertLocalConversation({
        conversationKey: convKey,
        lastSyncAt: new Date().toISOString(),
      });

      set((state) => ({
        messages,
        messageCache: { ...state.messageCache, [userId]: messages },
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
   * Phase 3: cursor-based pagination (unchanged from before, now also writes to IDB).
   */
  loadMoreMessages: async (userId) => {
    const { messages, isLoadingMoreMessages, hasMoreMessages } = get();
    const { authUser } = useAuthStore.getState();

    if (isLoadingMoreMessages || !hasMoreMessages) return;

    const oldestMessage = messages[0];
    if (!oldestMessage) return;

    set({ isLoadingMoreMessages: true });
    try {
      const cursor = encodeURIComponent(oldestMessage.createdAt);
      const res = await axiosInstance.get(`/messages/${userId}?before=${cursor}&limit=30`);
      const { messages: olderMessages, hasMore } = res.data;

      // Write to IDB
      if (authUser) {
        await bulkUpsertMessages(olderMessages, String(authUser._id));
      }

      set((state) => {
        const updated = [...olderMessages, ...state.messages];
        return {
          messages: updated,
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
   * Sends a message with an optimistic update and offline queue support.
   *
   * ── Phase A: clientId idempotency ────────────────────────────────────────────
   *   A UUID is generated before the HTTP request. The server stores it and
   *   deduplicates retries by clientId. Safe to retry any number of times.
   *
   * ── Phase C: IDB write ───────────────────────────────────────────────────────
   *   The message is written to IDB immediately (syncStatus: "pending").
   *   On server confirm: syncStatus → "synced", _id updated.
   *
   * ── Phase D: Offline queue ───────────────────────────────────────────────────
   *   If the HTTP request fails (offline), the message stays in IDB as "pending".
   *   The service worker BackgroundSync tag "sync-pending-messages" will retry
   *   automatically when the network recovers.
   *
   * ── Optimistic update (unchanged from before) ───────────────────────────────
   *   The message is shown immediately with status "sending" before the server
   *   confirms. On success → replaced with server response. On failure → IDB
   *   entry stays "pending" with a visual indicator.
   */
  sendMessage: async (messageData) => {
    const { selectedUser, messages } = get();
    const { authUser } = useAuthStore.getState();

    // Generate a unique ID for this message BEFORE sending
    // This is the cornerstone of idempotency: if the network fails and we
    // retry, the server recognises clientId and returns the existing message.
    const clientId = crypto.randomUUID();
    const tempId = `temp-${clientId}`;

    const optimisticMessage = {
      _id: tempId,
      clientId,
      senderId: authUser._id,
      receiverId: selectedUser._id,
      text: messageData.text,
      image: messageData.image || null,
      createdAt: new Date().toISOString(),
      status: "sending",   // client-only — shows a clock/dot icon
      syncStatus: "pending",
      isOptimistic: true,
    };

    // Show the message immediately in the UI
    set({ messages: [...messages, optimisticMessage] });

    // Write to IDB immediately — this is what survives if the tab closes
    const { authUser: currentUser } = useAuthStore.getState();
    if (currentUser && selectedUser) {
      const convKey = conversationKey(String(currentUser._id), String(selectedUser._id));
      await upsertLocalMessage({
        ...optimisticMessage,
        conversationKey: convKey,
      });
    }

    try {
      const res = await axiosInstance.post(`/messages/send/${selectedUser._id}`, {
        ...messageData,
        clientId, // 👈 Phase A: pass clientId to server for idempotency
      });

      // Server confirmed — update the IDB record with real _id + "synced" status
      await updateMessageSyncStatus(clientId, "synced", {
        _id: res.data._id,
        status: res.data.status,
        createdAt: res.data.createdAt,
      });

      // Replace the optimistic message with the confirmed server message
      set((state) => {
        const updated = state.messages.map((m) => (m._id === tempId ? res.data : m));
        return {
          messages: updated,
          messageCache: { ...state.messageCache, [selectedUser._id]: updated },
        };
      });

      // Optimistically update the sidebar `chats` state locally (zero network overhead)
      set((state) => {
        const preview = messageData.text ? messageData.text.slice(0, 60) : "[Photo]";
        const existingChatIndex = state.chats.findIndex((c) => c._id === selectedUser._id);

        if (existingChatIndex !== -1) {
          const updatedChat = {
            ...state.chats[existingChatIndex],
            lastMessageText: preview,
            lastMessageAt: new Date().toISOString(),
          };
          const remainingChats = state.chats.filter((_, idx) => idx !== existingChatIndex);
          return { chats: [updatedChat, ...remainingChats] };
        } else {
          const newChatEntry = {
            ...selectedUser,
            lastMessageText: preview,
            lastMessageAt: new Date().toISOString(),
            unreadCount: 0,
          };
          return { chats: [newChatEntry, ...state.chats] };
        }
      });
    } catch (error) {
      // Network error — keep the message in IDB as "pending" so BackgroundSync
      // can retry it when the network recovers. We do NOT remove the optimistic
      // message from the UI — instead we change its status to "pending".
      const isNetworkError = !error.response;

      if (isNetworkError) {
        // Register service worker BackgroundSync so the SW retries on reconnect
        if ("serviceWorker" in navigator && "SyncManager" in window) {
          try {
            const registration = await navigator.serviceWorker.ready;
            await registration.sync.register("sync-pending-messages");
          } catch (syncErr) {
            console.warn("[SW] BackgroundSync registration failed:", syncErr);
          }
        }

        // Update the optimistic message to show "pending" state
        set((state) => ({
          messages: state.messages.map((m) =>
            m._id === tempId ? { ...m, syncStatus: "pending", status: "sending" } : m
          ),
          hasPendingMessages: true,
        }));
        // Don't show error toast — message is queued, not lost
      } else {
        // Server rejected the message — remove optimistic update and mark IDB failed
        await updateMessageSyncStatus(clientId, "failed");
        set((state) => ({ messages: state.messages.filter((m) => m._id !== tempId) }));
        toast.error(error.response?.data?.message || "Something went wrong");
      }
    }
  },

  /**
   * Retry all pending messages in IDB.
   * Called when the app detects network recovery or the user taps "Retry".
   */
  retryPendingMessages: async () => {
    const pending = await getPendingMessages();
    if (pending.length === 0) {
      set({ hasPendingMessages: false });
      return;
    }

    for (const msg of pending) {
      try {
        const res = await axiosInstance.post(`/messages/send/${msg.receiverId}`, {
          text: msg.text,
          image: msg.image,
          clientId: msg.clientId,
        });

        await updateMessageSyncStatus(msg.clientId, "synced", {
          _id: res.data._id,
          status: res.data.status,
        });

        // Update UI if this conversation is currently open
        const { selectedUser } = get();
        if (selectedUser && String(selectedUser._id) === String(msg.receiverId)) {
          set((state) => ({
            messages: state.messages.map((m) =>
              m.clientId === msg.clientId ? { ...m, ...res.data } : m
            ),
          }));
        }
      } catch (err) {
        // Still offline or server error — leave as pending
        console.warn("[Retry] Failed to send pending message:", err.message);
      }
    }

    // Check if any are still pending
    const remaining = await getPendingMessages();
    set({ hasPendingMessages: remaining.length > 0 });
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
   * Initialize all chat socket listeners globally on the Socket.IO connection.
   *
   * Called as soon as the socket connects in useAuthStore (and on reconnects).
   * Having listeners registered globally ensures:
   *   1. Messages from any user arrive live even when the chat is not open
   *   2. Delivered ACKs are emitted immediately on receipt
   *   3. Read ACKs are emitted immediately when the chat is open
   *   4. Tick marks (✓ → ✓✓ → cyan ✓✓) update live across both sender & receiver
   *
   * ── Phase C addition: every incoming message is also written to IDB ─────────
   *   This ensures that background messages (from users not currently open)
   *   are persisted locally and available instantly next time you open that chat.
   */
  initSocketListeners: (socket) => {
    if (!socket) return;

    // Remove any previously bound listeners to avoid duplicate events
    socket.off("newMessage");
    socket.off("messageStatusUpdate");
    socket.off("messagesRead");
    socket.off("typing");
    socket.off("stopTyping");

    // ── 1. newMessage ──────────────────────────────────────────────────────────
    socket.on("newMessage", async (newMessage) => {
      const { selectedUser, isSoundEnabled } = get();
      const { authUser } = useAuthStore.getState();
      const isFromSelectedUser =
        selectedUser && String(newMessage.senderId) === String(selectedUser._id);

      // Phase C: write to IDB regardless of whether chat is open
      if (authUser) {
        const myId = String(authUser._id);
        const otherId = String(newMessage.senderId) === myId
          ? String(newMessage.receiverId)
          : String(newMessage.senderId);
        await upsertLocalMessage({
          ...newMessage,
          syncStatus: "synced",
          conversationKey: conversationKey(myId, otherId),
        });
      }

      if (isFromSelectedUser) {
        // Message is from the active chat — append to visible messages
        set((state) => {
          if (state.messages.some((m) => String(m._id) === String(newMessage._id))) return state;
          const updated = [...state.messages, newMessage];
          return {
            messages: updated,
            messageCache: { ...state.messageCache, [selectedUser._id]: updated },
          };
        });

        // 1. Immediately ACK delivery so sender gets ✓✓ (grey)
        socket.emit("messageDelivered", {
          messageId: newMessage._id,
          senderId: newMessage.senderId,
        });

        // 2. Since chat is actively open, immediately ACK read so sender gets ✓✓ (cyan)
        socket.emit("markRead", {
          senderId: newMessage.senderId,
        });

        if (isSoundEnabled) {
          const notificationSound = new Audio("/sounds/notification.mp3");
          notificationSound.currentTime = 0;
          notificationSound.play().catch(() => {});
        }
      } else {
        // Message is from a background contact:
        // 1. ACK delivery so sender gets ✓✓ (message reached device!)
        socket.emit("messageDelivered", {
          messageId: newMessage._id,
          senderId: newMessage.senderId,
        });

        // 2. Update sidebar locally with preview, timestamp, and unread badge (+1)
        set((state) => {
          const preview = newMessage.text ? newMessage.text.slice(0, 60) : "[Photo]";
          const existingChatIndex = state.chats.findIndex(
            (c) => String(c._id) === String(newMessage.senderId)
          );

          if (existingChatIndex !== -1) {
            const updatedChat = {
              ...state.chats[existingChatIndex],
              lastMessageText: preview,
              lastMessageAt: newMessage.createdAt || new Date().toISOString(),
              unreadCount: (state.chats[existingChatIndex].unreadCount || 0) + 1,
            };
            const remainingChats = state.chats.filter((_, idx) => idx !== existingChatIndex);
            return { chats: [updatedChat, ...remainingChats] };
          } else {
            // New user sent message — fetch chats list once
            get().getMyChatPartners();
            return {};
          }
        });

        if (isSoundEnabled) {
          const notificationSound = new Audio("/sounds/notification.mp3");
          notificationSound.currentTime = 0;
          notificationSound.play().catch(() => {});
        }
      }
    });

    // ── 2. messageStatusUpdate (e.g. sent → delivered) ────────────────────────
    socket.on("messageStatusUpdate", ({ messageId, status }) => {
      set((state) => {
        const updateMsg = (msgs) =>
          msgs.map((m) => (String(m._id) === String(messageId) ? { ...m, status } : m));

        const updatedMessages = updateMsg(state.messages);
        const selectedId = state.selectedUser?._id;
        const updatedCache = selectedId
          ? { ...state.messageCache, [selectedId]: updateMsg(state.messageCache[selectedId] || []) }
          : state.messageCache;

        return { messages: updatedMessages, messageCache: updatedCache };
      });
    });

    // ── 3. messagesRead (e.g. receiver opened chat → turn sent messages cyan) ──
    socket.on("messagesRead", ({ readBy, senderId }) => {
      const { authUser } = useAuthStore.getState();
      if (!authUser) return;

      set((state) => {
        const updateMsg = (msgs) =>
          msgs.map((m) =>
            String(m.senderId) === String(authUser._id) &&
            String(m.receiverId) === String(readBy) &&
            m.status !== "read"
              ? { ...m, status: "read" }
              : m
          );

        const updatedMessages = updateMsg(state.messages);
        const selectedId = state.selectedUser?._id;
        const updatedCache = selectedId
          ? { ...state.messageCache, [selectedId]: updateMsg(state.messageCache[selectedId] || []) }
          : state.messageCache;

        return { messages: updatedMessages, messageCache: updatedCache };
      });
    });

    // ── 4. typing & stopTyping ─────────────────────────────────────────────────
    socket.on("typing", ({ senderId }) => {
      set((state) => ({
        typingUsers: { ...state.typingUsers, [String(senderId)]: true },
      }));
    });

    socket.on("stopTyping", ({ senderId }) => {
      set((state) => ({
        typingUsers: { ...state.typingUsers, [String(senderId)]: false },
      }));
    });
  },

  // Backward compatibility: alias to initSocketListeners
  subscribeToMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (socket) {
      get().initSocketListeners(socket);
    }
  },

  unsubscribeFromMessages: () => {
    // Keep global listeners active; no-op to prevent tearing down listeners on chat navigation
  },
}));
