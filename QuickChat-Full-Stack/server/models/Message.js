import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
    conversationId: {type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true},
    senderId: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true},
    receiverId: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true},
    text: { type: String, },
    image: { type: String, },
    seen: {type: Boolean, default: false}
}, {timestamps: true});

messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 172800 }); // 48-hour expiration TTL

const Message = mongoose.model("Message", messageSchema);

export default Message;