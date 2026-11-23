import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export type SurfaceType = 'asphalt' | 'cobble' | 'gravel' | 'grass' | 'mud' | 'water';

export const WATER_LEVEL = -3.15;

// World terrain grid covering Farmyard + Münsing + Am Kirchberg + Starnberger See shore!
const GRID_MIN_X = -150;
const GRID_MAX_X = 110;
const GRID_MIN_Z = -130;
const GRID_MAX_Z = 70;
const GRID_STEP = 2.0;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Analytic continuous Upper Bavarian heightfield for Münsing & Starnberger See.
 * - Farmyard plateau (x ∈ [-32, 32], z ∈ [-31, 31]): crisp flat y = 0 for rock-solid pallet stacking.
 * - Hauptstraße / Weipertshausener Str. / Bachstraße / EDEKA / Alter Wirt / Rathaus: flat-to-gently-undulating y = 0..0.4m.
 * - Am Kirchberg (centered at -21, -67.5): authentic +3.5m church hill with flat churchyard crown & drivable west/east slopes.
 * - Ammerlander Straße heading west (x < -58): scenic descent down to Starnberger See shoreline (y = -3.15m at x = -102).
 */
export function getTerrainHeight(x: number, z: number): number {
  // 1. Am Kirchberg Church Hill (authentic gentle Bavarian hill for St. Mariä Himmelfahrt!)
  const dxChurch = (x - -21) / 18.5;
  const dzChurch = (z - -67.5) / 16.5;
  const rChurch = Math.hypot(dxChurch, dzChurch);
  // Flat churchyard crown inside r < 0.68, smooth drivable ramp down to r = 1.35
  const churchHill = 3.4 * (1 - smoothstep(0.62, 1.32, rChurch));

  // 2. Gentle descent west toward Starnberger See (Lake Starnberg shoreline around x = -100)
  // Keep Hauptstraße / Ammerlander Straße smoothly descending down to the lakeside pier!
  const lakeSlope = smoothstep(-58, -106, x) * -3.55;
  // Deeper lakebed offshore
  const lakeDepth = smoothstep(-102, -132, x) * -2.6;

  // 3. Subtle natural Upper Bavarian rolling pasture outside the flat farm & road corridors
  const farmFlatMask =
    (1 - smoothstep(28, 42, Math.abs(x))) * (1 - smoothstep(28, 40, Math.abs(z)));
  const mainRoadMask = 1 - smoothstep(5.5, 11.0, Math.abs(z - -40));
  const weipertMask = (1 - smoothstep(5.0, 10.5, Math.abs(x - 2))) * smoothstep(-110, -34, z);
  const bachMask = (1 - smoothstep(5.0, 10.5, Math.abs(x - 38))) * smoothstep(-90, -34, z);
  const edekaPad = (1 - smoothstep(10, 18, Math.abs(x - 56))) * (1 - smoothstep(11, 18, Math.abs(z - -56)));
  const alterWirtPad = (1 - smoothstep(9, 15, Math.abs(x - 22))) * (1 - smoothstep(10, 16, Math.abs(z - -55)));
  const rathausPad = (1 - smoothstep(8, 14, Math.abs(x - 21.5))) * (1 - smoothstep(8, 14, Math.abs(z - -72.5)));
  const bakeryPad = (1 - smoothstep(8, 14, Math.abs(x - -52))) * (1 - smoothstep(7, 13, Math.abs(z - -55)));
  const dorfplatzPad = (1 - smoothstep(7, 12, Math.abs(x - -8.5))) * (1 - smoothstep(7, 12, Math.abs(z - -52.5)));

  const keepLevel = Math.min(
    1,
    Math.max(
      farmFlatMask,
      mainRoadMask,
      weipertMask,
      bachMask,
      edekaPad,
      alterWirtPad,
      rathausPad,
      bakeryPad,
      dorfplatzPad
    )
  );

  const rolling =
    (Math.sin(x * 0.045) * Math.cos(z * 0.04) * 1.15 +
      Math.sin((x + z) * 0.028) * 0.85) *
    (1 - keepLevel) *
    (1 - smoothstep(-60, -90, x));

  // Keep northernmost far hills gently rising past z = -105 (outside playable streets!)
  const northRise = smoothstep(-106, -130, z) * 4.5 * (1 - smoothstep(-65, -95, x));

  // Keep farmyard strictly y = 0.0 inside [-31, 31] x [-30, 30]
  const total = (churchHill + rolling + northRise) * (1 - farmFlatMask) + lakeSlope + lakeDepth;
  return total;
}

