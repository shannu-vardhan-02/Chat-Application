import express from "express";
import {
  login,
  logout,
  signup,
  updateProfile,
} from "../controllers/auth.controller.js";
import { protectRoute } from "../middlewares/auth.middleware.js";
import { arcjetProtection } from "../middlewares/arcjet.middleware.js";

const router = express.Router();

router.use(arcjetProtection); // Apply Arcjet protection to all auth routes

router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", logout);
// the above routes are all POST because they are changing the state of the server (creating a user, creating a session, deleting a session), if they were GET, they would be idempotent and not change the state of the server
router.put("/update-profile", protectRoute, updateProfile);
// what does protectRoute do? In one line: It is a middleware that checks if the user is authenticated before allowing access to the route, ensuring that only logged-in users can update their profile.
// this route is a PUT because it is updating the user's profile, which is changing the state of the server, but it is idempotent because it can be called multiple times without changing the state of the server after the first call
router.get("/check-auth", protectRoute, (req, res) => {
  // Return the full user object so the frontend can restore session state
  res.status(200).json(req.user);
});
export default router;
