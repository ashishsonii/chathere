import express from "express";
import "dotenv/config";
console.log("DEBUG: REDIS_URL =", process.env.REDIS_URL);
console.log("DEBUG: MONGODB_URI =", process.env.MONGODB_URI);
import cors from "cors";
import http from "http";
import { connectDB } from "./lib/db.js";
import userRouter from "./routes/userRoutes.js";
import messageRouter from "./routes/messageRoutes.js";
import User from "./models/User.js";
import bcrypt from "bcryptjs";
import callRoutes from "./routes/callRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import { Server } from "socket.io";
import { runMigration } from "./lib/migrate.js";
// import redis from "./lib/redis.js";
import { setupCallSignaling, handleCallDisconnect } from "./services/callSignaling.js";
// import { initWorker } from "./workers/aiWorker.js";

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app)

// import { createAdapter } from "@socket.io/redis-adapter";
// import Redis from "ioredis";

// Initialize socket.io server
export const io = new Server(server, {
  cors: {
    origin: [
      "https://chatbyashish.duckdns.org",
      "https://orry.vercel.app",
      "http://localhost:5173"
    ],
    credentials: true
  }
});

// Configure Redis adapter for Socket.io clustering
// const pubClient = new Redis(process.env.REDIS_URL);
// const subClient = new Redis(process.env.REDIS_URL);

// pubClient.on("error", (err) => console.error("Socket.io Redis PubClient Error:", err.message));
// subClient.on("error", (err) => console.error("Socket.io Redis SubClient Error:", err.message));

// io.adapter(createAdapter(pubClient, subClient));

// Initialize BullMQ AI Worker
// initWorker(io);

// Store online users locally for hotfix
export const userSocketMap = {}; // { userId: socketId }
export const onlineUsersSet = new Set(); // Stores userIds

// Socket.io connection handler
io.on("connection", async (socket)=>{
    const userId = socket.handshake.query.userId;
    console.log("User Connected", userId);

    if(userId) {
        socket.join(userId.toString());
        userSocketMap[userId] = socket.id;
        onlineUsersSet.add(userId.toString());
    }
    
    // Setup WebRTC Call Signaling
    setupCallSignaling(io, socket, userSocketMap);
    
    // Fetch and broadcast online users from Local Set
    io.emit("getOnlineUsers", Array.from(onlineUsersSet));

    socket.on("disconnect", async ()=>{
        console.log("User Disconnected", userId);
        if (userId) {
            // Drop any active calls the user is in
            await handleCallDisconnect(io, userId);

            delete userSocketMap[userId];
            onlineUsersSet.delete(userId.toString());
        }
        io.emit("getOnlineUsers", Array.from(onlineUsersSet));
    })

    // Typing event
    socket.on("typing", ({ toUserId, typing }) => {
        if (toUserId) {
            io.to(toUserId.toString()).emit("typing", { fromUserId: userId, typing });
        }
    });
})

// Middleware setup
// Increased limit to 20mb to prevent 413 Payload Too Large errors on high-res image uploads
app.use(express.json({limit: "20mb"}));


app.use(cors({
  origin: [
    "https://orry.vercel.app",
    "http://localhost:5173",
    "https://chatbyashish.duckdns.org"
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "token"],
  credentials: true
}));






// Routes setup
app.use("/api/status", (req, res)=> res.send("Server is live"));
app.use("/api/auth", userRouter);
app.use("/api/messages", messageRouter);
app.use("/api/calls", callRoutes);
app.use("/api/ai", aiRoutes);




// Connect to MongoDB
await connectDB();

const initOrryAI = async () => {
    try {
        const orry = await User.findOne({ email: "orry@quickchat.ai" });
        if (!orry) {
            const hashedPassword = await bcrypt.hash(Math.random().toString(36), 10);
            await User.create({
                email: "orry@quickchat.ai",
                fullName: "Orry AI",
                password: hashedPassword,
                bio: "I am Orry AI, your friendly virtual assistant! I can help you answer questions, analyze images, and generate pictures! (Messages auto-delete in 48 hours)",
                profilePic: "" 
            });
            console.log("Orry AI user created in DB!");
        } else {
            console.log("Orry AI user already exists:", orry._id);
        }
    } catch (err) {
        console.error("Failed to init Orry AI:", err);
    }
};
await initOrryAI();

import Message from "./models/Message.js";
try {
    await Message.collection.dropIndex("createdAt_1");
    console.log("Dropped legacy TTL index on Messages.");
} catch (error) {
    if (error.code !== 27) { // 27 = IndexNotFound
        console.error("Error dropping TTL index:", error);
    }
}

// Initialize workers
// import "./workers/cleanupWorker.js";

if (process.env.VERCEL !== "1") {
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, ()=> console.log("Server is running on PORT: " + PORT));
}

// Export server for Vercel
export default server;
