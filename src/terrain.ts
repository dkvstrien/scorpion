import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import muensingRaw from './data/muensingData.json';

export interface MuensingOSMData {
  meta: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    scale: number;
    lakeElevationM: number;
    elevScale: number;
  };
  elevation: {
    cols: number;
    rows: number;
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    values: number[];
  };
  roads: { hw: string; name: string; pts: [number, number][] }[];
  buildings: { x: number; z: number; w: number; d: number; rot: number; type: string; name: string }[];
  forests: { x: number; z: number; w: number; d: number }[];
  streams: { name: string; pts: [number, number][] }[];
  landmarks: { name: string; kind: string; x: number; z: number }[];
}

export const OSM_DATA = muensingRaw as unknown as MuensingOSMData;

export type SurfaceType = 'asphalt' | 'gravel' | 'grass' | 'mud' | 'water';

// Home Farmyard nestled right on the real open meadow in Wimpasing beside Münsinger Straße!
export const FARM_CENTER = new THREE.Vector3(75, 0, 175);
export const WATER_LEVEL = -1.1;

// Real GPS landmarks from the OpenStreetMap dataset
export const REAL_SPOTS = {
  farm: { x: 75, z: 175, label: 'Wimpasing Home Farm' },
  wimpasing: { x: -21.6, z: 194.3, label: 'Wimpasing' },
  sebaldPier: { x: -206, z: 125, label: 'Fischerei Sebald · Starnberger See' },
  schlossAmmerland: { x: -222.5, z: 163.5, label: 'Schloss Ammerland' },
  ried: { x: -3.1, z: 50.9, label: 'Ried' },
  muensingAltwirt: { x: 474.6, z: 240.0, label: 'Münsing · Gasthaus Zum Altwirt' },
  muensingChurch: { x: 456.6, z: 225.5, label: 'Münsing · St. Mariä Himmelfahrt' },
  edeka: { x: 516.7, z: 213.4, label: 'Münsing · EDEKA Graf' },
  weipertshausen: { x: 214.4, z: -401.7, label: 'Weipertshausen' }
};

// Terrain visual & physics grid bounds covering Starnberger See shore -> Ammerland -> Wimpasing -> Münsing -> Weipertshausen!
export const WORLD_MIN_X = -390;
export const WORLD_MAX_X = 650;
export const WORLD_MIN_Z = -435;
export const WORLD_MAX_Z = 305;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Real Starnberger See eastern shoreline X coordinate (follows real Nördliche/Südliche Seestraße from OSM!).
 */
