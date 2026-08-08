import User from "../models/user.model.js";
import bcrypt from "bcryptjs";
import { generateToken } from "../lib/utils.js";
import { sendWelcomeEmail } from "../emails/email.handler.js";
import { ENV } from "../lib/env.js";
import cloudinary from "../lib/cloudinary.js";

export const signup = async (req, res) => {
  const { fullName, email, password } = req.body;
  // Here you would typically save the user to the database
  try {
    if (!fullName || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }
    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters long" });
    }
    // check if email is valid using regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }
    // check if email already exists in the database
    const user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: "Email already exists" });
    }
    // hash the password before saving to the database for security reasons
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      fullName,
      email,
      password: hashedPassword,
    });

    if (newUser) {
      const savedUser = await newUser.save();
      generateToken(savedUser._id, res);
      res.status(201).json({
        message: "User created successfully",
        _id: newUser._id,
        fullName: newUser.fullName,
        email: newUser.email,
        profilePic: newUser.profilePic,
      });

      // send a welcome email to the user after successful signup using nodemailer

      try {
        await sendWelcomeEmail(newUser.email, newUser.fullName, ENV.CLIENT_URL);
      } catch (error) {
        console.error("Error sending welcome email:", error);
      }
    } else {
      res.status(400).json({ message: "Invalid user data" });
    }
  } catch (error) {
    console.error("SIGNUP ERROR : ", error);
    return res.status(500).json({ message: "Server error" });
  }
};
export const login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
      // never tell the client which one is wrong for security reasons
    }
    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
      return res.status(400).json({ message: "Invalid email or password" });
    }
    generateToken(user._id, res);
    res.status(200).json({
      message: "Login successful",
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      profilePic: user.profilePic,
    });
  } catch (error) {
    console.error("LOGIN ERROR : ", error);
    return res.status(500).json({ message: "Server error" });
  }
};
export const logout = (_, res) => {
  // Clear the "jwt" cookie — must match the name set in generateToken
  res.cookie("jwt", "", { maxAge: 0 });
  res.status(200).json({ message: "Logout successful" });
};
export const updateProfile = async (req, res) => {
  try {
    const { profilePic, fullName } = req.body;
    const userId = req.user._id;
    const updateData = {};

    if (fullName && fullName.trim()) {
      updateData.fullName = fullName.trim();
    }

    if (profilePic) {
      // The client now uploads directly to Cloudinary and sends us the final URL.
      if (profilePic.startsWith("https://res.cloudinary.com/")) {
        // Delete the old profile pic from Cloudinary if it exists and is a Cloudinary URL
        const oldPic = req.user.profilePic;
        if (oldPic && oldPic.startsWith("https://res.cloudinary.com/")) {
          try {
            const uploadIndex = oldPic.indexOf("/upload/");
            if (uploadIndex !== -1) {
              const afterUpload = oldPic.substring(uploadIndex + 8);
              const withoutVersion = afterUpload.replace(/^v\d+\//, "");
              const publicId = withoutVersion.replace(/\.[^/.]+$/, "");
              cloudinary.uploader.destroy(publicId).catch(() => {});
            }
          } catch {}
        }
        updateData.profilePic = profilePic;
      } else {
        return res.status(400).json({ message: "Invalid image URL" });
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: "No data provided for update" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    ).select("-password");

    res.status(200).json(updatedUser);
  } catch (error) {
    console.error("UPDATE PROFILE ERROR : ", error);
    res.status(500).json({ message: "Server error" });
  }
};
