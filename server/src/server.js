import express from "express";
import path from "path";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/auth.routes.js";
import messageRoutes from "./routes/message.routes.js";
import { connectDB } from "./lib/db.js";

import { ENV } from "./lib/env.js";
const app = express();
const __dirname = path.resolve();

const PORT = ENV.PORT || 3000;

app.use(express.json()); // req.body will be undefined without this middleware
// req.body will contain the parsed JSON data sent by the client in the request body which is used in the signup and login controllers to get the user data for authentication and registration
app.use(cookieParser()); // to parse the cookies sent by the client in the request headers, which is used in the protectRoute middleware to get the token from the cookies for authentication

app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);

// make ready for deployment - frontend + backend
// if the client/dist folder exists, serve the static files from there
// static files means the files that are generated after building the react app, which are present in the dist folder of client
// by doing this, we can serve the frontend and backend from the same server, which is useful for deployment
// if (ENV.NODE_ENV === "production") {
//   // send the static files from react app
//   app.use(express.static(path.join(__dirname, "../client/dist")));
//   // if any route other than api is hit, send the index.html file of react app
//   app.get("*", (req, res) => {
//     res.sendFile(path.join(__dirname, "../client/dist/index.html"));
//   });
// }

app.listen(PORT, () => {
  console.log(`server is running in port ${PORT}`);
  connectDB();
});
