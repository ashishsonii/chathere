import * as THREE from 'three';

const vertexShader = `
uniform float uTime;
uniform int uEffectType;
attribute float size;
attribute vec3 customColor;
attribute vec3 velocity;
attribute float life;

varying vec3 vColor;
varying float vLife;

void main() {
    vColor = customColor;
    vLife = life;
    
    vec3 pos = position;
    
    if (uEffectType == 1) { // Fire (Closed Fist)
        pos += velocity * uTime * 2.0;
        pos.y += sin(uTime * 5.0 + pos.x) * 0.1;
    } else if (uEffectType == 2) { // Lightning (Two Fingers)
        pos += velocity * sin(uTime * 15.0) * 0.5;
        pos.x += cos(uTime * 20.0 + pos.y) * 0.05;
    } else if (uEffectType == 3) { // Magic Fog (Hand Raise)
        pos += velocity * uTime * 0.5;
        pos.x += sin(uTime + pos.y) * 0.2;
    } else if (uEffectType == 4) { // Burst (Thumbs Up)
        pos += velocity * (uTime * 5.0);
    } else if (uEffectType == 5) { // Fire Throw (Push)
        pos += velocity * (uTime * 15.0);
    } else if (uEffectType == 6) { // Web Sparkles
        pos += velocity * (uTime * 0.2); // Keep them tightly clustered to form a sharp web line!
    } else { // Dr Strange Shield (Open Palm)
        // velocity.x = base angle, velocity.y = radius
        float angle = velocity.x + uTime * 3.0; // Spin speed
        float radius = velocity.y;
        pos.x += cos(angle) * radius;
        pos.y += sin(angle) * radius;
        pos.z += velocity.z + sin(uTime * 5.0 + velocity.x) * 0.1;
    }

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    
    // Scale particles based on life and distance
    gl_PointSize = size * (1.0 - life) * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
}
`;

const fragmentShader = `
uniform int uEffectType;
varying vec3 vColor;
varying float vLife;

void main() {
    // Soft circle texture
    vec2 xy = gl_PointCoord.xy - vec2(0.5);
    float ll = length(xy);
    if (ll > 0.5) discard;
    
    float alpha = (0.5 - ll) * 2.0;
    alpha *= (1.0 - vLife); // Fade out over time
    
    vec3 finalColor = vColor;
    
    if (uEffectType == 1) { // Fire
        finalColor = mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), vLife);
        alpha *= 1.5;
    } else if (uEffectType == 5) { // Fire Throw
        finalColor = mix(vec3(1.0, 0.8, 0.0), vec3(1.0, 0.2, 0.0), vLife);
        alpha *= 2.0;
    } else if (uEffectType == 2) { // Lightning
        finalColor = vec3(0.5, 0.8, 1.0);
        if (ll < 0.1) finalColor = vec3(1.0); // Hot core
    } else if (uEffectType == 6) { // Web Sparkles
        finalColor = mix(vec3(0.0, 1.0, 1.0), vec3(0.5, 0.0, 1.0), vLife); // Cyan to purple
        float star = 0.05 / (ll + 0.01);
        alpha = star; // Instant full brightness for thick lightning!
    } else if (uEffectType == 0) { // Dr Strange Shield (Reverted to Blue/Cyan)
        finalColor = mix(vec3(0.2, 0.8, 1.0), vec3(0.0, 0.3, 1.0), vLife);
        // Star sparkle texture
        float star = 0.05 / (ll + 0.01);
        alpha = star * (1.0 - vLife);
    }

    gl_FragColor = vec4(finalColor, alpha);
}
`;

