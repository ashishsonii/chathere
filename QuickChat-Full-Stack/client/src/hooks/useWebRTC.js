import { useState, useRef, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

export const useWebRTC = (socket, userId, axios) => {
    const [localStream, setLocalStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOff, setIsCameraOff] = useState(false);
    
    const peerConnection = useRef(null);
    const pendingCandidates = useRef([]); // Buffer for ICE candidates received before answer

    // Initialize RTCPeerConnection
    const initPeerConnection = useCallback(async (callId, remoteUserId, isInitiator) => {
        if (peerConnection.current) {
            peerConnection.current.close();
        }

        let iceServersConfig = ICE_SERVERS;
        try {
            if (axios) {
                const { data } = await axios.get("/api/calls/turn-credentials");
                if (data.success && data.credentials) {
                    iceServersConfig = {
                        iceServers: [
                            ...ICE_SERVERS.iceServers,
                            data.credentials
                        ]
                    };
                }
            }
        } catch (error) {
            console.error("Failed to fetch TURN credentials, falling back to STUN", error);
        }

        const pc = new RTCPeerConnection(iceServersConfig);
        peerConnection.current = pc;

        // 1. Handle local ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("call:ice-candidate", {
                    callId,
                    to: remoteUserId,
                    candidate: event.candidate
                });
            }
        };

        // 2. Handle remote stream (when track is received)
        pc.ontrack = (event) => {
            setRemoteStream(event.streams[0]);
        };

        // 3. Add local tracks to peer connection if we already have a stream
        if (localStream) {
            localStream.getTracks().forEach(track => {
                pc.addTrack(track, localStream);
            });
        }

        return pc;
    }, [localStream, socket, axios]);

    // Create an offer (Caller)
    const createOffer = async (callId, remoteUserId) => {
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
                offer
            });
        } catch (error) {
            console.error("Error creating offer:", error);
        }
    };

    // Create an answer (Receiver)
    const createAnswer = async (callId, remoteUserId, offer) => {
        const pc = peerConnection.current;
        if (!pc) return;

        try {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            socket.emit("call:sdp-answer", {
                callId,
                to: remoteUserId,
                answer
            });

            // Process any pending candidates that arrived before the offer was set
            pendingCandidates.current.forEach(candidate => {
                pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
            });
            pendingCandidates.current = [];

        } catch (error) {
            console.error("Error creating answer:", error);
        }
    };

    // Handle remote answer
    const handleAnswer = async (answer) => {
        const pc = peerConnection.current;
        if (!pc) return;
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            
            // Process any pending candidates that arrived before the answer was set
            pendingCandidates.current.forEach(candidate => {
                pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
            });
            pendingCandidates.current = [];
        } catch (error) {
            console.error("Error handling answer:", error);
        }
    };

    // Handle incoming ICE candidate
    const handleIceCandidate = async (candidate) => {
        const pc = peerConnection.current;
        if (!pc) return;

        try {
            // If remote description is set, add immediately
            if (pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } else {
                // Otherwise buffer it
                pendingCandidates.current.push(candidate);
            }
        } catch (error) {
            console.error("Error adding ICE candidate:", error);
        }
    };

    // Get user media
    const startLocalStream = async (type) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: type === "video" ? {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: "user"
                } : false
            });
            setLocalStream(stream);
            return stream;
        } catch (error) {
            console.warn("First getUserMedia attempt failed, trying fallback:", error);
            try {
                // Fallback without strict constraints
                const fallbackStream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                    video: type === "video"
                });
                setLocalStream(fallbackStream);
                return fallbackStream;
            } catch (fallbackError) {
                console.error("Error accessing media devices:", fallbackError);
                toast.error(`Media access failed: ${fallbackError.name || fallbackError.message}. Check permissions or if another app is using the mic/camera.`);
                return null;
            }
        }
    };

    const stopLocalStream = () => {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            setLocalStream(null);
        }
    };

    const toggleMute = () => {
        if (localStream) {
            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsMuted(!audioTrack.enabled);
                return !audioTrack.enabled;
            }
        }
        return isMuted;
    };

    const toggleCamera = () => {
        if (localStream) {
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setIsCameraOff(!videoTrack.enabled);
                return !videoTrack.enabled;
            }
        }
        return isCameraOff;
    };

    const cleanup = () => {
        if (peerConnection.current) {
            peerConnection.current.close();
            peerConnection.current = null;
        }
        stopLocalStream();
        setRemoteStream(null);
        setIsMuted(false);
        setIsCameraOff(false);
        pendingCandidates.current = [];
    };

    return {
        localStream,
        remoteStream,
        isMuted,
        isCameraOff,
        startLocalStream,
        initPeerConnection,
        createOffer,
        createAnswer,
        handleAnswer,
        handleIceCandidate,
        toggleMute,
        toggleCamera,
        cleanup
    };
};
