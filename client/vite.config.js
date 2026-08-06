import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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
}

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: { manualChunks },
    },
    chunkSizeWarningLimit: 600,
  },
});
