import { useState, useRef, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' }
    ],
    iceCandidatePoolSize: 10
};

export const useWebRTC = (socket, userId, axios) => {
    const [localStream, setLocalStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOff, setIsCameraOff] = useState(false);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [audioOutputDevices, setAudioOutputDevices] = useState([]);
    const [selectedAudioOutput, setSelectedAudioOutput] = useState('default');
    
    const peerConnection = useRef(null);
    const dataChannelRef = useRef(null);
    const pendingCandidates = useRef([]);
    // localStreamRef is set SYNCHRONOUSLY in startLocalStream, before React
    // batches the setState. This guarantees initPeerConnection always sees
    // the latest stream even when called in the same tick as startLocalStream.
    const localStreamRef = useRef(null);
    const cameraStreamRef = useRef(null); // Stores original camera stream during screen share
    const isScreenSharingRef = useRef(false); // Synchronous guard against stale closures
    const screenShareLockRef = useRef(false); // Prevents double-click race conditions

    // Initialize RTCPeerConnection.
    // `explicitStream` lets callers pass the stream directly to bypass any
    // stale-closure issues (e.g. when acceptCall calls startLocalStream then
    // immediately calls initPeerConnection in the same synchronous block).
    const initPeerConnection = useCallback(async (callId, remoteUserId, isInitiator, explicitStream) => {
        // Clean up any prior connection fully before creating a new one
        if (peerConnection.current) {
            peerConnection.current.ontrack = null;
            peerConnection.current.onicecandidate = null;
            peerConnection.current.oniceconnectionstatechange = null;
            peerConnection.current.onconnectionstatechange = null;
            peerConnection.current.close();
            peerConnection.current = null;
        }
        pendingCandidates.current = [];

        // Fetch TURN credentials for NAT traversal reliability
        let iceServersConfig = ICE_SERVERS;
        try {
            if (axios) {
                const { data } = await axios.get("/api/calls/turn-credentials");
                if (data.success && data.credentials) {
                    iceServersConfig = {
                        iceServers: [
                            ...ICE_SERVERS.iceServers,
                            data.credentials
                        ],
                        iceCandidatePoolSize: 10
                    };
                }
            }
        } catch (error) {
            console.warn("[WebRTC] TURN credentials unavailable, using STUN only:", error.message);
        }

        const pc = new RTCPeerConnection(iceServersConfig);
        peerConnection.current = pc;

        // 1. Relay local ICE candidates to remote peer via signaling
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("call:ice-candidate", {
                    callId,
                    to: remoteUserId,
                    candidate: event.candidate
                });
            }
        };

        // 2. Assign the remote stream directly. Do NOT wrap it in a new MediaStream
        //    each time, as rapidly recreating the stream object can cause the
        //    browser's video decoder pipeline to stall or show a black screen.
        pc.ontrack = (event) => {
            const stream = event.streams && event.streams.length > 0 
                ? event.streams[0] 
                : new MediaStream([event.track]);
            
            // To force a React re-render if necessary while keeping the same 
            // stream identity, we just set the state. If the stream is the same 
            // object, React might bail out, but the DOM <video> element will 
            // natively handle new tracks being added to its existing srcObject.
            setRemoteStream(stream);
        };

        // 3. ICE connection state monitoring — auto-restart on failure
        pc.oniceconnectionstatechange = () => {
            const state = pc.iceConnectionState;
            console.log(`[WebRTC] ICE state: ${state}`);
            if (state === 'failed') {
                console.warn("[WebRTC] ICE failed — attempting ICE restart");
                pc.restartIce();
            }
        };

        pc.onconnectionstatechange = () => {
            console.log(`[WebRTC] Connection state: ${pc.connectionState}`);
        };

        // 4. Dummy DataChannel to keep DTLS alive for certain browsers/NATs
        if (isInitiator) {
            const channel = pc.createDataChannel("vfx_sync");
            channel.onopen = () => console.log(`[WebRTC] DataChannel opened`);
            dataChannelRef.current = channel;
        } else {
            pc.ondatachannel = (event) => {
                event.channel.onopen = () => console.log(`[WebRTC] DataChannel opened`);
                dataChannelRef.current = event.channel;
            };
        }

        // 5. Add local media tracks to the peer connection.
        //    Priority: explicit param > synchronous ref > React state
        const mediaStream = explicitStream || localStreamRef.current;
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => {
                pc.addTrack(track, mediaStream);
            });
            console.log(`[WebRTC] Added ${mediaStream.getTracks().length} local track(s)`);
        } else {
            console.warn("[WebRTC] No local stream available — remote peer will not receive media!");
        }

        return pc;
    }, [socket, axios]); // localStream deliberately excluded — we use the ref

    // Create an SDP offer (caller side)
    const createOffer = useCallback(async (callId, remoteUserId) => {
        const pc = peerConnection.current;
        if (!pc) return;

        try {
            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            await pc.setLocalDescription(offer);
            
            socket.emit("call:sdp-offer", {
                callId,
                to: remoteUserId,
                offer: pc.localDescription
            });
        } catch (error) {
            console.error("[WebRTC] Error creating offer:", error);
        }
    }, [socket]);

    // Create an SDP answer (receiver side)
    const createAnswer = useCallback(async (callId, remoteUserId, offer) => {
        const pc = peerConnection.current;
        if (!pc) return;

        try {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            socket.emit("call:sdp-answer", {
                callId,
                to: remoteUserId,
                answer: pc.localDescription
            });

            // Flush any ICE candidates that arrived before the remote description
            if (pendingCandidates.current.length > 0) {
                console.log(`[WebRTC] Flushing ${pendingCandidates.current.length} buffered ICE candidates`);
                for (const c of pendingCandidates.current) {
                    try { await pc.addIceCandidate(new RTCIceCandidate(c)); }
                    catch (e) { console.warn("[WebRTC] Buffered candidate failed:", e.message); }
                }
                pendingCandidates.current = [];
            }
        } catch (error) {
            console.error("[WebRTC] Error creating answer:", error);
        }
    }, [socket]);

    // Handle the remote SDP answer (caller receives this)
    const handleAnswer = useCallback(async (answer) => {
        const pc = peerConnection.current;
        if (!pc) return;

        try {
            if (pc.signalingState !== "have-local-offer") {
                console.warn(`[WebRTC] Ignoring answer — wrong state: ${pc.signalingState}`);
                return;
            }
            await pc.setRemoteDescription(new RTCSessionDescription(answer));

            // Flush buffered ICE candidates
            if (pendingCandidates.current.length > 0) {
                console.log(`[WebRTC] Flushing ${pendingCandidates.current.length} buffered ICE candidates`);
                for (const c of pendingCandidates.current) {
                    try { await pc.addIceCandidate(new RTCIceCandidate(c)); }
                    catch (e) { console.warn("[WebRTC] Buffered candidate failed:", e.message); }
                }
                pendingCandidates.current = [];
            }
        } catch (error) {
            console.error("[WebRTC] Error handling answer:", error);
        }
    }, []);

    // Handle incoming ICE candidate — add immediately or buffer
    const handleIceCandidate = useCallback(async (candidate) => {
        const pc = peerConnection.current;
        if (!pc) return;

        try {
            if (pc.remoteDescription && pc.remoteDescription.type) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } else {
                pendingCandidates.current.push(candidate);
            }
        } catch (error) {
            console.warn("[WebRTC] ICE candidate error:", error.message);
        }
    }, []);

    // Acquire local camera/microphone
    const startLocalStream = async (type) => {
        // Stop any prior stream first to release hardware
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
        }

        const constraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: type === "video" ? {
                width: { ideal: 1280, max: 1920 },
                height: { ideal: 720, max: 1080 },
                frameRate: { ideal: 30, max: 30 },
                facingMode: "user"
            } : false
        };

        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (primaryErr) {
            console.warn("[WebRTC] Primary getUserMedia failed, trying fallback:", primaryErr.name);
            try {
                // Minimal constraints — works on the widest range of devices/OS
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                    video: type === "video"
                });
            } catch (fallbackErr) {
                console.error("[WebRTC] Media access totally failed:", fallbackErr);
                const reason = fallbackErr.name === 'NotAllowedError'
                    ? 'Permission denied — please allow camera/mic in browser settings.'
                    : fallbackErr.message;
                toast.error(`Media access failed: ${reason}`);
                throw fallbackErr;
            }
        }

        // Set the ref SYNCHRONOUSLY so it is available in the same tick
        localStreamRef.current = stream;
        // Queue the React state update (will apply on next render)
        setLocalStream(stream);
        return stream;
    };

    const stopLocalStream = useCallback(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
        }
        setLocalStream(null);
    }, []);

    const toggleMute = useCallback(() => {
        const stream = localStreamRef.current;
        if (stream) {
            const audioTrack = stream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsMuted(!audioTrack.enabled);
                return !audioTrack.enabled;
            }
        }
        return false;
    }, []);

    const toggleCamera = useCallback(() => {
        const stream = localStreamRef.current;
        if (stream) {
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setIsCameraOff(!videoTrack.enabled);
                return !videoTrack.enabled;
            }
        }
        return false;
    }, []);

    // Screen sharing — uses replaceTrack() so no renegotiation is needed.
    // Uses refs (not state) to avoid the same stale-closure bug we fixed earlier.
    const toggleScreenShare = useCallback(async () => {
        const pc = peerConnection.current;
        if (!pc) return false;

        // Prevent double-click: if a share operation is already in progress, bail
        if (screenShareLockRef.current) return isScreenSharingRef.current;
        screenShareLockRef.current = true;

        // Check if getDisplayMedia is available
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
            toast.error("Screen sharing is not supported on this device/browser.");
            screenShareLockRef.current = false;
            return false;
        }

        try {
            if (!isScreenSharingRef.current) {
                // --- START screen share ---
                // Request HD quality: 1080p preferred, up to 4K, high framerate
                const screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        cursor: "always",
                        width: { ideal: 1920, max: 3840 },
                        height: { ideal: 1080, max: 2160 },
                        frameRate: { ideal: 30, max: 60 }
                    },
                    audio: false
                });

                const screenTrack = screenStream.getVideoTracks()[0];
                if (!screenTrack) {
                    screenShareLockRef.current = false;
                    return false;
                }

                // Find the video sender in the peer connection
                const videoSender = pc.getSenders().find(s => s.track && s.track.kind === "video");
                if (!videoSender) {
                    console.warn("[WebRTC] No video sender found to replace");
                    screenTrack.stop();
                    screenShareLockRef.current = false;
                    return false;
                }

                // Save the camera stream so we can switch back
                cameraStreamRef.current = localStreamRef.current;

                // Hint browser this is detailed content (sharper text rendering)
                try { screenTrack.contentHint = 'detail'; } catch(e) {}

                // Replace the camera track with the screen track
                await videoSender.replaceTrack(screenTrack);

                // Boost encoding bitrate for HD quality screen share
                try {
                    const params = videoSender.getParameters();
                    if (!params.encodings) params.encodings = [{}];
                    params.encodings.forEach(enc => {
                        enc.maxBitrate = 4_000_000; // 4 Mbps for crisp HD
                        enc.maxFramerate = 30;
                    });
                    await videoSender.setParameters(params);
                } catch(e) { console.warn('[WebRTC] Could not set screen share bitrate:', e.message); }

                // Update local stream to show screen in PiP
                const newStream = new MediaStream([
                    ...localStreamRef.current.getAudioTracks(),
                    screenTrack
                ]);
                localStreamRef.current = newStream;
                setLocalStream(newStream);
                isScreenSharingRef.current = true;
                setIsScreenSharing(true);

                // When user clicks browser's "Stop sharing" button
                screenTrack.onended = async () => {
                    await switchBackToCamera(videoSender);
                };

                screenShareLockRef.current = false;
                return true;
            } else {
                // --- STOP screen share ---
                const videoSender = pc.getSenders().find(s => s.track && s.track.kind === "video");
                if (videoSender) {
                    await switchBackToCamera(videoSender);
                }
                screenShareLockRef.current = false;
                return false;
            }
        } catch (error) {
            screenShareLockRef.current = false;
            if (error.name === 'NotAllowedError') {
                // User cancelled the screen picker — not an error
                return isScreenSharingRef.current;
            }
            console.error("[WebRTC] Screen share error:", error);
            toast.error("Screen sharing failed.");
            return isScreenSharingRef.current;
        }
    }, []); // No state deps — all reads go through refs

    // Helper: switch back from screen share to camera
    const switchBackToCamera = useCallback(async (videoSender) => {
        const cameraStream = cameraStreamRef.current;
        if (!cameraStream) return;

        const cameraTrack = cameraStream.getVideoTracks()[0];
        if (cameraTrack && videoSender) {
            await videoSender.replaceTrack(cameraTrack);

            // Restore normal camera bitrate
            try {
                const params = videoSender.getParameters();
                if (params.encodings) {
                    params.encodings.forEach(enc => {
                        enc.maxBitrate = 1_500_000; // 1.5 Mbps for camera
                        enc.maxFramerate = 30;
                    });
                    await videoSender.setParameters(params);
                }
            } catch(e) {}
        }

        // Stop the screen track
        const currentStream = localStreamRef.current;
        if (currentStream) {
            currentStream.getVideoTracks().forEach(t => {
                if (t !== cameraTrack) t.stop();
            });
        }

        // Restore camera stream
        localStreamRef.current = cameraStream;
        setLocalStream(cameraStream);
        isScreenSharingRef.current = false;
        setIsScreenSharing(false);
        cameraStreamRef.current = null;
    }, []);

    // --- Audio Output Device Management ---
    // Refresh the list of available audio output devices
    const refreshAudioDevices = useCallback(async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const outputs = devices.filter(d => d.kind === 'audiooutput');
            setAudioOutputDevices(outputs);
        } catch(e) {
            console.warn('[WebRTC] Cannot enumerate audio devices:', e.message);
        }
    }, []);

    // Listen for device changes (plugging in headphones, connecting Bluetooth)
    useEffect(() => {
        if (!navigator.mediaDevices?.addEventListener) return;
        const handler = () => refreshAudioDevices();
        navigator.mediaDevices.addEventListener('devicechange', handler);
        // Initial load
        refreshAudioDevices();
        return () => navigator.mediaDevices.removeEventListener('devicechange', handler);
    }, [refreshAudioDevices]);

    // Change audio output device (speaker, Bluetooth, earpiece, etc.)
    const changeAudioOutput = useCallback(async (deviceId) => {
        setSelectedAudioOutput(deviceId);
        // The actual setSinkId call is handled by the VideoCallScreen component
        // on its <video> elements, since setSinkId is a DOM API on HTMLMediaElement
    }, []);

    const cleanup = useCallback(() => {
        if (peerConnection.current) {
            peerConnection.current.ontrack = null;
            peerConnection.current.onicecandidate = null;
            peerConnection.current.oniceconnectionstatechange = null;
            peerConnection.current.onconnectionstatechange = null;
            peerConnection.current.close();
            peerConnection.current = null;
        }
        if (dataChannelRef.current) {
            dataChannelRef.current.close();
            dataChannelRef.current = null;
        }
        // Stop screen share stream if active
        if (cameraStreamRef.current) {
            cameraStreamRef.current.getTracks().forEach(t => t.stop());
            cameraStreamRef.current = null;
        }
        stopLocalStream();
        setRemoteStream(null);
        setIsMuted(false);
        setIsCameraOff(false);
        setIsScreenSharing(false);
        pendingCandidates.current = [];
    }, [stopLocalStream]);

    return {
        localStream,
        remoteStream,
        isMuted,
        isCameraOff,
        isScreenSharing,
        audioOutputDevices,
        selectedAudioOutput,
        startLocalStream,
        initPeerConnection,
        createOffer,
        createAnswer,
        handleAnswer,
        handleIceCandidate,
        toggleMute,
        toggleCamera,
        toggleScreenShare,
        changeAudioOutput,
        cleanup
    };
};
