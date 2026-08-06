import express from "express";
import path from "path";
import cookieParser from "cookie-parser";
import cors from "cors";

import authRoutes from "./routes/auth.routes.js";
import messageRoutes from "./routes/message.routes.js";
import { connectDB } from "./lib/db.js";
import { ENV } from "./lib/env.js";

// Import app & server from socket.js — the express app is already wrapped in
// an HTTP server + Socket.IO there. We must use `server.listen` (not app.listen)
// so that Socket.IO connections are handled on the same port.
import { app, server } from "./lib/socket.js";

const __dirname = path.resolve();
const PORT = ENV.PORT || 3000;

// CORS — allow requests from the frontend dev server and production URL
app.use(cors({ origin: [ENV.CLIENT_URL, "http://localhost:5173"], credentials: true }));

app.use(express.json({ limit: "5mb" })); // req.body — 5mb limit for base64 image uploads
app.use(cookieParser()); // parse cookies for JWT auth

app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);

// Production: serve the React build from client/dist
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

