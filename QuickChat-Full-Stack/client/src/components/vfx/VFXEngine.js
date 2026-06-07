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
        // 5 lines, 2 vertices each, 3 floats per vertex = 30 floats
        this.webPositions = new Float32Array(30); 
        this.webGeometry.setAttribute('position', new THREE.BufferAttribute(this.webPositions, 3));
        
        this.webMaterial = new THREE.LineBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        
        this.webLines = new THREE.LineSegments(this.webGeometry, this.webMaterial);
        this.webLines.visible = false;
        this.scene.add(this.webLines);

        // State
        this.activeEffect = null;
        this.targetPos = new THREE.Vector3(0,0,0);
        this.hand1Points = null;
        this.hand2Points = null;
        this.clock = new THREE.Clock();
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
            return;
        }

        if (gesture === "connect_webs" && hand1 && hand2) {
            this.activeEffect = gesture;
            this.webLines.visible = true;
            this.hand1Points = hand1;
            this.hand2Points = hand2;
            
            // Map the 5 fingers
            for (let i = 0; i < 5; i++) {
                const pos1 = this.mapScreenToWorld(hand1[i].x, hand1[i].y);
                const pos2 = this.mapScreenToWorld(hand2[i].x, hand2[i].y);
                
                this.webPositions[i * 6] = pos1.x;
                this.webPositions[i * 6 + 1] = pos1.y;
                this.webPositions[i * 6 + 2] = pos1.z;
                
                this.webPositions[i * 6 + 3] = pos2.x;
                this.webPositions[i * 6 + 4] = pos2.y;
                this.webPositions[i * 6 + 5] = pos2.z;
            }
            this.webGeometry.attributes.position.needsUpdate = true;
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
    }

    spawnParticles(count, typeInt) {
        let spawned = 0;
        for (let i = 0; i < this.particleCount; i++) {
            if (this.lifes[i] >= 1.0) { // Find dead particle
                this.lifes[i] = 0.0; // Reset life
                
                // Base position with slight jitter
                if (typeInt === 6) { // Web Sparkles along the lines
                    // Pick a random finger pair line (0 to 4)
                    const fIdx = Math.floor(Math.random() * 5);
                    const t = Math.random(); // Position along the line
                    
                    const p1x = this.webPositions[fIdx * 6];
                    const p1y = this.webPositions[fIdx * 6 + 1];
                    const p1z = this.webPositions[fIdx * 6 + 2];
                    
                    const p2x = this.webPositions[fIdx * 6 + 3];
                    const p2y = this.webPositions[fIdx * 6 + 4];
                    const p2z = this.webPositions[fIdx * 6 + 5];

                    this.positions[i*3] = p1x + (p2x - p1x) * t + (Math.random() - 0.5) * 0.1;
                    this.positions[i*3+1] = p1y + (p2y - p1y) * t + (Math.random() - 0.5) * 0.1;
                    this.positions[i*3+2] = p1z + (p2z - p1z) * t + (Math.random() - 0.5) * 0.1;
                    
                    this.colors[i*3] = 0.5; this.colors[i*3+1] = 0.8; this.colors[i*3+2] = 1.0;
                    this.velocities[i*3] = (Math.random() - 0.5) * 1.0;
                    this.velocities[i*3+1] = Math.random() * 2.0 - 1.0; // Float
                    this.velocities[i*3+2] = (Math.random() - 0.5) * 1.0;
                    this.sizes[i] = Math.random() * 10 + 5;
                    
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
        
        const dt = this.clock.getDelta();
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
            if (this.activeEffect === "open_palm") pCount = 25; // Dense sparkling shield
            
            if (this.activeEffect === "connect_webs") {
                // Animate jitter on the web lines
                const positions = this.webGeometry.attributes.position.array;
                for(let i=0; i<30; i++) {
                    positions[i] += (Math.random() - 0.5) * 0.05;
                }
                this.webGeometry.attributes.position.needsUpdate = true;
                
                // Spawn sparkles
                this.spawnParticles(15, 6);
            } else {
                this.spawnParticles(pCount, this.material.uniforms.uEffectType.value);
            }
        }

        this.renderer.render(this.scene, this.camera);
    }

    destroy() {
        if (this.animationId) cancelAnimationFrame(this.animationId);
        window.removeEventListener('resize', this.resize.bind(this));
        this.renderer.dispose();
    }
}