export function getTerrainNormal(x: number, z: number, target = new THREE.Vector3()): THREE.Vector3 {
  const eps = 0.45;
  const hL = getTerrainHeight(x - eps, z);
  const hR = getTerrainHeight(x + eps, z);
  const hD = getTerrainHeight(x, z - eps);
  const hU = getTerrainHeight(x, z + eps);
  target.set(hL - hR, 2 * eps, hD - hU).normalize();
  return target;
}

export function getSurfaceType(x: number, z: number): SurfaceType {
  const y = getTerrainHeight(x, z);
  if (y < WATER_LEVEL + 0.12 && x < -92) return 'water';

  // Hauptstraße & Ammerlander Straße down to Starnberger See pier
  if (Math.abs(z - -40) < 5.3 && x > -104 && x < 84) return 'asphalt';
  // Gate apron
  if (Math.abs(x - -1.5) < 5.8 && z > -37 && z < -29) return 'asphalt';
  // Weipertshausener Straße
  if (Math.abs(x - 2) < 4.7 && z > -105 && z < -39) return 'asphalt';
  // Am Kirchberg west & north loop
  if (Math.abs(x - -38) < 4.1 && z > -86 && z < -39) return 'asphalt';
  if (Math.abs(z - -84) < 4.2 && x > -41 && x < 42) return 'asphalt';
  // Bachstraße & EDEKA parking lot
  if (Math.abs(x - 38) < 4.2 && z > -86 && z < -39) return 'asphalt';
  if (x > 41 && x < 52 && z > -67 && z < -45) return 'asphalt';

  // Dorfplatz & sidewalks
  if (x > -15.5 && x < -1.5 && z > -59.5 && z < -45.5) return 'cobble';
  if (Math.abs(z - -46.6) < 1.5 && x > -82 && x < 82) return 'cobble';

  // Farmyard courtyard & mud tracks
  if (Math.abs(x) < 28 && Math.abs(z) < 28) {
    if (Math.abs(x) < 4 || Math.abs(z) < 4) return 'mud';
    return 'gravel';
  }
  return 'grass';
}

export interface TerrainBuildResult {
  mesh: THREE.Mesh;
  body: CANNON.Body;
  waterMesh: THREE.Mesh;
}

/**
 * Builds both the continuous 3D terrain mesh (vertex-colored Bavarian grass/shore/hill shading + detail)
 * AND the exact matching Cannon-es Heightfield physics collider, plus the shimmering Starnberger See water plane!
 */
