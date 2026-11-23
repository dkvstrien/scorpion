import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
  FARM_CENTER,
  getTerrainHeight,
  OSM_DATA,
  REAL_SPOTS,
  WATER_LEVEL
} from './terrain';
import { createAsphaltTexture } from './textures';

export interface DynamicVillageObj {
  id: number;
  kind: 'car' | 'bench' | 'postbox' | 'stall' | 'fallen_tree' | 'lamp' | 'maibaum';
  label: string;
  mesh: THREE.Group;
  body: CANNON.Body;
  radius: number;
  halfHeight: number;
  heldByTractor: boolean;
  alarmActive: boolean;
  hazardLights?: THREE.Mesh[];
  cruiseRoad?: [number, number][];
  cruiseIdx?: number;
  cruiseDir?: number;
  cruiseActive?: boolean;
  honkCooldown?: number;
  inLake?: boolean;
}

export interface DestructibleStatic {
  kind: 'tree' | 'lamp' | 'maibaum';
  label: string;
  pos: THREE.Vector3;
  standingMesh: THREE.Group;
  toppled: boolean;
  radius: number;
  height: number;
}

interface Pedestrian {
  group: THREE.Group;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  homePos: THREE.Vector3;
  wanderAngle: number;
  panicTimer: number;
  tumbleTimer: number;
  tumbleVel: THREE.Vector3;
  phase: number;
}

export interface VillageCallbacks {
  onTreeOrLampToppled: (label: string, kind: 'tree' | 'lamp' | 'maibaum', pos: THREE.Vector3) => void;
  onCarHonk: (alarm: boolean) => void;
  onLakeSplash: (label: string, pos: THREE.Vector3) => void;
}

