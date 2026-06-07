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
    } else { // Shield (Open Palm)
        pos += normalize(velocity) * sin(uTime * 2.0) * 0.1;
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

        // State
        this.activeEffect = null;
        this.targetPos = new THREE.Vector3(0,0,0);
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

    triggerEffect(gesture, x, y) {
        if (gesture === "none") {
            this.activeEffect = null;
            return;
        }

        // Map 0.0-1.0 screen coordinates to 3D world space coordinates
        const vec = new THREE.Vector3(
            (x * 2) - 1,
            -(y * 2) + 1,
            0.5
        );
        vec.unproject(this.camera);
        const dir = vec.sub(this.camera.position).normalize();
        const distance = -this.camera.position.z / dir.z;
        this.targetPos.copy(this.camera.position).add(dir.multiplyScalar(distance));

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
            
            this.spawnParticles(pCount, this.material.uniforms.uEffectType.value);
        }

        this.renderer.render(this.scene, this.camera);
    }

    destroy() {
        if (this.animationId) cancelAnimationFrame(this.animationId);
        window.removeEventListener('resize', this.resize.bind(this));
        this.renderer.dispose();
    }
}