export function getShorelineX(z: number): number {
  const pts: [number, number][] = [
    [-440, -258],
    [-260, -284],
    [-130, -264],
    [-30, -226],
    [78, -206],
    [130, -214],
    [170, -228],
    [245, -242],
    [320, -248]
  ];
  if (z <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    if (z <= pts[i + 1][0]) {
      const t = (z - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
      return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t;
    }
  }
  return pts[pts.length - 1][1];
}

/**
 * Sample real SRTM elevation in meters above sea level (m ü. NN) from Open-Elevation DEM grid.
 */
export function getRealElevationMeters(x: number, z: number): number {
  const { cols, rows, minX, maxX, minZ, maxZ, values } = OSM_DATA.elevation;
  const u = Math.max(0, Math.min(cols - 1.0001, ((x - minX) / (maxX - minX)) * (cols - 1)));
  const v = Math.max(0, Math.min(rows - 1.0001, ((z - minZ) / (maxZ - minZ)) * (rows - 1)));
  const ix = Math.floor(u);
  const iz = Math.floor(v);
  const fx = u - ix;
  const fz = v - iz;

  const e00 = values[iz * cols + ix];
  const e10 = values[iz * cols + ix + 1];
  const e01 = values[(iz + 1) * cols + ix];
  const e11 = values[(iz + 1) * cols + ix + 1];

  return (e00 * (1 - fx) + e10 * fx) * (1 - fz) + (e01 * (1 - fx) + e11 * fx) * fz;
}

const FARM_RAW_ELEV = getRealElevationMeters(FARM_CENTER.x, FARM_CENTER.z);
export const FARM_GROUND_Y = Math.max(0.6, (FARM_RAW_ELEV - 583.0) * 0.36 + 0.5);

/**
 * Continuous 3D world Y height in game meters, driven directly by the real Münsing–Ammerland DEM!
 * - Starnberger See sits cleanly west of the real Seestraße shoreline at WATER_LEVEL (-1.1m)
 * - Ammerland & Wimpasing sit dry at y ≈ +0.5m..+4m
 * - Driving east up Münsinger Straße climbs the REAL Bavarian moraine ridge up to y ≈ +25m in Münsing!
 * - Home Farmyard at (75, 175) has a crisp flat carved plateau for realistic pallet stacking!
 */
export function getTerrainHeight(x: number, z: number): number {
  const elevM = getRealElevationMeters(x, z);
  let y = Math.max(0.45, (elevM - 583.0) * 0.36 + 0.45);

  // Carve smooth Starnberger See lake basin west of the real Seestraße shoreline!
  const shoreX = getShorelineX(z);
  const lakeDrop = smoothstep(shoreX + 6, shoreX - 30, x);
  y = y * (1 - lakeDrop) + (WATER_LEVEL - 3.2) * lakeDrop;

  // Carve a crisp flat farmyard terrace around Wimpasing Home Farm (75, 175) so barns & pallet stacks are 100% level!
  const fdx = Math.abs(x - FARM_CENTER.x);
  const fdz = Math.abs(z - FARM_CENTER.z);
  const farmFlat = (1 - smoothstep(32, 48, fdx)) * (1 - smoothstep(30, 46, fdz));
  y = y * (1 - farmFlat) + FARM_GROUND_Y * farmFlat;

  return y;
}

export function getDrivableGroundY(x: number, z: number): number {
  // Wooden Fischerei Sebald Lakeside Pier (Steg) jutting out into Starnberger See at (-208..-244, 125)!
  if (x <= -206 && x >= -246 && Math.abs(z - 125) <= 3.0) {
    return Math.max(getTerrainHeight(x, z), WATER_LEVEL + 0.72);
  }
  return getTerrainHeight(x, z);
}

export function getTerrainNormal(x: number, z: number, target = new THREE.Vector3()): THREE.Vector3 {
  const eps = 0.8;
  const hL = getTerrainHeight(x - eps, z);
  const hR = getTerrainHeight(x + eps, z);
  const hD = getTerrainHeight(x, z - eps);
  const hU = getTerrainHeight(x, z + eps);
  target.set(hL - hR, 2 * eps, hD - hU).normalize();
  return target;
}

export function getSurfaceType(x: number, z: number): SurfaceType {
  const y = getTerrainHeight(x, z);
  if (y < WATER_LEVEL + 0.15) return 'water';
  if (Math.abs(x - FARM_CENTER.x) < 28 && Math.abs(z - FARM_CENTER.z) < 28) {
    if (Math.abs(x - FARM_CENTER.x) < 4.5 || Math.abs(z - FARM_CENTER.z) < 4.5) return 'mud';
    return 'gravel';
  }
  return 'grass';
}

export interface TerrainBuildResult {
  mesh: THREE.Mesh;
  body: CANNON.Body;
  waterMesh: THREE.Mesh;
}

export function buildRealMuensingTerrain(
  scene: THREE.Scene,
  world: CANNON.World,
  groundMat: CANNON.Material,
  detailBump: THREE.CanvasTexture,
  meadowTex: THREE.CanvasTexture
): TerrainBuildResult {
  const cols = 130;
  const rows = 92;
  const width = WORLD_MAX_X - WORLD_MIN_X;
  const depth = WORLD_MAX_Z - WORLD_MIN_Z;
  const centerX = (WORLD_MIN_X + WORLD_MAX_X) * 0.5;
  const centerZ = (WORLD_MIN_Z + WORLD_MAX_Z) * 0.5;

  const geo = new THREE.PlaneGeometry(width, depth, cols, rows);
  geo.rotateX(-Math.PI / 2);

  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(posAttr.count * 3);
  const c = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const wx = posAttr.getX(i) + centerX;
    const wz = posAttr.getZ(i) + centerZ;
    const wy = getTerrainHeight(wx, wz);
    posAttr.setY(i, wy);

    const n = Math.sin(wx * 0.035) * Math.cos(wz * 0.035) * 0.035;
    if (wy < WATER_LEVEL + 0.55) {
      // Starnberger See pale gravel pebble beach
      c.setRGB(0.62 + n, 0.58 + n, 0.47 + n);
    } else if (wy > 16) {
      // Sunlit Upper Bavarian Münsing moraine upland pasture
      c.setRGB(0.39 + n, 0.55 + n, 0.27 + n);
    } else {
      // Rich green Starnberger See lakeside & valley meadow
      c.setRGB(0.34 + n, 0.5 + n, 0.24 + n);
    }
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  meadowTex.repeat.set(65, 45);
  detailBump.repeat.set(55, 40);

  const terrainMat = new THREE.MeshStandardMaterial({
    map: meadowTex,
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.02,
    bumpMap: detailBump,
    bumpScale: 0.14
  });

  const mesh = new THREE.Mesh(geo, terrainMat);
  mesh.position.set(centerX, 0, centerZ);
  mesh.receiveShadow = true;
  scene.add(mesh);

  // Cannon-es Heightfield physics collider matching the exact DEM terrain!
  const hfStep = 8.0;
  const hfCols = Math.ceil(width / hfStep);
  const hfRows = Math.ceil(depth / hfStep);
  const matrix: number[][] = [];
  for (let ix = 0; ix <= hfCols; ix++) {
    const col: number[] = [];
    const wx = WORLD_MIN_X + ix * hfStep;
    for (let iz = 0; iz <= hfRows; iz++) {
      const wz = WORLD_MAX_Z - iz * hfStep;
      col.push(getTerrainHeight(wx, wz));
    }
    matrix.push(col);
  }
  const hfShape = new CANNON.Heightfield(matrix, { elementSize: hfStep });
  const body = new CANNON.Body({ mass: 0, material: groundMat });
  body.addShape(hfShape);
  body.position.set(WORLD_MIN_X, 0, WORLD_MAX_Z);
  body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(body);

  // Shimmering Reflective Starnberger See (Lake Starnberg) stretching far west toward Tutzing & Feldafing!
  const waterGeo = new THREE.PlaneGeometry(760, 1200, 32, 32);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x1e6082,
    roughness: 0.12,
    metalness: 0.56,
    transparent: true,
    opacity: 0.92
  });
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.set(-595, WATER_LEVEL, -60);
  waterMesh.receiveShadow = true;
  scene.add(waterMesh);

  // Panoramic Bavarian Alps (Karwendel & Zugspitze) far on the southern horizon across Starnberger See!
  const alpRock = new THREE.MeshStandardMaterial({ color: 0x5c738c, roughness: 0.94, flatShading: true });
  const alpSnow = new THREE.MeshStandardMaterial({ color: 0xeef5fb, roughness: 0.85, flatShading: true });
  const alpPeaks: [number, number, number, number][] = [
    [-540, 560, 120, 140],
    [-340, 620, 135, 168],
    [-120, 660, 145, 190],
    [120, 650, 140, 182],
    [360, 620, 135, 165],
    [590, 580, 125, 148]
  ];
  for (const [ax, az, ar, ah] of alpPeaks) {
    const peak = new THREE.Mesh(new THREE.ConeGeometry(ar, ah, 6), alpRock);
    peak.position.set(ax, ah * 0.5 - 6, az);
    peak.rotation.y = ax * 0.02;
    scene.add(peak);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(ar * 0.38, ah * 0.38, 6), alpSnow);
    cap.position.set(ax, ah * 0.81 - 6, az);
    cap.rotation.y = ax * 0.02;
    scene.add(cap);
  }

  return { mesh, body, waterMesh };
}
