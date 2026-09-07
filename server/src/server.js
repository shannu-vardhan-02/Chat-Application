import express from "express";
import path from "path";
import cookieParser from "cookie-parser";
import cors from "cors";

import authRoutes from "./routes/auth.routes.js";
import messageRoutes from "./routes/message.routes.js";
import uploadRoutes from "./routes/upload.routes.js";
import diagnosticsRoutes from "./routes/diagnostics.routes.js";
import { requestTracker } from "./middlewares/requestTracker.middleware.js";
import { connectDB } from "./lib/db.js";
import { ENV } from "./lib/env.js";
import { app, server } from "./lib/socket.js";

const __dirname = path.resolve();
const PORT = ENV.PORT || 3000;

// Allowed origins (stripping trailing slashes)
const allowedOrigins = [
  ENV.CLIENT_URL?.replace(/\/$/, ""),
  "http://localhost:5173",
  "https://chat-application-pearl-five.vercel.app",
].filter(Boolean);

// Dynamic CORS middleware supporting Vercel <-> Render cross-domain authentication
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const cleanOrigin = origin.replace(/\/$/, "");
      if (allowedOrigins.includes(cleanOrigin) || cleanOrigin.endsWith(".vercel.app")) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "100kb" })); // Images no longer pass through server — only small JSON payloads
app.use(cookieParser()); // parse cookies for JWT authentication
app.use(requestTracker); // Track every request duration, requestId, and telemetry

app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/diagnostics", diagnosticsRoutes);

// Deployment: serve static frontend if dist folder exists
if (ENV.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../client/dist")));
  app.get("*", (_, res) => {
    res.sendFile(path.join(__dirname, "../client/dist/index.html"));
  });
}

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  connectDB();
});
