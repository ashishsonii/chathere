// import User from "../models/User.js";
// import jwt from "jsonwebtoken";

// // Middleware to protect routes
// export const protectRoute = async (req, res, next)=>{
//     try {
//         const token = req.headers.token;

//         const decoded = jwt.verify(token, process.env.JWT_SECRET)

//         const user = await User.findById(decoded.userId).select("-password");

//         if(!user) return res.json({ success: false, message: "User not found" });

//         req.user = user;
//         next();
//     } catch (error) {
//         console.log(error.message);
//         res.json({ success: false, message: error.message });
//     }
// }




import User from "../models/User.js";
import jwt from "jsonwebtoken";

// Middleware to protect routes
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
    const user = await User.findById(decoded.userId).select("-password");

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
