import crypto from "crypto";
import redis from "../lib/redis.js";
import Call from "../models/Call.js";

// Helper to handle the signaling logic for calls
export const setupCallSignaling = (io, socket, userSocketMap) => {
    const userId = socket.handshake.query.userId;
    if (!userId) return;

    // 1. Initiate a Call
    socket.on("call:initiate", async ({ receiverId, type }) => {
        try {
            // Check if receiver is online
            const receiverSocketId = userSocketMap[receiverId];
            if (!receiverSocketId) {
                return socket.emit("call:error", { message: "User is offline" });
            }

            // Check if receiver is already in a call
            const receiverInCall = await redis.get(`call:user:${receiverId}`);
            if (receiverInCall) {
                return socket.emit("call:error", { message: "User is busy on another call", reason: "busy" });
            }

            // Create a unique Call ID
            const callId = crypto.randomUUID();

            // Set call state in Redis (expires in 5 mins to prevent zombie calls)
            const callState = {
                callId,
                callerId: userId,
                receiverId,
                type,
                status: "ringing",
                startedAt: Date.now()
            };
            await redis.setex(`call:active:${callId}`, 300, JSON.stringify(callState));
            await redis.setex(`call:user:${userId}`, 300, callId);
            await redis.setex(`call:user:${receiverId}`, 300, callId);

            // Emit incoming call to receiver
            io.to(receiverSocketId).emit("call:incoming", {
                callId,
                callerId: userId,
                type
            });

            // Acknowledge to caller
            socket.emit("call:initiated", { callId, receiverId, type });
            
        } catch (error) {
            console.error("Error initiating call:", error);
            socket.emit("call:error", { message: "Failed to initiate call" });
        }
    });

    // 2. Accept a Call
    socket.on("call:accept", async ({ callId }) => {
        try {
            const stateStr = await redis.get(`call:active:${callId}`);
            if (!stateStr) return socket.emit("call:error", { message: "Call expired or not found" });

            const callState = JSON.parse(stateStr);
            if (callState.receiverId !== userId) return;

            callState.status = "answered";
            callState.answeredAt = Date.now();
            await redis.setex(`call:active:${callId}`, 86400, JSON.stringify(callState)); // Extend TTL while active

            const callerSocketId = userSocketMap[callState.callerId];
            if (callerSocketId) {
                io.to(callerSocketId).emit("call:accepted", { callId });
            }
        } catch (error) {
            console.error("Error accepting call:", error);
        }
    });

    // 3. Reject a Call
    socket.on("call:reject", async ({ callId }) => {
        try {
            const stateStr = await redis.get(`call:active:${callId}`);
            if (!stateStr) return;

            const callState = JSON.parse(stateStr);
            
            // Clean up Redis
            await redis.del(`call:active:${callId}`);
            await redis.del(`call:user:${callState.callerId}`);
            await redis.del(`call:user:${callState.receiverId}`);

            // Save to MongoDB
            await Call.create({
                callId,
                type: callState.type,
                caller: callState.callerId,
                receiver: callState.receiverId,
                status: "rejected",
                startedAt: callState.startedAt,
                endedAt: Date.now()
            });

            const callerSocketId = userSocketMap[callState.callerId];
            if (callerSocketId) {
                io.to(callerSocketId).emit("call:rejected", { callId });
            }
        } catch (error) {
            console.error("Error rejecting call:", error);
        }
    });

    // 4. End a Call (by either party)
    socket.on("call:end", async ({ callId, duration, quality }) => {
        try {
            const stateStr = await redis.get(`call:active:${callId}`);
            if (!stateStr) return; // Already ended

            const callState = JSON.parse(stateStr);
            
            // Determine the other user
            const otherUserId = callState.callerId === userId ? callState.receiverId : callState.callerId;
            const otherSocketId = userSocketMap[otherUserId];

            // Clean up Redis
            await redis.del(`call:active:${callId}`);
            await redis.del(`call:user:${callState.callerId}`);
            await redis.del(`call:user:${callState.receiverId}`);

            // Save to MongoDB
            await Call.create({
                callId,
                type: callState.type,
                caller: callState.callerId,
                receiver: callState.receiverId,
                status: callState.status === "answered" ? "ended" : "missed",
                startedAt: callState.startedAt,
                answeredAt: callState.answeredAt,
                endedAt: Date.now(),
                duration: duration || 0,
                quality
            });

            // Notify other user
            if (otherSocketId) {
                io.to(otherSocketId).emit("call:ended", { callId });
            }
        } catch (error) {
            console.error("Error ending call:", error);
        }
    });

    // 5. WebRTC Signaling: SDP Offer
    socket.on("call:sdp-offer", ({ callId, to, offer }) => {
        const toSocketId = userSocketMap[to];
        if (toSocketId) {
            io.to(toSocketId).emit("call:sdp-offer", { callId, from: userId, offer });
        }
    });

    // 6. WebRTC Signaling: SDP Answer
    socket.on("call:sdp-answer", ({ callId, to, answer }) => {
        const toSocketId = userSocketMap[to];
        if (toSocketId) {
            io.to(toSocketId).emit("call:sdp-answer", { callId, from: userId, answer });
        }
    });

    // 7. WebRTC Signaling: ICE Candidate
    socket.on("call:ice-candidate", ({ callId, to, candidate }) => {
        const toSocketId = userSocketMap[to];
        if (toSocketId) {
            io.to(toSocketId).emit("call:ice-candidate", { callId, from: userId, candidate });
        }
    });

    // 8. Media Toggle Notifications (Mute/Camera off)
    socket.on("call:toggle-media", ({ callId, to, mediaType, isEnabled }) => {
        const toSocketId = userSocketMap[to];
        if (toSocketId) {
            io.to(toSocketId).emit("call:media-toggled", { callId, from: userId, mediaType, isEnabled });
        }
    });
};
