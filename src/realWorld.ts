import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
  FARM_CENTER,
  getShorelineX,
  getTerrainHeight,
  OSM_DATA,
  REAL_SPOTS,
  SEBALD_PIER,
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
  ctx.fillStyle = '#192028';
  ctx.beginPath();
  ctx.arc(64, 64, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e5c158';
  ctx.lineWidth = 7;
  ctx.stroke();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.strokeStyle = '#f4d672';
    ctx.lineWidth = i % 3 === 0 ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(64 + Math.cos(a) * 40, 64 + Math.sin(a) * 40);
    ctx.lineTo(64 + Math.cos(a) * 53, 64 + Math.sin(a) * 53);
    ctx.stroke();
  }
  ctx.strokeStyle = '#f8e080';
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

/**
 * 4 Authentic Upper Bavarian Architectural Facade Textures (modeled directly from real Münsing & Starnberger See homes!):
 * - 'einfirsthof': Signature cream-plaster ground floor + rich dark weathered brown larch timber upper story + carved balcony & red geraniums!
 * - 'timber': Full warm weathered brown Alpine timber plank farmhouse / chalet with dark green shutters!
 * - 'barn': Tall weathered dark-brown vertical timber Stadel planks + wide double wooden barn doors + hayloft hatch!
 * - 'landhaus': Warm ochre/cream village plaster with painted Alpine window trim (Lüftlmalerei) + dark timber eaves & shutters!
 */
