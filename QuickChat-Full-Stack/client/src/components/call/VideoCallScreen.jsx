import React, { useContext, useEffect, useRef, useCallback, useState } from 'react';
import { CallContext } from '../../../context/CallContext';

const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
};

// Fit modes for the remote video
const FIT_MODES = [
    { id: 'contain', label: 'Fit', desc: 'Full view, no crop' },
    { id: 'cover', label: 'Fill', desc: 'Fill screen, may crop' },
];

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
        remoteIsCameraOff,
        remoteIsMuted,
        audioOutputDevices,
        selectedAudioOutput,
        iceConnectionState,
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

    // --- Orientation & fit ---
    const [forceLandscape, setForceLandscape] = useState(false);
    const [fitMode, setFitMode] = useState('contain'); // 'contain' | 'cover'
    const [zoomLevel, setZoomLevel] = useState(1); // 1 = 100%, range 0.5 – 2.0

    const handleTapToggle = useCallback((e) => {
        // Prevent toggle if clicking on a button or the controls bar
        if (e.target.closest('button') || e.target.closest('.controls-bar')) return;
        
        setControlsVisible(prev => {
            const next = !prev;
            if (next) {
                clearTimeout(hideTimerRef.current);
                hideTimerRef.current = setTimeout(() => {
                    setControlsVisible(false);
                    setShowAudioPicker(false);
                }, 4000);
            } else {
                clearTimeout(hideTimerRef.current);
                setShowAudioPicker(false);
            }
            return next;
        });
    }, []);

    const handlePointerMove = useCallback((e) => {
        // Ignore touch movements so they don't conflict with the explicit tap-to-toggle
        if (e.pointerType === 'touch') return;

        setControlsVisible(prev => {
            clearTimeout(hideTimerRef.current);
            hideTimerRef.current = setTimeout(() => {
                setControlsVisible(false);
                setShowAudioPicker(false);
            }, 4000);
            return true; // Always visible on mouse move
        });
    }, []);

    // Start auto-hide timer when connected
    useEffect(() => {
        if (callState === 'connected') {
            clearTimeout(hideTimerRef.current);
            hideTimerRef.current = setTimeout(() => {
                setControlsVisible(false);
                setShowAudioPicker(false);
            }, 4000);
        }
        return () => clearTimeout(hideTimerRef.current);
    }, [callState]);

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

    // Toggle landscape mode: try native orientation lock, fallback to CSS rotation
    const toggleLandscape = useCallback(() => {
        if (!forceLandscape) {
            // Try to lock to landscape via Screen Orientation API
            try {
                screen.orientation?.lock?.('landscape').catch(() => {});
            } catch(e) {}
        } else {
            try {
                screen.orientation?.unlock?.();
            } catch(e) {}
        }
        setForceLandscape(prev => !prev);
    }, [forceLandscape]);

    if (callState !== "connected" || currentCall?.type !== "video") return null;

    const isCinemaMode = remoteIsScreenSharing;

    // Landscape CSS rotation for devices that don't support orientation lock
    const landscapeStyle = forceLandscape ? {
        transform: 'rotate(90deg)',
        transformOrigin: 'center center',
        width: '100vh',
        height: '100vw',
        position: 'fixed',
        top: '50%',
        left: '50%',
        marginTop: 'calc(-50vw)',
        marginLeft: 'calc(-50vh)',
    } : {};

    return (
        <div 
            ref={containerRef}
            className="fixed inset-0 z-40 bg-black flex flex-col"
            style={forceLandscape ? landscapeStyle : {}}
            onClick={handleTapToggle}
            onPointerMove={handlePointerMove}
        >
            
            {/* Remote Video (Full Screen) */}
            <div className="flex-1 relative w-full h-full overflow-hidden">
                {/* The video element is always rendered if remoteStream exists, but kept invisible until onCanPlay */}
                <video 
                    ref={setRemoteVideoRef} 
                    autoPlay 
                    playsInline
                    className={`w-full h-full transition-opacity duration-500 ${remoteStream ? 'opacity-100' : 'opacity-0'}`}
                    style={{ 
                        objectFit: fitMode,
                        background: '#000',
                        transform: `scale(${zoomLevel})`,
                        transformOrigin: 'center center',
                    }}
                />

                {(!remoteStream || iceConnectionState === 'new' || iceConnectionState === 'checking') && (
                    <div className="absolute inset-0 z-10 w-full h-full flex items-center justify-center bg-gray-900">
                        <div className="flex flex-col items-center gap-4">
                            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-violet-500"></div>
                            <p className="text-gray-400 text-sm">
                                {iceConnectionState === 'checking' ? 'Connecting media...' : 'Waiting for video...'}
                            </p>
                        </div>
                    </div>
                )}

                {/* Remote Camera Off Indicator */}
                {iceConnectionState === 'connected' && remoteIsCameraOff && (
                    <div className="absolute inset-0 z-10 w-full h-full flex flex-col items-center justify-center bg-gray-900/90 backdrop-blur-md">
                        <div className="w-24 h-24 rounded-full bg-gray-800 flex items-center justify-center mb-4 border border-gray-700 shadow-xl">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                                <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                            </svg>
                        </div>
                        <p className="text-white font-medium text-lg">{currentCall.user?.fullName} turned off their camera</p>
                    </div>
                )}
                
                {iceConnectionState === 'failed' && (
                    <div className="absolute inset-0 z-10 w-full h-full flex items-center justify-center bg-gray-900/80 backdrop-blur-sm">
                        <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-xl flex flex-col items-center gap-3">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <p className="text-red-400 font-medium">Connection Failed</p>
                            <p className="text-gray-400 text-sm text-center max-w-xs">Could not establish a direct connection. This is often caused by restrictive firewalls or NAT types.</p>
                        </div>
                    </div>
                )}

                {/* Cinema mode indicator */}
                {isCinemaMode && controlsVisible && (
                    <div className="absolute top-16 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-blue-500/80 rounded-full text-white text-xs font-medium backdrop-blur-sm flex items-center gap-2">
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
                        <>
                            <video 
                                ref={setLocalVideoRef} 
                                autoPlay 
                                playsInline 
                                muted 
                                className="w-full h-full object-cover" 
                                style={isScreenSharing ? {} : { transform: "scaleX(-1)" }}
                            />
                        </>
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-800 text-gray-500 text-xs">
                            Camera Off
                        </div>
                    )}
                </div>

                {/* Header overlay — auto-hides */}
                <div className={`absolute top-0 left-0 w-full p-6 md:p-8 bg-gradient-to-b from-black/70 to-transparent flex justify-between items-start pointer-events-none transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0'}`}>
                    <div className="flex flex-col drop-shadow-md">
                        <div className="flex items-center gap-3">
                            <h2 className="text-xl md:text-3xl font-bold text-white tracking-wide drop-shadow-lg">{currentCall.user?.fullName}</h2>
                            {remoteIsMuted && (
                                <div className="bg-red-500/80 p-1.5 rounded-full backdrop-blur-sm shadow-md" title="User is muted">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7.02 7.02 0 01-1.42 4.24m-1.55 1.55A7.02 7.02 0 0112 18a7 7 0 01-7-7M5 11v-1m0-2V7m0 2h.01M5 7h.01m13.98 0A6.98 6.98 0 0019 11M3 3l18 18" />
                                    </svg>
                                </div>
                            )}
                        </div>
                        <p className="text-gray-300 font-mono text-sm md:text-lg font-medium tracking-wider mt-1">{formatDuration(callDuration)}</p>
                    </div>
                </div>

                {/* --- Zoom & Fit controls (right side, vertical) --- */}
                <div className={`controls-bar select-none absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                    {/* Zoom In */}
                    <button 
                        onClick={() => setZoomLevel(prev => Math.min(prev + 0.15, 2.5))}
                        className="w-9 h-9 rounded-full bg-gray-800/80 text-white flex items-center justify-center text-lg font-bold backdrop-blur-sm hover:bg-gray-700 border border-white/10"
                        title="Zoom in"
                    >+</button>
                    
                    {/* Zoom indicator */}
                    <span className="text-white/70 text-[10px] font-mono">{Math.round(zoomLevel * 100)}%</span>

                    {/* Zoom Out */}
                    <button 
                        onClick={() => setZoomLevel(prev => Math.max(prev - 0.15, 0.5))}
                        className="w-9 h-9 rounded-full bg-gray-800/80 text-white flex items-center justify-center text-lg font-bold backdrop-blur-sm hover:bg-gray-700 border border-white/10"
                        title="Zoom out"
                    >−</button>

                    {/* Reset zoom */}
                    {zoomLevel !== 1 && (
                        <button 
                            onClick={() => setZoomLevel(1)}
                            className="w-9 h-9 rounded-full bg-gray-800/80 text-white flex items-center justify-center backdrop-blur-sm hover:bg-gray-700 border border-white/10"
                            title="Reset zoom"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {/* Controls — auto-hides after 4s */}
            <div className={`controls-bar select-none absolute bottom-10 left-1/2 transform -translate-x-1/2 flex items-center gap-3 md:gap-5 bg-gray-900/80 px-5 md:px-7 py-3.5 rounded-full backdrop-blur-md shadow-2xl border border-white/10 transition-all duration-300 ${controlsVisible ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0 pointer-events-none'}`}>
                
                {/* Mute Button */}
                <button 
                    onClick={toggleMute}
                    className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-colors ${isMuted ? 'bg-white text-black' : 'bg-gray-700 text-white hover:bg-gray-600'}`}
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
                    className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-colors ${isCameraOff ? 'bg-white text-black' : 'bg-gray-700 text-white hover:bg-gray-600'}`}
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

                {/* Screen Share */}
                {!!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) && (
                    <button 
                        onClick={toggleScreenShare}
                        className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-colors ${isScreenSharing ? 'bg-blue-500 text-white ring-2 ring-blue-300' : 'bg-gray-700 text-white hover:bg-gray-600'}`}
                        title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" />
                        </svg>
                    </button>
                )}

                {/* Fit Mode Toggle: Fit ↔ Fill */}
                <button 
                    onClick={() => {
                        const nextIdx = (FIT_MODES.findIndex(m => m.id === fitMode) + 1) % FIT_MODES.length;
                        setFitMode(FIT_MODES[nextIdx].id);
                    }}
                    className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gray-700 text-white hover:bg-gray-600 flex items-center justify-center transition-colors"
                    title={`Current: ${FIT_MODES.find(m => m.id === fitMode)?.desc}`}
                >
                    {fitMode === 'contain' ? (
                        /* Fit icon — arrows pointing inward */
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                        </svg>
                    ) : (
                        /* Fill icon — arrows pointing outward */
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                        </svg>
                    )}
                </button>

                {/* Landscape/Portrait Toggle (Mobile Only) */}
                <button 
                    onClick={toggleLandscape}
                    className={`w-10 h-10 md:hidden rounded-full flex items-center justify-center transition-colors ${forceLandscape ? 'bg-amber-500 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'}`}
                    title={forceLandscape ? 'Switch to Portrait' : 'Switch to Landscape'}
                >
                    {forceLandscape ? (
                        /* Portrait icon */
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3" />
                        </svg>
                    ) : (
                        /* Landscape icon */
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3" style={{transform: 'rotate(90deg)'}} />
                        </svg>
                    )}
                </button>

                {/* Audio Output Picker */}
                <div className="relative">
                    <button 
                        onClick={() => setShowAudioPicker(!showAudioPicker)}
                        className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-colors ${showAudioPicker ? 'bg-violet-500 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'}`}
                        title="Audio output"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                        </svg>
                    </button>

                    {/* Audio Output Dropdown */}
                    {showAudioPicker && audioOutputDevices.length > 0 && (
                        <div className="absolute bottom-full mb-3 right-0 bg-gray-800 rounded-xl shadow-2xl border border-gray-600/50 py-2 min-w-[200px] max-w-[280px] backdrop-blur-md">
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
                    className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg transition-transform hover:scale-110 ml-1"
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
