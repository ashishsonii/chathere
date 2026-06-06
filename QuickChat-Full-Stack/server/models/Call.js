import mongoose from "mongoose";

const callSchema = new mongoose.Schema({
    callId: { type: String, required: true, unique: true }, // UUID for the call
    type: { type: String, enum: ["voice", "video"], required: true },
    caller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // For 1:1 calls
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // For group calls
    status: { 
        type: String, 
        enum: ["ringing", "answered", "rejected", "missed", "ended", "busy"], 
        default: "ringing" 
    },
    startedAt: { type: Date, default: Date.now },
    answeredAt: { type: Date },
    endedAt: { type: Date },
    duration: { type: Number, default: 0 }, // in seconds
    quality: {
        avgRtt: { type: Number },
        avgPacketLoss: { type: Number }
    }
}, { timestamps: true });

// Indexes for faster history retrieval
callSchema.index({ caller: 1, createdAt: -1 });
callSchema.index({ receiver: 1, createdAt: -1 });
callSchema.index({ participants: 1, createdAt: -1 });

const Call = mongoose.model("Call", callSchema);

export default Call;
