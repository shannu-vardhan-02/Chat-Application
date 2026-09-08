import { useState, useEffect } from "react";
import { Download, X, RefreshCw } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * PWAInstallPrompt — Two responsibilities:
 *
 * 1. INSTALL PROMPT:
 *    The browser fires "beforeinstallprompt" when the PWA installability criteria
 *    are met (manifest present, SW registered, app not already installed, HTTPS).
 *    We capture this event and show our own styled "Install App" button.
 *    Clicking it shows the native browser install dialog.
 *
 * 2. UPDATE BANNER:
 *    vite-plugin-pwa's useRegisterSW hook notifies us when a new service worker
 *    version is ready (registerType: "prompt" in vite.config.js).
 *    We show a "New version available — Refresh" banner.
 *    Clicking it calls updateServiceWorker(true) which skips waiting + reloads.
 *
 * WHY NOT AUTO-REFRESH:
 *    Auto-refreshing mid-session would discard unsent messages and disrupt UX.
 *    We let the user choose when to update.
 */
function PWAInstallPrompt() {
  // Capture the beforeinstallprompt event
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [isInstallDismissed, setIsInstallDismissed] = useState(
    () => localStorage.getItem("pwa-install-dismissed") === "true"
  );

  // useRegisterSW: vite-plugin-pwa hook for SW lifecycle
  // needRefresh = true means a new SW is waiting (user should refresh)
  // offlineReady = true means the app is fully cached for offline use
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(registration) {
      console.log("[PWA] Service worker registered:", registration?.scope);
    },
    onRegisterError(error) {
      console.warn("[PWA] Service worker registration failed:", error);
    },
  });

  useEffect(() => {
    const handler = (e) => {
      // Prevent the browser's default mini-infobar (Chrome on Android)
      e.preventDefault();
      // Save the event — we'll trigger it when the user clicks our button
      setInstallPromptEvent(e);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Handle install button click
  const handleInstall = async () => {
    if (!installPromptEvent) return;
    // Show the native install dialog
    installPromptEvent.prompt();
    // Wait for the user's choice
    const { outcome } = await installPromptEvent.userChoice;
    if (outcome === "accepted") {
      setInstallPromptEvent(null); // hide our button — app is installed
    }
  };

  // Dismiss the install prompt (user doesn't want to install)
  const handleInstallDismiss = () => {
    localStorage.setItem("pwa-install-dismissed", "true");
    setIsInstallDismissed(true);
  };

  // Dismiss the offline-ready toast
  const handleOfflineReadyClose = () => setOfflineReady(false);

  // Refresh for the new SW version
  const handleUpdate = () => {
    updateServiceWorker(true);
    setNeedRefresh(false);
  };

  return (
    <>
      {/* ── Offline Ready Toast (shown once when app is first fully cached) ── */}
      {offlineReady && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50
            flex items-center gap-3 px-4 py-2.5 rounded-xl
            bg-slate-800 border border-slate-700 shadow-2xl text-sm text-slate-200
            animate-in slide-in-from-bottom-4 duration-300"
        >
          <span className="size-2 rounded-full bg-emerald-400 shrink-0" />
          <span>App ready for offline use</span>
          <button
            onClick={handleOfflineReadyClose}
            className="ml-1 text-slate-400 hover:text-slate-200 transition-colors"
            aria-label="Dismiss"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* ── New Version Available Banner ──────────────────────────────────── */}
      {needRefresh && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50
            flex items-center gap-3 px-4 py-2.5 rounded-xl
            bg-indigo-900/90 border border-indigo-700 shadow-2xl text-sm text-slate-100
            backdrop-blur-sm animate-in slide-in-from-bottom-4 duration-300"
        >
          <RefreshCw className="size-4 text-indigo-300 shrink-0" />
          <span>New version available</span>
          <button
            onClick={handleUpdate}
            className="ml-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500
              text-xs font-medium transition-colors"
          >
            Refresh
          </button>
          <button
            onClick={() => setNeedRefresh(false)}
            className="text-slate-400 hover:text-slate-200 transition-colors"
            aria-label="Dismiss"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* ── Install App Banner ────────────────────────────────────────────── */}
      {installPromptEvent && !isInstallDismissed && (
        <div
          className="fixed bottom-20 right-4 z-50
            flex items-center gap-3 px-4 py-3 rounded-xl
            bg-slate-800 border border-cyan-700/50 shadow-2xl
            animate-in slide-in-from-right-4 duration-300 max-w-xs"
        >
          <img
            src="/icons/icon-192.png"
            alt="Charchalu"
            className="size-10 rounded-xl shrink-0 object-cover"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-100">Install Charchalu</p>
            <p className="text-xs text-slate-400 mt-0.5">Add to home screen for offline use</p>
          </div>
          <div className="flex flex-col gap-1.5 shrink-0">
            <button
              onClick={handleInstall}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg
                bg-cyan-600 hover:bg-cyan-500 text-xs font-medium text-white transition-colors"
            >
              <Download className="size-3" />
              Install
            </button>
            <button
              onClick={handleInstallDismiss}
              className="text-[10px] text-slate-500 hover:text-slate-400 transition-colors text-center"
            >
              Not now
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default PWAInstallPrompt;
