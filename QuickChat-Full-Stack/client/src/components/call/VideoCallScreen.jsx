import React, { useContext, useEffect, useRef, useCallback } from 'react';
import { CallContext } from '../../../context/CallContext';

const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
};

const VideoCallScreen = () => {
    const { 
        callState, 
        currentCall, 
        callDuration,
        endCall,
        toggleMute,
        toggleCamera,
        toggleScreenShare,
        isMuted,
        isCameraOff,
        isScreenSharing,
        localStream,
        remoteStream
    } = useContext(CallContext);

    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);

    // Bind local stream to local video element
    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
            localVideoRef.current.play().catch(() => {});
        }
    }, [localStream]);

    // Bind remote stream to remote video element.
    // Uses a ref callback as well for when the element mounts after the stream exists.
    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
            remoteVideoRef.current.play().catch(() => {});
        }
    }, [remoteStream]);

    // Ref callback for the remote <video> — handles the case where
    // remoteStream is already set when the element first mounts.
    const setRemoteVideoRef = useCallback((el) => {
        remoteVideoRef.current = el;
        if (el && remoteStream) {
            el.srcObject = remoteStream;
            el.play().catch(() => {});
        }
    }, [remoteStream]);

    // Same for local video
    const setLocalVideoRef = useCallback((el) => {
        localVideoRef.current = el;
        if (el && localStream) {
            el.srcObject = localStream;
            el.play().catch(() => {});
        }
    }, [localStream]);

    if (callState !== "connected" || currentCall?.type !== "video") return null;

    return (
        <div className="fixed inset-0 z-40 bg-black flex flex-col">
            
            {/* Remote Video (Full Screen) */}
            <div className="flex-1 relative w-full h-full">
                {remoteStream ? (
                    <video 
                        ref={setRemoteVideoRef} 
                        autoPlay 
                        playsInline 
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-900">
                        <div className="flex flex-col items-center gap-4">
                            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-violet-500"></div>
                            <p className="text-gray-400 text-sm">Connecting video...</p>
                        </div>
                    </div>
                )}

                {/* Local Video (PiP) */}
                <div className="absolute top-6 right-6 w-32 md:w-48 aspect-[3/4] md:aspect-video bg-gray-800 rounded-xl overflow-hidden shadow-2xl border-2 border-gray-600/50 z-10">
                    {localStream && !isCameraOff ? (
                        <video 
                            ref={setLocalVideoRef} 
                            autoPlay 
                            playsInline 
                            muted 
                            className="w-full h-full object-cover" 
                            style={isScreenSharing ? {} : { transform: "scaleX(-1)" }}
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-800 text-gray-500">
                            Camera Off
                        </div>
                    )}
                </div>

                {/* Header overlay */}
                <div className="absolute top-0 left-0 w-full p-6 bg-gradient-to-b from-black/70 to-transparent flex justify-between items-start pointer-events-none">
                    <div className="flex flex-col drop-shadow-md">
                        <h2 className="text-xl font-bold text-white">{currentCall.user?.fullName}</h2>
                        <p className="text-gray-300 font-mono">{formatDuration(callDuration)}</p>
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 flex items-center gap-6 bg-gray-900/80 px-8 py-4 rounded-full backdrop-blur-md shadow-2xl border border-white/10 transition-all hover:bg-gray-900">
                
                {/* Mute Button */}
                <button 
                    onClick={toggleMute}
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${isMuted ? 'bg-white text-black' : 'bg-gray-700 text-white hover:bg-gray-600'}`}
                >
                    {isMuted ? (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                          <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                        </svg>
                    )}
                </button>

                {/* Camera Toggle */}
                <button 
                    onClick={toggleCamera}
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${isCameraOff ? 'bg-white text-black' : 'bg-gray-700 text-white hover:bg-gray-600'}`}
                >
                    {isCameraOff ? (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                          <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                        </svg>
                    )}
                </button>

                {/* Screen Share Button — Forced to always show */}
                <button 
                    onClick={toggleScreenShare}
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${isScreenSharing ? 'bg-blue-500 text-white ring-2 ring-blue-300' : 'bg-gray-700 text-white hover:bg-gray-600'}`}
                    title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" />
                    </svg>
                </button>

                {/* End Call Button */}
                <button 
                    onClick={endCall}
                    className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg transition-transform hover:scale-110 ml-2"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white transform rotate-[135deg]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                </button>

            </div>
        </div>
    );
};

export default VideoCallScreen;