function createBavarianArchetypeTexture(
  kind: 'einfirsthof' | 'timber' | 'barn' | 'landhaus'
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;

  const drawPlanks = (y0: number, y1: number, baseHex: string, vertical = false) => {
    ctx.fillStyle = baseHex;
    ctx.fillRect(0, y0, 256, y1 - y0);
    if (vertical) {
      for (let x = 0; x < 256; x += 12) {
        ctx.fillStyle = x % 24 === 0 ? 'rgba(0,0,0,0.14)' : 'rgba(255,220,175,0.06)';
        ctx.fillRect(x, y0, 10, y1 - y0);
        ctx.fillStyle = 'rgba(25,14,6,0.34)';
        ctx.fillRect(x + 10, y0, 2, y1 - y0);
      }
    } else {
      for (let y = y0; y < y1; y += 11) {
        ctx.fillStyle = y % 22 === 0 ? 'rgba(0,0,0,0.12)' : 'rgba(255,220,180,0.06)';
        ctx.fillRect(0, y, 256, 9);
        ctx.fillStyle = 'rgba(28,15,6,0.3)';
        ctx.fillRect(0, y + 9, 256, 2);
      }
    }
  };

  const drawWindow = (wx: number, wy: number, shutterColor: string, flowers: boolean, lueftl = false) => {
    if (lueftl) {
      // Subtle painted Upper Bavarian Lüftlmalerei frame around window!
      ctx.strokeStyle = '#9c6638';
      ctx.lineWidth = 3;
      ctx.strokeRect(wx - 18, wy - 23, 36, 46);
      ctx.fillStyle = '#c27b48';
      ctx.fillRect(wx - 10, wy - 28, 20, 5);
    }
    if (shutterColor) {
      ctx.fillStyle = shutterColor;
      ctx.fillRect(wx - 24, wy - 19, 10, 40);
      ctx.fillRect(wx + 14, wy - 19, 10, 40);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(wx - 24, wy - 19, 10, 40);
      ctx.strokeRect(wx + 14, wy - 19, 10, 40);
    }
    ctx.fillStyle = '#2b3b45';
    ctx.fillRect(wx - 13, wy - 18, 26, 38);
    ctx.fillStyle = 'rgba(255, 222, 152, 0.28)';
    ctx.fillRect(wx - 11, wy - 16, 22, 34);
    ctx.fillStyle = '#efe9dc';
    ctx.fillRect(wx - 1, wy - 18, 2, 38);
    ctx.fillRect(wx - 13, wy - 1, 26, 2);

    if (flowers) {
      ctx.fillStyle = '#4e2f18';
      ctx.fillRect(wx - 17, wy + 19, 34, 7);
      ctx.fillStyle = '#2d6330';
      ctx.fillRect(wx - 16, wy + 16, 32, 4);
      ctx.fillStyle = '#d62f29';
      ctx.fillRect(wx - 13, wy + 13, 5, 5);
      ctx.fillRect(wx - 3, wy + 12, 6, 5);
      ctx.fillRect(wx + 7, wy + 13, 5, 5);
    }
  };

  if (kind === 'einfirsthof') {
    // Upper half: Rich dark weathered brown Bavarian timber!
    drawPlanks(0, 128, '#6e472a', false);
    // Lower half: Warm Bavarian cream-ochre lime plaster + stone foundation plinth
    ctx.fillStyle = '#f2ead9';
    ctx.fillRect(0, 128, 256, 100);
    ctx.fillStyle = '#877f73';
    ctx.fillRect(0, 228, 256, 28);

    // Classic carved brown wooden Bavarian wrap-around balcony (Balkon) across mid-floor!
    ctx.fillStyle = '#4e2f19';
    ctx.fillRect(0, 104, 256, 28);
    for (let x = 4; x < 256; x += 12) {
      ctx.fillStyle = '#7c5130';
      ctx.fillRect(x, 108, 7, 20);
    }
    ctx.fillStyle = '#3b2211';
    ctx.fillRect(0, 102, 256, 4);
    ctx.fillRect(0, 128, 256, 5);
    // Bright red geranium boxes lined along the wooden balcony!
    for (let x = 14; x < 244; x += 38) {
      ctx.fillStyle = '#2b5e2e';
      ctx.fillRect(x, 96, 28, 6);
      ctx.fillStyle = '#d83029';
      ctx.fillRect(x + 3, 93, 6, 5);
      ctx.fillRect(x + 12, 92, 6, 5);
      ctx.fillRect(x + 20, 93, 5, 5);
    }

    for (const wx of [44, 128, 212]) {
      drawWindow(wx, 48, '#285234', false);
      drawWindow(wx, 174, '#285234', true);
    }
  } else if (kind === 'timber') {
    // Full warm weathered brown Bavarian larch-wood chalet/farmhouse!
    drawPlanks(0, 226, '#7a4f2d', false);
    ctx.fillStyle = '#7e766b';
    ctx.fillRect(0, 226, 256, 30);

    // Heavy horizontal timber mid-beam & carved timber rail
    ctx.fillStyle = '#492b16';
    ctx.fillRect(0, 114, 256, 12);
    for (const wx of [44, 128, 212]) {
      drawWindow(wx, 52, '#2a5636', true);
      drawWindow(wx, 172, '#2a5636', false);
    }
  } else if (kind === 'barn') {
    // Authentic Upper Bavarian weathered dark-brown vertical timber Stadel (Hay Barn)!
    drawPlanks(0, 232, '#5a3a21', true);
    ctx.fillStyle = '#6f685e';
    ctx.fillRect(0, 232, 256, 24);
    // Horizontal cross-bracing beams
    ctx.fillStyle = '#3d2513';
    ctx.fillRect(0, 112, 256, 10);
    ctx.fillRect(0, 12, 256, 8);
    // Wide double sliding wooden barn doors in center
    ctx.fillStyle = '#472c18';
    ctx.fillRect(72, 128, 112, 104);
    ctx.strokeStyle = '#2c190c';
    ctx.lineWidth = 4;
    ctx.strokeRect(72, 128, 56, 104);
    ctx.strokeRect(128, 128, 56, 104);
    // Diagonal X-bracing on barn doors
    ctx.beginPath();
    ctx.moveTo(74, 130);
    ctx.lineTo(126, 230);
    ctx.moveTo(126, 130);
    ctx.lineTo(74, 230);
    ctx.moveTo(130, 130);
    ctx.lineTo(182, 230);
    ctx.moveTo(182, 130);
    ctx.lineTo(130, 230);
    ctx.stroke();
    // Upper hayloft vent hatch
    ctx.fillStyle = '#25170e';
    ctx.fillRect(104, 38, 48, 52);
    ctx.strokeStyle = '#8b5e36';
    ctx.strokeRect(104, 38, 48, 52);
  } else {
    // Warm ochre/cream village Landhaus with Alpine painted window borders & dark timber eaves
    ctx.fillStyle = '#f4ebd7';
    ctx.fillRect(0, 0, 256, 226);
    for (let i = 0; i < 600; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(Math.random() * 256, Math.random() * 226, 2, 2);
    }
    ctx.fillStyle = '#53351d';
    ctx.fillRect(0, 0, 256, 14); // Dark timber top eaves band
    ctx.fillStyle = '#857e74';
    ctx.fillRect(0, 226, 256, 30);
    for (const wx of [44, 128, 212]) {
      drawWindow(wx, 56, '#2a5636', true, true);
      drawWindow(wx, 166, '#2a5636', false, true);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function createTileRoofTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#b4492d';
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 16) {
    for (let x = 0; x < 256; x += 16) {
      const shade = ((x * 7 + y * 13) % 24) - 12;
      ctx.fillStyle = `rgb(${176 + shade}, ${72 + Math.floor(shade * 0.5)}, ${45 + Math.floor(shade * 0.4)})`;
      ctx.fillRect(x + 1, y + 1, 14, 13);
    }
    ctx.fillStyle = 'rgba(30,10,5,0.28)';
    ctx.fillRect(0, y + 14, 256, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  return tex;
}

/**
 * True overhanging Upper Bavarian Satteldach (pitched gable roof with triangular prism geometry, NOT a pyramid cone!).
 * Unit dimensions: width 1 along X (ridge along X), depth 1 along Z (eaves along ±Z), height 1 from y=0..1.
 */
function createBavarianGableRoofGeometry(): THREE.BufferGeometry {
  const hw = 0.56; // Generous Bavarian gable overhang along X
  const hd = 0.58; // Broad overhanging eaves along Z
  const h = 1.0;

  const verts = [
    // South roof slope (+Z)
    -hw, 0, hd,  hw, 0, hd,  hw, h, 0,
    -hw, 0, hd,  hw, h, 0,  -hw, h, 0,
    // North roof slope (-Z)
    hw, 0, -hd,  -hw, 0, -hd,  -hw, h, 0,
    hw, 0, -hd,  -hw, h, 0,   hw, h, 0,
    // West gable triangle (-X)
    -hw, 0, -hd,  -hw, 0, hd,  -hw, h, 0,
    // East gable triangle (+X)
    hw, 0, hd,   hw, 0, -hd,   hw, h, 0,
    // Underside eaves soffit
    -hw, 0, -hd,  hw, 0, -hd,  hw, 0, hd,
    -hw, 0, -hd,  hw, 0, hd,  -hw, 0, hd
  ];
  const uvs = [
    0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 0.5, 1,
    0, 0, 1, 0, 0.5, 1,
    0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
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
 * Builds a single merged terrain-conforming ribbon mesh with counter-clockwise upward normals!
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
    const dense: [number, number][] = [];
    for (let i = 0; i < line.pts.length - 1; i++) {
      const a = line.pts[i];
      const b = line.pts[i + 1];
      const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const steps = Math.max(1, Math.ceil(dist / 7));
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

      const hC = getTerrainHeight(p[0], p[1]);
      const hL = getTerrainHeight(lx, lz);
      const hR = getTerrainHeight(rx, rz);
      const roadY = Math.max(hC, (hL + hR) * 0.5) + yOffset;

      positions.push(lx, Math.max(hL + yOffset, roadY - 0.08), lz);
      positions.push(rx, Math.max(hR + yOffset, roadY - 0.08), rz);
      uvs.push(0, accumLen * 0.1);
      uvs.push(1, accumLen * 0.1);

      if (i < dense.length - 1) {
        const i0 = vBase + i * 2;
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

    this.buildRealOSMRoadsAndDetails(scene);
    this.buildRealBavarianBuildings(scene, world, groundMat);
    this.buildHeroLandmarks(scene, world, groundMat);
    this.buildMultiSpeciesBavarianForests(scene);
    this.buildInteractivePropsAndCars();
    this.buildDestructibleTreesAndLamps();
    this.buildPedestrians();
  }

  public setNightMode(nightAmount: number): void {
    this.warmWindowMat.emissiveIntensity = 0.22 + nightAmount * 1.5;
    this.lampBulbMat.emissiveIntensity = 0.35 + nightAmount * 2.0;
    for (const pl of this.lampPointLights) {
      pl.intensity = nightAmount * 18;
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

  private buildRealOSMRoadsAndDetails(scene: THREE.Scene): void {
    const mainPaved: { pts: [number, number][]; halfWidth: number }[] = [];
    const villagePaved: { pts: [number, number][]; halfWidth: number }[] = [];

    for (const r of OSM_DATA.roads) {
      // Let farm tracks & driveways show directly from the crisp 20cm Bavaria aerial orthophoto!
      if (r.hw === 'track' || r.hw === 'service') continue;
      if (r.hw === 'secondary' || r.hw === 'tertiary') {
        mainPaved.push({ pts: r.pts, halfWidth: 4.6 });
      } else {
        villagePaved.push({ pts: r.pts, halfWidth: 3.4 });
      }
    }

    // Crisp farm access driveway linking Wimpasing Home Farm west to Sterzenweg & south toward Münsinger Straße!
    villagePaved.push({
      pts: [
        [FARM_CENTER.x, FARM_CENTER.z + 29],
        [FARM_CENTER.x - 16, FARM_CENTER.z + 82],
        [-207.9, 852.3]
      ],
      halfWidth: 3.6
    });
    villagePaved.push({
      pts: [
        [FARM_CENTER.x - 30, FARM_CENTER.z + 8],
        [-148, 808],
        [-211.5, 843.3]
      ],
      halfWidth: 3.4
    });

    const asphaltTex = createAsphaltTexture();
    const mainAsphaltMat = new THREE.MeshStandardMaterial({
      map: asphaltTex,
      roughness: 0.88,
      metalness: 0.05,
      transparent: true,
      opacity: 0.88,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    const villageAsphaltMat = new THREE.MeshStandardMaterial({
      color: 0x4b4f54,
      roughness: 0.92,
      transparent: true,
      opacity: 0.72,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });

    scene.add(buildMergedRibbonMesh(mainPaved, 0.36, mainAsphaltMat));
    scene.add(buildMergedRibbonMesh(villagePaved, 0.28, villageAsphaltMat));

    // Lübbach stream ribbon flowing north-south along the west edge of Münsing
    if (OSM_DATA.streams.length > 0) {
      const streamLines = OSM_DATA.streams.map((s) => ({ pts: s.pts, halfWidth: 2.2 }));
      const streamMat = new THREE.MeshStandardMaterial({
        color: 0x26799c,
        roughness: 0.16,
        metalness: 0.48,
        transparent: true,
        opacity: 0.85,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });
      scene.add(buildMergedRibbonMesh(streamLines, 0.14, streamMat));
    }

    // Authentic German white-and-black roadside reflector posts (Leitpfosten) along main Landstraßen!
    const postPositions: [number, number][] = [];
    for (const r of mainPaved) {
      for (let i = 0; i < r.pts.length - 1; i++) {
        const a = r.pts[i];
        const b = r.pts[i + 1];
        const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (dist < 18) continue;
        const steps = Math.max(1, Math.floor(dist / 36));
        const nx = -(b[1] - a[1]) / dist;
        const nz = (b[0] - a[0]) / dist;
        for (let s = 1; s <= steps; s++) {
          const t = s / (steps + 1);
          const mx = a[0] + (b[0] - a[0]) * t;
          const mz = a[1] + (b[1] - a[1]) * t;
          if (Math.hypot(mx - REAL_SPOTS.muensingChurch.x, mz - REAL_SPOTS.muensingChurch.z) < 65) continue;
          postPositions.push([mx + nx * 5.4, mz + nz * 5.4]);
          postPositions.push([mx - nx * 5.4, mz - nz * 5.4]);
        }
      }
    }
    if (postPositions.length > 0) {
      const lpGeo = new THREE.BoxGeometry(0.14, 0.95, 0.08);
      const lpMat = new THREE.MeshStandardMaterial({ color: 0xf4f6f4, roughness: 0.55 });
      const lpCapGeo = new THREE.BoxGeometry(0.15, 0.22, 0.09);
      const lpCapMat = new THREE.MeshStandardMaterial({ color: 0x1c1e20, roughness: 0.65 });
      const lpInst = new THREE.InstancedMesh(lpGeo, lpMat, postPositions.length);
      const capInst = new THREE.InstancedMesh(lpCapGeo, lpCapMat, postPositions.length);
      const dummy = new THREE.Object3D();
      postPositions.forEach(([px, pz], idx) => {
        const gy = getTerrainHeight(px, pz);
        dummy.position.set(px, gy + 0.46, pz);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        lpInst.setMatrixAt(idx, dummy.matrix);
        dummy.position.set(px, gy + 0.72, pz);
        dummy.updateMatrix();
        capInst.setMatrixAt(idx, dummy.matrix);
      });
      lpInst.instanceMatrix.needsUpdate = true;
      capInst.instanceMatrix.needsUpdate = true;
      scene.add(lpInst, capInst);
    }

    // Authentic German Yellow Ortsschilder at Münsing, Wimpasing, Ammerland & Weipertshausen!
    this.addTownSign(scene, 'Münsing', 'Lkr. Bad Tölz-Wolfratshausen', 1245, 998, -Math.PI / 2);
    this.addTownSign(scene, 'Wimpasing', 'Gemeinde Münsing', -222, 854, Math.PI / 2);
    this.addTownSign(scene, 'Ammerland', 'Starnberger See · 584m', -940, 745, Math.PI / 2);
    this.addTownSign(scene, 'Weipertshausen', 'Gemeinde Münsing', 504, -1140, 0.1);
  }

  private addTownSign(scene: THREE.Scene, title: string, sub: string, x: number, z: number, rotY: number): void {
    const gy = getTerrainHeight(x, z);
    const g = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.08, 2.9, 8),
      new THREE.MeshStandardMaterial({ color: 0x62686e, roughness: 0.5, metalness: 0.5 })
    );
    pole.position.y = 1.45;
    g.add(pole);

    const tex = makeSignTexture(320, 140, '#f2c016', '#16181a', title, sub, '#121416');
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 1.08, 0.08),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.52 })
    );
    board.position.y = 2.45;
    g.add(board);

    g.position.set(x, gy, z);
    g.rotation.y = rotY;
    scene.add(g);
  }

  /**
   * Renders all ~850 real OSM buildings using 4 rich, authentic Upper Bavarian archetypes (predominantly brown-timber
   * & red-gable-roof Einfirsthöfe, dark larch Bauernhäuser, weathered timber Stadel barns, and warm ochre Landhäuser)
   * with true overhanging Satteldach gable roofs and chimneys — zero repetitive white boxes!
   */
  private buildRealBavarianBuildings(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    const pavedSegs: [number, number, number, number, number][] = [];
    for (const r of OSM_DATA.roads) {
      if (r.hw === 'track' || r.hw === 'service') continue;
      const hw = r.hw === 'secondary' || r.hw === 'tertiary' ? 5.6 : 4.2;
      for (let i = 0; i < r.pts.length - 1; i++) {
        pavedSegs.push([r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1], hw]);
      }
    }

    type BItem = { x: number; z: number; w: number; d: number; h: number; rot: number; arch: 'einfirsthof' | 'timber' | 'barn' | 'landhaus' };
    const buckets: Record<BItem['arch'], BItem[]> = {
      einfirsthof: [],
      timber: [],
      barn: [],
      landhaus: []
    };

    OSM_DATA.buildings.forEach((b, idx) => {
      if (Math.abs(b.x - FARM_CENTER.x) < 52 && Math.abs(b.z - FARM_CENTER.z) < 48) return;
      if (b.type === 'church' || b.type === 'castle') return;
      if (Math.hypot(b.x - REAL_SPOTS.muensingChurch.x, b.z - REAL_SPOTS.muensingChurch.z) < 28) return;
      if (Math.hypot(b.x - REAL_SPOTS.muensingAltwirt.x, b.z - REAL_SPOTS.muensingAltwirt.z) < 24) return;
      if (Math.hypot(b.x - REAL_SPOTS.schlossAmmerland.x, b.z - REAL_SPOTS.schlossAmmerland.z) < 32) return;
      if (Math.hypot(b.x - REAL_SPOTS.sebaldPier.x, b.z - REAL_SPOTS.sebaldPier.z) < 36) return;
      // Keep scenic paved fast-travel viewpoints completely clear
      if (Math.hypot(b.x - 1352, b.z - 984) < 16) return;
      if (Math.hypot(b.x - -978, b.z - 702) < 20) return;
      if (Math.hypot(b.x - 496, b.z - -1189) < 18) return;

      // True 1:1 meter building footprints matching real 1:1 UTM32 OSM streets!
      const w = THREE.MathUtils.clamp(b.w * 0.96, 6.0, 32);
      const d = THREE.MathUtils.clamp(b.d * 0.96, 5.2, 24);
      const approxR = Math.min(w, d) * 0.45;

      for (const [ax, az, bx, bz, hw] of pavedSegs) {
        const minClear = hw + approxR;
        if (pointToSegmentDistSq(b.x, b.z, ax, az, bx, bz) < minClear * minClear) return;
      }

      let arch: BItem['arch'];
      if (b.type === 'barn') {
        arch = 'barn';
      } else {
        const roll = (idx * 37 + Math.abs(Math.round(b.x))) % 100;
        if (roll < 42) arch = 'einfirsthof'; // Signature Upper Bavarian brown-timber + cream-base farmhouse!
        else if (roll < 70) arch = 'timber'; // Full warm dark-brown larch timber home!
        else if (roll < 82) arch = 'barn'; // Timber outbuilding / Stadel
        else arch = 'landhaus'; // Warm ochre / apricot village house
      }

      const h =
        arch === 'barn'
          ? 4.6 + (idx % 2) * 1.1
          : arch === 'einfirsthof'
            ? 5.6 + (idx % 3) * 0.85
            : 5.0 + (idx % 3) * 0.95;

      buckets[arch].push({ x: b.x, z: b.z, w, d, h, rot: b.rot, arch });
    });

    const wallGeo = new THREE.BoxGeometry(1, 1, 1);
    const roofGeo = createBavarianGableRoofGeometry();
    const chimneyGeo = new THREE.BoxGeometry(0.65, 1.4, 0.65);
    const tileTex = createTileRoofTexture();

    const roofPalette = [0xc25434, 0xb14528, 0xa23c24, 0x8f3a25, 0x623b2c];
    const tintPalettes: Record<BItem['arch'], number[]> = {
      einfirsthof: [0xffffff, 0xf8f0e2, 0xf5e8d4, 0xfff8ec],
      timber: [0xffffff, 0xefd7be, 0xe4c7a8, 0xd9b998],
      barn: [0xffffff, 0xe8d5c2, 0xdcc5af],
      landhaus: [0xfff4df, 0xf6e2bc, 0xf2d9b8, 0xeee6d4]
    };

    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    const allChimneys: { x: number; y: number; z: number; rot: number }[] = [];

    (Object.keys(buckets) as BItem['arch'][]).forEach((arch) => {
      const list = buckets[arch];
      if (list.length === 0) return;

      const wallMat = new THREE.MeshStandardMaterial({
        map: createBavarianArchetypeTexture(arch),
        roughness: arch === 'barn' || arch === 'timber' ? 0.9 : 0.84,
        metalness: 0.02
      });
      const roofMat = new THREE.MeshStandardMaterial({
        map: tileTex,
        roughness: 0.78,
        metalness: 0.06
      });

      const wallInst = new THREE.InstancedMesh(wallGeo, wallMat, list.length);
      const roofInst = new THREE.InstancedMesh(roofGeo, roofMat, list.length);
      wallInst.castShadow = true;
      wallInst.receiveShadow = true;
      roofInst.castShadow = true;

      const tints = tintPalettes[arch];

      list.forEach((b, idx) => {
        const gy = getTerrainHeight(b.x, b.z);
        // Embed foundation 1.8m into sloped Bavarian terrain so NO house ever floats!
        dummy.position.set(b.x, gy + b.h * 0.5 - 0.85, b.z);
        dummy.rotation.set(0, b.rot, 0);
        dummy.scale.set(b.w, b.h + 1.7, b.d);
        dummy.updateMatrix();
        wallInst.setMatrixAt(idx, dummy.matrix);

        col.setHex(tints[idx % tints.length]);
        wallInst.setColorAt(idx, col);

        // True overhanging Bavarian gable roof aligned along the building's longer axis!
        const roofH = Math.min(3.6, Math.min(b.w, b.d) * 0.34);
        const ridgeRot = b.w >= b.d ? b.rot : b.rot + Math.PI / 2;
        const rSpanX = Math.max(b.w, b.d);
        const rSpanZ = Math.min(b.w, b.d);

        dummy.position.set(b.x, gy + b.h - 0.08, b.z);
        dummy.rotation.set(0, ridgeRot, 0);
        dummy.scale.set(rSpanX, roofH, rSpanZ);
        dummy.updateMatrix();
        roofInst.setMatrixAt(idx, dummy.matrix);

        col.setHex(roofPalette[(idx * 3 + arch.length) % roofPalette.length]);
        roofInst.setColorAt(idx, col);

        if (arch !== 'barn' && idx % 2 === 0) {
          allChimneys.push({
            x: b.x + Math.cos(ridgeRot) * rSpanX * 0.22,
            y: gy + b.h + roofH * 0.72,
            z: b.z - Math.sin(ridgeRot) * rSpanX * 0.22,
            rot: ridgeRot
          });
        }

        // Solid physics colliders for key hubs so driving feels genuinely physical
        const nearHub =
          Math.hypot(b.x - REAL_SPOTS.muensingAltwirt.x, b.z - REAL_SPOTS.muensingAltwirt.z) < 160 ||
          Math.hypot(b.x - REAL_SPOTS.wimpasing.x, b.z - REAL_SPOTS.wimpasing.z) < 120 ||
          Math.hypot(b.x - REAL_SPOTS.sebaldPier.x, b.z - REAL_SPOTS.sebaldPier.z) < 120 ||
          Math.hypot(b.x - REAL_SPOTS.weipertshausen.x, b.z - REAL_SPOTS.weipertshausen.z) < 100;
        if (nearHub) {
          this.addStaticBox(world, groundMat, b.x, gy + b.h * 0.5, b.z, b.w, b.h, b.d, b.rot);
        }
      });

      wallInst.instanceMatrix.needsUpdate = true;
      roofInst.instanceMatrix.needsUpdate = true;
      if (wallInst.instanceColor) wallInst.instanceColor.needsUpdate = true;
      if (roofInst.instanceColor) roofInst.instanceColor.needsUpdate = true;
      scene.add(wallInst, roofInst);
    });

    if (allChimneys.length > 0) {
      const chimMat = new THREE.MeshStandardMaterial({ color: 0x8f4330, roughness: 0.88 });
      const chimInst = new THREE.InstancedMesh(chimneyGeo, chimMat, allChimneys.length);
      allChimneys.forEach((ch, idx) => {
        dummy.position.set(ch.x, ch.y, ch.z);
        dummy.rotation.set(0, ch.rot, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        chimInst.setMatrixAt(idx, dummy.matrix);
      });
      chimInst.instanceMatrix.needsUpdate = true;
      scene.add(chimInst);
    }
  }

  /**
   * Photo-referenced hero landmarks at exact GPS coordinates:
   * 1. Pfarrkirche St. Mariä Himmelfahrt (modeled directly from real 2023 Am Kirchberg 2 photo!)
   * 2. Gasthaus & Metzgerei Zum Altwirt + Chestnut-Shaded Biergarten & Münsing Maibaum
   * 3. Schloss Ammerland (authentic 1685 lakeside baroque palace with TWO copper Zwiebeltürme!)
   * 4. Fischereihofladen & Bootsverleih Sebald + 58m Wooden Pier, Rowboats & Sailboats
   */
  private buildHeroLandmarks(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    const tileTex = createTileRoofTexture();
    const gableGeo = createBavarianGableRoofGeometry();

    // === 1. PFARRKIRCHE ST. MARIÄ HIMMELFAHRT AT REAL GPS (830.8, 657.7) ===
    {
      const cx = REAL_SPOTS.muensingChurch.x;
      const cz = REAL_SPOTS.muensingChurch.z;
      const gy = getTerrainHeight(cx, cz);

      const stucco = new THREE.MeshStandardMaterial({ color: 0xf4f0e6, roughness: 0.84 });
      const tileRed = new THREE.MeshStandardMaterial({ map: tileTex, color: 0xca5a3b, roughness: 0.78 });
      const verdigrisCopper = new THREE.MeshStandardMaterial({ color: 0x335e50, roughness: 0.38, metalness: 0.48 });
      const gold = new THREE.MeshStandardMaterial({ color: 0xe8bd42, roughness: 0.2, metalness: 0.9 });
      const oakMat = new THREE.MeshStandardMaterial({ color: 0x4d311c, roughness: 0.86 });
      const louverMat = new THREE.MeshStandardMaterial({ color: 0x262928, roughness: 0.9 });

      // Baroque Hall Nave (Saalbau)
      const nave = new THREE.Mesh(new THREE.BoxGeometry(20, 9.6, 10.6), stucco);
      nave.position.set(cx, gy + 4.2, cz);
      nave.castShadow = true;
      nave.receiveShadow = true;
      scene.add(nave);
      this.addStaticBox(world, groundMat, cx, gy + 4.8, cz, 20, 9.6, 10.6);

      // Steep terracotta gable roof over nave
      const naveRoof = new THREE.Mesh(gableGeo, tileRed);
      naveRoof.position.set(cx, gy + 8.95, cz);
      naveRoof.scale.set(20.6, 5.4, 11.2);
      naveRoof.castShadow = true;
      scene.add(naveRoof);

      // Indented octagonal late-Gothic East Choir Apse (exact match to 2023 photo!)
      const apse = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 8.8, 6), stucco);
      apse.position.set(cx + 11.2, gy + 3.9, cz);
      apse.castShadow = true;
      scene.add(apse);
      const apseRoof = new THREE.Mesh(new THREE.ConeGeometry(4.9, 4.2, 6), tileRed);
      apseRoof.position.set(cx + 11.2, gy + 10.3, cz);
      apseRoof.castShadow = true;
      scene.add(apseRoof);

      // Arched stained-glass nave windows + oak west portal & copper canopy
      for (const side of [-1, 1]) {
        for (const wx of [-6.2, -2.1, 2.1, 6.2]) {
          const wMesh = new THREE.Mesh(new THREE.BoxGeometry(1.15, 3.3, 0.18), this.warmWindowMat);
          wMesh.position.set(cx + wx, gy + 5.1, cz + side * 5.34);
          scene.add(wMesh);
          const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.18, 12), this.warmWindowMat);
          arch.rotation.x = Math.PI / 2;
          arch.position.set(cx + wx, gy + 6.75, cz + side * 5.34);
          scene.add(arch);
        }
      }
      const portal = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.8, 2.5), oakMat);
      portal.position.set(cx - 10.05, gy + 1.9, cz);
      scene.add(portal);

      // Iconic Tall Southern Bell Tower (square shaft -> octagonal belfry -> plump dark-verdigris fluted Zwiebelturm!)
      const tx = cx + 5.5;
      const tz = cz + 6.6;
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(5.2, 16.5, 5.2), stucco);
      shaft.position.set(tx, gy + 7.8, tz);
      shaft.castShadow = true;
      scene.add(shaft);
      this.addStaticBox(world, groundMat, tx, gy + 8.2, tz, 5.2, 16.5, 5.2);

      // Octagonal white upper belfry with dark louvered arched sound-holes & clock dials!
      const belfry = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.85, 9.2, 8), stucco);
      belfry.position.set(tx, gy + 20.5, tz);
      belfry.castShadow = true;
      scene.add(belfry);

      const clockMat = new THREE.MeshStandardMaterial({ map: createClockTexture(), roughness: 0.4 });
      for (const [ox, oz, ry] of [
        [0, 2.82, 0],
        [0, -2.82, Math.PI],
        [2.82, 0, Math.PI / 2],
        [-2.82, 0, -Math.PI / 2]
      ]) {
        const face = new THREE.Mesh(new THREE.CircleGeometry(0.95, 18), clockMat);
        face.position.set(tx + ox, gy + 18.2, tz + oz);
        face.rotation.y = ry;
        scene.add(face);
        const louver = new THREE.Mesh(new THREE.BoxGeometry(0.85, 2.2, 0.16), louverMat);
        louver.position.set(tx + ox * 0.96, gy + 21.8, tz + oz * 0.96);
        louver.rotation.y = ry;
        scene.add(louver);
      }

      // Authentic plump fluted dark-verdigris copper onion dome (matching 2023 reference photo!)
      const onionPts = [
        new THREE.Vector2(0.01, 7.6),
        new THREE.Vector2(0.28, 6.2),
        new THREE.Vector2(1.05, 5.2),
        new THREE.Vector2(2.65, 4.1),
        new THREE.Vector2(3.55, 2.6),
        new THREE.Vector2(3.35, 1.15),
        new THREE.Vector2(2.65, 0)
      ];
      const onion = new THREE.Mesh(new THREE.LatheGeometry(onionPts, 16), verdigrisCopper);
      onion.position.set(tx, gy + 25.0, tz);
      onion.castShadow = true;
      scene.add(onion);

      // Shiny gold orb & cross finial
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), gold);
      orb.position.set(tx, gy + 32.8, tz);
      scene.add(orb);
      const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.7, 0.14), gold);
      crossV.position.set(tx, gy + 34.0, tz);
      scene.add(crossV);
      const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.14, 0.14), gold);
      crossH.position.set(tx, gy + 34.25, tz);
      scene.add(crossH);

      // Cream-plaster Kirchhofmauer (Churchyard Retaining Wall) tucked cleanly along the church edge (clear of Weipertshausener Str.!)
      const wallMat = new THREE.MeshStandardMaterial({ color: 0xddd4c2, roughness: 0.92 });
      const wallSeg = new THREE.Mesh(new THREE.BoxGeometry(19, 1.8, 0.58), wallMat);
      wallSeg.position.set(cx + 1, gy + 0.6, cz + 8.9);
      wallSeg.castShadow = true;
      wallSeg.receiveShadow = true;
      scene.add(wallSeg);
      const wallCap = new THREE.Mesh(new THREE.BoxGeometry(19.4, 0.2, 0.78), oakMat);
      wallCap.position.set(cx + 1, gy + 1.56, cz + 8.9);
      scene.add(wallCap);
    }

    // === 2. HERO GASTHAUS "ZUM ALTWIRT" INN, CHESTNUT BIERGARTEN & MÜNSING MAIBAUM ===
    {
      const ax = REAL_SPOTS.muensingAltwirt.x + 2;
      const az = REAL_SPOTS.muensingAltwirt.z + 4;
      const gy = getTerrainHeight(ax, az);

      const innMat = new THREE.MeshStandardMaterial({
        map: createBavarianArchetypeTexture('landhaus'),
        color: 0xfbe8c4,
        roughness: 0.84
      });
      const innRoofMat = new THREE.MeshStandardMaterial({ map: tileTex, color: 0xaa4428, roughness: 0.78 });
      const darkWood = new THREE.MeshStandardMaterial({ color: 0x4c2f19, roughness: 0.88 });

      const innBody = new THREE.Mesh(new THREE.BoxGeometry(16.5, 7.6, 11.0), innMat);
      innBody.position.set(ax, gy + 3.2, az);
      innBody.castShadow = true;
      innBody.receiveShadow = true;
      scene.add(innBody);
      this.addStaticBox(world, groundMat, ax, gy + 3.6, az, 16.5, 7.6, 11.0);

      // Broad low-pitched Upper Bavarian overhanging gable roof!
      const innRoof = new THREE.Mesh(gableGeo, innRoofMat);
      innRoof.position.set(ax, gy + 6.95, az);
      innRoof.scale.set(17.5, 4.1, 12.2);
      innRoof.castShadow = true;
      scene.add(innRoof);

      // Carved dark-timber Bavarian front balcony
      const balc = new THREE.Mesh(new THREE.BoxGeometry(7.2, 1.05, 1.45), darkWood);
      balc.position.set(ax, gy + 4.3, az - 5.9);
      balc.castShadow = true;
      scene.add(balc);

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
        new THREE.BoxGeometry(7.2, 1.55, 0.16),
        new THREE.MeshStandardMaterial({ map: altTex, roughness: 0.45 })
      );
      signBoard.position.set(ax, gy + 6.0, az - 5.64);
      signBoard.rotation.y = Math.PI;
      scene.add(signBoard);

      // Blue-and-white Bavarian Biergarten Parasols right outside Zum Altwirt!
      const umbrellaMat = new THREE.MeshStandardMaterial({ color: 0x2679c2, roughness: 0.72 });
      const whitePole = new THREE.MeshStandardMaterial({ color: 0xeeeae0, roughness: 0.6 });
      for (const [ux, uz] of [
        [ax - 9.5, az - 6.5],
        [ax - 4.0, az - 8.5],
        [ax + 2.5, az - 8.5]
      ]) {
        const uy = getTerrainHeight(ux, uz);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.8, 8), whitePole);
        pole.position.set(ux, uy + 1.4, uz);
        scene.add(pole);
        const canopy = new THREE.Mesh(new THREE.ConeGeometry(2.1, 0.75, 8), umbrellaMat);
        canopy.position.set(ux, uy + 2.75, uz);
        canopy.castShadow = true;
        scene.add(canopy);
      }

      // Tall Blue-and-White Münsing Maibaum standing proudly on the village square between Church & Altwirt!
      const mx = REAL_SPOTS.muensingChurch.x + 36;
      const mz = REAL_SPOTS.muensingChurch.z + 32;
      const my = getTerrainHeight(mx, mz);
      const g = new THREE.Group();
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.3, 17, 14),
        new THREE.MeshStandardMaterial({ map: createMaibaumTexture(), roughness: 0.42 })
      );
      pole.position.y = 8.5;
      pole.castShadow = true;
      g.add(pole);

      const wreath = new THREE.Mesh(
        new THREE.TorusGeometry(1.35, 0.28, 10, 18),
        new THREE.MeshStandardMaterial({ color: 0x2d6630, roughness: 0.88 })
      );
      wreath.rotation.x = Math.PI / 2;
      wreath.position.y = 13.8;
      g.add(wreath);

      const crown = new THREE.Mesh(
        new THREE.ConeGeometry(1.05, 2.6, 8),
        new THREE.MeshStandardMaterial({ color: 0x2d6630, roughness: 0.88 })
      );
      crown.position.y = 17.8;
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
        height: 17
      });
    }

    // === 3. SCHLOSS AMMERLAND AT REAL GPS (-743.6, 520.4) — AUTHENTIC 1685 PALACE WITH TWIN ONION TOWERS! ===
    {
      const sx = REAL_SPOTS.schlossAmmerland.x;
      const sz = REAL_SPOTS.schlossAmmerland.z;
      const gy = Math.max(WATER_LEVEL + 1.2, getTerrainHeight(sx, sz));

      const castlePlaster = new THREE.MeshStandardMaterial({
        map: createBavarianArchetypeTexture('landhaus'),
        color: 0xf7e7c4,
        roughness: 0.8
      });
      const towerPlaster = new THREE.MeshStandardMaterial({ color: 0xf5e8cb, roughness: 0.82 });
      const tileRed = new THREE.MeshStandardMaterial({ map: tileTex, color: 0xb4482c, roughness: 0.78 });
      const verdigrisCopper = new THREE.MeshStandardMaterial({ color: 0x3b7660, roughness: 0.36, metalness: 0.48 });

      const keep = new THREE.Mesh(new THREE.BoxGeometry(15, 11.2, 22), castlePlaster);
      keep.position.set(sx, gy + 5.0, sz);
      keep.castShadow = true;
      keep.receiveShadow = true;
      scene.add(keep);
      this.addStaticBox(world, groundMat, sx, gy + 5.4, sz, 15, 11.2, 22);

      const roof = new THREE.Mesh(gableGeo, tileRed);
      roof.position.set(sx, gy + 10.55, sz);
      roof.rotation.y = Math.PI / 2;
      roof.scale.set(22.6, 4.6, 15.6);
      roof.castShadow = true;
      scene.add(roof);

      // Authentic TWO prominent copper onion-domed lakeside towers (Zwiebeltürme) of Caspar Feichtmayr's 1685 Schloss Ammerland!
      const castleOnionPts = [
        new THREE.Vector2(0.01, 5.2),
        new THREE.Vector2(0.24, 4.2),
        new THREE.Vector2(0.95, 3.4),
        new THREE.Vector2(2.2, 2.3),
        new THREE.Vector2(2.35, 1.0),
        new THREE.Vector2(1.85, 0)
      ];
      const castleOnionGeo = new THREE.LatheGeometry(castleOnionPts, 16);
      for (const oz of [-10.2, 10.2]) {
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.85, 2.0, 14.5, 12), towerPlaster);
        tower.position.set(sx - 6.8, gy + 6.8, sz + oz);
        tower.castShadow = true;
        scene.add(tower);

        const cap = new THREE.Mesh(castleOnionGeo, verdigrisCopper);
        cap.position.set(sx - 6.8, gy + 14.0, sz + oz);
        cap.castShadow = true;
        scene.add(cap);
      }

      const stex = makeSignTexture(384, 96, '#2e241b', '#e5be49', 'SCHLOSS AMMERLAND', 'STARNBERGER SEE · 1685', '#faf4dc');
      const sboard = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.2, 0.12), new THREE.MeshStandardMaterial({ map: stex }));
      sboard.position.set(sx + 8.6, gy + 2.6, sz);
      sboard.rotation.y = Math.PI / 2;
      scene.add(sboard);
    }

    // === 4. FISCHEREIHOFLADEN & BOOTSVERLEIH SEBALD + 58M WOODEN PIER ON STARNBERGER SEE! ===
    {
      const px = REAL_SPOTS.sebaldPier.x;
      const pz = REAL_SPOTS.sebaldPier.z;
      const deckY = WATER_LEVEL + 0.72;
      const timber = new THREE.MeshStandardMaterial({ color: 0x6f4d2e, roughness: 0.9 });

      // Rustic weathered brown-timber lakeside fishhouse & boat rental shop north of pier!
      const shopX = px - 2;
      const shopZ = pz - 11.5;
      const shopY = Math.max(WATER_LEVEL + 0.8, getTerrainHeight(shopX, shopZ));
      const shop = new THREE.Mesh(
        new THREE.BoxGeometry(11.5, 4.8, 7.6),
        new THREE.MeshStandardMaterial({ map: createBavarianArchetypeTexture('timber'), roughness: 0.9 })
      );
      shop.position.set(shopX, shopY + 2.1, shopZ);
      shop.castShadow = true;
      shop.receiveShadow = true;
      scene.add(shop);
      this.addStaticBox(world, groundMat, shopX, shopY + 2.2, shopZ, 11.5, 4.8, 7.6);

      const shopRoof = new THREE.Mesh(gableGeo, new THREE.MeshStandardMaterial({ map: tileTex, color: 0xa84127, roughness: 0.8 }));
      shopRoof.position.set(shopX, shopY + 4.45, shopZ);
      shopRoof.scale.set(12.2, 2.8, 8.4);
      shopRoof.castShadow = true;
      scene.add(shopRoof);

      const sTex = makeSignTexture(
        420,
        112,
        '#194b6b',
        '#f4d03f',
        'FISCHEREI SEBALD',
        'BOOTSVERLEIH · BROTZEITGARTEN',
        '#ffffff',
        '#ffe580'
      );
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(5.6, 1.35, 0.1),
        new THREE.MeshStandardMaterial({ map: sTex, roughness: 0.5 })
      );
      sign.position.set(shopX, shopY + 3.5, shopZ + 3.9);
      scene.add(sign);

      // 58m Long Drivable Wooden Pier (Steg) jutting straight out over emerald Starnberger See!
      const pierLen = SEBALD_PIER.eastX - SEBALD_PIER.westX;
      const pierMidX = (SEBALD_PIER.eastX + SEBALD_PIER.westX) * 0.5;
      const pier = new THREE.Mesh(new THREE.BoxGeometry(pierLen, 0.3, SEBALD_PIER.halfWidth * 2), timber);
      pier.position.set(pierMidX, deckY, pz);
      pier.castShadow = true;
      pier.receiveShadow = true;
      scene.add(pier);
      this.addStaticBox(world, groundMat, pierMidX, deckY - 0.08, pz, pierLen, 0.36, SEBALD_PIER.halfWidth * 2);

      for (let x = SEBALD_PIER.eastX - 2; x >= SEBALD_PIER.westX + 2; x -= 7) {
        for (const oz of [-SEBALD_PIER.halfWidth + 0.35, SEBALD_PIER.halfWidth - 0.35]) {
          const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 4.4, 8), timber);
          pile.position.set(x, deckY - 1.0, pz + oz);
          scene.add(pile);
        }
      }

      // Gently bobbing white sailboats & wooden rowboats moored off Fischerei Sebald & Schloss Ammerland!
      const hullMat = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.35 });
      const sailMat = new THREE.MeshStandardMaterial({ color: 0xfffdf6, roughness: 0.65, side: THREE.DoubleSide });
      const boatCoords: [number, number, number][] = [
        [SEBALD_PIER.westX - 18, pz - 24, 0.35],
        [SEBALD_PIER.westX - 36, pz + 28, -0.25],
        [SEBALD_PIER.westX - 58, pz - 48, 0.7],
        [SEBALD_PIER.westX - 28, pz + 84, -0.5],
        [SEBALD_PIER.westX - 42, pz + 135, 0.15],
        [SEBALD_PIER.westX - 22, pz - 85, -0.6]
      ];
      boatCoords.forEach(([bx, bz, rot], idx) => {
        const boat = new THREE.Group();
        const hull = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.84, 5.2), hullMat);
        hull.position.y = 0.24;
        hull.castShadow = true;
        boat.add(hull);
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 7.0, 8), timber);
        mast.position.y = 3.7;
        boat.add(mast);
        const sailGeo = new THREE.BufferGeometry();
        sailGeo.setAttribute(
          'position',
          new THREE.BufferAttribute(new Float32Array([0, 0.9, 0, 0, 6.8, 0, 0, 1.2, 3.0]), 3)
        );
        sailGeo.computeVertexNormals();
        boat.add(new THREE.Mesh(sailGeo, sailMat));
        boat.position.set(bx, WATER_LEVEL + 0.06, bz);
        boat.rotation.y = rot;
        scene.add(boat);
        this.sailboats.push({
          group: boat,
          basePos: new THREE.Vector3(bx, WATER_LEVEL + 0.06, bz),
          phase: idx * 1.25,
          driftAmp: 2.8
        });
      });
    }
  }

  /**
   * Rich multi-species Upper Bavarian vegetation:
   * - 3-Tiered Dark Alpine Spruces (3 stacked bough cones per spruce — lush real forest silhouettes!)
   * - Multi-Cluster Broadleaf Oaks, Lindens & Chestnuts along lakeside gardens, village squares & road alleys!
   */
  private buildMultiSpeciesBavarianForests(scene: THREE.Scene): void {
    const roadSegs: [number, number, number, number][] = [];
    for (const r of OSM_DATA.roads) {
      if (r.hw === 'track' || r.hw === 'service') continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        roadSegs.push([r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]]);
      }
    }

    const isClearForTree = (tx: number, tz: number): boolean => {
      if (Math.abs(tx - FARM_CENTER.x) < 54 && Math.abs(tz - FARM_CENTER.z) < 52) return false;
      if (tx < getShorelineX(tz) + 4) return false;
      if (getTerrainHeight(tx, tz) < WATER_LEVEL + 0.6) return false;
      // Keep Sebald Pier corridor & Münsing central intersection cleanly framed
      if (tx < REAL_SPOTS.sebaldPier.x + 28 && tz > SEBALD_PIER.z - 28 && tz < SEBALD_PIER.z + 28) return false;
      if (Math.hypot(tx - REAL_SPOTS.muensingChurch.x, tz - REAL_SPOTS.muensingChurch.z) < 42) return false;
      if (Math.hypot(tx - REAL_SPOTS.muensingAltwirt.x, tz - REAL_SPOTS.muensingAltwirt.z) < 38) return false;
      for (const [ax, az, bx, bz] of roadSegs) {
        if (pointToSegmentDistSq(tx, tz, ax, az, bx, bz) < 14 * 14) return false;
      }
      return true;
    };

    const spruces: { x: number; z: number; s: number }[] = [];
    const oaks: { x: number; z: number; s: number }[] = [];

    // 1. Dense Real OSM Forest Polygons (70% 3-tier Alpine Spruces, 30% Broadleaf Beeches/Oaks)
    for (const f of OSM_DATA.forests) {
      const area = f.w * f.d;
      const count = Math.min(130, Math.max(16, Math.floor(area / 2200)));
      for (let i = 0; i < count; i++) {
        const tx = f.x + (Math.random() - 0.5) * f.w * 0.9;
        const tz = f.z + (Math.random() - 0.5) * f.d * 0.9;
        if (!isClearForTree(tx, tz)) continue;
        const s = 1.05 + Math.random() * 0.75;
        if (i % 10 < 7) spruces.push({ x: tx, z: tz, s });
        else oaks.push({ x: tx, z: tz, s: s * 0.95 });
      }
    }

    // 2. Scenic Bavarian Hedgerows & Broadleaf Meadow Groves across the full 3.8km x 2.9km valley!
    for (let i = 0; i < 420; i++) {
      const tx = -1020 + Math.random() * 2820;
      const tz = -1320 + Math.random() * 2650;
      if (!isClearForTree(tx, tz)) continue;
      const s = 1.0 + Math.random() * 0.75;
      if (i % 2 === 0) oaks.push({ x: tx, z: tz, s });
      else spruces.push({ x: tx, z: tz, s });
    }

    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x543822, roughness: 0.95 });

    // Instanced 3-Tiered Alpine Spruces (trunk + 3 stacked evergreen bough tiers!)
    if (spruces.length > 0) {
      const sTrunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.24, 0.42, 3.6, 6), trunkMat, spruces.length);
      const boughMat = new THREE.MeshStandardMaterial({ color: 0x2f5a2c, roughness: 0.92 });
      const tier1 = new THREE.InstancedMesh(new THREE.ConeGeometry(2.7, 4.0, 7), boughMat, spruces.length);
      const tier2 = new THREE.InstancedMesh(new THREE.ConeGeometry(2.1, 3.8, 7), boughMat, spruces.length);
      const tier3 = new THREE.InstancedMesh(new THREE.ConeGeometry(1.4, 3.4, 7), boughMat, spruces.length);
      tier1.castShadow = true;
      tier2.castShadow = true;

      spruces.forEach((t, idx) => {
        const gy = getTerrainHeight(t.x, t.z);
        dummy.rotation.set(0, idx * 1.3, 0);
        dummy.scale.setScalar(t.s);

        dummy.position.set(t.x, gy + 1.6 * t.s, t.z);
        dummy.updateMatrix();
        sTrunk.setMatrixAt(idx, dummy.matrix);

        dummy.position.set(t.x, gy + 4.0 * t.s, t.z);
        dummy.updateMatrix();
        tier1.setMatrixAt(idx, dummy.matrix);

        dummy.position.set(t.x, gy + 6.4 * t.s, t.z);
        dummy.updateMatrix();
        tier2.setMatrixAt(idx, dummy.matrix);

        dummy.position.set(t.x, gy + 8.6 * t.s, t.z);
        dummy.updateMatrix();
        tier3.setMatrixAt(idx, dummy.matrix);

        col.setHex(idx % 3 === 0 ? 0x264b24 : idx % 3 === 1 ? 0x305d2c : 0x3a6a33);
        tier1.setColorAt(idx, col);
        tier2.setColorAt(idx, col);
        tier3.setColorAt(idx, col);
      });

      sTrunk.instanceMatrix.needsUpdate = true;
      tier1.instanceMatrix.needsUpdate = true;
      tier2.instanceMatrix.needsUpdate = true;
      tier3.instanceMatrix.needsUpdate = true;
      if (tier1.instanceColor) tier1.instanceColor.needsUpdate = true;
      if (tier2.instanceColor) tier2.instanceColor.needsUpdate = true;
      if (tier3.instanceColor) tier3.instanceColor.needsUpdate = true;
      scene.add(sTrunk, tier1, tier2, tier3);
    }

    // Instanced Broadleaf Bavarian Oaks, Lindens & Chestnuts (trunk + organic twin foliage clusters!)
    if (oaks.length > 0) {
      const oTrunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.48, 3.8, 6), trunkMat, oaks.length);
      const leafMat = new THREE.MeshStandardMaterial({ color: 0x4f7d36, roughness: 0.88 });
      const canopyMain = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(2.8, 1), leafMat, oaks.length);
      const canopySide = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(2.0, 1), leafMat, oaks.length);
      canopyMain.castShadow = true;

      oaks.forEach((t, idx) => {
        const gy = getTerrainHeight(t.x, t.z);
        dummy.rotation.set(0, idx * 2.1, 0);
        dummy.scale.setScalar(t.s);

        dummy.position.set(t.x, gy + 1.8 * t.s, t.z);
        dummy.updateMatrix();
        oTrunk.setMatrixAt(idx, dummy.matrix);

        dummy.position.set(t.x, gy + 5.1 * t.s, t.z);
        dummy.scale.set(t.s * 1.15, t.s * 0.92, t.s * 1.1);
        dummy.updateMatrix();
        canopyMain.setMatrixAt(idx, dummy.matrix);

        const ang = idx * 1.7;
        dummy.position.set(t.x + Math.cos(ang) * 1.5 * t.s, gy + 4.4 * t.s, t.z + Math.sin(ang) * 1.5 * t.s);
        dummy.scale.setScalar(t.s * 0.95);
        dummy.updateMatrix();
        canopySide.setMatrixAt(idx, dummy.matrix);

        col.setHex(idx % 4 === 0 ? 0x4b7a33 : idx % 4 === 1 ? 0x5c8c3a : idx % 4 === 2 ? 0x3f6e2f : 0x6c963e);
        canopyMain.setColorAt(idx, col);
        canopySide.setColorAt(idx, col);
      });

      oTrunk.instanceMatrix.needsUpdate = true;
      canopyMain.instanceMatrix.needsUpdate = true;
      canopySide.instanceMatrix.needsUpdate = true;
      if (canopyMain.instanceColor) canopyMain.instanceColor.needsUpdate = true;
      if (canopySide.instanceColor) canopySide.instanceColor.needsUpdate = true;
      scene.add(oTrunk, canopyMain, canopySide);
    }
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
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x875c34, roughness: 0.88 });
    const darkPost = new THREE.MeshStandardMaterial({ color: 0x24282b, roughness: 0.6 });
    const ax = REAL_SPOTS.muensingAltwirt.x;
    const az = REAL_SPOTS.muensingAltwirt.z;
    const sx = REAL_SPOTS.sebaldPier.x;
    const sz = REAL_SPOTS.sebaldPier.z;

    const benchSpots: [number, number, number][] = [
      [ax - 7.5, az - 2.5, 0],
      [ax - 2.0, az - 4.5, 0],
      [ax + 4.5, az - 4.5, 0],
      [sx - 4, sz + 9, Math.PI / 2],
      [sx - 4, sz - 6, Math.PI / 2],
      [REAL_SPOTS.wimpasing.x + 8, REAL_SPOTS.wimpasing.z - 6, 0.3]
    ];
    for (const [bx, bz, rot] of benchSpots) {
      const g = new THREE.Group();
      const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.84), woodMat);
      top.position.y = 0.36;
      top.castShadow = true;
      g.add(top);
      for (const szOff of [-0.68, 0.68]) {
        const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.09, 0.3), woodMat);
        seat.position.set(0, 0.04, szOff);
        g.add(seat);
      }
      for (const sxOff of [-0.82, 0.82]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.72, 1.38), darkPost);
        leg.position.set(sxOff, 0, 0);
        g.add(leg);
      }
      this.addDynamicProp('bench', 'Biergarten Table', g, new CANNON.Vec3(1.1, 0.42, 0.8), 18, bx, bz, rot);
    }

    // Physical ~1.4-ton Bavarian Cars parked across Wimpasing, Ammerland, Münsing & Weipertshausen!
    const carConfigs: {
      name: string;
      color: number;
      x: number;
      z: number;
      rotY: number;
      isVan?: boolean;
      isPolizei?: boolean;
    }[] = [
      { name: 'Bayerische Polizei Car', color: 0xf4f6f8, x: REAL_SPOTS.muensingAltwirt.x - 24, z: REAL_SPOTS.muensingAltwirt.z - 16, rotY: 0.25, isPolizei: true },
      { name: 'Deutsche Post Van', color: 0xf5c414, x: REAL_SPOTS.muensingAltwirt.x + 28, z: REAL_SPOTS.muensingAltwirt.z - 18, rotY: Math.PI / 2, isVan: true },
      { name: 'Silver Bavarian Touring', color: 0xb6bec4, x: REAL_SPOTS.edeka.x - 10, z: REAL_SPOTS.edeka.z + 12, rotY: 0.1 },
      { name: 'Red Compact', color: 0xc93126, x: sx + 14, z: sz + 18, rotY: 0.15 },
      { name: 'Forest Green SUV', color: 0x2d5e3a, x: REAL_SPOTS.wimpasing.x + 18, z: REAL_SPOTS.wimpasing.z - 12, rotY: Math.PI / 2 },
      { name: 'Blue Sedan', color: 0x244878, x: 491, z: -1206, rotY: 0.2 },
      // Parked right outside Wimpasing Home Farm gate so you can immediately test lifting a 1.4-ton vehicle!
      { name: 'Old Farm Pickup', color: 0x9c3d28, x: FARM_CENTER.x + 16, z: FARM_CENTER.z + 35, rotY: 1.3 }
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
      [REAL_SPOTS.muensingAltwirt.x + 14, REAL_SPOTS.muensingAltwirt.z - 6],
      [REAL_SPOTS.muensingAltwirt.x - 9, REAL_SPOTS.muensingAltwirt.z + 12],
      [REAL_SPOTS.muensingChurch.x - 16, REAL_SPOTS.muensingChurch.z - 8],
      [REAL_SPOTS.sebaldPier.x - 2, REAL_SPOTS.sebaldPier.z + 18],
      [REAL_SPOTS.schlossAmmerland.x + 22, REAL_SPOTS.schlossAmmerland.z - 22],
      [REAL_SPOTS.wimpasing.x + 14, REAL_SPOTS.wimpasing.z + 12],
      [FARM_CENTER.x + 28, FARM_CENTER.z + 42]
    ];
    for (const [tx, tz] of treeSpots) {
      const ty = getTerrainHeight(tx, tz);
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 3.0, 8), trunkMat);
      trunk.position.y = 1.5;
      trunk.castShadow = true;
      g.add(trunk);
      const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(2.5, 1), leafBright);
      crown.position.y = 4.3;
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
        height: 6.2
      });
    }

    const lampSpots: [number, number][] = [
      [REAL_SPOTS.muensingChurch.x + 16, REAL_SPOTS.muensingChurch.z + 22],
      [REAL_SPOTS.muensingAltwirt.x - 8, REAL_SPOTS.muensingAltwirt.z - 18],
      [REAL_SPOTS.muensingAltwirt.x + 20, REAL_SPOTS.muensingAltwirt.z - 22],
      [REAL_SPOTS.sebaldPier.x + 8, REAL_SPOTS.sebaldPier.z + 10],
      [REAL_SPOTS.wimpasing.x + 10, REAL_SPOTS.wimpasing.z],
      [FARM_CENTER.x + 10, FARM_CENTER.z + 32]
    ];
    for (const [lx, lz] of lampSpots) {
      const ly = getTerrainHeight(lx, lz);
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 4.8, 8), ironMat);
      pole.position.y = 2.4;
      g.add(pole);
      const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.54, 0.42), this.lampBulbMat);
      lantern.position.y = 4.95;
      g.add(lantern);

      const pl = new THREE.PointLight(0xffcb78, 0, 26, 1.8);
      pl.position.set(0, 4.8, 0);
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
        height: 5.0
      });
    }
  }

  private buildPedestrians(): void {
    const jacketColors = [0x2d6638, 0xc9422c, 0x1b6db8, 0xdba624, 0x6b3e5e];
    const trouserMat = new THREE.MeshStandardMaterial({ color: 0x3b2c20, roughness: 0.9 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf2c59d, roughness: 0.75 });

    const spots: [number, number][] = [
      [REAL_SPOTS.muensingChurch.x + 22, REAL_SPOTS.muensingChurch.z + 24],
      [REAL_SPOTS.muensingAltwirt.x - 10, REAL_SPOTS.muensingAltwirt.z - 12],
      [REAL_SPOTS.muensingAltwirt.x + 16, REAL_SPOTS.muensingAltwirt.z - 14],
      [REAL_SPOTS.edeka.x - 6, REAL_SPOTS.edeka.z + 6],
      [REAL_SPOTS.sebaldPier.x - 4, REAL_SPOTS.sebaldPier.z + 8],
      [REAL_SPOTS.sebaldPier.x + 4, REAL_SPOTS.sebaldPier.z - 6],
      [REAL_SPOTS.schlossAmmerland.x + 18, REAL_SPOTS.schlossAmmerland.z + 4],
      [REAL_SPOTS.wimpasing.x + 6, REAL_SPOTS.wimpasing.z + 4],
      [REAL_SPOTS.wimpasing.x - 8, REAL_SPOTS.wimpasing.z - 6],
      [488, -1200]
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
        const disturbed =
          o.heldByTractor ||
          upVec.y < 0.72 ||
          o.body.position.y > getTerrainHeight(o.body.position.x, o.body.position.z) + 2.0;
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

      const inWater = o.body.position.y < WATER_LEVEL + 0.25 && o.body.position.x < getShorelineX(o.body.position.z) - 6;
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
      if (dist > 180) continue;

      if (p.tumbleTimer <= 0 && dist < 2.3 && Math.abs(tractorSpeed) > 1.2) {
        p.tumbleTimer = 1.2;
        p.panicTimer = 5.5;
        const pushDir = toTractor.normalize();
        p.tumbleVel.set(pushDir.x * 5.2, 4.2, pushDir.z * 5.2);
      }

      if (p.tumbleTimer > 0) {
        p.tumbleTimer -= dt;
        p.tumbleVel.y -= 13.5 * dt;
        p.pos.addScaledVector(p.tumbleVel, dt);
        const floorY = getTerrainHeight(p.pos.x, p.pos.z);
        if (p.pos.y < floorY) {
          p.pos.y = floorY;
          p.tumbleVel.y *= -0.25;
          p.tumbleVel.x *= 0.6;
          p.tumbleVel.z *= 0.6;
        }
        p.group.position.copy(p.pos);
        p.group.rotation.x += dt * 7.5;
        p.group.rotation.z += dt * 5.5;
        if (p.tumbleTimer <= 0) {
          p.group.rotation.set(0, p.wanderAngle, 0);
        }
        continue;
      }

      if (dist < 10.5 && Math.abs(tractorSpeed) > 2.2) {
        p.panicTimer = Math.max(p.panicTimer, 3.4);
      }

      if (p.panicTimer > 0) {
        p.panicTimer -= dt;
        const away = toTractor.lengthSq() > 0.01 ? toTractor.normalize() : new THREE.Vector3(1, 0, 0);
        p.vel.x = away.x * 4.5;
        p.vel.z = away.z * 4.5;
        p.wanderAngle = Math.atan2(away.x, away.z);
      } else {
        p.phase += dt * 0.7;
        const toHome = p.homePos.clone().sub(p.pos);
        toHome.y = 0;
        if (toHome.length() > 26) {
          p.wanderAngle = Math.atan2(toHome.x, toHome.z);
        } else if (Math.random() < dt * 0.45) {
          p.wanderAngle += (Math.random() - 0.5) * 1.4;
        }
        p.vel.x = Math.sin(p.wanderAngle) * 1.15;
        p.vel.z = Math.cos(p.wanderAngle) * 1.15;
      }

      p.pos.x += p.vel.x * dt;
      p.pos.z += p.vel.z * dt;
      p.pos.y = getTerrainHeight(p.pos.x, p.pos.z);
      p.group.position.copy(p.pos);
      p.group.rotation.y = p.wanderAngle;

      const stride = Math.sin(elapsed * (p.panicTimer > 0 ? 15 : 5.5) + p.phase) * (p.panicTimer > 0 ? 0.75 : 0.38);
      p.leftLeg.rotation.x = stride;
      p.rightLeg.rotation.x = -stride;
      p.leftArm.rotation.x = p.panicTimer > 0 ? -2.4 + stride * 0.4 : -stride * 0.7;
      p.rightArm.rotation.x = p.panicTimer > 0 ? -2.4 - stride * 0.4 : stride * 0.7;
    }
  }
}
