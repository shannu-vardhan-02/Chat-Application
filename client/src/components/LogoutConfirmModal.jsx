import { useEffect } from "react";
import { LogOutIcon, XIcon, Loader2Icon } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";

const mouseClickSound = new Audio("/sounds/mouse-click.mp3");

function LogoutConfirmModal() {
  const { isLogoutModalOpen, setIsLogoutModalOpen, isLoggingOut, logout } = useAuthStore();
  const { isSoundEnabled } = useChatStore();

  const playClick = () => {
    if (isSoundEnabled) {
      mouseClickSound.currentTime = 0;
      mouseClickSound.play().catch(() => {});
    }
  };

  const handleClose = () => {
    if (isLoggingOut) return;
    playClick();
    setIsLogoutModalOpen(false);
  };

  const handleConfirm = async () => {
    playClick();
    await logout();
  };

  // Close on Escape key
  useEffect(() => {
    if (!isLogoutModalOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape" && !isLoggingOut) {
        setIsLogoutModalOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLogoutModalOpen, isLoggingOut, setIsLogoutModalOpen]);

  if (!isLogoutModalOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-modal-title"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 overflow-hidden flex flex-col space-y-4 animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={handleClose}
          disabled={isLoggingOut}
          className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors disabled:opacity-50"
          title="Close"
          aria-label="Close"
        >
          <XIcon className="size-4" />
        </button>

        {/* Modal Header with Icon */}
        <div className="flex flex-col items-center text-center space-y-3 pt-1">
          <div className="size-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shadow-inner">
            <LogOutIcon className="size-6" />
          </div>

          <div className="space-y-1">
            <h3 id="logout-modal-title" className="text-base font-semibold text-slate-100">
              Log out of Charchalu?
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed max-w-[260px] mx-auto">
              Are you sure you want to log out? You will need to sign in again to continue chatting.
            </p>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={isLoggingOut}
            className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700/80 text-slate-300 hover:text-slate-100 font-medium text-sm transition-all border border-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>

          <button
            type="button"
            id="confirm-logout-btn"
            onClick={handleConfirm}
            disabled={isLoggingOut}
            className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white font-medium text-sm transition-all shadow-md shadow-rose-600/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoggingOut ? (
              <>
                <Loader2Icon className="size-4 animate-spin" />
                <span>Logging out…</span>
              </>
            ) : (
              <span>Log Out</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default LogoutConfirmModal;
