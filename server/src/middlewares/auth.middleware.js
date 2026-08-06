import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import { ENV } from "../lib/env.js";

export const protectRoute = async (req, res, next) => {
  const token = req.cookies.jwt; // must match cookie name in utils.js
  if (!token) {
    return res.status(401).json({ message: "Unauthorized, no token provided" });
  }
  try {
    const decoded = jwt.verify(token, ENV.JWT_SECRET); // decoded token contains userId
    if (!decoded) {
      return res.status(401).json({ message: "Unauthorized, invalid token" });
    }

    const user = await User.findById(decoded.userId).select("-password"); // Fetch user by decoded.userId
    if (!user) {
      return res.status(401).json({ message: "Unauthorized, user not found" });
    }

    req.user = user; // Attach the user object to the request for use in subsequent middleware or route handlers
    next(); // Proceed to the next middleware or route handler
  } catch (error) {
    console.error("Token verification failed:", error);
    return res.status(401).json({ message: "Unauthorized, invalid token" });
  }
};
