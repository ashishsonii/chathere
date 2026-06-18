import crypto from "crypto";
// import redis from "../lib/redis.js";
import Call from "../models/Call.js";

// In-memory call state for hotfix
const activeCalls = new Map(); // callId -> callState
const userCalls = new Map(); // userId -> callId

// Helper to handle unexpected socket disconnections during an active call
export const handleCallDisconnect = async (io, userId) => {
    try {
        const callId = userCalls.get(userId.toString());
        if (!callId) return; // Not in a call

        const callStateStr = activeCalls.get(callId);
        if (!callStateStr) return;

        const callState = JSON.parse(callStateStr);
        const otherUserId = callState.callerId === userId ? callState.receiverId : callState.callerId;

        // Clean up Memory
        activeCalls.delete(callId);
        userCalls.delete(callState.callerId.toString());
        userCalls.delete(callState.receiverId.toString());

        // Save dropped call to MongoDB
        await Call.create({
            callId,
            type: callState.type,
            caller: callState.callerId,
            receiver: callState.receiverId,
            status: callState.status === "answered" ? "ended" : "missed",
            startedAt: callState.startedAt,
            answeredAt: callState.answeredAt,
            endedAt: Date.now(),
            duration: 0,
            quality: "dropped (disconnected)"
        });

        // Notify other user that call dropped
        io.to(otherUserId.toString()).emit("call:ended", { callId, reason: "disconnected" });
    } catch (error) {
        console.error("Error handling call disconnect:", error);
    }
};

// Helper to handle the signaling logic for calls
export const setupCallSignaling = (io, socket, userSocketMap) => {
    const userId = socket.handshake.query.userId;
    if (!userId) return;

    // 1. Initiate a Call
    socket.on("call:initiate", async ({ receiverId, type }) => {
        try {
            // Check if receiver is online
            // Since we're not using redis.sismember anymore, we check userSocketMap directly
            const isOnline = !!userSocketMap[receiverId];
            if (!isOnline) {
                return socket.emit("call:error", { message: "User is offline" });
            }

            // Check if receiver is already in a call
            const receiverInCall = userCalls.get(receiverId.toString());
            if (receiverInCall) {
                return socket.emit("call:error", { message: "User is busy on another call", reason: "busy" });
            }

            // Create a unique Call ID
            const callId = crypto.randomUUID();

            // Set call state in Memory
            const callState = {
                callId,
                callerId: userId,
                receiverId,
                type,
                status: "ringing",
                startedAt: Date.now()
            };
            activeCalls.set(callId, JSON.stringify(callState));
            userCalls.set(userId.toString(), callId);
            userCalls.set(receiverId.toString(), callId);

            // Emit incoming call to receiver
            io.to(receiverId.toString()).emit("call:incoming", {
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
            const stateStr = activeCalls.get(callId);
            if (!stateStr) return socket.emit("call:error", { message: "Call expired or not found" });

            const callState = JSON.parse(stateStr);
            if (callState.receiverId !== userId) return;

            callState.status = "answered";
            callState.answeredAt = Date.now();
            activeCalls.set(callId, JSON.stringify(callState));

            io.to(callState.callerId.toString()).emit("call:accepted", { callId });
        } catch (error) {
            console.error("Error accepting call:", error);
        }
    });

    // 3. Reject a Call
    socket.on("call:reject", async ({ callId }) => {
        try {
            const stateStr = activeCalls.get(callId);
            if (!stateStr) return;

            const callState = JSON.parse(stateStr);
            
            // Clean up Memory
            activeCalls.delete(callId);
            userCalls.delete(callState.callerId.toString());
            userCalls.delete(callState.receiverId.toString());

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

            io.to(callState.callerId.toString()).emit("call:rejected", { callId });
        } catch (error) {
            console.error("Error rejecting call:", error);
        }
    });

    // 4. End a Call (by either party)
    socket.on("call:end", async ({ callId, duration, quality }) => {
        try {
            const stateStr = activeCalls.get(callId);
            if (!stateStr) return; // Already ended

            const callState = JSON.parse(stateStr);
            
            // Determine the other user
            const otherUserId = callState.callerId === userId ? callState.receiverId : callState.callerId;

            // Clean up Memory
            activeCalls.delete(callId);
            userCalls.delete(callState.callerId.toString());
            userCalls.delete(callState.receiverId.toString());

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
            io.to(otherUserId.toString()).emit("call:ended", { callId });
        } catch (error) {
            console.error("Error ending call:", error);
        }
    });

    // 5. WebRTC Signaling: SDP Offer
    socket.on("call:sdp-offer", ({ callId, to, offer }) => {
        io.to(to.toString()).emit("call:sdp-offer", { callId, from: userId, offer });
    });

    // 6. WebRTC Signaling: SDP Answer
    socket.on("call:sdp-answer", ({ callId, to, answer }) => {
        io.to(to.toString()).emit("call:sdp-answer", { callId, from: userId, answer });
    });

    // 7. WebRTC Signaling: ICE Candidate
    socket.on("call:ice-candidate", ({ callId, to, candidate }) => {
        io.to(to.toString()).emit("call:ice-candidate", { callId, from: userId, candidate });
    });

    // 8. Media Toggle Notifications (Mute/Camera off)
    socket.on("call:toggle-media", ({ callId, to, mediaType, isEnabled }) => {
        io.to(to.toString()).emit("call:media-toggled", { callId, from: userId, mediaType, isEnabled });
    });

    // 9. Screen Share state notification — lets remote peer switch to cinema mode
    socket.on("call:screen-share", ({ to, isSharing }) => {
        io.to(to.toString()).emit("call:screen-share", { from: userId, isSharing });
    });
};
