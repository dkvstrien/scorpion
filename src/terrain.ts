import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import muensingRaw from './data/muensingData.json';
import { createWaterRippleBumpTexture } from './textures';

export interface MuensingOSMData {
  meta: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    originE: number;
    originN: number;
    scale: number;
    lakeElevationM: number;
    elevScale: number;
  };
  heightmap: {
    file: string;
    cols: number;
    rows: number;
    minElev: number;
    maxElev: number;
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
  farmlands?: { x: number; z: number; w: number; d: number; kind: string }[];
  streams: { name: string; pts: [number, number][] }[];
  landmarks: { name: string; kind: string; x: number; z: number }[];
}

export const OSM_DATA = muensingRaw as unknown as MuensingOSMData;

export type SurfaceType = 'asphalt' | 'gravel' | 'grass' | 'mud' | 'water';

// TRUE 1:1 METRIC UTM ZONE 32N (EPSG:25832) PLAYABLE WORLD (3,800 m x 2,900 m!)
export const WORLD_MIN_X = OSM_DATA.meta.minX;
export const WORLD_MAX_X = OSM_DATA.meta.maxX;
export const WORLD_MIN_Z = OSM_DATA.meta.minZ;
export const WORLD_MAX_Z = OSM_DATA.meta.maxZ;
export const LAKE_ELEV_M = OSM_DATA.meta.lakeElevationM;

export const FARM_CENTER = new THREE.Vector3(OSM_DATA.spots.farm[0], 0, OSM_DATA.spots.farm[1]);
// Open working gravel farmyard immediately west/southwest of the real farmhouse (-312.5, 909.6), clear of all LoD2 footprints
export const FARM_YARD_CENTER = new THREE.Vector3(OSM_DATA.spots.farm[0] - 33.5, 0, OSM_DATA.spots.farm[1] + 16.4);
// Default Scorpion spawn & respawn in the Home Farm yard, facing east toward the farmhouse & village road exit
export const FARM_SPAWN = {
  x: FARM_YARD_CENTER.x + 4.0,
  z: FARM_YARD_CENTER.z - 4.0,
  heading: -Math.PI / 2
};
export const WATER_LEVEL = 0.0;

