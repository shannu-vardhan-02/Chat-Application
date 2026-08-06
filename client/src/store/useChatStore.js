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
   * Fetch messages for a user — uses in-memory cache so switching between
   * contacts that are already loaded does NOT fire a new API request.
   * The cache is invalidated when a new message arrives or when the chat is deleted.
   */
  getMessagesByUserId: async (userId) => {
    const cached = get().messageCache[userId];
    if (cached) {
      // Cache hit — load instantly, no network request
      set({ messages: cached });
      return;
    }

    set({ isMessagesLoading: true });
    try {
      const res = await axiosInstance.get(`/messages/${userId}`);
      // Store in cache and in current messages
      set((state) => ({
        messages: res.data,
        messageCache: { ...state.messageCache, [userId]: res.data },
      }));
    } catch (error) {
      toast.error(error.response?.data?.message || "Something went wrong");
    } finally {
      set({ isMessagesLoading: false });
    }
  },

  sendMessage: async (messageData) => {
    const { selectedUser, messages } = get();
    const { authUser } = useAuthStore.getState();

    const tempId = `temp-${Date.now()}`;

    // Optimistic update: show message immediately before server confirms
    const optimisticMessage = {
      _id: tempId,
      senderId: authUser._id,
      receiverId: selectedUser._id,
      text: messageData.text,
      image: messageData.image,
      createdAt: new Date().toISOString(),
      isOptimistic: true,
    };
    set({ messages: [...messages, optimisticMessage] });

    try {
      const res = await axiosInstance.post(`/messages/send/${selectedUser._id}`, messageData);
      // Replace the optimistic message with the confirmed server message
      set((state) => {
        const updated = state.messages.map((m) => (m._id === tempId ? res.data : m));
        return {
          messages: updated,
          // Update cache for this user too
          messageCache: { ...state.messageCache, [selectedUser._id]: updated },
        };
      });
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

  // Listen for real-time incoming messages via Socket.IO
  subscribeToMessages: () => {
    const { selectedUser, isSoundEnabled } = get();
    if (!selectedUser) return;

    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    socket.on("newMessage", (newMessage) => {
      const isMessageSentFromSelectedUser = newMessage.senderId === selectedUser._id;
      if (!isMessageSentFromSelectedUser) return;

      const currentMessages = get().messages;
      const updated = [...currentMessages, newMessage];
      set((state) => ({
        messages: updated,
        // Keep cache in sync with real-time messages
        messageCache: { ...state.messageCache, [selectedUser._id]: updated },
      }));

      if (isSoundEnabled) {
        const notificationSound = new Audio("/sounds/notification.mp3");
        notificationSound.currentTime = 0;
        notificationSound.play().catch(() => {});
      }
    });
  },

  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (socket) socket.off("newMessage");
  },
}));
