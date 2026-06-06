import Call from "../models/Call.js";
import { signUser } from "../lib/s3.js";

// Get user's call history
export const getCallHistory = async (req, res) => {
    try {
        const userId = req.user._id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const calls = await Call.find({
            $or: [{ caller: userId }, { receiver: userId }, { participants: userId }]
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("caller", "-password")
        .populate("receiver", "-password")
        .populate("participants", "-password");

        // Sign the profile pictures if any
        const signedCalls = [];
        for (const call of calls) {
            const callObj = call.toObject();
            if (callObj.caller) {
                callObj.caller = await signUser(callObj.caller);
            }
            if (callObj.receiver) {
                callObj.receiver = await signUser(callObj.receiver);
            }
            if (callObj.participants && callObj.participants.length > 0) {
                callObj.participants = await Promise.all(callObj.participants.map(signUser));
            }
            signedCalls.push(callObj);
        }

        const total = await Call.countDocuments({
            $or: [{ caller: userId }, { receiver: userId }, { participants: userId }]
        });

        res.json({
            success: true,
            calls: signedCalls,
            hasMore: total > skip + calls.length,
            total
        });
    } catch (error) {
        console.error("Error fetching call history:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get specific call details
export const getCallDetails = async (req, res) => {
    try {
        const { callId } = req.params;
        const userId = req.user._id;

        const call = await Call.findOne({ callId })
            .populate("caller", "-password")
            .populate("receiver", "-password")
            .populate("participants", "-password");

        if (!call) {
            return res.status(404).json({ success: false, message: "Call not found" });
        }

        // Verify user was part of the call
        const isParticipant = 
            call.caller._id.toString() === userId.toString() ||
            (call.receiver && call.receiver._id.toString() === userId.toString()) ||
            (call.participants && call.participants.some(p => p._id.toString() === userId.toString()));

        if (!isParticipant) {
            return res.status(403).json({ success: false, message: "Unauthorized to view this call" });
        }

        const callObj = call.toObject();
        if (callObj.caller) callObj.caller = await signUser(callObj.caller);
        if (callObj.receiver) callObj.receiver = await signUser(callObj.receiver);
        if (callObj.participants) {
            callObj.participants = await Promise.all(callObj.participants.map(signUser));
        }

        res.json({ success: true, call: callObj });
    } catch (error) {
        console.error("Error fetching call details:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};