function makeSignTexture(
  w: number,
  h: number,
  bg: string,
  border: string,
  line1: string,
  line2: string | null,
  textColor: string,
  accentColor = textColor
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = border;
  ctx.lineWidth = Math.max(4, Math.floor(h * 0.06));
  ctx.strokeRect(4, 4, w - 8, h - 8);
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (line2) {
    ctx.font = `bold ${Math.floor(h * 0.32)}px sans-serif`;
    ctx.fillText(line1, w / 2, h * 0.38, w - 26);
    ctx.fillStyle = accentColor;
    ctx.font = `bold ${Math.floor(h * 0.19)}px sans-serif`;
    ctx.fillText(line2, w / 2, h * 0.72, w - 26);
  } else {
    ctx.font = `bold ${Math.floor(h * 0.42)}px sans-serif`;
    ctx.fillText(line1, w / 2, h * 0.52, w - 26);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createClockTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#1d2530';
  ctx.beginPath();
  ctx.arc(64, 64, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e5c158';
  ctx.lineWidth = 7;
  ctx.stroke();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.strokeStyle = '#f2d36b';
    ctx.lineWidth = i % 3 === 0 ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(64 + Math.cos(a) * 42, 64 + Math.sin(a) * 42);
    ctx.lineTo(64 + Math.cos(a) * 53, 64 + Math.sin(a) * 53);
    ctx.stroke();
  }
  ctx.strokeStyle = '#f7df7c';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(64, 64);
  ctx.lineTo(42, 46);
  ctx.moveTo(64, 64);
  ctx.lineTo(94, 42);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createBavarianFacadeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;

  // Warm Upper Bavarian lime plaster base (tinted per-instance via instanceColor!)
  ctx.fillStyle = '#f6f2e8';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle plaster grain
  for (let i = 0; i < 650; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(x, y, 2, 2);
  }

  // Dark stone foundation plinth at bottom
  ctx.fillStyle = '#8b857b';
  ctx.fillRect(0, 224, 256, 32);
  ctx.fillStyle = '#6f6960';
  ctx.fillRect(0, 222, 256, 4);

  // Dark Alpine timber horizontal balcony rail across mid-floor
  ctx.fillStyle = '#5c3c22';
  ctx.fillRect(0, 114, 256, 10);
  ctx.fillStyle = '#734b2b';
  ctx.fillRect(0, 124, 256, 4);

  // Two rows of classic Bavarian shuttered windows (3 per row)
  const rows = [42, 148];
  const cols = [42, 128, 214];
  for (const wy of rows) {
    for (const wx of cols) {
      // Green wooden shutters flanking each window
      ctx.fillStyle = '#2d5c3b';
      ctx.fillRect(wx - 24, wy - 20, 10, 42);
      ctx.fillRect(wx + 14, wy - 20, 10, 42);
      ctx.strokeStyle = '#1f4229';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(wx - 24, wy - 20, 10, 42);
      ctx.strokeRect(wx + 14, wy - 20, 10, 42);

      // Warm glazed pane + white timber muntin cross
      ctx.fillStyle = '#334652';
      ctx.fillRect(wx - 13, wy - 19, 26, 40);
      ctx.fillStyle = 'rgba(255, 223, 152, 0.32)';
      ctx.fillRect(wx - 11, wy - 17, 22, 36);
      ctx.fillStyle = '#f2ede2';
      ctx.fillRect(wx - 1, wy - 19, 2, 40);
      ctx.fillRect(wx - 13, wy - 1, 26, 2);

      // Red geranium window flowerbox on upper floor!
      if (wy < 100) {
        ctx.fillStyle = '#5a3920';
        ctx.fillRect(wx - 16, wy + 20, 32, 7);
        ctx.fillStyle = '#2f6a34';
        ctx.fillRect(wx - 15, wy + 17, 30, 4);
        ctx.fillStyle = '#d6332c';
        ctx.fillRect(wx - 12, wy + 15, 5, 4);
        ctx.fillRect(wx - 2, wy + 14, 6, 4);
        ctx.fillRect(wx + 7, wy + 15, 5, 4);
      }
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function pointToSegmentDistSq(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-6) return (px - ax) * (px - ax) + (pz - az) * (pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
  const cx = ax + t * dx;
  const cz = az + t * dz;
  return (px - cx) * (px - cx) + (pz - cz) * (pz - cz);
}

function createMaibaumTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f7f9fc';
  ctx.fillRect(0, 0, 128, 512);
  ctx.fillStyle = '#1b7fd6';
  for (let y = -128; y < 640; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(128, y + 64);
    ctx.lineTo(128, y + 96);
    ctx.lineTo(0, y + 32);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Builds a single merged terrain-conforming ribbon mesh for dozens of real OSM polylines (1 draw call!).
 */
function buildMergedRibbonMesh(
  polylines: { pts: [number, number][]; halfWidth: number }[],
  yOffset: number,
  material: THREE.Material
): THREE.Mesh {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let vBase = 0;

  for (const line of polylines) {
    // Subdivide long segments so ribbons hug hills cleanly without slicing underground!
    const dense: [number, number][] = [];
    for (let i = 0; i < line.pts.length - 1; i++) {
      const a = line.pts[i];
      const b = line.pts[i + 1];
      const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const steps = Math.max(1, Math.ceil(dist / 5));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        dense.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    dense.push(line.pts[line.pts.length - 1]);

    let accumLen = 0;
    for (let i = 0; i < dense.length; i++) {
      const p = dense[i];
      const prev = dense[Math.max(0, i - 1)];
      const next = dense[Math.min(dense.length - 1, i + 1)];
      const tx = next[0] - prev[0];
      const tz = next[1] - prev[1];
      const tLen = Math.hypot(tx, tz) || 1;
      const nx = -tz / tLen;
      const nz = tx / tLen;

      if (i > 0) accumLen += Math.hypot(p[0] - prev[0], p[1] - prev[1]);

      const lx = p[0] + nx * line.halfWidth;
      const lz = p[1] + nz * line.halfWidth;
      const rx = p[0] - nx * line.halfWidth;
      const rz = p[1] - nz * line.halfWidth;

      positions.push(lx, getTerrainHeight(lx, lz) + yOffset, lz);
      positions.push(rx, getTerrainHeight(rx, rz) + yOffset, rz);
      uvs.push(0, accumLen * 0.14);
      uvs.push(1, accumLen * 0.14);

      if (i < dense.length - 1) {
        const i0 = vBase + i * 2;
        // Counter-clockwise winding viewed from +Y so road & stream normals point UP!
        indices.push(i0, i0 + 2, i0 + 1);
        indices.push(i0 + 1, i0 + 2, i0 + 3);
      }
    }
    vBase += dense.length * 2;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  return mesh;
}

export class RealMuensingWorld {
  public objects: DynamicVillageObj[] = [];
  public destructibles: DestructibleStatic[] = [];
  public warmWindowMat: THREE.MeshStandardMaterial;
  public lampBulbMat: THREE.MeshStandardMaterial;
  public lampPointLights: THREE.PointLight[] = [];
  public churchPos: THREE.Vector3;

  private sailboats: { group: THREE.Group; basePos: THREE.Vector3; phase: number; driftAmp: number }[] = [];
  private pedestrians: Pedestrian[] = [];
  private nextId = 1000;
  private scene: THREE.Scene;
  private world: CANNON.World;
  private propMat: CANNON.Material;
  private callbacks: VillageCallbacks;

  constructor(
    scene: THREE.Scene,
    world: CANNON.World,
    groundMat: CANNON.Material,
    propMat: CANNON.Material,
    callbacks: VillageCallbacks
  ) {
    this.scene = scene;
    this.world = world;
    this.propMat = propMat;
    this.callbacks = callbacks;

    this.churchPos = new THREE.Vector3(
      REAL_SPOTS.muensingChurch.x,
      getTerrainHeight(REAL_SPOTS.muensingChurch.x, REAL_SPOTS.muensingChurch.z),
      REAL_SPOTS.muensingChurch.z
    );

    this.warmWindowMat = new THREE.MeshStandardMaterial({
      color: 0xffdfa2,
      emissive: 0xffb347,
      emissiveIntensity: 0.25,
      roughness: 0.25
    });
    this.lampBulbMat = new THREE.MeshStandardMaterial({
      color: 0xfff3c4,
      emissive: 0xffd570,
      emissiveIntensity: 0.45
    });

    this.buildRealOSMRoadsAndStreams(scene);
    this.buildRealOSMBuildings(scene, world, groundMat);
    this.buildHeroLandmarks(scene, world, groundMat);
    this.buildRealOSMForests(scene);
    this.buildInteractivePropsAndCars();
    this.buildDestructibleTreesAndLamps();
    this.buildPedestrians();
  }

  public setNightMode(nightAmount: number): void {
    this.warmWindowMat.emissiveIntensity = 0.22 + nightAmount * 1.5;
    this.lampBulbMat.emissiveIntensity = 0.35 + nightAmount * 2.0;
    for (const pl of this.lampPointLights) {
      pl.intensity = nightAmount * 16;
    }
  }

  private addStaticBox(
    world: CANNON.World,
    mat: CANNON.Material,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    rotY = 0
  ): void {
    const body = new CANNON.Body({ mass: 0, material: mat });
    body.addShape(new CANNON.Box(new CANNON.Vec3(w * 0.5, h * 0.5, d * 0.5)));
    body.position.set(x, y, z);
    if (rotY !== 0) body.quaternion.setFromEuler(0, rotY, 0);
    world.addBody(body);
  }

  private buildRealOSMRoadsAndStreams(scene: THREE.Scene): void {
    const paved: { pts: [number, number][]; halfWidth: number }[] = [];
    const tracks: { pts: [number, number][]; halfWidth: number }[] = [];

    for (const r of OSM_DATA.roads) {
      if (r.hw === 'track' || r.hw === 'service') {
        tracks.push({ pts: r.pts, halfWidth: 2.3 });
      } else if (r.hw === 'secondary' || r.hw === 'tertiary') {
        paved.push({ pts: r.pts, halfWidth: 4.4 });
      } else {
        paved.push({ pts: r.pts, halfWidth: 3.3 });
      }
    }

    // Add a short farm driveway linking Wimpasing Home Farm (75, 175) straight south onto Münsinger Straße!
    paved.push({
      pts: [
        [FARM_CENTER.x, FARM_CENTER.z + 28],
        [FARM_CENTER.x + 12, FARM_CENTER.z + 46],
        [110, 224],
        [160.9, 223.3]
      ],
      halfWidth: 4.0
    });
    // And west farm lane connecting cleanly into Wimpasing hamlet!
    tracks.push({
      pts: [
        [FARM_CENTER.x - 28, FARM_CENTER.z + 4],
        [20, 185],
        [-21.6, 194.3]
      ],
      halfWidth: 3.2
    });

    const asphaltTex = createAsphaltTexture();
    asphaltTex.repeat.set(1, 2);
    const asphaltMat = new THREE.MeshStandardMaterial({
      map: asphaltTex,
      roughness: 0.88,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    const trackMat = new THREE.MeshStandardMaterial({
      color: 0xa5967e,
      roughness: 0.96,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });

    scene.add(buildMergedRibbonMesh(paved, 0.22, asphaltMat));
    scene.add(buildMergedRibbonMesh(tracks, 0.15, trackMat));

    // Real Lübbach stream ribbon flowing north-south along the west edge of Münsing!
    if (OSM_DATA.streams.length > 0) {
      const streamLines = OSM_DATA.streams.map((s) => ({ pts: s.pts, halfWidth: 1.7 }));
      const streamMat = new THREE.MeshStandardMaterial({
        color: 0x2c7ea6,
        roughness: 0.18,
        metalness: 0.45,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });
      scene.add(buildMergedRibbonMesh(streamLines, 0.12, streamMat));
    }

    // Authentic German Yellow Ortsschilder at Münsing, Wimpasing & Ammerland!
    this.addTownSign(scene, 'Münsing', 'Lkr. Bad Tölz-Wolfratshausen', 360, 228, -0.3);
    this.addTownSign(scene, 'Wimpasing', 'Gemeinde Münsing', 44, 198, Math.PI / 2);
    this.addTownSign(scene, 'Ammerland', 'Starnberger See · 584m', -172, 178, Math.PI / 2);
  }

  private addTownSign(scene: THREE.Scene, title: string, sub: string, x: number, z: number, rotY: number): void {
    const gy = getTerrainHeight(x, z);
    const g = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.08, 2.8, 8),
      new THREE.MeshStandardMaterial({ color: 0x62686e, roughness: 0.5, metalness: 0.5 })
    );
    pole.position.y = 1.4;
    g.add(pole);

    const tex = makeSignTexture(320, 140, '#f2c016', '#16181a', title, sub, '#121416');
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(2.35, 1.05, 0.08),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 })
    );
    board.position.y = 2.4;
    g.add(board);

    g.position.set(x, gy, z);
    g.rotation.y = rotY;
    scene.add(g);
  }

  private buildRealOSMBuildings(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    // Pre-collect paved road segments so NO generic OSM building ever blocks or encroaches on a drivable road!
    const pavedSegs: [number, number, number, number, number][] = [];
    for (const r of OSM_DATA.roads) {
      if (r.hw === 'track' || r.hw === 'service') continue;
      const hw = r.hw === 'secondary' || r.hw === 'tertiary' ? 5.0 : 3.8;
      for (let i = 0; i < r.pts.length - 1; i++) {
        pavedSegs.push([r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1], hw]);
      }
    }

    // Filter out buildings inside our Wimpasing Home Farmyard, hero landmarks, or overlapping any paved street!
    const regular = OSM_DATA.buildings.filter((b) => {
      if (Math.abs(b.x - FARM_CENTER.x) < 42 && Math.abs(b.z - FARM_CENTER.z) < 40) return false;
      if (b.type === 'church' || b.type === 'castle') return false;
      if (Math.hypot(b.x - REAL_SPOTS.muensingChurch.x, b.z - REAL_SPOTS.muensingChurch.z) < 22) return false;
      if (Math.hypot(b.x - REAL_SPOTS.muensingAltwirt.x, b.z - REAL_SPOTS.muensingAltwirt.z) < 20) return false;
      if (Math.hypot(b.x - REAL_SPOTS.schlossAmmerland.x, b.z - REAL_SPOTS.schlossAmmerland.z) < 22) return false;
      if (Math.hypot(b.x - REAL_SPOTS.sebaldPier.x, b.z - REAL_SPOTS.sebaldPier.z) < 22) return false;
      // Keep scenic fast-travel plazas on paved roads 100% unobstructed
      if (Math.hypot(b.x - 436, b.z - 229) < 15) return false;
      if (Math.hypot(b.x - 256, b.z - -352) < 16) return false;

      const approxR = THREE.MathUtils.clamp(Math.max(b.w, b.d) * 0.56, 3.6, 11.5) * 0.48;
      for (const [ax, az, bx, bz, hw] of pavedSegs) {
        const minClear = hw + approxR;
        if (pointToSegmentDistSq(b.x, b.z, ax, az, bx, bz) < minClear * minClear) return false;
      }
      return true;
    });

    const count = regular.length;
    const wallGeo = new THREE.BoxGeometry(1, 1, 1);
    const roofGeo = new THREE.ConeGeometry(0.78, 1, 4);
    roofGeo.rotateY(Math.PI / 4);

    const facadeTex = createBavarianFacadeTexture();
    const wallMat = new THREE.MeshStandardMaterial({
      map: facadeTex,
      roughness: 0.84,
      metalness: 0.03
    });
    const roofMat = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.08 });

    const wallInst = new THREE.InstancedMesh(wallGeo, wallMat, count);
    const roofInst = new THREE.InstancedMesh(roofGeo, roofMat, count);
    wallInst.castShadow = true;
    wallInst.receiveShadow = true;
    roofInst.castShadow = true;

    const wallPalette = [0xffffff, 0xfaf0db, 0xf4eee0, 0xf2e4cc, 0xede0c8];
    const roofPalette = [0xa8432a, 0x963a24, 0x733a27, 0x4c4a47];
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();

    regular.forEach((b, idx) => {
      const gy = getTerrainHeight(b.x, b.z);
      // Proportionately scaled to match our 0.28× real OSM street grid so every village lane stays cleanly drivable!
      const w = THREE.MathUtils.clamp(b.w * 0.56, 3.8, 11.5);
      const d = THREE.MathUtils.clamp(b.d * 0.56, 3.4, 10.0);
      const h = b.type === 'barn' ? 4.2 : 4.4 + (idx % 3) * 0.95;

      // Embed foundation 1.5m below terrain so sloped Bavarian houses NEVER float!
      dummy.position.set(b.x, gy + h * 0.5 - 0.65, b.z);
      dummy.rotation.set(0, b.rot, 0);
      dummy.scale.set(w, h + 1.3, d);
      dummy.updateMatrix();
      wallInst.setMatrixAt(idx, dummy.matrix);

      col.setHex(b.type === 'barn' ? 0xa9845c : wallPalette[idx % wallPalette.length]);
      wallInst.setColorAt(idx, col);

      // Pitched Bavarian hipped roof with overhanging eaves
      const roofH = Math.min(3.0, Math.min(w, d) * 0.44);
      dummy.position.set(b.x, gy + h + roofH * 0.5 - 0.08, b.z);
      dummy.rotation.set(0, b.rot, 0);
      dummy.scale.set(w * 1.12, roofH, d * 1.12);
      dummy.updateMatrix();
      roofInst.setMatrixAt(idx, dummy.matrix);

      col.setHex(roofPalette[idx % roofPalette.length]);
      roofInst.setColorAt(idx, col);

      // Add solid physics colliders for key village-core buildings so driving feels real!
      const nearHub =
        Math.hypot(b.x - REAL_SPOTS.muensingAltwirt.x, b.z - REAL_SPOTS.muensingAltwirt.z) < 75 ||
        Math.hypot(b.x - REAL_SPOTS.wimpasing.x, b.z - REAL_SPOTS.wimpasing.z) < 55 ||
        Math.hypot(b.x - REAL_SPOTS.sebaldPier.x, b.z - REAL_SPOTS.sebaldPier.z) < 55;
      if (nearHub) {
        this.addStaticBox(world, groundMat, b.x, gy + h * 0.5, b.z, w, h, d, b.rot);
      }
    });

    wallInst.instanceMatrix.needsUpdate = true;
    roofInst.instanceMatrix.needsUpdate = true;
    if (wallInst.instanceColor) wallInst.instanceColor.needsUpdate = true;
    if (roofInst.instanceColor) roofInst.instanceColor.needsUpdate = true;
    scene.add(wallInst);
    scene.add(roofInst);
  }

  private buildHeroLandmarks(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    // === 1. PFARRKIRCHE ST. MARIÄ HIMMELFAHRT AT REAL GPS (456.6, 225.5) ===
    {
      const cx = REAL_SPOTS.muensingChurch.x;
      const cz = REAL_SPOTS.muensingChurch.z;
      const gy = getTerrainHeight(cx, cz);

      const stucco = new THREE.MeshStandardMaterial({ color: 0xf6f2e8, roughness: 0.84 });
      const tileRed = new THREE.MeshStandardMaterial({ color: 0xa6422c, roughness: 0.78 });
      const copper = new THREE.MeshStandardMaterial({ color: 0x468868, roughness: 0.34, metalness: 0.52 });
      const gold = new THREE.MeshStandardMaterial({ color: 0xe8bd42, roughness: 0.2, metalness: 0.9 });

      const nave = new THREE.Mesh(new THREE.BoxGeometry(16, 9, 9.2), stucco);
      nave.position.set(cx, gy + 4.0, cz);
      nave.castShadow = true;
      nave.receiveShadow = true;
      scene.add(nave);
      this.addStaticBox(world, groundMat, cx, gy + 4.5, cz, 16, 9, 9.2);

      // Arched stained-glass nave windows (south & north walls) + oak west portal + rose window!
      const oakMat = new THREE.MeshStandardMaterial({ color: 0x4d311c, roughness: 0.85 });
      const archGlass = this.warmWindowMat;
      for (const side of [-1, 1]) {
        for (const wx of [-4.8, -1.6, 1.6, 4.8]) {
          const wMesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, 3.2, 0.16), archGlass);
          wMesh.position.set(cx + wx, gy + 4.8, cz + side * 4.62);
          scene.add(wMesh);
          const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.16, 12), archGlass);
          arch.rotation.x = Math.PI / 2;
          arch.position.set(cx + wx, gy + 6.4, cz + side * 4.62);
          scene.add(arch);
        }
      }
      const portal = new THREE.Mesh(new THREE.BoxGeometry(0.24, 3.6, 2.4), oakMat);
      portal.position.set(cx - 8.05, gy + 1.8, cz);
      scene.add(portal);
      const rose = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.18, 16), archGlass);
      rose.rotation.z = Math.PI / 2;
      rose.position.set(cx - 8.05, gy + 6.1, cz);
      scene.add(rose);

      const roofSlopeLen = Math.hypot(5.4, 4.2);
      const roofAng = Math.atan2(4.2, 5.4);
      for (const s of [-1, 1]) {
        const slope = new THREE.Mesh(new THREE.BoxGeometry(17.2, 0.28, roofSlopeLen), tileRed);
        slope.position.set(cx, gy + 10.4, cz + s * 2.5);
        slope.rotation.x = s * roofAng;
        slope.castShadow = true;
        scene.add(slope);
      }

      // Towering Southern Zwiebelturm Bell Tower!
      const tx = cx + 6.0;
      const tz = cz + 5.2;
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(4.6, 17, 4.6), stucco);
      shaft.position.set(tx, gy + 8.0, tz);
      shaft.castShadow = true;
      scene.add(shaft);
      this.addStaticBox(world, groundMat, tx, gy + 8.5, tz, 4.6, 17, 4.6);

      const belfry = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.4, 4.5, 8), stucco);
      belfry.position.set(tx, gy + 18.6, tz);
      belfry.castShadow = true;
      scene.add(belfry);

      const clockMat = new THREE.MeshStandardMaterial({ map: createClockTexture(), roughness: 0.4 });
      for (const [ox, oz, ry] of [
        [0, 2.34, 0],
        [0, -2.34, Math.PI],
        [2.34, 0, Math.PI / 2],
        [-2.34, 0, -Math.PI / 2]
      ]) {
        const face = new THREE.Mesh(new THREE.CircleGeometry(0.95, 18), clockMat);
        face.position.set(tx + ox, gy + 14.8, tz + oz);
        face.rotation.y = ry;
        scene.add(face);
      }

      const onionPts = [
        new THREE.Vector2(0.01, 6.8),
        new THREE.Vector2(0.32, 5.6),
        new THREE.Vector2(0.8, 4.6),
        new THREE.Vector2(0.58, 3.8),
        new THREE.Vector2(1.55, 2.9),
        new THREE.Vector2(2.8, 1.95),
        new THREE.Vector2(2.55, 0.8),
        new THREE.Vector2(2.3, 0)
      ];
      const onion = new THREE.Mesh(new THREE.LatheGeometry(onionPts, 18), copper);
      onion.position.set(tx, gy + 20.8, tz);
      onion.castShadow = true;
      scene.add(onion);

      const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.5, 0.14), gold);
      crossV.position.set(tx, gy + 28.4, tz);
      scene.add(crossV);
      const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.14, 0.14), gold);
      crossH.position.set(tx, gy + 28.65, tz);
      scene.add(crossH);
    }

    // === 2. SCHLOSS AMMERLAND AT REAL GPS (-222.5, 163.5) ON STARNBERGER SEE! ===
    {
      const sx = REAL_SPOTS.schlossAmmerland.x;
      const sz = REAL_SPOTS.schlossAmmerland.z;
      const gy = getTerrainHeight(sx, sz);

      const castlePlaster = new THREE.MeshStandardMaterial({ color: 0xebd9ae, roughness: 0.82 });
      const tileRed = new THREE.MeshStandardMaterial({ color: 0xa43f29, roughness: 0.78 });
      const copper = new THREE.MeshStandardMaterial({ color: 0x468868, roughness: 0.36, metalness: 0.48 });

      const keep = new THREE.Mesh(new THREE.BoxGeometry(15, 10.5, 10), castlePlaster);
      keep.position.set(sx, gy + 4.8, sz);
      keep.castShadow = true;
      keep.receiveShadow = true;
      scene.add(keep);
      this.addStaticBox(world, groundMat, sx, gy + 5.2, sz, 15, 10.5, 10);

      const roof = new THREE.Mesh(new THREE.ConeGeometry(9.6, 4.4, 4), tileRed);
      roof.rotation.y = Math.PI / 4;
      roof.scale.set(1.2, 1, 0.85);
      roof.position.set(sx, gy + 12.2, sz);
      roof.castShadow = true;
      scene.add(roof);

      // Iconic Bavarian corner turrets with copper onion caps!
      for (const ox of [-7.2, 7.2]) {
        for (const oz of [-4.8, 4.8]) {
          const turret = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.65, 12.5, 12), castlePlaster);
          turret.position.set(sx + ox, gy + 5.8, sz + oz);
          turret.castShadow = true;
          scene.add(turret);

          const cap = new THREE.Mesh(new THREE.ConeGeometry(1.75, 3.2, 12), copper);
          cap.position.set(sx + ox, gy + 13.6, sz + oz);
          cap.castShadow = true;
          scene.add(cap);
        }
      }

      // Signboard
      const stex = makeSignTexture(384, 96, '#2e241b', '#e5be49', 'SCHLOSS AMMERLAND', 'STARNBERGER SEE', '#faf4dc');
      const sboard = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.05, 0.1), new THREE.MeshStandardMaterial({ map: stex }));
      sboard.position.set(sx + 8.5, gy + 2.4, sz);
      sboard.rotation.y = Math.PI / 2;
      scene.add(sboard);
    }

    // === 3. FISCHEREIHOFLADEN & BOOTSVERLEIH SEBALD + WOODEN PIER ON STARNBERGER SEE! ===
    {
      const px = REAL_SPOTS.sebaldPier.x;
      const pz = REAL_SPOTS.sebaldPier.z;
      const gy = getTerrainHeight(px, pz);
      const deckY = WATER_LEVEL + 0.68;
      const timber = new THREE.MeshStandardMaterial({ color: 0x7a5735, roughness: 0.9 });

      // Wooden boathouse & fish shop neatly north of the pier entrance (so Nördliche Seestraße stays wide open!)
      const shopX = px - 1.5;
      const shopZ = pz - 8.5;
      const shopY = getTerrainHeight(shopX, shopZ);
      const shop = new THREE.Mesh(
        new THREE.BoxGeometry(8.2, 4.4, 6.2),
        new THREE.MeshStandardMaterial({ color: 0x875f38, roughness: 0.88 })
      );
      shop.position.set(shopX, shopY + 2.0, shopZ);
      shop.castShadow = true;
      shop.receiveShadow = true;
      scene.add(shop);
      this.addStaticBox(world, groundMat, shopX, shopY + 2.0, shopZ, 8.2, 4.4, 6.2);

      const shopRoof = new THREE.Mesh(
        new THREE.ConeGeometry(6.2, 2.4, 4),
        new THREE.MeshStandardMaterial({ color: 0x9b3e26, roughness: 0.78 })
      );
      shopRoof.rotation.y = Math.PI / 4;
      shopRoof.scale.set(1.18, 1, 0.92);
      shopRoof.position.set(shopX, shopY + 5.2, shopZ);
      shopRoof.castShadow = true;
      scene.add(shopRoof);

      const sTex = makeSignTexture(
        420,
        112,
        '#194b6b',
        '#f4d03f',
        'FISCHEREI SEBALD',
        'BOOTSVERLEIH · STARNBERGER SEE',
        '#ffffff',
        '#ffe580'
      );
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(5.2, 1.25, 0.1),
        new THREE.MeshStandardMaterial({ map: sTex, roughness: 0.5 })
      );
      sign.position.set(shopX, shopY + 3.4, shopZ + 3.16);
      scene.add(sign);

      // Smooth wooden approach ramp + drivable Wooden Pier (Steg) jutting out over Lake Starnberg (-204..-246, z=125)!
      const pier = new THREE.Mesh(new THREE.BoxGeometry(42, 0.28, 6.0), timber);
      pier.position.set(-225, deckY, pz);
      pier.castShadow = true;
      pier.receiveShadow = true;
      scene.add(pier);
      this.addStaticBox(world, groundMat, -225, deckY - 0.08, pz, 42, 0.36, 6.0);

      for (let x = -208; x >= -244; x -= 6) {
        for (const oz of [-2.7, 2.7]) {
          const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 4.2, 8), timber);
          pile.position.set(x, deckY - 1.1, pz + oz);
          scene.add(pile);
        }
      }

      // Gently bobbing white sailboats on Starnberger See!
      const hullMat = new THREE.MeshStandardMaterial({ color: 0xf4f2eb, roughness: 0.35 });
      const sailMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, side: THREE.DoubleSide });
      const boatCoords: [number, number, number][] = [
        [-265, 110, 0.3],
        [-290, 145, -0.5],
        [-275, 75, 0.8],
        [-315, 175, -0.2],
        [-260, 195, 0.6],
        [-305, 45, -0.9]
      ];
      boatCoords.forEach(([bx, bz, rot], idx) => {
        const boat = new THREE.Group();
        const hull = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.78, 4.8), hullMat);
        hull.position.y = 0.22;
        hull.castShadow = true;
        boat.add(hull);
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 6.4, 8), timber);
        mast.position.y = 3.4;
        boat.add(mast);
        const sailGeo = new THREE.BufferGeometry();
        sailGeo.setAttribute(
          'position',
          new THREE.BufferAttribute(new Float32Array([0, 0.8, 0, 0, 6.2, 0, 0, 1.1, 2.7]), 3)
        );
        sailGeo.computeVertexNormals();
        const sail = new THREE.Mesh(sailGeo, sailMat);
        boat.add(sail);
        boat.position.set(bx, WATER_LEVEL + 0.06, bz);
        boat.rotation.y = rot;
        scene.add(boat);
        this.sailboats.push({
          group: boat,
          basePos: new THREE.Vector3(bx, WATER_LEVEL + 0.06, bz),
          phase: idx * 1.3,
          driftAmp: 2.2
        });
      });
    }

    // === 4. HERO GASTHAUS "ZUM ALTWIRT" INN & MÜNSING MAIBAUM AT REAL GPS! ===
    {
      const ax = REAL_SPOTS.muensingAltwirt.x + 2.5;
      const az = REAL_SPOTS.muensingAltwirt.z + 7.5;
      const gy = getTerrainHeight(ax, az);

      const innMat = new THREE.MeshStandardMaterial({
        map: createBavarianFacadeTexture(),
        color: 0xfbf0d8,
        roughness: 0.82
      });
      const innRoofMat = new THREE.MeshStandardMaterial({ color: 0x9b3a24, roughness: 0.78 });
      const innBody = new THREE.Mesh(new THREE.BoxGeometry(13.5, 7.2, 9.2), innMat);
      innBody.position.set(ax, gy + 3.1, az);
      innBody.castShadow = true;
      innBody.receiveShadow = true;
      scene.add(innBody);
      this.addStaticBox(world, groundMat, ax, gy + 3.5, az, 13.5, 7.2, 9.2);

      const innRoof = new THREE.Mesh(new THREE.ConeGeometry(9.6, 3.6, 4), innRoofMat);
      innRoof.rotation.y = Math.PI / 4;
      innRoof.scale.set(1.22, 1, 0.88);
      innRoof.position.set(ax, gy + 8.4, az);
      innRoof.castShadow = true;
      scene.add(innRoof);

      const altTex = makeSignTexture(
        512,
        128,
        '#1e3b26',
        '#e5be49',
        'GASTHAUS ZUM ALTWIRT',
        'METZGEREI · MÜNSING SEIT 1609',
        '#faf4dc',
        '#a8db3e'
      );
      const signBoard = new THREE.Mesh(
        new THREE.BoxGeometry(6.8, 1.5, 0.16),
        new THREE.MeshStandardMaterial({ map: altTex, roughness: 0.45 })
      );
      signBoard.position.set(ax, gy + 5.6, az - 4.72);
      signBoard.rotation.y = Math.PI;
      scene.add(signBoard);

      // Tall Blue-and-White Münsing Maibaum right on the village square between Church & Altwirt!
      const mx = 466;
      const mz = 232;
      const my = getTerrainHeight(mx, mz);
      const g = new THREE.Group();
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.28, 15, 14),
        new THREE.MeshStandardMaterial({ map: createMaibaumTexture(), roughness: 0.42 })
      );
      pole.position.y = 7.5;
      pole.castShadow = true;
      g.add(pole);

      const wreath = new THREE.Mesh(
        new THREE.TorusGeometry(1.25, 0.25, 10, 18),
        new THREE.MeshStandardMaterial({ color: 0x2d6630, roughness: 0.88 })
      );
      wreath.rotation.x = Math.PI / 2;
      wreath.position.y = 12.2;
      g.add(wreath);

      const crown = new THREE.Mesh(
        new THREE.ConeGeometry(0.95, 2.4, 8),
        new THREE.MeshStandardMaterial({ color: 0x2d6630, roughness: 0.88 })
      );
      crown.position.y = 15.8;
      g.add(crown);

      g.position.set(mx, my, mz);
      scene.add(g);
      this.destructibles.push({
        kind: 'maibaum',
        label: 'Münsing Maibaum',
        pos: new THREE.Vector3(mx, my, mz),
        standingMesh: g,
        toppled: false,
        radius: 0.9,
        height: 15
      });
    }
  }

  private buildRealOSMForests(scene: THREE.Scene): void {
    // Collect paved road segments so trees never grow in the middle of paved Bavarian streets!
    const roadSegs: [number, number, number, number][] = [];
    for (const r of OSM_DATA.roads) {
      if (r.hw === 'track' || r.hw === 'service') continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        roadSegs.push([r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]]);
      }
    }
    const isClearForTree = (tx: number, tz: number): boolean => {
      if (Math.abs(tx - FARM_CENTER.x) < 46 && Math.abs(tz - FARM_CENTER.z) < 44) return false;
      if (getTerrainHeight(tx, tz) < WATER_LEVEL + 0.7) return false;
      // Keep Sebald Pier, Schloss Ammerland waterfront vista & Münsing village square open!
      if (tx < -186 && tz > 102 && tz < 182) return false;
      if (Math.hypot(tx - REAL_SPOTS.muensingAltwirt.x, tz - REAL_SPOTS.muensingAltwirt.z) < 48) return false;
      for (const [ax, az, bx, bz] of roadSegs) {
        if (pointToSegmentDistSq(tx, tz, ax, az, bx, bz) < 9.5 * 9.5) return false;
      }
      return true;
    };

    // Populate REAL OpenStreetMap forest polygons with 900+ instanced Bavarian spruces & oaks (2 draw calls!)
    const treePositions: { x: number; z: number; s: number }[] = [];

    for (const f of OSM_DATA.forests) {
      const area = f.w * f.d;
      const count = Math.min(85, Math.max(10, Math.floor(area / 360)));
      for (let i = 0; i < count; i++) {
        const tx = f.x + (Math.random() - 0.5) * f.w * 0.88;
        const tz = f.z + (Math.random() - 0.5) * f.d * 0.88;
        if (!isClearForTree(tx, tz)) continue;
        treePositions.push({ x: tx, z: tz, s: 0.85 + Math.random() * 0.65 });
      }
    }

    // Scatter scenic roadside woodland around Weipertshausen & eastern hills
    for (let i = 0; i < 180; i++) {
      const tx = -180 + Math.random() * 760;
      const tz = -390 + Math.random() * 620;
      if (Math.hypot(tx - REAL_SPOTS.muensingAltwirt.x, tz - REAL_SPOTS.muensingAltwirt.z) < 90) continue;
      if (Math.hypot(tx - REAL_SPOTS.wimpasing.x, tz - REAL_SPOTS.wimpasing.z) < 60) continue;
      if (!isClearForTree(tx, tz)) continue;
      treePositions.push({ x: tx, z: tz, s: 0.9 + Math.random() * 0.7 });
    }

    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.44, 3.2, 6);
    const crownGeo = new THREE.ConeGeometry(2.3, 6.2, 7);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x593d26, roughness: 0.95 });
    const crownMat = new THREE.MeshStandardMaterial({ color: 0x345e2d, roughness: 0.9 });

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treePositions.length);
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, treePositions.length);
    crowns.castShadow = true;

    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    treePositions.forEach((t, idx) => {
      const gy = getTerrainHeight(t.x, t.z);
      dummy.position.set(t.x, gy + 1.5 * t.s, t.z);
      dummy.rotation.set(0, idx * 1.1, 0);
      dummy.scale.setScalar(t.s);
      dummy.updateMatrix();
      trunks.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(t.x, gy + 5.2 * t.s, t.z);
      dummy.updateMatrix();
      crowns.setMatrixAt(idx, dummy.matrix);

      col.setHex(idx % 3 === 0 ? 0x2e5729 : idx % 3 === 1 ? 0x3b6932 : 0x457537);
      crowns.setColorAt(idx, col);
    });
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
    scene.add(trunks);
    scene.add(crowns);
  }

  private addDynamicProp(
    kind: DynamicVillageObj['kind'],
    label: string,
    mesh: THREE.Group,
    halfExtents: CANNON.Vec3,
    mass: number,
    x: number,
    z: number,
    rotY: number
  ): DynamicVillageObj {
    const gy = getTerrainHeight(x, z);
    const body = new CANNON.Body({
      mass,
      material: this.propMat,
      linearDamping: 0.22,
      angularDamping: 0.36
    });
    body.addShape(new CANNON.Box(halfExtents));
    body.position.set(x, gy + halfExtents.y + 0.12, z);
    body.quaternion.setFromEuler(0, rotY, 0);
    body.allowSleep = true;
    body.sleepSpeedLimit = 0.14;
    body.sleepTimeLimit = 1.1;

    this.world.addBody(body);
    this.scene.add(mesh);

    const obj: DynamicVillageObj = {
      id: this.nextId++,
      kind,
      label,
      mesh,
      body,
      radius: Math.max(halfExtents.x, halfExtents.z),
      halfHeight: halfExtents.y,
      heldByTractor: false,
      alarmActive: false
    };
    this.objects.push(obj);
    return obj;
  }

  private buildInteractivePropsAndCars(): void {
    // Biergarten tables & benches in Münsing (Zum Altwirt) and at Fischerei Sebald on Starnberger See!
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x875c34, roughness: 0.88 });
    const darkPost = new THREE.MeshStandardMaterial({ color: 0x24282b, roughness: 0.6 });
    const benchSpots: [number, number, number][] = [
      [472, 246, 0],
      [478, 246, 0],
      [484, 246, 0],
      [-203, 132, Math.PI / 2],
      [-203, 118, Math.PI / 2],
      [-20, 198, 0.3]
    ];
    for (const [bx, bz, rot] of benchSpots) {
      const g = new THREE.Group();
      const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.84), woodMat);
      top.position.y = 0.36;
      top.castShadow = true;
      g.add(top);
      for (const sz of [-0.68, 0.68]) {
        const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.09, 0.3), woodMat);
        seat.position.set(0, 0.04, sz);
        g.add(seat);
      }
      for (const sx of [-0.82, 0.82]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.72, 1.38), darkPost);
        g.add(leg);
        leg.position.set(sx, 0, 0);
      }
      this.addDynamicProp('bench', 'Biergarten Table', g, new CANNON.Vec3(1.1, 0.42, 0.8), 18, bx, bz, rot);
    }

    // Physical Bavarian Cars parked across Wimpasing, Ammerland, Münsing & Weipertshausen (hefty mass so lifting them tests tipping!)
    const carConfigs: {
      name: string;
      color: number;
      x: number;
      z: number;
      rotY: number;
      isVan?: boolean;
      isPolizei?: boolean;
    }[] = [
      { name: 'Bayerische Polizei Car', color: 0xf4f6f8, x: 454, z: 248, rotY: 0.2, isPolizei: true },
      { name: 'Deutsche Post Van', color: 0xf5c414, x: 498, z: 238, rotY: Math.PI / 2, isVan: true },
      { name: 'Silver Bavarian Touring', color: 0xb6bec4, x: 514, z: 222, rotY: 0 },
      { name: 'Red Compact', color: 0xc93126, x: -195, z: 132, rotY: 0.1 },
      { name: 'Forest Green SUV', color: 0x2d5e3a, x: -16, z: 186, rotY: Math.PI / 2 },
      { name: 'Blue Sedan', color: 0x244878, x: 218, z: -392, rotY: 0.4 },
      // Parked right outside our Wimpasing Farm gate so you can immediately test lifting a heavy 1.5-ton car & tipping over!
      { name: 'Old Farm Pickup', color: 0x9c3d28, x: FARM_CENTER.x + 15, z: FARM_CENTER.z + 34, rotY: 1.3 }
    ];

    const glassMat = new THREE.MeshStandardMaterial({ color: 0x1d2d36, roughness: 0.1, metalness: 0.55 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x1e2022, roughness: 0.92 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xc8cfd4, roughness: 0.35, metalness: 0.65 });
    const polizeiBlue = new THREE.MeshStandardMaterial({ color: 0x1362b8, roughness: 0.35 });
    const beaconBlue = new THREE.MeshStandardMaterial({ color: 0x29a6ff, emissive: 0x1388ff, emissiveIntensity: 1.2 });

    for (const cfg of carConfigs) {
      const g = new THREE.Group();
      const paint = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.24, metalness: 0.38 });
      const len = cfg.isVan ? 4.4 : 3.85;
      const bodyH = cfg.isVan ? 1.05 : 0.72;

      const lower = new THREE.Mesh(new THREE.BoxGeometry(1.78, bodyH, len), paint);
      lower.position.y = -0.08;
      lower.castShadow = true;
      g.add(lower);

      if (cfg.isPolizei) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.26, len * 0.96), polizeiBlue);
        stripe.position.y = -0.04;
        g.add(stripe);
      }

      const cabLen = cfg.isVan ? 3.1 : 1.9;
      const cabH = cfg.isVan ? 0.85 : 0.62;
      const cabZ = cfg.isVan ? 0.42 : 0.15;
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.56, cabH, cabLen), cfg.isVan ? paint : glassMat);
      cabin.position.set(0, bodyH * 0.5 + cabH * 0.5 - 0.12, cabZ);
      cabin.castShadow = true;
      g.add(cabin);

      if (cfg.isPolizei) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.26), beaconBlue);
        bar.position.set(0, bodyH * 0.5 + cabH + 0.06, cabZ);
        g.add(bar);
      }

      const hazards: THREE.Mesh[] = [];
      for (const lx of [-0.62, 0.62]) {
        const hzMat = new THREE.MeshStandardMaterial({ color: 0xffa500, emissive: 0xff8800, emissiveIntensity: 0 });
        const hz = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.09), hzMat);
        hz.position.set(lx, 0.02, -len * 0.5 - 0.02);
        g.add(hz);
        hazards.push(hz);
      }

      for (const wx of [-0.88, 0.88]) {
        for (const wz of [-len * 0.31, len * 0.31]) {
          const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.24, 12), tireMat);
          tire.rotation.z = Math.PI / 2;
          tire.position.set(wx, -0.44, wz);
          g.add(tire);
          const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.26, 8), rimMat);
          rim.rotation.z = Math.PI / 2;
          rim.position.set(wx, -0.44, wz);
          g.add(rim);
        }
      }

      // Authentic ~1.4-ton car mass in physics scale so hoisting a car far out on the boom REALLY threatens to tip the Scorpion!
      const obj = this.addDynamicProp(
        'car',
        cfg.name,
        g,
        new CANNON.Vec3(0.92, cfg.isVan ? 0.95 : 0.78, len * 0.5),
        1400,
        cfg.x,
        cfg.z,
        cfg.rotY
      );
      obj.hazardLights = hazards;
    }
  }

  private buildDestructibleTreesAndLamps(): void {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4028, roughness: 0.95 });
    const leafBright = new THREE.MeshStandardMaterial({ color: 0x4b7e39, roughness: 0.88 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x262b2e, roughness: 0.5, metalness: 0.65 });

    const treeSpots: [number, number][] = [
      [462, 244],
      [482, 234],
      [-196, 140],
      [-212, 152],
      [-10, 190],
      [120, 215],
      [240, 185]
    ];
    for (const [tx, tz] of treeSpots) {
      const ty = getTerrainHeight(tx, tz);
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.4, 2.8, 8), trunkMat);
      trunk.position.y = 1.4;
      trunk.castShadow = true;
      g.add(trunk);
      const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(2.3, 1), leafBright);
      crown.position.y = 4.0;
      crown.castShadow = true;
      g.add(crown);
      g.position.set(tx, ty - 0.1, tz);
      this.scene.add(g);
      this.destructibles.push({
        kind: 'tree',
        label: 'Bavarian Chestnut Tree',
        pos: new THREE.Vector3(tx, ty, tz),
        standingMesh: g,
        toppled: false,
        radius: 1.1,
        height: 5.8
      });
    }

    const lampSpots: [number, number][] = [
      [464, 238],
      [486, 240],
      [508, 224],
      [-200, 128],
      [-20, 192],
      [FARM_CENTER.x + 10, FARM_CENTER.z + 32]
    ];
    for (const [lx, lz] of lampSpots) {
      const ly = getTerrainHeight(lx, lz);
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 4.6, 8), ironMat);
      pole.position.y = 2.3;
      g.add(pole);
      const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.52, 0.4), this.lampBulbMat);
      lantern.position.y = 4.75;
      g.add(lantern);

      const pl = new THREE.PointLight(0xffcb78, 0, 22, 1.8);
      pl.position.set(0, 4.6, 0);
      g.add(pl);
      this.lampPointLights.push(pl);

      g.position.set(lx, ly, lz);
      this.scene.add(g);
      this.destructibles.push({
        kind: 'lamp',
        label: 'Village Streetlamp',
        pos: new THREE.Vector3(lx, ly, lz),
        standingMesh: g,
        toppled: false,
        radius: 0.72,
        height: 4.9
      });
    }
  }

  private buildPedestrians(): void {
    const jacketColors = [0x2d6638, 0xc9422c, 0x1b6db8, 0xdba624, 0x6b3e5e];
    const trouserMat = new THREE.MeshStandardMaterial({ color: 0x3b2c20, roughness: 0.9 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf2c59d, roughness: 0.75 });

    const spots: [number, number][] = [
      [468, 236],
      [476, 243],
      [494, 245],
      [512, 218],
      [-202, 127],
      [-206, 134],
      [-216, 165],
      [-18, 195],
      [-26, 190],
      [212, -398]
    ];

    spots.forEach(([px, pz], idx) => {
      const py = getTerrainHeight(px, pz);
      const g = new THREE.Group();
      const coatMat = new THREE.MeshStandardMaterial({ color: jacketColors[idx % jacketColors.length], roughness: 0.8 });

      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.28), coatMat);
      torso.position.y = 1.04;
      torso.castShadow = true;
      g.add(torso);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), skinMat);
      head.position.y = 1.54;
      g.add(head);

      const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.64, 0.16), trouserMat);
      leftLeg.position.set(-0.12, 0.36, 0);
      g.add(leftLeg);
      const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.64, 0.16), trouserMat);
      rightLeg.position.set(0.12, 0.36, 0);
      g.add(rightLeg);
      const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.54, 0.14), coatMat);
      leftArm.position.set(-0.32, 1.04, 0);
      g.add(leftArm);
      const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.54, 0.14), coatMat);
      rightArm.position.set(0.32, 1.04, 0);
      g.add(rightArm);

      g.position.set(px, py, pz);
      this.scene.add(g);
      this.pedestrians.push({
        group: g,
        leftLeg,
        rightLeg,
        leftArm,
        rightArm,
        pos: new THREE.Vector3(px, py, pz),
        vel: new THREE.Vector3(),
        homePos: new THREE.Vector3(px, py, pz),
        wanderAngle: Math.random() * Math.PI * 2,
        panicTimer: 0,
        tumbleTimer: 0,
        tumbleVel: new THREE.Vector3(),
        phase: Math.random() * 10
      });
    });
  }

  public scarePedestriansNear(origin: THREE.Vector3, radius: number): number {
    let scared = 0;
    for (const p of this.pedestrians) {
      if (p.pos.distanceTo(origin) < radius) {
        p.panicTimer = Math.max(p.panicTimer, 4.5);
        scared++;
      }
    }
    return scared;
  }

  private toppleDestructible(d: DestructibleStatic, impactPos: THREE.Vector3, impactSpeed: number): void {
    if (d.toppled) return;
    d.toppled = true;

    const fallDir = d.pos.clone().sub(impactPos);
    fallDir.y = 0;
    if (fallDir.lengthSq() < 0.01) fallDir.set(1, 0, 0);
    fallDir.normalize();

    const body = new CANNON.Body({
      mass: d.kind === 'maibaum' ? 650 : d.kind === 'tree' ? 480 : 180,
      material: this.propMat,
      linearDamping: 0.22,
      angularDamping: 0.28
    });
    const halfH = Math.min(4.2, d.height * 0.42);
    body.addShape(new CANNON.Box(new CANNON.Vec3(0.45, halfH, 0.45)), new CANNON.Vec3(0, halfH, 0));
    body.position.set(d.pos.x, d.pos.y + 0.55, d.pos.z);
    const push = Math.max(4.5, impactSpeed * 0.85);
    body.velocity.set(fallDir.x * push, 1.8, fallDir.z * push);
    body.angularVelocity.set(fallDir.z * 3.8, (Math.random() - 0.5) * 1.5, -fallDir.x * 3.8);
    this.world.addBody(body);

    this.objects.push({
      id: this.nextId++,
      kind: d.kind === 'maibaum' ? 'maibaum' : d.kind === 'lamp' ? 'lamp' : 'fallen_tree',
      label: d.label,
      mesh: d.standingMesh,
      body,
      radius: 1.1,
      halfHeight: 0.5,
      heldByTractor: false,
      alarmActive: false
    });
    this.callbacks.onTreeOrLampToppled(d.label, d.kind, d.pos.clone().add(new THREE.Vector3(0, 1.8, 0)));
  }

  public update(
    dt: number,
    elapsed: number,
    tractorPos: THREE.Vector3,
    tractorSpeed: number,
    tipPos: THREE.Vector3,
    tipSpeed: number
  ): void {
    for (const b of this.sailboats) {
      b.group.position.y = b.basePos.y + Math.sin(elapsed * 1.4 + b.phase) * 0.09;
      b.group.position.z = b.basePos.z + Math.sin(elapsed * 0.22 + b.phase) * b.driftAmp;
      b.group.rotation.z = Math.sin(elapsed * 1.1 + b.phase) * 0.06;
    }

    for (const d of this.destructibles) {
      if (d.toppled) continue;
      const dChassis = Math.hypot(d.pos.x - tractorPos.x, d.pos.z - tractorPos.z);
      const dTip = Math.hypot(d.pos.x - tipPos.x, d.pos.z - tipPos.z);
      if (dChassis < d.radius + 1.5 && Math.abs(tractorSpeed) > 2.6) {
        this.toppleDestructible(d, tractorPos, Math.abs(tractorSpeed));
      } else if (dTip < d.radius + 1.2 && tipPos.y < d.pos.y + d.height && tipSpeed > 3.2) {
        this.toppleDestructible(d, tipPos, tipSpeed);
      }
    }

    const hazardBlink = Math.sin(elapsed * 11) > 0 ? 1.5 : 0;
    for (const o of this.objects) {
      if (o.kind === 'car') {
        const upVec = new CANNON.Vec3(0, 1, 0);
        o.body.quaternion.vmult(upVec, upVec);
        const disturbed = o.heldByTractor || upVec.y < 0.72 || o.body.position.y > getTerrainHeight(o.body.position.x, o.body.position.z) + 2.0;
        if (disturbed && !o.alarmActive) {
          o.alarmActive = true;
          this.callbacks.onCarHonk(true);
        }
        if (o.alarmActive && o.hazardLights) {
          for (const hl of o.hazardLights) {
            (hl.material as THREE.MeshStandardMaterial).emissiveIntensity = hazardBlink;
          }
        }
      }

      const inWater = o.body.position.y < WATER_LEVEL + 0.25 && o.body.position.x < -210;
      if (inWater && !o.inLake) {
        o.inLake = true;
        this.callbacks.onLakeSplash(o.label, new THREE.Vector3(o.body.position.x, WATER_LEVEL + 0.2, o.body.position.z));
      } else if (!inWater) {
        o.inLake = false;
      }

      o.mesh.position.set(o.body.position.x, o.body.position.y, o.body.position.z);
      o.mesh.quaternion.set(
        o.body.quaternion.x,
        o.body.quaternion.y,
        o.body.quaternion.z,
        o.body.quaternion.w
      );
    }

    for (const p of this.pedestrians) {
      const toTractor = p.pos.clone().sub(tractorPos);
      toTractor.y = 0;
      const dist = toTractor.length();
      if (dist > 140) continue; // Lightweight distance culling across the huge 1.2km real map!

      if (p.tumbleTimer <= 0 && dist < 2.3 && Math.abs(tractorSpeed) > 1.2) {
        p.tumbleTimer = 1.2;
        p.panicTimer = 5.5;
        const pushDir = toTractor.normalize();
        p.tumbleVel.set(pushDir.x * 7.0, 4.8, pushDir.z * 7.0);
      }

      if (p.tumbleTimer > 0) {
        p.tumbleTimer -= dt;
        p.tumbleVel.y -= 16 * dt;
        p.pos.addScaledVector(p.tumbleVel, dt);
        const floorY = getTerrainHeight(p.pos.x, p.pos.z);
        if (p.pos.y < floorY) {
          p.pos.y = floorY;
          p.tumbleVel.y = Math.abs(p.tumbleVel.y) * 0.32;
          p.tumbleVel.x *= 0.72;
          p.tumbleVel.z *= 0.72;
        }
        p.group.position.copy(p.pos);
        p.group.rotation.x += dt * 9;
        p.group.rotation.z += dt * 7;
        continue;
      }

      p.group.rotation.x = 0;
      p.group.rotation.z = 0;
      if (dist < 10 && Math.abs(tractorSpeed) > 1.4) p.panicTimer = Math.max(p.panicTimer, 3.0);

      let moveSpeed = 1.3;
      if (p.panicTimer > 0) {
        p.panicTimer -= dt;
        moveSpeed = 5.4;
        const flee = toTractor.lengthSq() > 0.01 ? toTractor.normalize() : new THREE.Vector3(1, 0, 0);
        p.vel.lerp(flee.multiplyScalar(moveSpeed), Math.min(1, dt * 6));
      } else {
        p.wanderAngle += Math.sin(elapsed * 0.7 + p.phase) * 0.8 * dt;
        const backHome = p.homePos.clone().sub(p.pos);
        if (backHome.length() > 8) p.wanderAngle = Math.atan2(backHome.x, backHome.z);
        p.vel.set(Math.sin(p.wanderAngle) * moveSpeed, 0, Math.cos(p.wanderAngle) * moveSpeed);
      }

      p.pos.addScaledVector(p.vel, dt);
      p.pos.y = getTerrainHeight(p.pos.x, p.pos.z);
      p.group.position.copy(p.pos);
      if (p.vel.lengthSq() > 0.04) p.group.rotation.y = Math.atan2(p.vel.x, p.vel.z);

      const stride = Math.sin(elapsed * (p.panicTimer > 0 ? 18 : 6.5) + p.phase);
      p.leftLeg.rotation.x = stride * 0.65;
      p.rightLeg.rotation.x = -stride * 0.65;
      p.leftArm.rotation.x = p.panicTimer > 0 ? -2.6 + stride * 0.45 : -stride * 0.4;
      p.rightArm.rotation.x = p.panicTimer > 0 ? -2.6 - stride * 0.45 : stride * 0.4;
    }
  }
}
