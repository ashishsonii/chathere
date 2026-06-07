import React, { useContext, useEffect, useRef } from 'react';
import { CallContext } from '../../../context/CallContext';
import assets from '../../assets/assets';

const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
};

const VoiceCallScreen = () => {
    const { 
        callState, 
        currentCall, 
        callDuration,
        endCall,
        toggleMute,
        isMuted,
        remoteStream
    } = useContext(CallContext);

    const audioRef = useRef(null);

    useEffect(() => {
        if (audioRef.current && remoteStream) {
            audioRef.current.srcObject = remoteStream;
            audioRef.current.play().catch(e => console.log("Audio play failed:", e));
        }
    }, [remoteStream]);

    if (callState !== "connected" || currentCall?.type !== "voice") return null;

    return (
        <div className="fixed inset-0 z-40 bg-[#1e1930] flex flex-col items-center justify-between py-20">
            
            <audio ref={audioRef} autoPlay />

            {/* Header / Info */}
            <div className="flex flex-col items-center gap-4 mt-10">
                <div className="relative">
                    <div className="absolute inset-0 bg-violet-500 rounded-full animate-pulse opacity-20 scale-125"></div>
                    <img 
                        src={currentCall.user?.profilePic || assets.avatar_icon} 
                        alt="peer" 
                        className="w-40 h-40 rounded-full border-4 border-[#2a2444] relative z-10 object-cover shadow-2xl"
                    />
                </div>
                <h2 className="text-3xl font-bold text-white mt-4">{currentCall.user?.fullName}</h2>
                <p className="text-violet-300 font-mono text-xl tracking-widest">{formatDuration(callDuration)}</p>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-8 mb-10 bg-[#282142]/80 px-10 py-6 rounded-full backdrop-blur-md shadow-lg border border-white/5">
                
                {/* Mute Button */}
                <button 
                    onClick={toggleMute}
                    className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${isMuted ? 'bg-white text-black' : 'bg-gray-600/50 text-white hover:bg-gray-600'}`}
                >
                    {isMuted ? (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                          <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                        </svg>
                    )}
                </button>

                {/* End Call Button */}
                <button 
                    onClick={endCall}
                    className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg transition-transform hover:scale-110"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white transform rotate-[135deg]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                </button>

            </div>
        </div>
    );
};

export default VoiceCallScreen;
