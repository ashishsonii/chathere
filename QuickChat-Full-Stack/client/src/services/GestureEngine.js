import { FilesetResolver, GestureRecognizer } from "@mediapipe/tasks-vision";

// Stream gesture coordinates continuously

export class GestureEngine {
    constructor() {
        this.recognizer = null;
        this.isRunning = false;
        this.currentGesture = null;
        this.animationFrameId = null;
        this.scaleHistory = [];
        this.lastInferenceTime = 0;
        this.debounceFrames = 0;
        this.lastEventPayload = null;
    }

    async initialize() {
        if (this.recognizer) return;
        
        try {
            const vision = await FilesetResolver.forVisionTasks(
                "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
            );
            
            this.recognizer = await GestureRecognizer.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
                    delegate: "GPU"
                },
                runningMode: "VIDEO",
                numHands: 2
            });
            console.log("[GestureEngine] Initialized successfully");
        } catch (error) {
            console.error("[GestureEngine] Initialization failed:", error);
        }
    }

    start(videoElement, onGesture) {
        if (!this.recognizer) {
            console.warn("[GestureEngine] Cannot start, recognizer not initialized");
            return;
        }
        
        this.isRunning = true;
        let lastVideoTime = -1;

        const renderLoop = () => {
            if (!this.isRunning) return;

            // Only process new frames and throttle to ~30 FPS to prevent freezing/lag
            const now = performance.now();
            if (videoElement.currentTime !== lastVideoTime && videoElement.readyState >= 2) {
                if (now - this.lastInferenceTime < 33) {
                    this.animationFrameId = requestAnimationFrame(renderLoop);
                    return;
                }
                
                lastVideoTime = videoElement.currentTime;
                this.lastInferenceTime = now;
                
                try {
                    const results = this.recognizer.recognizeForVideo(videoElement, now);
                    
                    if (results.gestures.length > 0) {
                        
                        // --- TWO HANDS LOGIC (Connected Webs) ---
                        if (results.landmarks.length === 2) {
                            // Extract the 5 fingertips for both hands: [Thumb (4), Index (8), Middle (12), Ring (16), Pinky (20)]
                            const h1 = results.landmarks[0];
                            const h2 = results.landmarks[1];
                            
                            const hand1 = [h1[4], h1[8], h1[12], h1[16], h1[20]];
                            const hand2 = [h2[4], h2[8], h2[12], h2[16], h2[20]];
                            
                            this.currentGesture = "connect_webs";
                            this.debounceFrames = 5;
                            this.lastEventPayload = {
                                gesture: "connect_webs",
                                x: 0, y: 0, z: 0, // Dummy
                                hand1: hand1,
                                hand2: hand2
                            };
                            onGesture(this.lastEventPayload);
                            this.animationFrameId = requestAnimationFrame(renderLoop);
                            return; // Skip single hand processing
                        }

                        // --- SINGLE HAND LOGIC ---
                        const gestureName = results.gestures[0][0].categoryName;
                        const score = results.gestures[0][0].score;
                        
                        // Use the wrist landmark (index 0) and middle finger MCP (index 9)
                        const wrist = results.landmarks[0][0];
                        const mcp = results.landmarks[0][9];
                        
                        // Calculate 2D distance between wrist and middle MCP as a proxy for scale
                        const currentScale = Math.sqrt(Math.pow(wrist.x - mcp.x, 2) + Math.pow(wrist.y - mcp.y, 2));
                        
                        this.scaleHistory.push({ time: now, scale: currentScale });
                        if (this.scaleHistory.length > 10) this.scaleHistory.shift();

                        let isPushing = false;
                        if (this.scaleHistory.length >= 8) {
                            const oldestScale = this.scaleHistory[0].scale;
                            // If scale increased by > 20% over the last ~8-10 frames, it's a push toward camera
                            if (currentScale > oldestScale * 1.20) {
                                isPushing = true;
                            }
                        }
                        
                        // Map MediaPipe standard gestures to our VFX triggers
                        let mappedGesture = null;
                        if (gestureName === "Open_Palm") mappedGesture = "open_palm";
                        if (gestureName === "Closed_Fist") mappedGesture = "closed_fist";
                        if (gestureName === "Victory") mappedGesture = "two_finger";
                        if (gestureName === "Thumb_Up") mappedGesture = "thumbs_up";
                        if (gestureName === "ILoveYou" || gestureName === "Pointing_Up") mappedGesture = "hand_raise";

                        // Override with the super power throw if pushing
                        if (isPushing && (gestureName === "Open_Palm" || gestureName === "Closed_Fist")) {
                            mappedGesture = "fire_throw";
                        }

                        if (mappedGesture && score > 0.6) {
                            this.currentGesture = mappedGesture;
                            this.debounceFrames = 5; // Allow 5 frames of drop tolerance
                            this.lastEventPayload = {
                                gesture: mappedGesture,
                                x: wrist.x,
                                y: wrist.y,
                                z: wrist.z
                            };
                            onGesture(this.lastEventPayload);
                        } else if (this.debounceFrames > 0 && this.lastEventPayload) {
                            this.debounceFrames--;
                            onGesture(this.lastEventPayload);
                        } else if (this.currentGesture !== null) {
                            this.currentGesture = null;
                            onGesture({ gesture: "none", x: 0, y: 0, z: 0 });
                        }
                    } else if (this.debounceFrames > 0 && this.lastEventPayload) {
                        this.debounceFrames--;
                        onGesture(this.lastEventPayload);
                    } else if (this.currentGesture !== null) {
                        // Hand was lowered or gesture stopped and debounce expired
                        this.currentGesture = null;
                        onGesture({ gesture: "none", x: 0, y: 0, z: 0 });
                    }
                } catch (e) {
                    console.warn("[GestureEngine] Detection error:", e);
                }
            }

            this.animationFrameId = requestAnimationFrame(renderLoop);
        };

        renderLoop();
    }

    stop() {
        this.isRunning = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        this.currentGesture = null;
    }
}

// Singleton instance
export const gestureEngine = new GestureEngine();
