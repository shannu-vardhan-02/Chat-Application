import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import toast from "react-hot-toast";
import { io } from "socket.io-client";

// Socket connects to server root
const BASE_URL =
  import.meta.env.MODE === "development"
    ? "http://localhost:3000"
    : import.meta.env.VITE_BACKEND_URL
    ? import.meta.env.VITE_BACKEND_URL.replace(/\/api\/?$/, "")
    : "/";

export const useAuthStore = create((set, get) => ({
  authUser: null,
  isCheckingAuth: true,
  isSigningUp: false,
  isLoggingIn: false,
  socket: null,
  onlineUsers: [],

  // Called on app mount to restore the session from the JWT cookie
  checkAuth: async () => {
    try {
      const res = await axiosInstance.get("/auth/check-auth");
      set({ authUser: res.data });
      get().connectSocket();
    } catch (error) {
      // 401 is expected when user is not logged in — only log real errors in dev
      if (import.meta.env.MODE === "development" && error?.response?.status !== 401) {
        console.log("Error in authCheck:", error);
      }
      set({ authUser: null });
    } finally {
      set({ isCheckingAuth: false });
    }
  },

  signup: async (data) => {
    set({ isSigningUp: true });
    try {
      const res = await axiosInstance.post("/auth/signup", data);
      set({ authUser: res.data });

      toast.success("Account created successfully!");
      get().connectSocket();
    } catch (error) {
      toast.error(error.response?.data?.message || "Signup failed. Please try again.");
    } finally {
      set({ isSigningUp: false });
    }
  },

  login: async (data) => {
    set({ isLoggingIn: true });
    try {
      const res = await axiosInstance.post("/auth/login", data);
      set({ authUser: res.data });

      toast.success("Logged in successfully");
      get().connectSocket();
    } catch (error) {
      toast.error(error.response?.data?.message || "Login failed. Please check network/credentials.");
    } finally {
      set({ isLoggingIn: false });
    }
  },

  logout: async () => {
    try {
      await axiosInstance.post("/auth/logout");
      set({ authUser: null });

      // Unsubscribe from push notifications (remove subscription from server)
      import("../lib/push").then(({ unsubscribeFromPush }) => {
        unsubscribeFromPush().catch(() => {});
      });

      // Clear local IndexedDB so no sensitive messages linger on shared devices
      import("../lib/db").then(({ clearLocalDB }) => clearLocalDB()).catch(() => {});

      toast.success("Logged out successfully");
      get().disconnectSocket();
    } catch (error) {
      toast.error(error.response?.data?.message || "Error logging out");
      console.log("Logout error:", error);
    }
  },

  updateProfile: async (data) => {
    try {
      const res = await axiosInstance.put("/auth/update-profile", data);
      set({ authUser: res.data.user || res.data });
      toast.success("Profile updated successfully");
    } catch (error) {
      console.log("Error in update profile:", error);
      toast.error(error.response?.data?.message || "Failed to update profile");
    }
  },

  // Open a Socket.IO connection using the JWT cookie for auth
  connectSocket: () => {
    const { authUser, socket: existingSocket } = get();
    if (!authUser) return;
    if (existingSocket?.connected) return;

    // Disconnect stale socket instance if any
    if (existingSocket) {
      existingSocket.disconnect();
    }

    const socket = io(BASE_URL, {
      withCredentials: true,
      autoConnect: false,
    });

    // Listen for online users broadcast BEFORE connect so initial sync is never missed
    socket.on("getOnlineUsers", (userIds) => {
      console.log("[SOCKET] Received online users:", userIds);
      set({ onlineUsers: (userIds || []).map(String) });
    });

    socket.on("connect", () => {
      console.log("[SOCKET] Connected:", socket.id);
      socket.emit("requestOnlineUsers");
      // Initialize chat listeners upon connection and reconnection
      import("./useChatStore").then(({ useChatStore }) => {
        useChatStore.getState().initSocketListeners(socket);
        // On reconnect, retry any messages that were queued while offline
        useChatStore.getState().retryPendingMessages();
      });

      // Subscribe to push notifications after socket connects (deferred so it
      // doesn't block the connection and doesn't interrupt the user)
      setTimeout(() => {
        import("../lib/push").then(({ subscribeToPush }) => {
          subscribeToPush().catch(() => {});
        });
      }, 2000); // 2s delay so user is settled into the app before permission prompt
    });

    socket.on("disconnect", (reason) => {
      console.log("[SOCKET] Disconnected:", reason);
    });

    socket.connect();
    set({ socket });

    // Also initialize immediately so listeners are ready
    import("./useChatStore").then(({ useChatStore }) => {
      useChatStore.getState().initSocketListeners(socket);
    });
  },

  disconnectSocket: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, onlineUsers: [] });
    }
  },
}));
