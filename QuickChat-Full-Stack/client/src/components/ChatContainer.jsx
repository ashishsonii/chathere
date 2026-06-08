import React, { useContext, useEffect, useRef, useState } from 'react'
import assets from '../assets/assets'
import { formatMessageTime } from '../lib/utils'
import { ChatContext } from '../../context/ChatContext'
import { AuthContext } from '../../context/AuthContext'
import toast from 'react-hot-toast'
import { CallContext } from '../../context/CallContext'
import ProfileDrawer from './ProfileDrawer'

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
        loadMoreMessages,
        clearConversation
    } = useContext(ChatContext)

    const { authUser, onlineUsers, socket, axios } = useContext(AuthContext)
    const { initiateCall } = useContext(CallContext)

    const scrollEnd = useRef()
    const chatAreaRef = useRef()
    const isFirstLoad = useRef(true)

    const [input, setInput] = useState('');
    const [clickedMessages, setClickedMessages] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [isProfileDrawerOpen, setIsProfileDrawerOpen] = useState(false);

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

    // Handle Quick AI Suggestion Click
    const handleQuickSuggestion = async (suggestion) => {
        isFirstLoad.current = true;
        
        // Optimistic UI update
        setMessages(prev => [...prev, { _id: Date.now(), senderId: authUser._id, text: suggestion, createdAt: new Date() }]);
        setTypingStatus(prev => ({...prev, [selectedUser._id]: true}));
        
        try {
            await axios.post("/api/ai/generate", { prompt: suggestion, type: suggestion.startsWith("/image") ? "image" : "text" });
        } catch (err) {
            toast.error("Failed to reach Orry AI.");
            setTypingStatus(prev => ({...prev, [selectedUser._id]: false}));
        }
    };

    // Handle sending an image
    const handleSendImage = async (e) => {


        const file = e.target.files[0];
        if (!file || !file.type.startsWith("image/")) {
            toast.error("select an image file")
            return;
        }
        const reader = new FileReader();

        reader.onloadend = async () => {
            isFirstLoad.current = true; // Force scroll to bottom on new message
            if (selectedUser?.isAi) {
                setMessages(prev => [...prev, { _id: Date.now(), senderId: authUser._id, image: reader.result, createdAt: new Date() }]);
                setTypingStatus(prev => ({...prev, [selectedUser._id]: true}));
                try {
                    await axios.post("/api/ai/generate", { prompt: "", type: "vision", image: reader.result });
                } catch (err) {
                    toast.error("Failed to reach Orry AI.");
                    setTypingStatus(prev => ({...prev, [selectedUser._id]: false}));
                }
            } else {
                await sendMessage({ image: reader.result })
            }
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
            getMessages(selectedUser._id)
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
                <div onClick={() => setIsProfileDrawerOpen(true)} className="flex items-center gap-3 flex-1 cursor-pointer hover:bg-white/5 p-1 rounded-lg transition-colors">
                    <img src={selectedUser.profilePic || assets.avatar_icon} alt="" className="w-8 rounded-full" />
                    <div className='flex-1 text-lg text-white flex items-center gap-2'>
                        <div className='flex flex-col'>
                            {selectedUser.fullName}
                            {onlineUsers.includes(selectedUser._id) && <span className="w-2 h-2 rounded-full bg-green-500"></span>}
                        </div>
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

                {/* Clear Chat Button */}
                <button
                    onClick={() => {
                        if (window.confirm("Are you sure you want to clear this conversation?")) {
                            clearConversation();
                        }
                    }}
                    className="p-2 rounded-full hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors ml-2"
                    title="Clear Chat"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>

                <img src={assets.help_icon} alt="" className='max-md:hidden max-w-5 ml-2' />
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

                {/* AI Welcome State & Quick Suggestions */}
                {selectedUser?.isAi && messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center px-4 mt-10">
                        <img src={selectedUser.profilePic || assets.orry_avatar} alt="Orry AI" className="w-24 h-24 rounded-full border-4 border-indigo-500/30 mb-4 shadow-[0_0_20px_rgba(99,102,241,0.2)] animate-pulse" />
                        <h2 className="text-2xl font-bold text-white mb-2">I am Orry AI 🤖</h2>
                        <p className="text-sm text-gray-400 max-w-md mb-8">
                            Your personal intelligent assistant! Ask me anything, or generate beautiful images using the <span className="text-indigo-400 font-mono">/image</span> command.
                        </p>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                            <button onClick={() => handleQuickSuggestion("/image A futuristic cyberpunk city, neon lights, 4k")} className="bg-[#282142]/80 hover:bg-indigo-500/20 border border-indigo-500/30 p-3 rounded-xl text-sm text-left transition-all group">
                                <span className="block text-indigo-400 mb-1 group-hover:text-indigo-300">🎨 Generate Image</span>
                                <span className="text-gray-400 text-xs truncate block">/image A futuristic cyberpunk city...</span>
                            </button>
                            <button onClick={() => handleQuickSuggestion("Write a polite email to my boss asking for next Friday off.")} className="bg-[#282142]/80 hover:bg-indigo-500/20 border border-indigo-500/30 p-3 rounded-xl text-sm text-left transition-all group">
                                <span className="block text-emerald-400 mb-1 group-hover:text-emerald-300">📝 Draft Email</span>
                                <span className="text-gray-400 text-xs truncate block">Write a polite email to my boss...</span>
                            </button>
                            <button onClick={() => handleQuickSuggestion("Explain quantum computing to a 5-year-old.")} className="bg-[#282142]/80 hover:bg-indigo-500/20 border border-indigo-500/30 p-3 rounded-xl text-sm text-left transition-all group">
                                <span className="block text-amber-400 mb-1 group-hover:text-amber-300">🧠 Explain Concept</span>
                                <span className="text-gray-400 text-xs truncate block">Explain quantum computing...</span>
                            </button>
                            <button onClick={() => handleQuickSuggestion("Write a JavaScript function to reverse a string.")} className="bg-[#282142]/80 hover:bg-indigo-500/20 border border-indigo-500/30 p-3 rounded-xl text-sm text-left transition-all group">
                                <span className="block text-pink-400 mb-1 group-hover:text-pink-300">💻 Write Code</span>
                                <span className="text-gray-400 text-xs truncate block">Write a JS function to reverse...</span>
                            </button>
                        </div>
                    </div>
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

            {/* Profile Drawer Overlay */}
            {isProfileDrawerOpen && (
                <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={() => setIsProfileDrawerOpen(false)}></div>
            )}
            <ProfileDrawer isOpen={isProfileDrawerOpen} onClose={() => setIsProfileDrawerOpen(false)} />
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