export class VFXEngine {
    constructor(canvas) {
        this.canvas = canvas;
        this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap pixel ratio for mobile performance
        this.scene = new THREE.Scene();
        
        // Setup Camera
        const aspect = canvas.clientWidth / canvas.clientHeight;
        this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
        this.camera.position.z = 5;

        // Setup Particle System
        this.particleCount = 500;
        const geometry = new THREE.BufferGeometry();
        this.positions = new Float32Array(this.particleCount * 3);
        this.velocities = new Float32Array(this.particleCount * 3);
        this.colors = new Float32Array(this.particleCount * 3);
        this.sizes = new Float32Array(this.particleCount);
        this.lifes = new Float32Array(this.particleCount);
        
        for(let i=0; i<this.particleCount; i++) {
            this.lifes[i] = 1.0; // 1.0 means dead/inactive
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        geometry.setAttribute('velocity', new THREE.BufferAttribute(this.velocities, 3));
        geometry.setAttribute('customColor', new THREE.BufferAttribute(this.colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
        geometry.setAttribute('life', new THREE.BufferAttribute(this.lifes, 1));

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0.0 },
                uEffectType: { value: 0 }
            },
            vertexShader,
            fragmentShader,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.particleSystem = new THREE.Points(geometry, this.material);
        this.scene.add(this.particleSystem);

        // Setup Connected Webs (LineSegments)
        this.webGeometry = new THREE.BufferGeometry();
        // 5 fingers * 2 segments per finger * 2 vertices per segment = 20 vertices = 60 floats
        this.webPositions = new Float32Array(60); 
        this.webGeometry.setAttribute('position', new THREE.BufferAttribute(this.webPositions, 3));
        
        this.webMaterial = new THREE.LineBasicMaterial({
            color: 0x00ffff,
            linewidth: 3, // Fallback, WebGL limits this to 1px on Windows
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: true
        });
        
        this.webLines = new THREE.LineSegments(this.webGeometry, this.webMaterial);
        this.webLines.visible = false;
        this.webLines.frustumCulled = false; // Prevent WebGL from hiding dynamic geometry
        this.particleSystem.frustumCulled = false; // Prevent particle clipping
        this.scene.add(this.webLines);

        // --- NEW GRAPHICAL DR STRANGE SHIELD MESH (ANIMATED VIDEO) ---
        const video = document.createElement('video');
        video.src = '/shield.mp4';
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.crossOrigin = 'anonymous';
        video.style.display = 'none'; // Hide it from user
        document.body.appendChild(video); // Attach to DOM to prevent aggressive browser suspension
        this.shieldVideo = video;
        this.shieldVideo.play().catch(e => console.warn("Video autoplay blocked:", e));
        
        const shieldTexture = new THREE.VideoTexture(this.shieldVideo);
        
        this.shieldMaterial = new THREE.MeshBasicMaterial({
            map: shieldTexture,
            transparent: true,
            blending: THREE.AdditiveBlending, // Makes black background perfectly transparent
            depthWrite: false,
            color: 0xffaa00, // Golden magical tint
            opacity: 0.9
        });
        
        this.shieldMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), this.shieldMaterial);
        this.shieldMesh.visible = false;
        this.scene.add(this.shieldMesh);

        // State
        this.activeEffect = null;
        this.targetPos = new THREE.Vector3(0,0,0);
        this.hand1Points = null;
        this.hand2Points = null;
        this.webBase1 = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
        this.webBase2 = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
        this.lastTime = performance.now();
        this.animationId = null;

        this.resize();
        window.addEventListener('resize', this.resize.bind(this));
        
