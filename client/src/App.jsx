import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";
import { useAuthStore } from "./store/useAuthStore";
import { useEffect } from "react";
import PageLoader from "./components/PageLoader";
import { Toaster } from "react-hot-toast";

// Lazy load pages to reduce initial bundle size
const ChatPage   = lazy(() => import("./pages/ChatPage"));
const LoginPage  = lazy(() => import("./pages/LoginPage"));
const SignUpPage = lazy(() => import("./pages/SignUpPage"));

function App() {
  const { checkAuth, isCheckingAuth, authUser } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (isCheckingAuth) return <PageLoader />;

  return (
    <div className="h-screen w-screen bg-slate-900 relative overflow-hidden flex flex-col">
      <Suspense fallback={<PageLoader />}>
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
    </div>
  );
}

export default App;