export const REAL_SPOTS = {
  farm: { x: OSM_DATA.spots.farm[0], z: OSM_DATA.spots.farm[1], label: 'Home Farm' },
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

// Fischerei Sebald wooden pier (Steg) at true 1:1 scale on Starnberger See!
export const SEBALD_PIER = {
  z: REAL_SPOTS.sebaldPier.z,
  eastX: REAL_SPOTS.sebaldPier.x - 24,
  westX: REAL_SPOTS.sebaldPier.x - 86,
  halfWidth: 3.4
};

// Loaded high-res 381x291 road-graded Bavaria 1m LiDAR DGM1 grid (217 KB binary)
let dgmGrid: Float32Array | null = null;
let dgmCols = OSM_DATA.heightmap.cols;
let dgmRows = OSM_DATA.heightmap.rows;

export let FARM_GROUND_Y = 25.0;
export let FARM_EXIT_ROAD_Y = 25.0;
export let DEMO_GROUND_Y = 56.0;

/**
 * Loads the pre-baked 10m-resolution road-graded Bavaria DGM1 LiDAR heightmap (~12ms local fetch)
 * before world/buildings/tractor spawn so every object aligns to the exact LiDAR terrain!
 */
export async function initDgm1Heightmap(): Promise<void> {
  try {
    const res = await fetch(OSM_DATA.heightmap.file);
    if (res.ok) {
      const buf = await res.arrayBuffer();
      const packed = new Uint16Array(buf);
      const { cols, rows, minElev, maxElev } = OSM_DATA.heightmap;
      if (packed.length === cols * rows) {
        const span = maxElev - minElev;
        const f32 = new Float32Array(packed.length);
        for (let i = 0; i < packed.length; i++) {
          f32[i] = minElev + (packed[i] / 65535) * span;
        }
        dgmGrid = f32;
        dgmCols = cols;
        dgmRows = rows;
      }
    }
  } catch (err) {
    console.warn('DGM1 binary fallback to JSON preview grid:', err);
  }
  FARM_GROUND_Y = Math.max(1.2, getRealElevationMeters(FARM_YARD_CENTER.x, FARM_YARD_CENTER.z) - LAKE_ELEV_M);
  FARM_EXIT_ROAD_Y = Math.max(1.2, getRealElevationMeters(-277.6, 922.2) - LAKE_ELEV_M);
  DEMO_GROUND_Y = Math.max(1.2, getRealElevationMeters(165, 622) - LAKE_ELEV_M);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Exact 1:1 Starnberger See eastern shoreline X coordinate along real Nördliche/Südliche Seestraße!
 */
export function getShorelineX(z: number): number {
  const pts: [number, number][] = [
    [-1480, -1285],
    [-970, -1325],
    [-490, -1320],
    [-100, -1255],
    [415, -1065],
    [702, -1032],
    [849, -1062],
    [1080, -1085],
    [1460, -1125]
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
 * Sample true Bavaria 1m LiDAR DGM1 elevation in meters above sea level (m ü.NN).
 */
export function getRealElevationMeters(x: number, z: number): number {
  if (dgmGrid) {
    const u = Math.max(0, Math.min(dgmCols - 1.0001, ((x - WORLD_MIN_X) / (WORLD_MAX_X - WORLD_MIN_X)) * (dgmCols - 1)));
    const v = Math.max(0, Math.min(dgmRows - 1.0001, ((z - WORLD_MIN_Z) / (WORLD_MAX_Z - WORLD_MIN_Z)) * (dgmRows - 1)));
    const ix = Math.floor(u);
    const iz = Math.floor(v);
    const fx = u - ix;
    const fz = v - iz;
    const e00 = dgmGrid[iz * dgmCols + ix];
    const e10 = dgmGrid[iz * dgmCols + ix + 1];
    const e01 = dgmGrid[(iz + 1) * dgmCols + ix];
    const e11 = dgmGrid[(iz + 1) * dgmCols + ix + 1];
    return (e00 * (1 - fx) + e10 * fx) * (1 - fz) + (e01 * (1 - fx) + e11 * fx) * fz;
  }

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

// Initialize fallback FARM_GROUND_Y / DEMO_GROUND_Y before async binary finishes
FARM_GROUND_Y = Math.max(1.2, getRealElevationMeters(FARM_YARD_CENTER.x, FARM_YARD_CENTER.z) - LAKE_ELEV_M);
FARM_EXIT_ROAD_Y = Math.max(1.2, getRealElevationMeters(-277.6, 922.2) - LAKE_ELEV_M);
DEMO_GROUND_Y = Math.max(1.2, getRealElevationMeters(165, 622) - LAKE_ELEV_M);

/**
 * True 1:1 vertical world Y (meters above Starnberger See 584.2 m ü.NN) directly from road-graded Bavaria DGM1 LiDAR!
 */
export function getTerrainHeight(x: number, z: number): number {
  const elevM = getRealElevationMeters(x, z);
  let y = elevM - LAKE_ELEV_M;

  // Smooth Starnberger See lake basin west of the real shoreline
  const shoreX = getShorelineX(z);
  if (x < shoreX + 10) {
    const lakeDrop = smoothstep(shoreX + 10, shoreX - 45, x);
    y = y * (1 - lakeDrop) + (WATER_LEVEL - 3.8) * lakeDrop;
  }

  // Gentle level working terrace over the open Home Farm courtyard (fades out cleanly before surrounding real LoD2 buildings)
  const fdx = Math.abs(x - FARM_YARD_CENTER.x);
  const fdz = Math.abs(z - FARM_YARD_CENTER.z);
  if (fdx < 30 && fdz < 27) {
    const farmFlat = (1 - smoothstep(22, 30, fdx)) * (1 - smoothstep(19, 27, fdz));
    y = y * (1 - farmFlat) + FARM_GROUND_Y * farmFlat;
  }

  // Smoothly graded East farmyard exit ramp & village-road junction (-322..-268, z ~ 922) so driving out NEVER hits a curb ledge!
  if (x >= -324 && x <= -266 && Math.abs(z - 922.0) < 14) {
    const zBlend = 1 - smoothstep(6.5, 14.0, Math.abs(z - 922.0));
    const xBlend = (1 - smoothstep(-275, -266, x)) * smoothstep(-324, -316, x);
    const rampT = smoothstep(-320, -278, x);
    const targetLaneY = FARM_GROUND_Y * (1 - rampT) + FARM_EXIT_ROAD_Y * rampT;
    const laneWeight = zBlend * xBlend;
    y = y * (1 - laneWeight) + targetLaneY * laneWeight;
  }

  // Level terrace for the Old Gravel Pit Farmstead demolition site (165, 622) so walls & fast-travel landing sit flat
  const ddx = Math.abs(x - 165);
  const ddz = Math.abs(z - 622);
  if (ddx < 40 && ddz < 42) {
    const demoFlat = (1 - smoothstep(26, 40, ddx)) * (1 - smoothstep(28, 42, ddz));
    y = y * (1 - demoFlat) + DEMO_GROUND_Y * demoFlat;
  }

  return y;
}

export function getDrivableGroundY(x: number, z: number): number {
  if (
    x <= SEBALD_PIER.eastX + 4 &&
    x >= SEBALD_PIER.westX - 1 &&
    Math.abs(z - SEBALD_PIER.z) <= SEBALD_PIER.halfWidth
  ) {
    return Math.max(getTerrainHeight(x, z), WATER_LEVEL + 0.85);
  }
  return getTerrainHeight(x, z);
}

export function getTerrainNormal(x: number, z: number, target = new THREE.Vector3()): THREE.Vector3 {
  const eps = 1.5;
  const hL = getTerrainHeight(x - eps, z);
  const hR = getTerrainHeight(x + eps, z);
  const hD = getTerrainHeight(x, z - eps);
  const hU = getTerrainHeight(x, z + eps);
  target.set(hL - hR, 2 * eps, hD - hU).normalize();
  return target;
}

interface IndexedRoadSeg {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  halfWSq: number;
  isGravel: boolean;
}

const ROAD_GRID_CELL = 100;
let roadSpatialGrid: Map<string, IndexedRoadSeg[]> | null = null;

function ensureRoadSpatialGrid(): Map<string, IndexedRoadSeg[]> {
  if (roadSpatialGrid) return roadSpatialGrid;
  const grid = new Map<string, IndexedRoadSeg[]>();
  const addToCell = (cx: number, cz: number, seg: IndexedRoadSeg) => {
    const key = `${cx},${cz}`;
    let list = grid.get(key);
    if (!list) {
      list = [];
      grid.set(key, list);
    }
    list.push(seg);
  };

  for (const r of OSM_DATA.roads) {
    let halfW = 3.4;
    let isGravel = false;
    if (r.hw === 'secondary') {
      halfW = 4.6;
    } else if (r.hw === 'tertiary') {
      halfW = 4.1;
    } else if (r.hw === 'residential' || r.hw === 'unclassified' || r.hw === 'living_street') {
      halfW = 3.5;
    } else if (r.hw === 'track' || r.hw === 'service') {
      halfW = 2.85;
      isGravel = true;
    } else {
      halfW = 2.6;
      isGravel = true;
    }
    const halfWSq = halfW * halfW;
    const pad = halfW + 1;

    for (let i = 0; i < r.pts.length - 1; i++) {
      const [x1, z1] = r.pts[i];
      const [x2, z2] = r.pts[i + 1];
      const seg: IndexedRoadSeg = { x1, z1, x2, z2, halfWSq, isGravel };
      const minCX = Math.floor((Math.min(x1, x2) - pad) / ROAD_GRID_CELL);
      const maxCX = Math.floor((Math.max(x1, x2) + pad) / ROAD_GRID_CELL);
      const minCZ = Math.floor((Math.min(z1, z2) - pad) / ROAD_GRID_CELL);
      const maxCZ = Math.floor((Math.max(z1, z2) + pad) / ROAD_GRID_CELL);
      for (let cx = minCX; cx <= maxCX; cx++) {
        for (let cz = minCZ; cz <= maxCZ; cz++) {
          addToCell(cx, cz, seg);
        }
      }
    }
  }
  roadSpatialGrid = grid;
  return grid;
}

function pointToSegDistSq(px: number, pz: number, s: IndexedRoadSeg): number {
  const dx = s.x2 - s.x1;
  const dz = s.z2 - s.z1;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-4) {
    const ex = px - s.x1;
    const ez = pz - s.z1;
    return ex * ex + ez * ez;
  }
  const t = Math.max(0, Math.min(1, ((px - s.x1) * dx + (pz - s.z1) * dz) / lenSq));
  const cx = s.x1 + dx * t;
  const cz = s.z1 + dz * t;
  const ex = px - cx;
  const ez = pz - cz;
  return ex * ex + ez * ez;
}

export function getSurfaceType(x: number, z: number): SurfaceType {
  // Sebald wooden pier deck over water
  if (
    x <= SEBALD_PIER.eastX + 4 &&
    x >= SEBALD_PIER.westX - 1 &&
    Math.abs(z - SEBALD_PIER.z) <= SEBALD_PIER.halfWidth
  ) {
    return 'gravel';
  }

  const y = getTerrainHeight(x, z);
  if (y < WATER_LEVEL + 0.18) return 'water';

  // Home Farm paved/gravel courtyard & east exit lane
  if (
    (Math.abs(x - FARM_YARD_CENTER.x) < 26 && Math.abs(z - FARM_YARD_CENTER.z) < 24) ||
    (x >= -324 && x <= -274 && Math.abs(z - 922.0) < 7.5)
  ) {
    return 'gravel';
  }

  // Old Farmstead demolition site gravel pad
  if (Math.abs(x - 165) < 33 && Math.abs(z - 622) < 33) {
    return 'gravel';
  }

  // Real OSM road network (paved tarmac takes precedence over adjacent gravel tracks)
  const grid = ensureRoadSpatialGrid();
  const cx = Math.floor(x / ROAD_GRID_CELL);
  const cz = Math.floor(z / ROAD_GRID_CELL);
  const segs = grid.get(`${cx},${cz}`);
  let hitGravelTrack = false;
  if (segs) {
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (pointToSegDistSq(x, z, s) <= s.halfWSq) {
        if (!s.isGravel) return 'asphalt';
        hitGravelTrack = true;
      }
    }
  }
  if (hitGravelTrack) return 'gravel';

  // Bavarian village gravel courtyards (church, Altwirt beer garden, Schloss court, Ried Co-op, EDEKA lot)
  if (
    Math.hypot(x - REAL_SPOTS.muensingChurch.x, z - REAL_SPOTS.muensingChurch.z) < 24 ||
    Math.hypot(x - REAL_SPOTS.muensingAltwirt.x, z - REAL_SPOTS.muensingAltwirt.z) < 22 ||
    Math.hypot(x - REAL_SPOTS.schlossAmmerland.x, z - REAL_SPOTS.schlossAmmerland.z) < 22 ||
    Math.hypot(x - REAL_SPOTS.ried.x, z - REAL_SPOTS.ried.z) < 18 ||
    Math.hypot(x - REAL_SPOTS.edeka.x, z - REAL_SPOTS.edeka.z) < 20
  ) {
    return 'gravel';
  }

  // Damp lakeshore gravel/mud margin
  if (y < WATER_LEVEL + 1.05) return 'mud';

  return 'grass';
}

export interface TerrainBuildResult {
  mesh: THREE.Group;
  body: CANNON.Body;
  waterMesh: THREE.Mesh;
}

/**
 * Builds 4 seamlessly stitched high-resolution 1:1 DGM1 LiDAR terrain quadrants draped with exact EPSG:25832
 * official 20cm Bavaria DOP20 aerial orthophotos, matching Cannon-es Heightfield, shimmering Starnberger See,
 * and southern Bavarian Alps silhouette!
 */
export function buildRealMuensingTerrain(
  scene: THREE.Scene,
  world: CANNON.World,
  groundMat: CANNON.Material,
  detailBump: THREE.CanvasTexture,
  meadowTex: THREE.CanvasTexture
): TerrainBuildResult {
  const group = new THREE.Group();
  const texLoader = new THREE.TextureLoader();

  const midX = (WORLD_MIN_X + WORLD_MAX_X) * 0.5;
  const midZ = (WORLD_MIN_Z + WORLD_MAX_Z) * 0.5;
  const halfW = (WORLD_MAX_X - WORLD_MIN_X) * 0.5;
  const halfD = (WORLD_MAX_Z - WORLD_MIN_Z) * 0.5;

  detailBump.repeat.set(75, 58);

  const quads: { file: string; minX: number; maxX: number; minZ: number; maxZ: number }[] = [
    { file: './map/dop_nw.jpg', minX: WORLD_MIN_X, maxX: midX, minZ: WORLD_MIN_Z, maxZ: midZ },
    { file: './map/dop_ne.jpg', minX: midX, maxX: WORLD_MAX_X, minZ: WORLD_MIN_Z, maxZ: midZ },
    { file: './map/dop_sw.jpg', minX: WORLD_MIN_X, maxX: midX, minZ: midZ, maxZ: WORLD_MAX_Z },
    { file: './map/dop_se.jpg', minX: midX, maxX: WORLD_MAX_X, minZ: midZ, maxZ: WORLD_MAX_Z }
  ];

  // Crisp 160x122 mesh per quadrant (320x244 across 3.8km x 2.9km -> ~11.8m quads hugging DGM1 slopes & road corridors!)
  const segX = 160;
  const segZ = 122;

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
      roughness: 0.94,
      metalness: 0.01,
      bumpMap: detailBump,
      bumpScale: 0.24
    });
    // Crisp world-space grass/gravel micro-detail shader so terrain reads sharp right down to the tires (zero blurry smears!)
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uDetailTex = { value: meadowTex };
      shader.vertexShader =
        'varying vec3 vTerrainWorldPos;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvTerrainWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'
        );
      shader.fragmentShader =
        'uniform sampler2D uDetailTex;\nvarying vec3 vTerrainWorldPos;\n' +
        shader.fragmentShader.replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          float dFine = texture2D(uDetailTex, vTerrainWorldPos.xz * 0.14).g - 0.5;
          float dCoarse = texture2D(uDetailTex, vTerrainWorldPos.xz * 0.032).r - 0.5;
          float camDist = distance(cameraPosition, vTerrainWorldPos);
          float detailFade = 1.0 - smoothstep(45.0, 260.0, camDist);
          diffuseColor.rgb *= (1.0 + (dFine * 0.34 + dCoarse * 0.20) * (0.35 + 0.65 * detailFade));`
        );
    };
    mat.customProgramCacheKey = () => 'bavaria-terrain-detail-v1';

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, 0, cz);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  scene.add(group);

  // Cannon-es Heightfield matching the 10m road-graded DGM1 LiDAR terrain 1:1 (eliminates false hillside cross-slopes on roads!)
  const width = WORLD_MAX_X - WORLD_MIN_X;
  const depth = WORLD_MAX_Z - WORLD_MIN_Z;
  const hfStep = 10.0;
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

  // Shimmering Alpine Emerald-Blue Starnberger See water plane with subtle animated ripples
  const waterRipple = createWaterRippleBumpTexture();
  const waterGeo = new THREE.PlaneGeometry(2400, 3800, 32, 32);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x1b6673,
    roughness: 0.15,
    metalness: 0.42,
    bumpMap: waterRipple,
    bumpScale: 0.13,
    transparent: true,
    opacity: 0.88
  });
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.set(-2250, WATER_LEVEL, 0);
  waterMesh.receiveShadow = true;
  waterMesh.userData.rippleTex = waterRipple;
  scene.add(waterMesh);

  // Panoramic 2-Layer Sculpted Bavarian Alps (Voralpen foothills + Karwendel / Wetterstein / Zugspitze crest)
  // Softly hazed along the southern horizon so silhouettes feel genuinely Alpine rather than giant cones!
  const buildAlpineRidgeBand = (opts: {
    zCenter: number;
    xMin: number;
    xMax: number;
    segs: number;
    baseY: number;
    minH: number;
    maxH: number;
    seed: number;
    baseColor: number;
    midColor: number;
    peakColor: number;
    snowThreshold: number;
  }): THREE.Mesh => {
    const { zCenter, xMin, xMax, segs, baseY, minH, maxH, seed, baseColor, midColor, peakColor, snowThreshold } = opts;
    const rows = 4; // 0: base, 1: lower slope, 2: upper rock face, 3: serrated summit ridge
    const posArr: number[] = [];
    const colArr: number[] = [];
    const idxArr: number[] = [];

    const cBase = new THREE.Color(baseColor);
    const cMid = new THREE.Color(midColor);
    const cPeak = new THREE.Color(peakColor);
    const cTmp = new THREE.Color();

    const ridgeProfile = (u: number): number => {
      // Ridged multifractal Alpine crags (Wetterstein/Zugspitze SW, Benediktenwand S, Karwendel SE)
      const r1 = 1.0 - Math.abs(Math.sin(u * Math.PI * 4.5 + seed));
      const r2 = 1.0 - Math.abs(Math.sin(u * Math.PI * 11.2 + seed * 2.1));
      const r3 = 1.0 - Math.abs(Math.sin(u * Math.PI * 23.0 + seed * 3.7));
      const r4 = 1.0 - Math.abs(Math.sin(u * Math.PI * 41.0 + seed * 1.4));
      const ridged = r1 * 0.46 + r2 * r2 * 0.30 + r3 * r3 * 0.16 + r4 * 0.08;
      // Smooth fade right down to zero at the far east/west ends so there are never abrupt side walls!
      const edgeFade = Math.pow(Math.sin(Math.min(1, Math.max(0, u)) * Math.PI), 0.72);
      const raw = Math.max(0.0, Math.min(1.0, ridged)) * edgeFade;
      return minH * edgeFade + raw * (maxH - minH * 0.6);
    };

    for (let r = 0; r < rows; r++) {
      const rf = r / (rows - 1); // 0 -> 1 from skirt to crest
      for (let i = 0; i <= segs; i++) {
        const u = i / segs;
        const x = xMin + (xMax - xMin) * u;
        const crestH = ridgeProfile(u);
        const zJitter = Math.sin(u * Math.PI * 11.0 + seed + r * 0.8) * 65;
        // Sloped mountain face leaning back from foothills (zCenter - 190) up to summit crest (zCenter)
        const z = zCenter - (1 - rf) * 210 + zJitter;
        const y = baseY + Math.pow(rf, 1.15) * crestH;
        posArr.push(x, y, z);

        const normH = (y - baseY) / maxH;
        if (normH > snowThreshold && r === rows - 1) {
          cTmp.copy(cMid).lerp(cPeak, Math.min(1, (normH - snowThreshold) / (1 - snowThreshold) * 0.92 + 0.15));
        } else if (rf > 0.52) {
          cTmp.copy(cBase).lerp(cMid, (rf - 0.52) / 0.48);
        } else {
          cTmp.copy(cBase);
        }
        colArr.push(cTmp.r, cTmp.g, cTmp.b);
      }
    }

    const stride = segs + 1;
    for (let r = 0; r < rows - 1; r++) {
      for (let i = 0; i < segs; i++) {
        const a = r * stride + i;
        const b = a + 1;
        const c = (r + 1) * stride + i;
        const d = c + 1;
        idxArr.push(a, c, b, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colArr, 3));
    geo.setIndex(idxArr);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.96,
      metalness: 0.0,
      flatShading: true,
      side: THREE.DoubleSide
    });
    return new THREE.Mesh(geo, mat);
  };

  // Layer 1: Voralpen wooded foothills
  scene.add(
    buildAlpineRidgeBand({
      zCenter: 2240,
      xMin: -2550,
      xMax: 2550,
      segs: 84,
      baseY: -12,
      minH: 72,
      maxH: 155,
      seed: 0.8,
      baseColor: 0x4c685c,
      midColor: 0x5c7584,
      peakColor: 0x8ea3b5,
      snowThreshold: 0.95
    })
  );
  // Layer 2: Wetterstein / Zugspitze & Karwendel high limestone Alps crest
  scene.add(
    buildAlpineRidgeBand({
      zCenter: 2520,
      xMin: -2750,
      xMax: 2750,
      segs: 108,
      baseY: -12,
      minH: 138,
      maxH: 258,
      seed: 2.35,
      baseColor: 0x5d768e,
      midColor: 0x768fa8,
      peakColor: 0xdce7f2,
      snowThreshold: 0.62
    })
  );

  return { mesh: group, body, waterMesh };
}
