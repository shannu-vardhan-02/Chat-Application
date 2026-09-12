import { create } from "zustand";
import { axiosInstance, pingBackend } from "../lib/axios";
import toast from "react-hot-toast";
import { io } from "socket.io-client";

// Socket connects to server root
const BASE_URL =
  import.meta.env.MODE === "development"
    ? "http://localhost:3000"
    : import.meta.env.VITE_BACKEND_URL
    ? import.meta.env.VITE_BACKEND_URL.replace(/\/api\/?$/, "")
    : "/";

/**
 * Optimistic auth state — read last-known user from localStorage.
 *
 * WHY: Without this, the app shows a full-screen spinner (isCheckingAuth=true)
 * while waiting for GET /auth/check-auth to resolve — which on Render free tier
 * can be 30–60s during a cold start. With this hint:
 *   1. We read the last stored user synchronously from localStorage
 *   2. Set isCheckingAuth=false immediately → no spinner on load
 *   3. Render the correct UI optimistically (chat or login)
 *   4. checkAuth() runs in the background and corrects state if needed
 *      (e.g. token expired → clears user → redirects to login)
 *
 * SECURITY NOTE: This is only a UI hint, never a security bypass.
 *   - The JWT cookie is still validated server-side on every protected request.
 *   - If the token is expired/revoked, the first real API call returns 401,
 *     which the auth middleware handles by clearing the user and redirecting.
 *   - Private data is never shown from this hint alone — chat messages
 *     are fetched from the server after the hint is set.
 *
 * The hint is cleared on logout and updated on every successful checkAuth.
 */
function getOptimisticAuthUser() {
  try {
    const raw = localStorage.getItem("auth_user_hint");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setAuthUserHint(user) {
  try {
    if (user) {
      localStorage.setItem("auth_user_hint", JSON.stringify(user));
    } else {
      localStorage.removeItem("auth_user_hint");
    }
  } catch {}
}

const optimisticUser = getOptimisticAuthUser();

export const useAuthStore = create((set, get) => ({
  // If we have a stored hint, start as authenticated — no spinner.
  // If no hint, start unauthenticated — no spinner either.
  // In both cases isCheckingAuth=false so the UI renders immediately.
  authUser: optimisticUser,
  isCheckingAuth: false,
  isSigningUp: false,
  isLoggingIn: false,
  socket: null,
  onlineUsers: [],

  // Called on app mount to validate the session and correct the optimistic state.
  // Also fires a background ping to wake the Render server in parallel.
  checkAuth: async () => {
    // 1. Fire ping immediately — wakes the Render server in parallel with React init.
    //    This is fire-and-forget; we don't await it.
    pingBackend();

    try {
      const res = await axiosInstance.get("/auth/check-auth");
      // Session is valid — update hint with fresh user data
      setAuthUserHint(res.data);
      set({ authUser: res.data });
      get().connectSocket();
    } catch (error) {
      // 401 = expected when logged out or token expired
      if (import.meta.env.MODE === "development" && error?.response?.status !== 401) {
        console.log("Error in authCheck:", error);
      }
      // Clear both state and localStorage hint on auth failure
      setAuthUserHint(null);
      set({ authUser: null });
    }
    // No finally needed — isCheckingAuth was never set to true
  },

  signup: async (data) => {
    set({ isSigningUp: true });
    try {
      const res = await axiosInstance.post("/auth/signup", data);
      setAuthUserHint(res.data); // persist hint for optimistic load on next visit
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
      setAuthUserHint(res.data); // persist hint for optimistic load on next visit
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
      // Clear the localStorage hint FIRST so the next page load doesn't see stale auth
      setAuthUserHint(null);
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