export function buildTerrainAndLake(
  scene: THREE.Scene,
  world: CANNON.World,
  groundMat: CANNON.Material,
  detailBump: THREE.CanvasTexture,
  meadowTex: THREE.CanvasTexture
): TerrainBuildResult {
  const cols = Math.round((GRID_MAX_X - GRID_MIN_X) / GRID_STEP);
  const rows = Math.round((GRID_MAX_Z - GRID_MIN_Z) / GRID_STEP);

  // --- 1. Three.js Visual Heightfield Mesh ---
  const geo = new THREE.PlaneGeometry(
    GRID_MAX_X - GRID_MIN_X,
    GRID_MAX_Z - GRID_MIN_Z,
    cols,
    rows
  );
  geo.rotateX(-Math.PI / 2);

  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(posAttr.count * 3);
  const c = new THREE.Color();

  const centerX = (GRID_MIN_X + GRID_MAX_X) * 0.5;
  const centerZ = (GRID_MIN_Z + GRID_MAX_Z) * 0.5;

  for (let i = 0; i < posAttr.count; i++) {
    const wx = posAttr.getX(i) + centerX;
    const wz = posAttr.getZ(i) + centerZ;
    const wy = getTerrainHeight(wx, wz);
    posAttr.setY(i, wy);

    // Rich painterly Bavarian meadow / Kirchberg hillside / sandy Starnberger See pebble shore coloring!
    const noise = Math.sin(wx * 0.14) * Math.cos(wz * 0.13) * 0.04;
    if (wy < WATER_LEVEL + 0.45 && wx < -90) {
      // Warm natural Starnberger See pebble shore & shallow bed
      c.setRGB(0.62 + noise, 0.56 + noise, 0.44 + noise);
    } else if (wy > 1.8) {
      // Sunlit grassy Kirchberg church hillside
      c.setRGB(0.41 + noise, 0.58 + noise, 0.28 + noise);
    } else {
      // Lush Upper Bavarian pasture grass
      c.setRGB(0.36 + noise, 0.52 + noise, 0.25 + noise);
    }
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    map: meadowTex,
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.02,
    bumpMap: detailBump,
    bumpScale: 0.12
  });
  const mesh = new THREE.Mesh(geo, terrainMat);
  mesh.position.set(centerX, 0, centerZ);
  mesh.receiveShadow = true;
  scene.add(mesh);

  // Broad distant outer meadow skirt beyond the heightfield box (y = -3.6 so it never pokes through lake!)
  const skirt = new THREE.Mesh(
    new THREE.RingGeometry(130, 380, 64),
    new THREE.MeshStandardMaterial({ color: 0x51783a, roughness: 0.98 })
  );
  skirt.rotation.x = -Math.PI / 2;
  skirt.position.set(0, -0.35, -30);
  scene.add(skirt);

  // --- 2. Cannon-es Heightfield Physics Collider (exact match to visual terrain!) ---
  // Note: In Cannon Heightfield, matrix[i][j] maps local x = i * elementSize, local y = j * elementSize,
  // and rotating by -PI/2 around X maps local +Y -> world -Z!
  // So matrix[ix][iz] corresponds to worldX = GRID_MIN_X + ix * step, worldZ = GRID_MAX_Z - iz * step!
  const matrix: number[][] = [];
  for (let ix = 0; ix <= cols; ix++) {
    const col: number[] = [];
    const wx = GRID_MIN_X + ix * GRID_STEP;
    for (let iz = 0; iz <= rows; iz++) {
      const wz = GRID_MAX_Z - iz * GRID_STEP;
      col.push(getTerrainHeight(wx, wz));
    }
    matrix.push(col);
  }

  const hfShape = new CANNON.Heightfield(matrix, { elementSize: GRID_STEP });
  const body = new CANNON.Body({ mass: 0, material: groundMat });
  body.addShape(hfShape);
  body.position.set(GRID_MIN_X, 0, GRID_MAX_Z);
  body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(body);

  // --- 3. Shimmering Reflective Starnberger See (Lake Starnberg) on the Western Horizon! ---
  const waterGeo = new THREE.PlaneGeometry(240, 380, 28, 28);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x266c8e,
    roughness: 0.14,
    metalness: 0.52,
    transparent: true,
    opacity: 0.9
  });
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.set(-216, WATER_LEVEL, -40);
  waterMesh.receiveShadow = true;
  scene.add(waterMesh);

  return { mesh, body, waterMesh };
}

/**
 * Helper to build a terrain-conforming road strip so streets ride smoothly over Kirchberg & down toward Lake Starnberg!
 */
export function buildConformingStrip(
  width: number,
  length: number,
  centerX: number,
  centerZ: number,
  alongZ: boolean,
  yOffset: number,
  material: THREE.Material,
  segments = 24
): THREE.Mesh {
  const segW = alongZ ? 4 : segments;
  const segL = alongZ ? segments : 4;
  const geo = new THREE.PlaneGeometry(width, length, segW, segL);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i) + centerX;
    const wz = pos.getZ(i) + centerZ;
    pos.setY(i, getTerrainHeight(wx, wz) + yOffset);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(centerX, 0, centerZ);
  mesh.receiveShadow = true;
  return mesh;
}
