import React, { useContext, useEffect, useRef, useCallback, useState } from 'react';
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
        changeAudioOutput,
        isMuted,
        isCameraOff,
        isScreenSharing,
        remoteIsScreenSharing,
        audioOutputDevices,
        selectedAudioOutput,
        localStream,
        remoteStream
    } = useContext(CallContext);

    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const containerRef = useRef(null);

    // --- Auto-hide controls ---
    const [controlsVisible, setControlsVisible] = useState(true);
    const [showAudioPicker, setShowAudioPicker] = useState(false);
    const hideTimerRef = useRef(null);

    const resetHideTimer = useCallback(() => {
        setControlsVisible(true);
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => {
            setControlsVisible(false);
            setShowAudioPicker(false);
        }, 4000);
    }, []);

    // Start auto-hide timer when connected
    useEffect(() => {
        if (callState === 'connected') {
            resetHideTimer();
        }
        return () => clearTimeout(hideTimerRef.current);
    }, [callState, resetHideTimer]);

    // Bind local stream to local video element
    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
            localVideoRef.current.play().catch(() => {});
        }
    }, [localStream]);

    // Bind remote stream to remote video element
    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
            remoteVideoRef.current.play().catch(() => {});
        }
    }, [remoteStream]);

    // Apply audio output device to remote video element
    useEffect(() => {
        const el = remoteVideoRef.current;
        if (el && selectedAudioOutput && typeof el.setSinkId === 'function') {
            el.setSinkId(selectedAudioOutput).catch(e => {
                console.warn('[AudioOutput] setSinkId failed:', e.message);
            });
        }
    }, [selectedAudioOutput, remoteStream]);

    // Ref callback for the remote <video>
    const setRemoteVideoRef = useCallback((el) => {
        remoteVideoRef.current = el;
        if (el && remoteStream) {
            el.srcObject = remoteStream;
            el.play().catch(() => {});
            // Apply audio output device
            if (selectedAudioOutput && typeof el.setSinkId === 'function') {
                el.setSinkId(selectedAudioOutput).catch(() => {});
            }
        }
    }, [remoteStream, selectedAudioOutput]);

    // Ref callback for local video
    const setLocalVideoRef = useCallback((el) => {
        localVideoRef.current = el;
        if (el && localStream) {
            el.srcObject = localStream;
            el.play().catch(() => {});
        }
    }, [localStream]);

    if (callState !== "connected" || currentCall?.type !== "video") return null;

    // Cinema mode: when remote peer is screen sharing, optimize for landscape content viewing
    const isCinemaMode = remoteIsScreenSharing;

    return (
        <div 
            ref={containerRef}
            className="fixed inset-0 z-40 bg-black flex flex-col"
            onClick={resetHideTimer}
            onMouseMove={resetHideTimer}
            onTouchStart={resetHideTimer}
        >
            
            {/* Remote Video (Full Screen) */}
            <div className="flex-1 relative w-full h-full">
                {remoteStream ? (
                    <video 
                        ref={setRemoteVideoRef} 
                        autoPlay 
                        playsInline 
                        className={`w-full h-full ${isCinemaMode ? 'object-contain' : 'object-cover'}`}
                        style={isCinemaMode ? { background: '#000' } : {}}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-900">
                        <div className="flex flex-col items-center gap-4">
                            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-violet-500"></div>
                            <p className="text-gray-400 text-sm">Connecting video...</p>
                        </div>
                    </div>
                )}

                {/* Cinema mode indicator */}
                {isCinemaMode && controlsVisible && (
                    <div className="absolute top-16 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-blue-500/80 rounded-full text-white text-xs font-medium backdrop-blur-sm flex items-center gap-2 animate-fade-in">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" />
                        </svg>
                        {currentCall.user?.fullName} is sharing their screen
                    </div>
                )}

                {/* Local Video (PiP) — smaller in cinema mode */}
                <div 
                    className={`absolute top-6 right-6 bg-gray-800 rounded-xl overflow-hidden shadow-2xl border-2 border-gray-600/50 z-10 transition-all duration-300 ${
                        isCinemaMode 
                            ? 'w-24 md:w-32 aspect-[3/4] md:aspect-video opacity-70 hover:opacity-100' 
                            : 'w-32 md:w-48 aspect-[3/4] md:aspect-video'
                    } ${controlsVisible ? 'translate-y-0' : '-translate-y-2'}`}
                >
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
                        <div className="w-full h-full flex items-center justify-center bg-gray-800 text-gray-500 text-xs">
                            Camera Off
                        </div>
                    )}
                </div>

                {/* Header overlay — auto-hides */}
                <div className={`absolute top-0 left-0 w-full p-6 bg-gradient-to-b from-black/70 to-transparent flex justify-between items-start pointer-events-none transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0'}`}>
                    <div className="flex flex-col drop-shadow-md">
                        <h2 className="text-xl font-bold text-white">{currentCall.user?.fullName}</h2>
                        <p className="text-gray-300 font-mono">{formatDuration(callDuration)}</p>
                    </div>
                </div>
            </div>

            {/* Controls — auto-hides after 4s of no interaction */}
            <div className={`absolute bottom-10 left-1/2 transform -translate-x-1/2 flex items-center gap-4 md:gap-6 bg-gray-900/80 px-6 md:px-8 py-4 rounded-full backdrop-blur-md shadow-2xl border border-white/10 transition-all duration-300 ${controlsVisible ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0 pointer-events-none'}`}>
                
                {/* Mute Button */}
                <button 
                    onClick={toggleMute}
                    className={`w-11 h-11 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-colors ${isMuted ? 'bg-white text-black' : 'bg-gray-700 text-white hover:bg-gray-600'}`}
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
                    className={`w-11 h-11 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-colors ${isCameraOff ? 'bg-white text-black' : 'bg-gray-700 text-white hover:bg-gray-600'}`}
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

                {/* Screen Share Button */}
                <button 
                    onClick={toggleScreenShare}
                    className={`w-11 h-11 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-colors ${isScreenSharing ? 'bg-blue-500 text-white ring-2 ring-blue-300' : 'bg-gray-700 text-white hover:bg-gray-600'}`}
                    title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" />
                    </svg>
                </button>

                {/* Audio Output Picker */}
                <div className="relative">
                    <button 
                        onClick={() => setShowAudioPicker(!showAudioPicker)}
                        className={`w-11 h-11 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-colors ${showAudioPicker ? 'bg-violet-500 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'}`}
                        title="Audio output"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                        </svg>
                    </button>

                    {/* Audio Output Dropdown */}
                    {showAudioPicker && audioOutputDevices.length > 0 && (
                        <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 bg-gray-800 rounded-xl shadow-2xl border border-gray-600/50 py-2 min-w-[200px] max-w-[280px] backdrop-blur-md">
                            <p className="text-gray-400 text-xs font-semibold px-4 py-1 uppercase tracking-wider">Audio Output</p>
                            {audioOutputDevices.map((device) => (
                                <button
                                    key={device.deviceId}
                                    onClick={() => {
                                        changeAudioOutput(device.deviceId);
                                        setShowAudioPicker(false);
                                    }}
                                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-3 ${
                                        selectedAudioOutput === device.deviceId 
                                            ? 'text-violet-400 bg-violet-500/10' 
                                            : 'text-gray-200 hover:bg-gray-700'
                                    }`}
                                >
                                    {selectedAudioOutput === device.deviceId && (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                        </svg>
                                    )}
                                    <span className={`truncate ${selectedAudioOutput === device.deviceId ? '' : 'ml-7'}`}>
                                        {device.label || `Speaker ${device.deviceId.slice(0, 8)}`}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* End Call Button */}
                <button 
                    onClick={endCall}
                    className="w-13 h-13 md:w-14 md:h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg transition-transform hover:scale-110 ml-1"
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
