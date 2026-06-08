import React, { useContext, useEffect, useRef, useState } from 'react'
import assets from '../assets/assets'
import { formatMessageTime } from '../lib/utils'
import { ChatContext } from '../../context/ChatContext'
import { AuthContext } from '../../context/AuthContext'
import toast from 'react-hot-toast'
import { CallContext } from '../../context/CallContext'

const ChatContainer = () => {

    const {
        messages,
        setMessages,
        selectedUser,
        setSelectedUser,
        sendMessage,
        getMessages,
        typingStatus,
        setTypingStatus,
        hasMore,
        loadMoreMessages
    } = useContext(ChatContext)

    const { authUser, onlineUsers, socket, axios } = useContext(AuthContext)
    const { initiateCall } = useContext(CallContext)

    const scrollEnd = useRef()
    const chatAreaRef = useRef()
    const isFirstLoad = useRef(true)

    const [input, setInput] = useState('');
    const [clickedMessages, setClickedMessages] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    // Handle sending a message
    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (input.trim() === "") return null;
        isFirstLoad.current = true; // Force scroll to bottom on new message

        if (selectedUser?.isAi) {
            // Native AI Chat Integration
            const userMsgText = input.trim();
            const isImageReq = userMsgText.startsWith("/image");
            
            // 1. Optimistically append user message to UI
            setMessages(prev => [...prev, { _id: Date.now(), senderId: authUser._id, text: userMsgText, createdAt: new Date() }]);
            // 2. Add loading state / typing indicator for Orry AI
            setTypingStatus(prev => ({...prev, [selectedUser._id]: true}));
            
            try {
                // 3. Post to AI endpoint
                await axios.post("/api/ai/generate", { prompt: userMsgText, type: isImageReq ? "image" : "text" });
            } catch (err) {
                toast.error("Failed to reach Orry AI.");
                setTypingStatus(prev => ({...prev, [selectedUser._id]: false}));
            }
        } else {
            // Normal User Chat
            await sendMessage({ text: input.trim() });
        }
        setInput("")
    }

    // Handle sending an image
    const handleSendImage = async (e) => {
        if (selectedUser?.isAi) {
            toast.error("Orry AI cannot receive images yet!");
            return;
        }

        const file = e.target.files[0];
        if (!file || !file.type.startsWith("image/")) {
            toast.error("select an image file")
            return;
        }
        const reader = new FileReader();

        reader.onloadend = async () => {
            isFirstLoad.current = true; // Force scroll to bottom on new message
            await sendMessage({ image: reader.result })
            e.target.value = ""
        }
        reader.readAsDataURL(file)
    }

    // Typing activity handler
    const typingTimeout = useRef(null);
    const handleInputChange = (e) => {
        setInput(e.target.value);

        if (!selectedUser || selectedUser.isAi) return;

        socket.emit("typing", {
            toUserId: selectedUser._id,
            typing: e.target.value.length > 0,
        });

        clearTimeout(typingTimeout.current);
        typingTimeout.current = setTimeout(() => {
            socket.emit("typing", { toUserId: selectedUser._id, typing: false });
        }, 1200);
    };

    // Load first page on user selection
    useEffect(() => {
        if (selectedUser) {
            isFirstLoad.current = true;
            if (selectedUser.isAi) {
                // Initialize Orry AI chat
                setMessages([{
                    _id: "init",
                    senderId: selectedUser._id,
                    text: "Hello! I am Orry AI. How can I help you today? Prefix your message with /image to generate an image!",
                    createdAt: new Date()
                }]);
            } else {
                getMessages(selectedUser._id)
            }
        }
    }, [selectedUser])

    // Auto scroll management
    useEffect(() => {
        if (scrollEnd.current && !isLoadingMore) {
            scrollEnd.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages, typingStatus, selectedUser, isLoadingMore])

    // Scroll up dynamic pagination trigger
    const handleScroll = async () => {
        if (!chatAreaRef.current || isLoadingMore || !hasMore) return;

        const container = chatAreaRef.current;
        if (container.scrollTop === 0) {
            setIsLoadingMore(true);
            isFirstLoad.current = false; // Disable bottom scrolling

            const prevScrollHeight = container.scrollHeight;

            await loadMoreMessages();

            // Restore scroll position after older messages prepend (prevents visual jumping)
            setTimeout(() => {
                if (container) {
                    container.scrollTop = container.scrollHeight - prevScrollHeight;
                }
                setIsLoadingMore(false);
            }, 50);
        }
    };

    return selectedUser ? (
        <div className='h-full overflow-hidden relative backdrop-blur-lg flex flex-col'>
            {/* ------- header ------- */}
            <div className='flex items-center gap-3 py-3 mx-4 border-b border-stone-500 shrink-0'>
                <img src={selectedUser.profilePic || assets.avatar_icon} alt="" className="w-8 rounded-full" />
                <div className='flex-1 text-lg text-white flex items-center gap-2'>
                    <div className='flex flex-col'>
                        {selectedUser.fullName}
                        {onlineUsers.includes(selectedUser._id) && <span className="w-2 h-2 rounded-full bg-green-500"></span>}
                    </div>
                </div>
                <img onClick={() => setSelectedUser(null)} src={assets.arrow_icon} alt="" className='md:hidden max-w-7 cursor-pointer' />

                {/* Voice Call Button */}
                {!selectedUser?.isAi && (
                <button
                    onClick={() => initiateCall(selectedUser, "voice")}
                    className="p-2 rounded-full hover:bg-gray-700/50 text-gray-400 hover:text-white transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                </button>
                )}

                {/* Video Call Button */}
                {!selectedUser?.isAi && (
                <button
                    onClick={() => initiateCall(selectedUser, "video")}
                    className="p-2 rounded-full hover:bg-gray-700/50 text-gray-400 hover:text-white transition-colors mr-2"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                </button>
                )}

                <img src={assets.help_icon} alt="" className='max-md:hidden max-w-5' />
            </div>

            {/* ------- chat area ------- */}
            <div
                ref={chatAreaRef}
                onScroll={handleScroll}
                className='flex-1 overflow-y-scroll p-3 pb-6 flex flex-col'
            >
                {hasMore && !selectedUser?.isAi && (
                    <p className='text-center text-xs text-violet-400/70 py-2 font-medium shrink-0'>
                        {isLoadingMore ? "Loading chat history..." : "Scroll up to load older messages"}
                    </p>
                )}

                <div className='flex flex-col mt-auto'>
                    {messages.map((msg, index) => (
                        <div
                            onClick={() => setClickedMessages(prev => !prev)}
                            key={msg._id || index}
                            className={`flex items-end gap-2 justify-end ${msg.senderId !== authUser._id && 'flex-row-reverse'}`}
                        >
                            {msg.image ? (
                                <img src={msg.image} alt="" className='max-w-[230px] border border-gray-700 rounded-lg overflow-hidden mb-8' />
                            ) : (
                                <p className={`p-2 max-w-[80%] md:text-sm font-light rounded-lg mb-8 break-words whitespace-pre-wrap ${msg.senderId === authUser._id ? 'bg-violet-600 text-white rounded-br-none' : 'bg-gray-700 text-gray-100 rounded-bl-none'}`}>{msg.text}</p>
                            )}
                            <div className="text-center text-xs shrink-0">
                                <img src={msg.senderId === authUser._id ? authUser?.profilePic || assets.avatar_icon : selectedUser?.profilePic || assets.avatar_icon} alt="" className='w-7 rounded-full' />
                                <p className='text-gray-500'>{formatMessageTime(msg.createdAt)}</p>

                                {msg.senderId === authUser._id && clickedMessages && !selectedUser?.isAi && (
                                    <span className={`text-[10px] ${msg.seen ? 'text-violet-400' : 'text-gray-500'}`}>
                                        {msg.seen ? "Seen" : "Sent"}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                    {typingStatus[String(selectedUser?._id)] && selectedUser?._id !== authUser?._id && (
                        <div className="flex items-end gap-2 justify-start">
                            <div className="text-center text-xs shrink-0">
                                <img src={selectedUser?.profilePic || assets.avatar_icon} alt="" className="w-7 rounded-full" />
                                <p className="text-gray-500 text-[10px] mt-1">Typing</p>
                            </div>
                            <div className="p-3 px-4 w-[70px] md:text-sm font-light rounded-lg mb-8 bg-violet-500/30 text-white flex items-center justify-between">
                                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></span>
                                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                            </div>
                        </div>
                    )}
                    <div ref={scrollEnd}></div>
                </div>
            </div>

            {/* ------- bottom area ------- */}
            <div className='flex items-center gap-3 p-3 shrink-0 bg-[#282142]/40 backdrop-blur-md border-t border-gray-700/50'>
                <div className='flex-1 flex items-center bg-gray-100/12 px-3 rounded-full'>
                    <input
                        onChange={handleInputChange}
                        value={input}
                        onKeyDown={(e) => e.key === "Enter" ? handleSendMessage(e) : null}
                        type="text"
                        placeholder={selectedUser?.isAi ? "Ask Orry AI anything or type /image..." : "Send a message"}
                        className='flex-1 text-sm p-3 border-none rounded-lg outline-none text-white placeholder-gray-400'
                    />
                    <input onChange={handleSendImage} type="file" id='image' accept='image/png, image/jpeg' hidden />
                    <label htmlFor="image">
                        <img src={assets.gallery_icon} alt="" className="w-5 mr-2 cursor-pointer" />
                    </label>
                </div>
                <img onClick={handleSendMessage} src={assets.send_button} alt="" className="w-7 cursor-pointer" />
            </div>
        </div>
    ) : (
        <div
            style={{ backgroundColor: "rgba(255, 255, 255, 0.05)" }}
            className='flex-1 flex flex-col items-center justify-center gap-2 text-gray-500 max-md:hidden'
        >
            <div className="flex flex-col items-center gap-1 select-none mb-4">
                <h1 className="text-6xl font-extrabold tracking-tight bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent drop-shadow-md">
                    Orry
                </h1>
                <p className="text-gray-400 text-xs tracking-widest uppercase">
                    Chatby Ashish
                </p>
            </div>
            <p className='text-sm font-medium text-gray-400/80'>Chat anytime, anywhere</p>
            <footer className="flex justify-center items-center text-gray-400 text-[10px] py-4">
                © {new Date().getFullYear()} Ashish Soni — All rights reserved.
            </footer>
        </div>
    )
}

export default ChatContainer
