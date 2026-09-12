import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";
import { useAuthStore } from "./store/useAuthStore";
import { useEffect } from "react";
import { Toaster } from "react-hot-toast";

// Lazy load pages to reduce initial bundle size
const ChatPage          = lazy(() => import("./pages/ChatPage"));
const LoginPage         = lazy(() => import("./pages/LoginPage"));
const SignUpPage        = lazy(() => import("./pages/SignUpPage"));
const PWAInstallPrompt  = lazy(() => import("./components/PWAInstallPrompt"));

// Minimal inline fallback — shown only while the lazy chunk downloads on first visit.
// Deliberately no external import so it renders synchronously without any added latency.
const PageSpinner = () => (
  <div className="h-screen w-screen flex items-center justify-center bg-slate-900">
    <span className="loading loading-spinner loading-lg text-cyan-400" />
  </div>
);

function App() {
  const { checkAuth, authUser } = useAuthStore();

  useEffect(() => {
    // Validate the JWT session server-side. The UI has already rendered instantly
    // from the optimistic localStorage hint — this call corrects state in the
    // background (e.g. token expired → clears authUser → redirects to /login).
    checkAuth();
  }, [checkAuth]);

  // No isCheckingAuth block — the UI renders immediately.
  // First visit (no localStorage hint): shows /login page instantly.
  // Return visit (hint present):        shows /chat page instantly.
  // checkAuth resolves in background and redirects if the session is invalid.

  return (
    <div className="h-screen w-screen bg-slate-900 relative overflow-hidden flex flex-col">
      <Suspense fallback={<PageSpinner />}>
        <Routes>
          <Route path="/"       element={authUser ? <ChatPage />  : <Navigate to="/login" />} />
          <Route path="/login"  element={!authUser ? <LoginPage /> : <Navigate to="/" />} />
          <Route path="/signup" element={!authUser ? <SignUpPage /> : <Navigate to="/" />} />
        </Routes>
      </Suspense>

      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "#1e293b",
            color: "#e2e8f0",
            border: "1px solid rgba(51,65,85,0.8)",
            borderRadius: "12px",
          },
        }}
      />

      {/* PWA install prompt + update banner — lazy loaded, shown conditionally */}
      <Suspense fallback={null}>
        <PWAInstallPrompt />
      </Suspense>
    </div>
  );
}

export default App;
