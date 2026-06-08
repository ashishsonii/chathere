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
// messageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 }); // TTL index removed in favor of custom cleanup worker

const Message = mongoose.model("Message", messageSchema);

export default Message;