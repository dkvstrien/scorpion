import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
  createBarrelTexture,
  createCrateTexture,
  createHayTexture,
  createWrappedSilageTexture
} from './textures';

export type PropKind =
  | 'hay_round'
  | 'hay_square'
  | 'silage_wrapped'
  | 'crate'
  | 'log'
  | 'pumpkin'
  | 'barrel'
  | 'tire';

export type ZoneKey = 'logs' | 'crates' | 'hay' | 'silage' | 'harvest' | 'scrap';

export interface FarmProp {
  id: number;
  kind: PropKind;
  label: string;
  targetZone: ZoneKey;
  mesh: THREE.Group;
  body: CANNON.Body;
  radius: number;
  halfHeight: number;
  materialType: 'hay' | 'wood' | 'metal';
  isWrappedSilage: boolean;
  silageTint?: 'white' | 'mint';
  isPopped: boolean;
  isDamaged: boolean;
  crushable: boolean;
  heldByTractor: boolean;
  wasThrown: boolean;
  throwOrigin: THREE.Vector3;
  inZone: boolean;
  scored: boolean;
  stackAwarded: boolean;
  inWater: boolean;
  lastImpactAt: number;
}

export class PropManager {
  public props: FarmProp[] = [];
  private debris: { mesh: THREE.Mesh; body: CANNON.Body; life: number }[] = [];
  private nextId = 1;
  private scene: THREE.Scene;
  private world: CANNON.World;
  private propMaterial: CANNON.Material;

  private texHay: THREE.CanvasTexture;
  private texSilageWhite: THREE.CanvasTexture;
  private texSilageMint: THREE.CanvasTexture;
  private texSilageWhitePopped: THREE.CanvasTexture;
  private texSilageMintPopped: THREE.CanvasTexture;
  private texCrate: THREE.CanvasTexture;
  private texCrateDamaged: THREE.CanvasTexture;
  private texBarrelRed: THREE.CanvasTexture;
  private texBarrelBlue: THREE.CanvasTexture;

  public onImpact?: (prop: FarmProp, speed: number) => void;

  constructor(scene: THREE.Scene, world: CANNON.World, propMaterial: CANNON.Material) {
    this.scene = scene;
    this.world = world;
    this.propMaterial = propMaterial;

    this.texHay = createHayTexture();
    this.texSilageWhite = createWrappedSilageTexture('white', false);
    this.texSilageMint = createWrappedSilageTexture('mint', false);
    this.texSilageWhitePopped = createWrappedSilageTexture('white', true);
    this.texSilageMintPopped = createWrappedSilageTexture('mint', true);
    this.texCrate = createCrateTexture(false);
    this.texCrateDamaged = createCrateTexture(true);
    this.texBarrelRed = createBarrelTexture('#b34329');
    this.texBarrelBlue = createBarrelTexture('#2c6391');
  }

  public spawnInitialMess(): void {
    // --- 1. Storm-fallen pine logs blocking the main yard lane & barn approach (puzzle!) ---
    this.spawnProp('log', new THREE.Vector3(-1.4, 0.55, 0.2), 0.12);
    this.spawnProp('log', new THREE.Vector3(2.8, 0.55, -8.8), -0.22);
    this.spawnProp('log', new THREE.Vector3(-7.6, 0.55, -2.5), 1.35);

    // --- 2. Produce Pallets tumbled off the lane (need careful Pallet Forks stacking onto Flatbed Trailer!) ---
    this.spawnProp('crate', new THREE.Vector3(6.8, 0.72, -1.8), 0.35);
    this.spawnProp('crate', new THREE.Vector3(9.4, 0.72, 1.4), -0.45);
    this.spawnProp('crate', new THREE.Vector3(5.2, 0.72, 5.6), 0.8);
    this.spawnProp('crate', new THREE.Vector3(10.8, 0.72, -8.4), 0.18);

    // --- 3. Dry golden hay bales blown out across the yard (need Bale Spike -> Red Hay Barn) ---
    this.spawnProp('hay_round', new THREE.Vector3(-3.8, 0.9, -9.2), 0.5);
    this.spawnProp('hay_round', new THREE.Vector3(7.4, 0.9, -12.6), -0.4);
    this.spawnProp('hay_square', new THREE.Vector3(1.2, 0.55, -13.2), 0.25);
    this.spawnProp('hay_square', new THREE.Vector3(-6.4, 0.55, 5.2), 1.1);

    // --- 4. Delicate plastic-wrapped silage bales (MUST use Bale Grabber gently -> Concrete Silage Clamp!) ---
    this.spawnProp('silage_wrapped', new THREE.Vector3(-10.2, 0.85, -10.5), 0.2);
    this.spawnProp('silage_wrapped', new THREE.Vector3(-12.5, 0.85, -6.4), 0.9);
    this.spawnProp('silage_wrapped', new THREE.Vector3(-6.2, 0.85, -13.8), -0.3);
    this.spawnProp('silage_wrapped', new THREE.Vector3(-11.4, 0.85, 3.8), 0.6);

    // --- 5. Loose pumpkins rolled across the east lane from a tipped garden basket (don't drive over them!) ---
    this.spawnProp('pumpkin', new THREE.Vector3(4.2, 0.65, 11.4), 0);
    this.spawnProp('pumpkin', new THREE.Vector3(7.1, 0.65, 10.1), 0.5);
    this.spawnProp('pumpkin', new THREE.Vector3(9.6, 0.65, 12.6), 1.2);
    this.spawnProp('pumpkin', new THREE.Vector3(11.8, 0.65, 8.6), 2.1);

    // --- 6. Rusty oil drums & old tires by the workshop mud track (-> Yellow Scrap Skip) ---
    this.spawnProp('barrel', new THREE.Vector3(-9.8, 0.72, 8.8), 0.2);
    this.spawnProp('barrel', new THREE.Vector3(-7.4, 0.72, 12.2), 1.1);
    this.spawnProp('tire', new THREE.Vector3(-12.8, 0.35, 12.8), 0.4);
    this.spawnProp('tire', new THREE.Vector3(-4.8, 0.35, 14.8), 0.9);
  }

