import User from "../models/User.js";
import jwt from "jsonwebtoken";
import redis from "../lib/redis.js";

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
    
    // Check if the user profile is cached in Redis
    const cachedUser = await redis.get(`user:profile:${decoded.userId}`);
    let user;

    if (cachedUser) {
      user = JSON.parse(cachedUser);
    } else {
      // If not cached, fetch from MongoDB and write to Redis cache
      user = await User.findById(decoded.userId).select("-password");
      if (user) {
        // Cache user profile in Redis for 24 hours (86400 seconds)
        await redis.setex(`user:profile:${decoded.userId}`, 86400, JSON.stringify(user));
      }
    }

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
