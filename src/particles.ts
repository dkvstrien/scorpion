import * as THREE from 'three';

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  rotVel: THREE.Vector3;
  life: number;
  maxLife: number;
  gravity: number;
  startScale: number;
  grow: boolean;
}

export class ParticleSystem {
  private particles: Particle[] = [];
  private scene: THREE.Scene;
  private geoBox = new THREE.BoxGeometry(1, 1, 1);
  private geoIco = new THREE.IcosahedronGeometry(0.65, 0);

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public burst(
    pos: THREE.Vector3,
    count: number,
    options: {
      colors: number[];
      speed?: number;
      upBias?: number;
      size?: number;
      life?: number;
      gravity?: number;
      shape?: 'box' | 'puff';
      grow?: boolean;
    }
  ): void {
    const speed = options.speed ?? 4.5;
    const upBias = options.upBias ?? 2.5;
    const size = options.size ?? 0.22;
    const maxLife = options.life ?? 0.85;
    const gravity = options.gravity ?? 9.5;
    const geo = options.shape === 'puff' ? this.geoIco : this.geoBox;

    for (let i = 0; i < count; i++) {
      const color = options.colors[Math.floor(Math.random() * options.colors.length)];
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.7,
        metalness: 0.05,
        transparent: true,
        opacity: 0.95
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos).add(
        new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.4)
      );
      const s = size * (0.65 + Math.random() * 0.7);
      mesh.scale.setScalar(s);
      this.scene.add(mesh);

      const theta = Math.random() * Math.PI * 2;
      const rSpeed = speed * (0.35 + Math.random() * 0.8);
      this.particles.push({
        mesh,
        vel: new THREE.Vector3(Math.cos(theta) * rSpeed, upBias + Math.random() * speed * 0.8, Math.sin(theta) * rSpeed),
        rotVel: new THREE.Vector3(
          (Math.random() - 0.5) * 9,
          (Math.random() - 0.5) * 9,
          (Math.random() - 0.5) * 9
        ),
        life: maxLife * (0.75 + Math.random() * 0.4),
        maxLife,
        gravity,
        startScale: s,
        grow: options.grow ?? false
      });
    }
  }

  public spawnDust(pos: THREE.Vector3): void {
    this.burst(pos, 2, {
      colors: [0xd6c7a8, 0xc3b496],
      speed: 1.4,
      upBias: 0.8,
      size: 0.24,
      life: 0.55,
      gravity: -0.6,
      shape: 'puff',
      grow: true
    });
  }

  public spawnPlasticPop(pos: THREE.Vector3): void {
    // Escaping air puffs
    this.burst(pos, 10, {
      colors: [0xffffff, 0xe8f5ec],
      speed: 4.5,
      upBias: 2.2,
      size: 0.3,
      life: 0.75,
      gravity: -1.4,
      shape: 'puff',
      grow: true
    });
    // Torn plastic strips & green silage bits
    this.burst(pos, 14, {
      colors: [0xf8faf6, 0x5c702c, 0x7c8633, 0xd8e8d0],
      speed: 6.5,
      upBias: 4.0,
      size: 0.16,
      life: 1.05,
      gravity: 11,
      shape: 'box'
    });
  }

  public spawnCrush(pos: THREE.Vector3, colors: number[]): void {
    this.burst(pos, 18, {
      colors,
      speed: 7,
      upBias: 4.2,
      size: 0.18,
      life: 1.0,
      gravity: 13,
      shape: 'box'
    });
  }

  public spawnConfetti(pos: THREE.Vector3): void {
    this.burst(pos, 22, {
      colors: [0x9fd32e, 0xffd23f, 0xe84a22, 0x45b8f5, 0xffffff],
      speed: 5.5,
      upBias: 6.8,
      size: 0.16,
      life: 1.35,
      gravity: 7.5,
      shape: 'box'
    });
  }

  public spawnSplash(pos: THREE.Vector3): void {
    this.burst(pos, 14, {
      colors: [0x6fd0f5, 0xbfefff, 0xffffff],
      speed: 4.2,
      upBias: 5.2,
      size: 0.2,
      life: 0.75,
      gravity: 12,
      shape: 'puff'
    });
  }

  public update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
        continue;
      }

      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.rotVel.x * dt;
      p.mesh.rotation.y += p.rotVel.y * dt;
      p.mesh.rotation.z += p.rotVel.z * dt;

      const ratio = Math.max(0, p.life / p.maxLife);
      const mat = p.mesh.material as THREE.MeshStandardMaterial;
      mat.opacity = Math.min(1, ratio * 1.4);

      if (p.grow) {
        p.mesh.scale.setScalar(p.startScale * (1 + (1 - ratio) * 1.6));
      } else {
        p.mesh.scale.setScalar(p.startScale * (0.35 + ratio * 0.65));
      }
    }
  }
}
