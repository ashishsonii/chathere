import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { VFXEngine } from './VFXEngine';

export const VFXCanvas = forwardRef(({ className }, ref) => {
    const canvasRef = useRef(null);
    const engineRef = useRef(null);

    useEffect(() => {
        if (!canvasRef.current) return;
        
        // Initialize the Three.js WebGL Engine on this canvas
        engineRef.current = new VFXEngine(canvasRef.current);

        return () => {
            if (engineRef.current) {
                engineRef.current.destroy();
                engineRef.current = null;
            }
        };
    }, []);

    // Expose triggerEffect to parent components
    useImperativeHandle(ref, () => ({
        triggerEffect: (gesture, x, y) => {
            if (engineRef.current) {
                engineRef.current.triggerEffect(gesture, x, y);
            }
        }
    }));

    return (
        <canvas 
            ref={canvasRef} 
            className={`pointer-events-none absolute inset-0 w-full h-full ${className || ''}`} 
        />
    );
});

VFXCanvas.displayName = 'VFXCanvas';
