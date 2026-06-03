import express from "express";
import "dotenv/config";
import cors from "cors";
import http from "http";
import { connectDB } from "./lib/db.js";
import userRouter from "./routes/userRoutes.js";
import messageRouter from "./routes/messageRoutes.js";
import { Server } from "socket.io";
import { runMigration } from "./lib/migrate.js";
import redis from "./lib/redis.js";

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app)

import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";

// Initialize socket.io server
export const io = new Server(server, {
    cors: {origin: "*"}
});

// Configure Redis adapter for Socket.io clustering
const pubClient = new Redis(process.env.REDIS_URL);
const subClient = new Redis(process.env.REDIS_URL);

pubClient.on("error", (err) => console.error("Socket.io Redis PubClient Error:", err.message));
subClient.on("error", (err) => console.error("Socket.io Redis SubClient Error:", err.message));

io.adapter(createAdapter(pubClient, subClient));


// Store online users
export const userSocketMap = {}; // { userId: socketId }

// Socket.io connection handler
io.on("connection", async (socket)=>{
    const userId = socket.handshake.query.userId;
    console.log("User Connected", userId);

    if(userId) {
        socket.join(userId.toString());
        userSocketMap[userId] = socket.id;
        await redis.sadd("online_users", userId);
    }
    
    // Fetch and broadcast online users from Redis Set
    const onlineUsers = await redis.smembers("online_users");
    io.emit("getOnlineUsers", onlineUsers);

    socket.on("disconnect", async ()=>{
        console.log("User Disconnected", userId);
        if (userId) {
            delete userSocketMap[userId];
            await redis.srem("online_users", userId);
        }
        const updatedOnlineUsers = await redis.smembers("online_users");
        io.emit("getOnlineUsers", updatedOnlineUsers)
    })

    // Typing event
    socket.on("typing", ({ toUserId, typing }) => {
        if (toUserId) {
            io.to(toUserId.toString()).emit("typing", { fromUserId: userId, typing });
        }
    });
})

// Middleware setup
app.use(express.json({limit: "4mb"}));


app.use(cors({
  origin: [
    "https://orry.vercel.app", 
    "http://localhost:5173"
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true
}));






// Routes setup
app.use("/api/status", (req, res)=> res.send("Server is live"));
app.use("/api/auth", userRouter);
app.use("/api/messages", messageRouter)




// Connect to MongoDB
await connectDB();

if(process.env.NODE_ENV !== "production"){
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, ()=> console.log("Server is running on PORT: " + PORT));
}

// Export server for Vercel
export default server;
