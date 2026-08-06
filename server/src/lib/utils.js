import jwt from "jsonwebtoken";
import { ENV } from "./env.js";

export const generateToken = (userId, res) => {
  const { JWT_SECRET } = ENV;
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  const token = jwt.sign({ userId }, JWT_SECRET, {
    expiresIn: "7d",
  });

  // Cookie name is "jwt" — must match auth.middleware.js and socket.auth.middleware.js
  res.cookie("jwt", token, {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    httpOnly: true, // this will prevent the cookie from being accessed by client-side JavaScript for security reasons
    secure: ENV.NODE_ENV === "development" ? false : true, // this will ensure that the cookie is only sent over HTTPS in production for security reasons
    sameSite: "strict", // this will prevent the cookie from being sent in cross-site requests for security reasons
  });

  return token;
};
