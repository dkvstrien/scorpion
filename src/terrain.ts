import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import muensingRaw from './data/muensingData.json';

export interface MuensingOSMData {
  meta: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
    scale: number;
    lakeElevationM: number;
    elevScale: number;
  };
  spots: {
    farm: [number, number];
    wimpasing: [number, number];
    sebaldPier: [number, number];
    schlossAmmerland: [number, number];
    ried: [number, number];
    muensingChurch: [number, number];
    muensingAltwirt: [number, number];
    edeka: [number, number];
    weipertshausen: [number, number];
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

// Near-1:1 Real-World Bounds (2.40 km x 1.73 km across Starnberger See -> Ammerland -> Wimpasing -> Ried -> Münsing -> Weipertshausen!)
export const WORLD_MIN_X = OSM_DATA.meta.minX;
export const WORLD_MAX_X = OSM_DATA.meta.maxX;
export const WORLD_MIN_Z = OSM_DATA.meta.minZ;
export const WORLD_MAX_Z = OSM_DATA.meta.maxZ;

export const FARM_CENTER = new THREE.Vector3(OSM_DATA.spots.farm[0], 0, OSM_DATA.spots.farm[1]);
export const WATER_LEVEL = -1.2;

// Real GPS landmarks projected directly into our 0.65x near-1:1 world
export const REAL_SPOTS = {
  farm: { x: OSM_DATA.spots.farm[0], z: OSM_DATA.spots.farm[1], label: 'Wimpasing Home Farm' },
  wimpasing: { x: OSM_DATA.spots.wimpasing[0], z: OSM_DATA.spots.wimpasing[1], label: 'Wimpasing' },
  sebaldPier: {
    x: OSM_DATA.spots.sebaldPier[0],
    z: OSM_DATA.spots.sebaldPier[1],
    label: 'Fischerei Sebald · Starnberger See'
  },
  schlossAmmerland: {
    x: OSM_DATA.spots.schlossAmmerland[0],
    z: OSM_DATA.spots.schlossAmmerland[1],
    label: 'Schloss Ammerland'
  },
  ried: { x: OSM_DATA.spots.ried[0], z: OSM_DATA.spots.ried[1], label: 'Ried' },
  muensingAltwirt: {
    x: OSM_DATA.spots.muensingAltwirt[0],
    z: OSM_DATA.spots.muensingAltwirt[1],
    label: 'Münsing · Gasthaus Zum Altwirt'
  },
  muensingChurch: {
    x: OSM_DATA.spots.muensingChurch[0],
    z: OSM_DATA.spots.muensingChurch[1],
    label: 'Münsing · St. Mariä Himmelfahrt'
  },
  edeka: { x: OSM_DATA.spots.edeka[0], z: OSM_DATA.spots.edeka[1], label: 'Münsing · EDEKA Graf' },
  weipertshausen: {
    x: OSM_DATA.spots.weipertshausen[0],
    z: OSM_DATA.spots.weipertshausen[1],
    label: 'Weipertshausen'
  }
};

// Fischerei Sebald wooden pier geometry bounds (drivable out onto emerald Starnberger See!)
export const SEBALD_PIER = {
  z: REAL_SPOTS.sebaldPier.z,
  eastX: REAL_SPOTS.sebaldPier.x - 10,
  westX: REAL_SPOTS.sebaldPier.x - 68,
  halfWidth: 3.4
};

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Exact Starnberger See eastern shoreline X coordinate measured along real Nördliche/Südliche Seestraße!
 */
export function getShorelineX(z: number): number {
  const pts: [number, number][] = [
    [-900, -845],
    [-660, -878],
    [-350, -885],
    [-100, -848],
    [240, -742],
    [426, -722],
    [520, -750],
    [670, -764],
    [880, -792]
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
 * Sample real SRTM elevation in meters above sea level (m ü. NN).
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
export const FARM_GROUND_Y = Math.max(0.8, (FARM_RAW_ELEV - 583.0) * 0.56 + 0.55);

/**
 * Continuous 3D world Y height in game meters driven directly by the real Münsing–Ammerland SRTM DEM!
 * - Gentle, realistic Bavarian moraine grades at 0.65x horizontal scale (so roads climb smoothly without steep kinks!)
 * - Clean emerald Starnberger See lake basin west of the real shoreline
 * - Crisp level carved terrace at Wimpasing Home Farm for realistic pallet & bale stacking
 */
export function getTerrainHeight(x: number, z: number): number {
  const elevM = getRealElevationMeters(x, z);
  let y = Math.max(0.5, (elevM - 583.0) * 0.56 + 0.5);

  // Carve smooth Starnberger See lake basin west of the real shoreline
  const shoreX = getShorelineX(z);
  const lakeDrop = smoothstep(shoreX + 8, shoreX - 42, x);
  y = y * (1 - lakeDrop) + (WATER_LEVEL - 3.6) * lakeDrop;

  // Flat level farmyard terrace around Wimpasing Home Farm
  const fdx = Math.abs(x - FARM_CENTER.x);
  const fdz = Math.abs(z - FARM_CENTER.z);
  const farmFlat = (1 - smoothstep(34, 58, fdx)) * (1 - smoothstep(32, 56, fdz));
  y = y * (1 - farmFlat) + FARM_GROUND_Y * farmFlat;

  return y;
}

export function getDrivableGroundY(x: number, z: number): number {
  if (
    x <= SEBALD_PIER.eastX + 2 &&
    x >= SEBALD_PIER.westX - 1 &&
    Math.abs(z - SEBALD_PIER.z) <= SEBALD_PIER.halfWidth
  ) {
    return Math.max(getTerrainHeight(x, z), WATER_LEVEL + 0.78);
  }
  return getTerrainHeight(x, z);
}

export function getTerrainNormal(x: number, z: number, target = new THREE.Vector3()): THREE.Vector3 {
  const eps = 1.2;
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
  if (Math.abs(x - FARM_CENTER.x) < 30 && Math.abs(z - FARM_CENTER.z) < 28) {
    if (Math.abs(x - FARM_CENTER.x) < 4.5 || Math.abs(z - FARM_CENTER.z) < 4.5) return 'mud';
    return 'gravel';
  }
  return 'grass';
}

export interface TerrainBuildResult {
  mesh: THREE.Group;
  body: CANNON.Body;
  waterMesh: THREE.Mesh;
}

/**
 * Builds 4 seamlessly stitched high-resolution terrain quadrants draped with official 20cm Bavaria
 * OpenData Aerial Orthophotos (`public/map/dop_nw/ne/sw/se.jpg`, 4096x2960 total resolution!),
 * plus a matching Cannon-es Heightfield, shimmering emerald Starnberger See water, and southern Bavarian Alps!
 */
export function buildRealMuensingTerrain(
  scene: THREE.Scene,
  world: CANNON.World,
  groundMat: CANNON.Material,
  detailBump: THREE.CanvasTexture,
  _meadowTex: THREE.CanvasTexture
): TerrainBuildResult {
  const group = new THREE.Group();
  const texLoader = new THREE.TextureLoader();

  const midX = (WORLD_MIN_X + WORLD_MAX_X) * 0.5;
  const midZ = (WORLD_MIN_Z + WORLD_MAX_Z) * 0.5;
  const halfW = (WORLD_MAX_X - WORLD_MIN_X) * 0.5;
  const halfD = (WORLD_MAX_Z - WORLD_MIN_Z) * 0.5;

  detailBump.repeat.set(60, 44);

  const quads: { file: string; minX: number; maxX: number; minZ: number; maxZ: number }[] = [
    { file: './map/dop_nw.jpg', minX: WORLD_MIN_X, maxX: midX, minZ: WORLD_MIN_Z, maxZ: midZ },
    { file: './map/dop_ne.jpg', minX: midX, maxX: WORLD_MAX_X, minZ: WORLD_MIN_Z, maxZ: midZ },
    { file: './map/dop_sw.jpg', minX: WORLD_MIN_X, maxX: midX, minZ: midZ, maxZ: WORLD_MAX_Z },
    { file: './map/dop_se.jpg', minX: midX, maxX: WORLD_MAX_X, minZ: midZ, maxZ: WORLD_MAX_Z }
  ];

  const segX = 88;
  const segZ = 66;

  for (const q of quads) {
    const cx = (q.minX + q.maxX) * 0.5;
    const cz = (q.minZ + q.maxZ) * 0.5;
    const geo = new THREE.PlaneGeometry(halfW, halfD, segX, segZ);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i) + cx;
      const wz = pos.getZ(i) + cz;
      pos.setY(i, getTerrainHeight(wx, wz));
    }
    geo.computeVertexNormals();

    const aerialTex = texLoader.load(q.file);
    aerialTex.colorSpace = THREE.SRGBColorSpace;
    aerialTex.anisotropy = 8;
    aerialTex.minFilter = THREE.LinearMipmapLinearFilter;
    aerialTex.wrapS = THREE.ClampToEdgeWrapping;
    aerialTex.wrapT = THREE.ClampToEdgeWrapping;

    const mat = new THREE.MeshStandardMaterial({
      map: aerialTex,
      roughness: 0.92,
      metalness: 0.02,
      bumpMap: detailBump,
      bumpScale: 0.22
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, 0, cz);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  scene.add(group);

  // Cannon-es Heightfield physics collider matching the exact 2.40km x 1.73km DEM terrain!
  const width = WORLD_MAX_X - WORLD_MIN_X;
  const depth = WORLD_MAX_Z - WORLD_MIN_Z;
  const hfStep = 14.0;
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

  // Shimmering Alpine Emerald-Blue Starnberger See stretching west toward Tutzing & Feldafing!
  // Slightly translucent near shore so the real aerial turquoise pebble shallows shine through!
  const waterGeo = new THREE.PlaneGeometry(1600, 2600, 32, 32);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x1d686c,
    roughness: 0.12,
    metalness: 0.52,
    transparent: true,
    opacity: 0.84
  });
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.set(-1525, WATER_LEVEL, 0);
  waterMesh.receiveShadow = true;
  scene.add(waterMesh);

  // Panoramic Bavarian Alps (Karwendel & Zugspitze) far on the southern horizon across Starnberger See!
  const alpRock = new THREE.MeshStandardMaterial({ color: 0x5c738c, roughness: 0.94, flatShading: true });
  const alpSnow = new THREE.MeshStandardMaterial({ color: 0xeef5fb, roughness: 0.85, flatShading: true });
  const alpPeaks: [number, number, number, number][] = [
    [-1280, 1550, 260, 310],
    [-760, 1680, 290, 365],
    [-220, 1740, 310, 410],
    [340, 1710, 295, 385],
    [880, 1640, 275, 345],
    [1380, 1560, 260, 305]
  ];
  for (const [ax, az, ar, ah] of alpPeaks) {
    const peak = new THREE.Mesh(new THREE.ConeGeometry(ar, ah, 6), alpRock);
    peak.position.set(ax, ah * 0.5 - 12, az);
    peak.rotation.y = ax * 0.01;
    scene.add(peak);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(ar * 0.38, ah * 0.38, 6), alpSnow);
    cap.position.set(ax, ah * 0.81 - 12, az);
    cap.rotation.y = ax * 0.01;
    scene.add(cap);
  }

  return { mesh: group, body, waterMesh };
}
