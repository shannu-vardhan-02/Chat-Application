import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Manual chunk function for Vite v8 / rolldown compatibility
function manualChunks(id) {
  if (id.includes("node_modules/react") || id.includes("node_modules/react-dom") ||
      id.includes("node_modules/react-router") || id.includes("react-router-dom")) {
    return "vendor-react";
  }
  if (id.includes("node_modules/socket.io-client") || id.includes("node_modules/engine.io")) {
    return "vendor-socket";
  }
  if (id.includes("node_modules/lucide-react") || id.includes("node_modules/react-hot-toast")) {
    return "vendor-ui";
  }
  if (id.includes("node_modules/zustand") || id.includes("node_modules/axios")) {
    return "vendor-state";
  }
  if (id.includes("node_modules/dexie")) {
    return "vendor-idb";
  }
}

export default defineConfig({
  plugins: [
    react(),

    /**
     * VitePWA — Workbox-powered service worker + PWA manifest injection.
     *
     * mode: "generateSW"
     *   Workbox automatically generates a service worker from your build output.
     *   It fingerprints every asset and caches them with a Cache-first strategy.
     *   On deploy, it detects changed files and only updates those entries.
     *
     * registerType: "prompt"
     *   When a new SW version is available, we show a toast/banner asking the
     *   user to refresh ("New version available"). This is safer than
     *   "autoUpdate" which silently refreshes tabs mid-session.
     *
     * workbox.runtimeCaching:
     *   Rules for caching dynamic resources (API responses, images).
     *   App shell (JS/CSS/HTML) is pre-cached automatically by Workbox.
     */
    VitePWA({
      registerType: "prompt",
      injectRegister: "auto",

      // Include these files in the precache manifest
      includeAssets: ["favicon.svg", "icons/icon-192.png", "icons/icon-512.png", "avatar.png"],

      manifest: {
        name: "Charchalu",
        short_name: "Charchalu",
        description: "Real-time chat — offline ready. Chat with anyone, anywhere.",
        start_url: "/",
        display: "standalone",
        orientation: "portrait-primary",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        lang: "en",
        categories: ["social", "communication"],
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },

      workbox: {
        /**
         * Runtime caching rules — applied to requests NOT in the precache manifest.
         *
         * Strategy guide:
         *   NetworkFirst  — Try network, fall back to cache. Good for API data.
         *   CacheFirst    — Serve from cache, update in background. Good for stable assets.
         *   StaleWhileRevalidate — Serve cache immediately, update in background. Good for images.
         */
        runtimeCaching: [
          {
            // API calls — Network first so data is always fresh, fall back to cache offline
            urlPattern: /^https?:\/\/.*\/api\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Cloudinary images — Stale while revalidate (show cached, update in bg)
            urlPattern: /^https:\/\/res\.cloudinary\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "cloudinary-images",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Google Fonts / other CDN assets — Cache first (stable, long-lived)
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
        ],

        // BackgroundSync plugin — retries failed POST /api/messages/send requests
        // when the network comes back. Works in conjunction with useChatStore.sendMessage().
        // Note: The JS-level retry in useAuthStore.connectSocket is the primary mechanism.
        // BackgroundSync is the fallback for when the tab was closed.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        skipWaiting: false, // don't auto-activate new SW (we prompt the user)
        clientsClaim: false,
      },

      // Dev options: enable SW in development so we can test offline behaviour
      devOptions: {
        enabled: false, // set to true temporarily to test SW in dev mode
        type: "module",
      },
    }),
  ],

  build: {
    rollupOptions: {
      output: { manualChunks },
    },
    chunkSizeWarningLimit: 600,
  },
});