  public spawnExtraChaosWave(): void {
    const kinds: PropKind[] = [
      'crate',
      'hay_round',
      'silage_wrapped',
      'pumpkin',
      'log',
      'barrel',
      'tire'
    ];
    for (let i = 0; i < 6; i++) {
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      const angle = Math.random() * Math.PI * 2;
      const dist = 4 + Math.random() * 9;
      const pos = new THREE.Vector3(Math.cos(angle) * dist, 5.2 + i * 0.9, Math.sin(angle) * dist);
      this.spawnProp(kind, pos);
    }
  }

  public spawnProp(kind: PropKind, pos: THREE.Vector3, rotY = Math.random() * Math.PI * 2): FarmProp {
    const id = this.nextId++;
    const mesh = new THREE.Group();
    let body: CANNON.Body;
    let radius = 0.82;
    let halfHeight = 0.65;
    let targetZone: ZoneKey = 'crates';
    let label = 'Item';
    let materialType: 'hay' | 'wood' | 'metal' = 'wood';
    let isWrappedSilage = false;
    let silageTint: 'white' | 'mint' | undefined;
    let crushable = false;

    if (kind === 'hay_round') {
      targetZone = 'hay';
      label = 'Round Hay Bale';
      materialType = 'hay';
      radius = 0.85;
      halfHeight = 0.8;

      const cyl = new THREE.Mesh(
        new THREE.CylinderGeometry(0.8, 0.8, 1.35, 18),
        new THREE.MeshStandardMaterial({ map: this.texHay, roughness: 0.94 })
      );
      cyl.rotation.z = Math.PI / 2;
      cyl.castShadow = true;
      cyl.receiveShadow = true;
      mesh.add(cyl);

      const endMat = new THREE.MeshStandardMaterial({ color: 0xbf8f32, roughness: 0.96 });
      for (const s of [-1, 1]) {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.74, 0.04, 16), endMat);
        cap.rotation.z = Math.PI / 2;
        cap.position.x = s * 0.68;
        mesh.add(cap);
      }

