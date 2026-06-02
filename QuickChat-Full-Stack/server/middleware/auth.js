import User from "../models/User.js";
import jwt from "jsonwebtoken";
import redis from "../lib/redis.js";

// Middleware to protect routes and cache user profiles in Redis
export const protectRoute = async (req, res, next) => {
  try {
    const token = req.headers.token;

    if (!token) {
      // ✅ Add CORS headers even when rejecting
      res.setHeader("Access-Control-Allow-Origin", "https://orry.vercel.app");
      res.setHeader("Access-Control-Allow-Credentials", "true");
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
      res.setHeader("Access-Control-Allow-Origin", "https://orry.vercel.app");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    req.user = user;
    next();
  } catch (error) {
    console.log(error.message);
    // ✅ Add headers on error responses too
    res.setHeader("Access-Control-Allow-Origin", "https://orry.vercel.app");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired token" });
  }
};