        this.animate();
    }

    resize() {
        if (!this.canvas) return;
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.renderer.setSize(width, height, false);
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
        }
    }

    mapScreenToWorld(x, y) {
        const vec = new THREE.Vector3(
            (x * 2) - 1,
            -(y * 2) + 1,
            0.5
        );
        vec.unproject(this.camera);
        const dir = vec.sub(this.camera.position).normalize();
        const distance = -this.camera.position.z / dir.z;
        return this.camera.position.clone().add(dir.multiplyScalar(distance));
    }

    triggerEffect(gesture, x, y, hand1 = null, hand2 = null) {
        if (gesture === "none") {
            this.activeEffect = null;
            this.webLines.visible = false;
            this.shieldMesh.visible = false;
            return;
        }

        if (gesture === "connect_webs" && hand1 && hand2) {
            this.activeEffect = gesture;
            this.webLines.visible = true;
            this.shieldMesh.visible = false;
            this.hand1Points = hand1;
            this.hand2Points = hand2;
            this.material.uniforms.uEffectType.value = 6;
            
            // Map the 5 fingers to 3D world space
            for (let i = 0; i < 5; i++) {
                this.webBase1[i].copy(this.mapScreenToWorld(hand1[i].x, hand1[i].y));
                this.webBase2[i].copy(this.mapScreenToWorld(hand2[i].x, hand2[i].y));
            }
            return;
        } else {
            this.webLines.visible = false;
        }

        // Standard point mapping
        this.targetPos.copy(this.mapScreenToWorld(x, y));

        let typeInt = 0;
        switch(gesture) {
            case "closed_fist": typeInt = 1; break;
            case "two_finger": typeInt = 2; break;
            case "hand_raise": typeInt = 3; break;
            case "thumbs_up": typeInt = 4; break;
            case "fire_throw": typeInt = 5; break;
            case "open_palm": typeInt = 0; break;
            default: return;
        }

        this.material.uniforms.uEffectType.value = typeInt;
        this.activeEffect = gesture;
        
        // Toggle Graphic Shield Visibility
        if (gesture === "open_palm") {
            this.shieldMesh.visible = true;
            this.shieldMesh.position.copy(this.targetPos);
            this.shieldMesh.position.z += 0.2;
            
            // Force playback if browser suspended it in the background
            if (this.shieldVideo && this.shieldVideo.paused) {
                this.shieldVideo.play().catch(()=>{});
            }
        } else {
            this.shieldMesh.visible = false;
        }
    }

    spawnParticles(count, typeInt) {
        let spawned = 0;
        for (let i = 0; i < this.particleCount; i++) {
            if (this.lifes[i] >= 1.0) { // Find dead particle
                this.lifes[i] = 0.0; // Reset life
                
                // Base position with slight jitter
                if (typeInt === 6) { // Web Sparkles along the lines
                    // Pick a random finger pair (0 to 4)
                    const fIdx = Math.floor(Math.random() * 5);
                    const t = Math.random(); // Position along the line
                    
                    const p1 = this.webBase1[fIdx];
                    const p2 = this.webBase2[fIdx];

                    // Tightly cluster the particles along the line to form a thick, glowing beam
                    this.positions[i*3] = p1.x + (p2.x - p1.x) * t + (Math.random() - 0.5) * 0.05;
                    this.positions[i*3+1] = p1.y + (p2.y - p1.y) * t + (Math.random() - 0.5) * 0.05;
                    this.positions[i*3+2] = p1.z + (p2.z - p1.z) * t + (Math.random() - 0.5) * 0.05;
                    
                    this.colors[i*3] = 0.5; this.colors[i*3+1] = 0.8; this.colors[i*3+2] = 1.0;
                    
                    // Very slow drift so they don't explode outward into a bloom
                    this.velocities[i*3] = (Math.random() - 0.5) * 0.5;
                    this.velocities[i*3+1] = (Math.random() - 0.5) * 0.5;
                    this.velocities[i*3+2] = (Math.random() - 0.5) * 0.5;
                    
                    // Make them larger to fake line thickness
                    this.sizes[i] = Math.random() * 15 + 10;
                    
                    spawned++;
                    if (spawned >= count) break;
                    continue;
                }

                this.positions[i*3] = this.targetPos.x + (Math.random() - 0.5) * 0.2;
                this.positions[i*3+1] = this.targetPos.y + (Math.random() - 0.5) * 0.2;
                this.positions[i*3+2] = this.targetPos.z + (Math.random() - 0.5) * 0.1;

                // Base color and velocity depends on effect
                if (typeInt === 1) { // Fire
                    this.colors[i*3] = 1.0; this.colors[i*3+1] = 0.5; this.colors[i*3+2] = 0.0;
                    this.velocities[i*3] = (Math.random() - 0.5) * 2.0;
                    this.velocities[i*3+1] = Math.random() * 3.0 + 1.0; // Upwards
                    this.velocities[i*3+2] = (Math.random() - 0.5) * 2.0;
                    this.sizes[i] = Math.random() * 40 + 20;
                } else if (typeInt === 5) { // Fire Throw
                    this.colors[i*3] = 1.0; this.colors[i*3+1] = 0.6; this.colors[i*3+2] = 0.1;
                    this.velocities[i*3] = (Math.random() - 0.5) * 2.0;
                    this.velocities[i*3+1] = (Math.random() - 0.5) * 2.0;
                    this.velocities[i*3+2] = Math.random() * 5.0 + 3.0; // Fast towards camera (+Z)
                    this.sizes[i] = Math.random() * 60 + 30; // Larger particles
                } else if (typeInt === 2) { // Lightning
                    this.colors[i*3] = 0.5; this.colors[i*3+1] = 0.8; this.colors[i*3+2] = 1.0;
                    this.velocities[i*3] = (Math.random() - 0.5) * 5.0;
                    this.velocities[i*3+1] = (Math.random() - 0.5) * 5.0;
                    this.velocities[i*3+2] = (Math.random() - 0.5) * 2.0;
                    this.sizes[i] = Math.random() * 20 + 5;
                } else if (typeInt === 0) { // Dr Strange Shield
                    this.colors[i*3] = 1.0; this.colors[i*3+1] = 0.6; this.colors[i*3+2] = 0.1; // Golden
                    // Velocity acts as parameters: x=angle, y=radius, z=depth jitter
                    this.velocities[i*3] = Math.random() * Math.PI * 2; // Angle
                    
                    // Create multiple geometric rings
                    const rand = Math.random();
                    let radius = 0.5;
                    if (rand > 0.8) radius = 0.8; // Outer ring
                    else if (rand > 0.6) radius = 0.2; // Inner ring
                    
                    this.velocities[i*3+1] = radius; 
                    this.velocities[i*3+2] = (Math.random() - 0.5) * 0.1;
                    this.sizes[i] = Math.random() * 30 + 10;
                } else { // Generic magic/shield
                    this.colors[i*3] = 0.2; this.colors[i*3+1] = 0.6; this.colors[i*3+2] = 1.0;
                    this.velocities[i*3] = (Math.random() - 0.5) * 1.0;
                    this.velocities[i*3+1] = (Math.random() - 0.5) * 1.0;
                    this.velocities[i*3+2] = (Math.random() - 0.5) * 1.0;
                    this.sizes[i] = Math.random() * 30 + 10;
                }

                spawned++;
                if (spawned >= count) break;
            }
        }
        
        this.particleSystem.geometry.attributes.position.needsUpdate = true;
        this.particleSystem.geometry.attributes.velocity.needsUpdate = true;
        this.particleSystem.geometry.attributes.customColor.needsUpdate = true;
        this.particleSystem.geometry.attributes.size.needsUpdate = true;
        this.particleSystem.geometry.attributes.life.needsUpdate = true;
    }

    animate() {
        this.animationId = requestAnimationFrame(this.animate.bind(this));
        
        const now = performance.now();
        const dt = (now - this.lastTime) / 1000.0;
        this.lastTime = now;
        
        this.material.uniforms.uTime.value += dt;

        // Age particles
        let needsUpdate = false;
        for (let i = 0; i < this.particleCount; i++) {
            if (this.lifes[i] < 1.0) {
                this.lifes[i] += dt * 1.5; // Die over ~0.66 seconds
                needsUpdate = true;
            }
        }

        if (needsUpdate) {
            this.particleSystem.geometry.attributes.life.needsUpdate = true;
        }

        // Continuously emit particles if an effect is active
        if (this.activeEffect) {
            let pCount = 5; // Default particles per frame (5 * 60fps = 300 particles/sec)
            if (this.activeEffect === "thumbs_up") pCount = 15;
            if (this.activeEffect === "two_finger") pCount = 2;
            if (this.activeEffect === "fire_throw") pCount = 20;
            
            if (this.activeEffect === "connect_webs") {
                // Animate jagged lightning bolts for each finger
                for (let i = 0; i < 5; i++) {
                    const p1 = this.webBase1[i];
                    const p2 = this.webBase2[i];
                    
                    // Create a chaotic midpoint that snaps around
                    const midX = (p1.x + p2.x) / 2 + (Math.random() - 0.5) * 1.5;
                    const midY = (p1.y + p2.y) / 2 + (Math.random() - 0.5) * 1.5;
                    const midZ = (p1.z + p2.z) / 2 + (Math.random() - 0.5) * 0.5;

                    const idx = i * 12; // 4 vertices per finger * 3 floats

                    // Segment 1: Hand 1 -> Midpoint
                    this.webPositions[idx] = p1.x;
                    this.webPositions[idx+1] = p1.y;
                    this.webPositions[idx+2] = p1.z;
                    
                    this.webPositions[idx+3] = midX;
                    this.webPositions[idx+4] = midY;
                    this.webPositions[idx+5] = midZ;
                    
                    // Segment 2: Midpoint -> Hand 2
                    this.webPositions[idx+6] = midX;
                    this.webPositions[idx+7] = midY;
                    this.webPositions[idx+8] = midZ;
                    
                    this.webPositions[idx+9] = p2.x;
                    this.webPositions[idx+10] = p2.y;
                    this.webPositions[idx+11] = p2.z;
                }
                this.webGeometry.attributes.position.needsUpdate = true;

                // Spawn thick ASMR sparkles along the web lines
                this.spawnParticles(40, 6);
            } else if (this.activeEffect === "open_palm") {
                // Animate Graphic Shield Rotation
                this.shieldMesh.rotation.z -= dt * 3.0; // Spin magic circle
                // Smoothly track hand
                this.shieldMesh.position.lerp(this.targetPos, 0.3);
                
                // Add a very small amount of ambient magical sparks around the shield
                this.spawnParticles(3, this.material.uniforms.uEffectType.value);
            } else {
                this.spawnParticles(pCount, this.material.uniforms.uEffectType.value);
            }
        }

        this.renderer.render(this.scene, this.camera);
    }

    destroy() {
        if (this.shieldVideo) {
            this.shieldVideo.pause();
            if (this.shieldVideo.parentNode) this.shieldVideo.parentNode.removeChild(this.shieldVideo);
        }
        if (this.animationId) cancelAnimationFrame(this.animationId);
        window.removeEventListener('resize', this.resize.bind(this));
        this.renderer.dispose();
    }
}
