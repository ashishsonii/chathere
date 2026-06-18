import User from "../models/User.js";
import jwt from "jsonwebtoken";

// Middleware to protect routes and cache user profiles in Redis
export const protectRoute = async (req, res, next) => {
  try {
    const token = req.headers.token;

    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Fetch directly from MongoDB (Redis caching disabled for hotfix)
    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    req.user = user;
    next();
  } catch (error) {
    console.log("Auth Middleware Error:", error.message);
    return res
      .status(401)
      .json({ success: false, message: "Auth failed: " + error.message });
  }
};