      body = new CANNON.Body({
        mass: 32,
        material: this.propMaterial,
        linearDamping: 0.24,
        angularDamping: 0.36
      });
      const shape = new CANNON.Cylinder(0.8, 0.8, 1.35, 12);
      const q = new CANNON.Quaternion();
      q.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), Math.PI / 2);
      body.addShape(shape, new CANNON.Vec3(0, 0, 0), q);
    } else if (kind === 'hay_square') {
      targetZone = 'hay';
      label = 'Square Hay Bale';
      materialType = 'hay';
      radius = 0.86;
      halfHeight = 0.44;

      const box = new THREE.Mesh(
        new THREE.BoxGeometry(1.72, 0.86, 1.0),
        new THREE.MeshStandardMaterial({ map: this.texHay, roughness: 0.94 })
      );
      box.castShadow = true;
      box.receiveShadow = true;
      mesh.add(box);

      body = new CANNON.Body({
        mass: 26,
        material: this.propMaterial,
        linearDamping: 0.22,
        angularDamping: 0.36
      });
      body.addShape(new CANNON.Box(new CANNON.Vec3(0.86, 0.43, 0.5)));
    } else if (kind === 'silage_wrapped') {
      targetZone = 'silage';
      label = 'Wrapped Silage Bale';
      materialType = 'hay';
      isWrappedSilage = true;
      silageTint = id % 2 === 0 ? 'white' : 'mint';
      radius = 0.85;
      halfHeight = 0.74;

      const mat = new THREE.MeshStandardMaterial({
        map: silageTint === 'white' ? this.texSilageWhite : this.texSilageMint,
        roughness: 0.26,
        metalness: 0.05
      });
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 1.28, 20), mat);
      cyl.castShadow = true;
      cyl.receiveShadow = true;
      mesh.add(cyl);

      for (const s of [-1, 1]) {
        const cap = new THREE.Mesh(
          new THREE.SphereGeometry(0.815, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
          mat
        );
        cap.scale.y = 0.23;
        cap.position.y = s * 0.63;
        if (s < 0) cap.rotation.x = Math.PI;
        cap.castShadow = true;
        mesh.add(cap);
      }

      body = new CANNON.Body({
        mass: 34,
        material: this.propMaterial,
        linearDamping: 0.24,
        angularDamping: 0.36
      });
      body.addShape(new CANNON.Cylinder(0.82, 0.82, 1.44, 12));
    } else if (kind === 'crate') {
      targetZone = 'crates';
      label = 'Produce Pallet';
      materialType = 'wood';
      crushable = true;
      radius = 0.82;
      halfHeight = 0.64;

      // Realistic slatted euro-style wooden pallet base with clear fork channels!
      const palletWood = new THREE.MeshStandardMaterial({ color: 0x996b38, roughness: 0.92 });
      const topDeck = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.08, 1.36), palletWood);
      topDeck.position.y = -0.44;
      topDeck.castShadow = true;
      topDeck.receiveShadow = true;
      mesh.add(topDeck);

      for (const sx of [-0.58, 0, 0.58]) {
        const runner = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 1.34), palletWood);
        runner.position.set(sx, -0.56, 0);
        runner.castShadow = true;
        mesh.add(runner);
      }

      // Main stenciled wooden farm produce box strapped cleanly onto pallet
      const crateMesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.24, 1.02, 1.24),
        new THREE.MeshStandardMaterial({ map: this.texCrate, roughness: 0.84 })
      );
      crateMesh.name = 'crateBox';
      crateMesh.position.y = 0.11;
      crateMesh.castShadow = true;
      crateMesh.receiveShadow = true;
      mesh.add(crateMesh);

      // Black cargo straps holding crate to pallet
      const strapMat = new THREE.MeshStandardMaterial({ color: 0x26292c, roughness: 0.7 });
      for (const sx of [-0.36, 0.36]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.12, 1.28), strapMat);
        strap.position.set(sx, 0.08, 0);
        mesh.add(strap);
      }

      body = new CANNON.Body({
        mass: 30,
        material: this.propMaterial,
        linearDamping: 0.24,
        angularDamping: 0.48
      });
      body.addShape(new CANNON.Box(new CANNON.Vec3(0.66, 0.64, 0.66)));
    } else if (kind === 'log') {
      targetZone = 'logs';
      label = 'Fallen Pine Log';
      materialType = 'wood';
      radius = 0.58;
      halfHeight = 0.38;

      const barkMat = new THREE.MeshStandardMaterial({ color: 0x624228, roughness: 0.95 });
      const cutMat = new THREE.MeshStandardMaterial({ color: 0xd5af7b, roughness: 0.82 });
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.39, 3.0, 14), [barkMat, cutMat, cutMat]);
      cyl.rotation.z = Math.PI / 2;
      cyl.castShadow = true;
      cyl.receiveShadow = true;
      mesh.add(cyl);

      body = new CANNON.Body({
        mass: 28,
        material: this.propMaterial,
        linearDamping: 0.26,
        angularDamping: 0.34
      });
      const shape = new CANNON.Cylinder(0.37, 0.37, 3.0, 10);
      const q = new CANNON.Quaternion();
      q.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), Math.PI / 2);
      body.addShape(shape, new CANNON.Vec3(0, 0, 0), q);
    } else if (kind === 'pumpkin') {
      targetZone = 'harvest';
      label = 'Harvest Pumpkin';
      materialType = 'wood';
      crushable = true;
      radius = 0.58;
      halfHeight = 0.52;

      const pMat = new THREE.MeshStandardMaterial({ color: 0xd96518, roughness: 0.55 });
      for (let i = 0; i < 6; i++) {
        const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.48, 12, 10), pMat);
        const a = (i / 6) * Math.PI * 2;
        lobe.position.set(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12);
        lobe.scale.set(0.86, 0.78, 0.86);
        lobe.castShadow = true;
        lobe.receiveShadow = true;
        mesh.add(lobe);
      }
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.085, 0.28, 7),
        new THREE.MeshStandardMaterial({ color: 0x456b26, roughness: 0.88 })
      );
      stem.position.set(0.03, 0.44, 0);
      stem.rotation.z = -0.25;
      stem.castShadow = true;
      mesh.add(stem);

      body = new CANNON.Body({
        mass: 14,
        material: this.propMaterial,
        linearDamping: 0.25,
        angularDamping: 0.28
      });
      body.addShape(new CANNON.Sphere(0.52));
    } else if (kind === 'barrel') {
      targetZone = 'scrap';
      label = 'Rusty Oil Drum';
      materialType = 'metal';
      crushable = true;
      radius = 0.58;
      halfHeight = 0.65;

      const tex = id % 2 === 0 ? this.texBarrelRed : this.texBarrelBlue;
      const capMat = new THREE.MeshStandardMaterial({ color: 0x484441, roughness: 0.68, metalness: 0.45 });
      const cyl = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.45, 1.28, 16),
        [new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.35 }), capMat, capMat]
      );
      cyl.castShadow = true;
      cyl.receiveShadow = true;
      mesh.add(cyl);

      body = new CANNON.Body({
        mass: 22,
        material: this.propMaterial,
        linearDamping: 0.2,
        angularDamping: 0.3
      });
      body.addShape(new CANNON.Cylinder(0.45, 0.45, 1.28, 12));
    } else {
      targetZone = 'scrap';
      label = 'Old Tractor Tire';
      materialType = 'hay';
      radius = 0.72;
      halfHeight = 0.24;

      const rubber = new THREE.MeshStandardMaterial({ color: 0x242628, roughness: 0.92 });
      const torus = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.23, 12, 20), rubber);
      torus.rotation.x = Math.PI / 2;
      torus.castShadow = true;
      torus.receiveShadow = true;
      mesh.add(torus);

      body = new CANNON.Body({
        mass: 20,
        material: this.propMaterial,
        linearDamping: 0.25,
        angularDamping: 0.32
      });
      body.addShape(new CANNON.Cylinder(0.72, 0.72, 0.44, 12));
    }

    body.position.set(pos.x, pos.y, pos.z);
    body.quaternion.setFromEuler(0, rotY, 0);
    body.allowSleep = true;
    body.sleepSpeedLimit = 0.1;
    body.sleepTimeLimit = 1.0;

    const prop: FarmProp = {
      id,
      kind,
      label,
      targetZone,
      mesh,
      body,
      radius,
      halfHeight,
      materialType,
      isWrappedSilage,
      silageTint,
      isPopped: false,
      isDamaged: false,
      crushable,
      heldByTractor: false,
      wasThrown: false,
      throwOrigin: new THREE.Vector3(),
      inZone: false,
      scored: false,
      stackAwarded: false,
      inWater: false,
      lastImpactAt: 0
    };

    body.addEventListener('collide', (e: { contact: CANNON.ContactEquation }) => {
      const speed = Math.abs(e.contact.getImpactVelocityAlongNormal());
      const now = performance.now();
      if (speed > 2.0 && now - prop.lastImpactAt > 120) {
        prop.lastImpactAt = now;
        this.onImpact?.(prop, speed);
      }
    });

    this.world.addBody(body);
    this.scene.add(mesh);
    this.props.push(prop);
    return prop;
  }

  public popSilage(prop: FarmProp): boolean {
    if (!prop.isWrappedSilage || prop.isPopped) return false;
    prop.isPopped = true;
    prop.isDamaged = true;
    prop.label = 'Popped Silage Bale';

    const poppedTex = prop.silageTint === 'white' ? this.texSilageWhitePopped : this.texSilageMintPopped;
    prop.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        child.material = new THREE.MeshStandardMaterial({
          map: poppedTex,
          roughness: 0.68,
          metalness: 0.02
        });
      }
    });

    const flapMat = new THREE.MeshStandardMaterial({
      color: prop.silageTint === 'white' ? 0xf2f5ef : 0xcde3c8,
      side: THREE.DoubleSide,
      roughness: 0.35
    });
    const flap = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.36), flapMat);
    flap.position.set(0.85, 0.12, 0.14);
    flap.rotation.set(0.3, 0.7, -0.4);
    prop.mesh.add(flap);

    const tuft = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.28, 0),
      new THREE.MeshStandardMaterial({ color: 0x4b5d22, roughness: 0.95 })
    );
    tuft.position.set(0.75, 0.02, 0.05);
    prop.mesh.add(tuft);

    prop.mesh.scale.set(1.06, 0.88, 1.06);
    return true;
  }

  public damageOrCrushProp(prop: FarmProp): boolean {
    if (prop.isDamaged) return false;
    if (prop.isWrappedSilage) {
      return this.popSilage(prop);
    }
    if (!prop.crushable) return false;

    prop.isDamaged = true;
    const pos = new THREE.Vector3(prop.body.position.x, prop.body.position.y + 0.35, prop.body.position.z);

    if (prop.kind === 'pumpkin') {
      prop.label = 'Squashed Pumpkin';
      prop.mesh.scale.set(1.42, 0.25, 1.38);
      prop.targetZone = 'scrap';
      this.spawnDebrisChunks(pos, 5, 0xd96518, 'sphere', 0.16);
    } else if (prop.kind === 'barrel') {
      prop.label = 'Crushed Oil Drum';
      prop.mesh.scale.set(0.5, 1.04, 1.34);
      // Dark glossy spilled-oil puddle decal on ground beneath crushed drum!
      const puddle = new THREE.Mesh(
        new THREE.CircleGeometry(0.95, 16),
        new THREE.MeshStandardMaterial({ color: 0x16171a, roughness: 0.14, metalness: 0.5 })
      );
      puddle.rotation.x = -Math.PI / 2;
      puddle.position.set(pos.x, Math.max(0.03, prop.body.position.y - 0.55), pos.z);
      this.scene.add(puddle);
    } else if (prop.kind === 'crate') {
      prop.label = 'Smashed Pallet';
      prop.targetZone = 'scrap';
      const box = prop.mesh.getObjectByName('crateBox');
      if (box instanceof THREE.Mesh) {
        box.material = new THREE.MeshStandardMaterial({ map: this.texCrateDamaged, roughness: 0.9 });
      }
      prop.mesh.scale.set(1.12, 0.44, 1.12);
      // Multi-piece physics splinters: real tumbling wooden planks + rolling red farm apples!
      this.spawnDebrisChunks(pos, 5, 0x9c6832, 'plank', 0.24);
      this.spawnDebrisChunks(pos, 6, 0xc92a22, 'sphere', 0.12);
    }
    return true;
  }

  private spawnDebrisChunks(
    origin: THREE.Vector3,
    count: number,
    color: number,
    shapeType: 'plank' | 'sphere',
    size: number
  ): void {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: shapeType === 'sphere' ? 0.35 : 0.85 });
    for (let i = 0; i < count; i++) {
      const geo =
        shapeType === 'plank'
          ? new THREE.BoxGeometry(size * 2.8, size * 0.25, size * 0.65)
          : new THREE.SphereGeometry(size, 8, 6);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      this.scene.add(mesh);

      const body = new CANNON.Body({
        mass: 1.5,
        material: this.propMaterial,
        linearDamping: 0.2,
        angularDamping: 0.25
      });
      if (shapeType === 'plank') {
        body.addShape(new CANNON.Box(new CANNON.Vec3(size * 1.4, size * 0.125, size * 0.325)));
      } else {
        body.addShape(new CANNON.Sphere(size));
      }
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      body.position.set(origin.x + Math.cos(a) * 0.4, origin.y + 0.2 + Math.random() * 0.4, origin.z + Math.sin(a) * 0.4);
      body.velocity.set(Math.cos(a) * (2.2 + Math.random() * 2.5), 2.5 + Math.random() * 2.2, Math.sin(a) * (2.2 + Math.random() * 2.5));
      body.angularVelocity.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
      this.world.addBody(body);
      this.debris.push({ mesh, body, life: 18 });
    }
  }

  public syncMeshes(dt = 0.016): void {
    for (const p of this.props) {
      p.mesh.position.set(p.body.position.x, p.body.position.y, p.body.position.z);
      p.mesh.quaternion.set(
        p.body.quaternion.x,
        p.body.quaternion.y,
        p.body.quaternion.z,
        p.body.quaternion.w
      );
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      if (d.life <= 0) {
        this.scene.remove(d.mesh);
        this.world.removeBody(d.body);
        this.debris.splice(i, 1);
        continue;
      }
      d.mesh.position.set(d.body.position.x, d.body.position.y, d.body.position.z);
      d.mesh.quaternion.set(d.body.quaternion.x, d.body.quaternion.y, d.body.quaternion.z, d.body.quaternion.w);
    }
  }
}
