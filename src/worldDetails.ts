import * as THREE from 'three';
import {
  FARM_YARD_CENTER,
  getShorelineX,
  getTerrainHeight,
  OSM_DATA,
  REAL_SPOTS,
  SEBALD_PIER,
  WATER_LEVEL
} from './terrain';
import { createBarnWoodTexture, createHayTexture } from './textures';

function makeHaltestelleTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f2c41a';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#1b6d33';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#1b6d33';
  ctx.font = 'bold 74px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('H', 64, 67);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Populates Priority A3 open-country & village density across the entire 3.8 km x 2.9 km 1:1 Bavarian map:
 * - Wooden power / telephone poles with sagging catenary wires along Münsinger Straße & Weipertshausener Straße
 * - Wooden pasture fences & hedgerow shrub rows along open meadows and road shoulders
 * - Bavarian wayside shrines (Marterl), German Bushaltestelle bus stops, yellow postboxes & village benches
 * - Neighboring farm clutter (bale stacks, tarped silage clamps under tires, slurry tanks, woodpiles, trailers)
 * - Starnberger See lakeshore reed beds
 * Built with batched InstancedMeshes and merged line segments so frame rate stays locked at 60 fps!
 */
export function buildBavarianWorldDetails(scene: THREE.Scene): void {
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();

  // Collect all paved road segments so open-country crops, hedgerows, cows, huts & parked tractors never encroach on asphalt!
  const pavedSegs: [number, number, number, number][] = [];
  for (const r of OSM_DATA.roads) {
    if (r.hw === 'track' || r.hw === 'service') continue;
    for (let i = 0; i < r.pts.length - 1; i++) {
      pavedSegs.push([r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]]);
    }
  }
  const distToPavedRoad = (px: number, pz: number): number => {
    let bestSq = Infinity;
    for (const [ax, az, bx, bz] of pavedSegs) {
      const dx = bx - ax;
      const dz = bz - az;
      const lenSq = dx * dx + dz * dz;
      const t = lenSq > 1e-4 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq)) : 0;
      const cx = ax + dx * t - px;
      const cz = az + dz * t - pz;
      const dSq = cx * cx + cz * cz;
      if (dSq < bestSq) bestSq = dSq;
    }
    return Math.sqrt(bestSq);
  };

  // === 1. POWER & TELEPHONE POLES WITH SAGGING CATENARY WIRES ALONG MAIN RURAL ROADS ===
  const poleSpots: { x: number; z: number; nx: number; nz: number }[] = [];
  const wireVerts: number[] = [];

  for (const r of OSM_DATA.roads) {
    if (r.hw !== 'secondary' && r.hw !== 'tertiary') continue;
    let accum = 0;
    let prevPole: THREE.Vector3 | null = null;
    let prevCross: THREE.Vector3 | null = null;

    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i];
      const b = r.pts[i + 1];
      const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (segLen < 4) continue;
      const nx = -(b[1] - a[1]) / segLen;
      const nz = (b[0] - a[0]) / segLen;

      let posAlong = 0;
      while (posAlong < segLen) {
        const step = Math.min(segLen - posAlong, 62 - accum);
        posAlong += step;
        accum += step;
        if (accum >= 62) {
          accum = 0;
          const t = posAlong / segLen;
          const px = a[0] + (b[0] - a[0]) * t + nx * 7.8;
          const pz = a[1] + (b[1] - a[1]) * t + nz * 7.8;

          // Keep village core squares clean of overhead highway poles
          if (Math.hypot(px - REAL_SPOTS.muensingChurch.x, pz - REAL_SPOTS.muensingChurch.z) < 75) {
            prevPole = null;
            continue;
          }
          if (Math.abs(px - FARM_YARD_CENTER.x) < 34 && Math.abs(pz - FARM_YARD_CENTER.z) < 32) {
            prevPole = null;
            continue;
          }

          const py = getTerrainHeight(px, pz);
          if (py < WATER_LEVEL + 0.6) {
            prevPole = null;
            continue;
          }

          poleSpots.push({ x: px, z: pz, nx, nz });
          const curTop = new THREE.Vector3(px, py + 7.6, pz);
          const curCross = new THREE.Vector3(nx * 0.85, 0, nz * 0.85);

          if (prevPole && prevCross && prevPole.distanceTo(curTop) < 88) {
            // Draw 2 sagging catenary wires between adjacent poles (6 segments each)
            for (const side of [-1, 1]) {
              const p0 = prevPole.clone().addScaledVector(prevCross, side);
              const p1 = curTop.clone().addScaledVector(curCross, side);
              const segs = 6;
              for (let s = 0; s < segs; s++) {
                const u0 = s / segs;
                const u1 = (s + 1) / segs;
                const sag0 = -4 * u0 * (1 - u0) * 1.15;
                const sag1 = -4 * u1 * (1 - u1) * 1.15;
                wireVerts.push(
                  p0.x + (p1.x - p0.x) * u0,
                  p0.y + (p1.y - p0.y) * u0 + sag0,
                  p0.z + (p1.z - p0.z) * u0,
                  p0.x + (p1.x - p0.x) * u1,
                  p0.y + (p1.y - p0.y) * u1 + sag1,
                  p0.z + (p1.z - p0.z) * u1
                );
              }
            }
          }
          prevPole = curTop;
          prevCross = curCross;
        }
      }
    }
  }

  if (poleSpots.length > 0) {
    const woodPoleMat = new THREE.MeshStandardMaterial({ color: 0x4c3723, roughness: 0.94 });
    const poleGeo = new THREE.CylinderGeometry(0.11, 0.16, 8.2, 6);
    const armGeo = new THREE.BoxGeometry(2.0, 0.14, 0.14);
    const poleInst = new THREE.InstancedMesh(poleGeo, woodPoleMat, poleSpots.length);
    const armInst = new THREE.InstancedMesh(armGeo, woodPoleMat, poleSpots.length);
    poleInst.castShadow = true;

    poleSpots.forEach((p, idx) => {
      const gy = getTerrainHeight(p.x, p.z);
      dummy.position.set(p.x, gy + 4.0, p.z);
      dummy.rotation.set(0, Math.atan2(p.nx, p.nz), 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      poleInst.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(p.x, gy + 7.6, p.z);
      dummy.rotation.set(0, Math.atan2(p.nz, p.nx), 0);
      dummy.updateMatrix();
      armInst.setMatrixAt(idx, dummy.matrix);
    });
    poleInst.instanceMatrix.needsUpdate = true;
    armInst.instanceMatrix.needsUpdate = true;
    scene.add(poleInst, armInst);

    if (wireVerts.length > 0) {
      const wGeo = new THREE.BufferGeometry();
      wGeo.setAttribute('position', new THREE.Float32BufferAttribute(wireVerts, 3));
      const wires = new THREE.LineSegments(
        wGeo,
        new THREE.LineBasicMaterial({ color: 0x222528, transparent: true, opacity: 0.72 })
      );
      scene.add(wires);
    }
  }

  // === 2. WOODEN PASTURE FENCES & ROADSIDE HEDGEROW BUSHES ALONG OPEN COUNTRY ===
  const fenceSegs: { x: number; z: number; rot: number }[] = [];
  const bushes: { x: number; z: number; s: number; hex: number }[] = [];

  for (const r of OSM_DATA.roads) {
    if (r.hw !== 'secondary' && r.hw !== 'tertiary') continue;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i];
      const b = r.pts[i + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 16) continue;
      const nx = -(b[1] - a[1]) / len;
      const nz = (b[0] - a[0]) / len;
      const ang = Math.atan2(b[0] - a[0], b[1] - a[1]);

      const steps = Math.floor(len / 14);
      for (let s = 0; s < steps; s++) {
        const t = (s + 0.5) / steps;
        const mx = a[0] + (b[0] - a[0]) * t;
        const mz = a[1] + (b[1] - a[1]) * t;
        if (Math.hypot(mx - REAL_SPOTS.muensingChurch.x, mz - REAL_SPOTS.muensingChurch.z) < 110) continue;
        if (Math.hypot(mx - REAL_SPOTS.wimpasing.x, mz - REAL_SPOTS.wimpasing.z) < 90) continue;

        const side = (i + s) % 2 === 0 ? 1 : -1;
        const fx = mx + nx * side * 9.2;
        const fz = mz + nz * side * 9.2;
        if (getTerrainHeight(fx, fz) < WATER_LEVEL + 0.8) continue;

        if ((i + s) % 3 !== 0) {
          fenceSegs.push({ x: fx, z: fz, rot: ang });
        } else {
          bushes.push({
            x: mx - nx * side * 8.4,
            z: mz - nz * side * 8.4,
            s: 0.9 + ((i * 7 + s * 3) % 8) * 0.14,
            hex: (i + s) % 3 === 0 ? 0x3b682c : (i + s) % 3 === 1 ? 0x4b7834 : 0x5c8539
          });
        }
      }
    }
  }

  // Scatter additional flowering meadow bushes & single field bushes near farm lanes
  for (let i = 0; i < 240; i++) {
    const bx = -960 + ((i * 317) % 2680);
    const bz = -1240 + ((i * 541) % 2480);
    if (bx < getShorelineX(bz) + 12) continue;
    if (Math.abs(bx - FARM_YARD_CENTER.x) < 34 && Math.abs(bz - FARM_YARD_CENTER.z) < 32) continue;
    if (bx > -330 && bx < -274 && Math.abs(bz - 922) < 9) continue;
    bushes.push({
      x: bx,
      z: bz,
      s: 0.8 + (i % 6) * 0.2,
      hex: i % 4 === 0 ? 0x3d6d2d : i % 4 === 1 ? 0x507d34 : i % 4 === 2 ? 0x628c3a : 0x708b36
    });
  }

  if (fenceSegs.length > 0) {
    const fenceMat = new THREE.MeshStandardMaterial({ color: 0x785a3a, roughness: 0.94 });
    const postGeo = new THREE.BoxGeometry(0.16, 1.3, 0.16);
    const railGeo = new THREE.BoxGeometry(0.09, 0.12, 13.5);
    const posts = new THREE.InstancedMesh(postGeo, fenceMat, fenceSegs.length);
    const railsTop = new THREE.InstancedMesh(railGeo, fenceMat, fenceSegs.length);
    const railsMid = new THREE.InstancedMesh(railGeo, fenceMat, fenceSegs.length);
    fenceSegs.forEach((f, idx) => {
      const gy = getTerrainHeight(f.x, f.z);
      dummy.rotation.set(0, f.rot, 0);
      dummy.scale.set(1, 1, 1);
      dummy.position.set(f.x, gy + 0.62, f.z);
      dummy.updateMatrix();
      posts.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(f.x, gy + 1.02, f.z);
      dummy.updateMatrix();
      railsTop.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(f.x, gy + 0.56, f.z);
      dummy.updateMatrix();
      railsMid.setMatrixAt(idx, dummy.matrix);
    });
    posts.instanceMatrix.needsUpdate = true;
    railsTop.instanceMatrix.needsUpdate = true;
    railsMid.instanceMatrix.needsUpdate = true;
    scene.add(posts, railsTop, railsMid);
  }

  if (bushes.length > 0) {
    const bushGeo = new THREE.DodecahedronGeometry(1.35, 1);
    const bushMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    const bushInst = new THREE.InstancedMesh(bushGeo, bushMat, bushes.length);
    bushes.forEach((b, idx) => {
      const gy = getTerrainHeight(b.x, b.z);
      dummy.position.set(b.x, gy + 0.72 * b.s, b.z);
      dummy.rotation.set(0, idx * 0.9, 0);
      dummy.scale.set(b.s * 1.25, b.s * 0.75, b.s * 1.1);
      dummy.updateMatrix();
      bushInst.setMatrixAt(idx, dummy.matrix);
      col.setHex(b.hex);
      bushInst.setColorAt(idx, col);
    });
    bushInst.instanceMatrix.needsUpdate = true;
    if (bushInst.instanceColor) bushInst.instanceColor.needsUpdate = true;
    scene.add(bushInst);
  }

  // === 3. BAVARIAN WAYSIDE SHRINES (MARTERL), GERMAN BUS STOPS (BUSHALTESTELLE) & POSTBOXES ===
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x543820, roughness: 0.92 });
  const tileRed = new THREE.MeshStandardMaterial({ color: 0xa6422a, roughness: 0.8 });
  const benchWood = new THREE.MeshStandardMaterial({ color: 0x865d36, roughness: 0.88 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x8eb5c4,
    transparent: true,
    opacity: 0.42,
    roughness: 0.15
  });
  const metalGrey = new THREE.MeshStandardMaterial({ color: 0x3a4044, roughness: 0.55, metalness: 0.45 });
  const hSignMat = new THREE.MeshStandardMaterial({ map: makeHaltestelleTexture(), roughness: 0.4 });
  const postYellow = new THREE.MeshStandardMaterial({ color: 0xf4c214, roughness: 0.42 });

  // Wayside Shrines (Marterl / Feldkreuz) along open country crossroads & hill crests!
  const marterlSpots: [number, number, number][] = [
    [454, 954, 0.3], // Open Country Münsinger Straße viewpoint
    [255, 922, 0.15], // East of Wimpasing crest
    [640, 956, -0.25], // Mid Münsinger Straße meadow crest
    [920, 825, -0.4],
    [1065, 976, 0.5], // West Münsing hill entrance
    [-210, 620, 0.8], // Wimpasing–Ried lane
    [-125, 340, -0.3], // North of Ried
    [290, -180, 0.4], // Mid Weipertshausener Straße
    [420, -450, 0.1],
    [472, -840, -0.35],
    [486, -1165, -0.2]
  ];
  for (const [mx, mz, rot] of marterlSpots) {
    const gy = getTerrainHeight(mx, mz);
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.24, 3.0, 0.24), darkWood);
    post.position.y = 1.5;
    post.castShadow = true;
    g.add(post);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.2, 0.2), darkWood);
    arm.position.y = 2.35;
    g.add(arm);
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.55, 4), tileRed);
    hood.rotation.y = Math.PI / 4;
    hood.position.y = 3.15;
    g.add(hood);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.46), benchWood);
    bench.position.set(1.25, 0.5, 0.2);
    g.add(bench);
    g.position.set(mx, gy, mz);
    g.rotation.y = rot;
    scene.add(g);
  }

  // German Bus Stops (Bushaltestelle) in Münsing, Wimpasing & Ammerland!
  const busStops: [number, number, number][] = [
    [1424, 1044, -0.4], // Münsing Zum Altwirt street
    [1362, 1008, 0.1], // Münsing Am Kirchberg
    [-970, 718, Math.PI / 2], // Ammerland Seestraße
    [-218, 840, 0.4] // Wimpasing
  ];
  for (const [bx, bz, rot] of busStops) {
    const gy = getTerrainHeight(bx, bz);
    const g = new THREE.Group();
    const back = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.3, 0.12), glassMat);
    back.position.set(0, 1.25, -0.75);
    g.add(back);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.14, 1.9), metalGrey);
    roof.position.set(0, 2.48, 0);
    roof.castShadow = true;
    g.add(roof);
    for (const sx of [-1.7, 1.7]) {
      const colMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.45, 0.12), metalGrey);
      colMesh.position.set(sx, 1.22, -0.75);
      g.add(colMesh);
    }
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 0.42), benchWood);
    seat.position.set(0, 0.52, -0.42);
    g.add(seat);
    // Yellow-green German 'H' Haltestelle sign on pole
    const hPole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.9, 6), metalGrey);
    hPole.position.set(2.3, 1.45, 0.3);
    g.add(hPole);
    const hSign = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.58, 0.06), hSignMat);
    hSign.position.set(2.3, 2.75, 0.3);
    g.add(hSign);

    g.position.set(bx, gy, bz);
    g.rotation.y = rot;
    scene.add(g);
  }

  // Yellow Deutsche Post letterboxes & village bins
  const postboxSpots: [number, number][] = [
    [1364, 994],
    [1444, 1028],
    [-976, 708],
    [-281, 918],
    [486, -1198]
  ];
  for (const [px, pz] of postboxSpots) {
    const gy = getTerrainHeight(px, pz);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.25, 6), metalGrey);
    pole.position.set(px, gy + 0.62, pz);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.58, 0.34), postYellow);
    box.position.set(px, gy + 1.32, pz);
    box.castShadow = true;
    scene.add(pole, box);
  }

  // === 4. NEIGHBORING BAVARIAN FARM CLUTTER (NOT JUST THE HOME FARM!) ===
  // Round hay & wrapped silage bale stacks, tarped silage clamps under tires, green slurry tanks & woodpiles
  const neighborFarms: [number, number][] = [
    [-175, 815],
    [REAL_SPOTS.ried.x + 22, REAL_SPOTS.ried.z + 18],
    [474, -1202], // Weipertshausen farmyard right beside the road!
    [1220, 975], // Münsing west farmyard edge
    [-955, 765] // Ammerland lakeside farmyard
  ];

  const hayMat = new THREE.MeshStandardMaterial({ color: 0xd6b14e, roughness: 0.94 });
  const silageMat = new THREE.MeshStandardMaterial({ color: 0xeff2ec, roughness: 0.45 });
  const tankMat = new THREE.MeshStandardMaterial({ color: 0x3a6444, roughness: 0.62, metalness: 0.25 });
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x9c9a92, roughness: 0.92 });
  const tarpMat = new THREE.MeshStandardMaterial({ color: 0x26292c, roughness: 0.72 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x1c1e20, roughness: 0.92 });
  const logMat = new THREE.MeshStandardMaterial({ color: 0x6f4a29, roughness: 0.94 });

  const baleGeo = new THREE.CylinderGeometry(0.78, 0.78, 1.25, 12);
  baleGeo.rotateZ(Math.PI / 2);

  neighborFarms.forEach(([fx, fz], fIdx) => {
    const gy = getTerrainHeight(fx, fz);
    const g = new THREE.Group();

    // Pyramid stack of 6 golden hay or wrapped silage bales
    const bMat = fIdx % 2 === 0 ? hayMat : silageMat;
    const offsets: [number, number, number][] = [
      [-1.7, 0.78, 0],
      [0, 0.78, 0],
      [1.7, 0.78, 0],
      [-0.85, 2.15, 0],
      [0.85, 2.15, 0],
      [0, 3.45, 0]
    ];
    for (const [ox, oy, oz] of offsets) {
      const bale = new THREE.Mesh(baleGeo, bMat);
      bale.position.set(ox, oy, oz);
      bale.castShadow = true;
      g.add(bale);
    }

    // Stacked cordwood pile beside the bales
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4 - r; c++) {
        const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.19, 2.4, 7), logMat);
        lg.rotation.x = Math.PI / 2;
        lg.position.set(4.5 + c * 0.4 + r * 0.2, 0.2 + r * 0.32, 0.4);
        g.add(lg);
      }
    }

    // Add a cylindrical green slurry tank & tarped silage clamp on neighboring farmyards!
    {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 3.6, 16), tankMat);
      tank.position.set(-7.5, 1.8, -5.5);
      tank.castShadow = true;
      g.add(tank);

      const clamp = new THREE.Mesh(new THREE.BoxGeometry(6.8, 1.4, 4.0), concreteMat);
      clamp.position.set(3.2, 0.7, -6.5);
      g.add(clamp);
      const tarp = new THREE.Mesh(new THREE.BoxGeometry(6.3, 0.8, 3.5), tarpMat);
      tarp.position.set(3.2, 1.5, -6.5);
      g.add(tarp);
      for (const tx of [1.2, 3.2, 5.2]) {
        const tire = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.13, 6, 10), tireMat);
        tire.rotation.x = Math.PI / 2;
        tire.position.set(tx, 1.96, -6.5);
        g.add(tire);
      }
    }

    g.position.set(fx, gy - 0.1, fz);
    g.rotation.y = fIdx * 0.7;
    scene.add(g);
  });

  // === 5. STARNBERGER SEE LAKESHORE REED BEDS ===
  const reedSpots: [number, number][] = [];
  for (let z = -600; z <= 1250; z += 14) {
    if (Math.abs(z - SEBALD_PIER.z) < 16) continue;
    const sx = getShorelineX(z);
    for (let k = 0; k < 3; k++) {
      reedSpots.push([sx - 3 - k * 2.4 + Math.sin(z) * 2, z + k * 3.5]);
    }
  }
  if (reedSpots.length > 0) {
    const reedGeo = new THREE.ConeGeometry(0.42, 2.2, 5);
    const reedMat = new THREE.MeshStandardMaterial({ color: 0x6c7d3c, roughness: 0.92 });
    const reedInst = new THREE.InstancedMesh(reedGeo, reedMat, reedSpots.length);
    reedSpots.forEach(([rx, rz], idx) => {
      dummy.position.set(rx, WATER_LEVEL + 0.7, rz);
      dummy.rotation.set(0, idx * 0.8, (idx % 3 - 1) * 0.08);
      dummy.scale.set(1.2, 0.8 + (idx % 4) * 0.25, 1.2);
      dummy.updateMatrix();
      reedInst.setMatrixAt(idx, dummy.matrix);
    });
    reedInst.instanceMatrix.needsUpdate = true;
    scene.add(reedInst);
  }

  // === 6. BAVARIAN ORCHARD FRUIT TREES NEAR FARMS (Streuobstwiese) ===
  const orchardSpots: [number, number, number][] = [
    [FARM_YARD_CENTER.x - 30, FARM_YARD_CENTER.z + 12, 1.0],
    [FARM_YARD_CENTER.x - 36, FARM_YARD_CENTER.z + 22, 0.92],
    [FARM_YARD_CENTER.x - 24, FARM_YARD_CENTER.z + 28, 1.05],
    [FARM_YARD_CENTER.x - 6, FARM_YARD_CENTER.z + 31, 0.95],
    [FARM_YARD_CENTER.x + 10, FARM_YARD_CENTER.z + 31, 1.08],
    [REAL_SPOTS.ried.x - 24, REAL_SPOTS.ried.z + 18, 1.0],
    [REAL_SPOTS.ried.x - 16, REAL_SPOTS.ried.z + 26, 0.88],
    [REAL_SPOTS.ried.x + 30, REAL_SPOTS.ried.z - 14, 1.05],
    [468, -1180, 0.95],
    [475, -1165, 1.08],
    [515, -1205, 0.92],
    [1255, 978, 1.02],
    [1268, 965, 0.9],
    [-938, 745, 0.96],
    [-932, 762, 1.05],
    [438, 945, 0.95],
    [495, 922, 1.0]
  ];
  const fTrunkGeo = new THREE.CylinderGeometry(0.14, 0.24, 2.3, 6);
  const fTrunkMat = new THREE.MeshStandardMaterial({ color: 0x563c24, roughness: 0.94 });
  const fCrownMainGeo = new THREE.DodecahedronGeometry(1.75, 1);
  const fCrownSideGeo = new THREE.DodecahedronGeometry(1.25, 1);
  const fCrownTopGeo = new THREE.DodecahedronGeometry(1.15, 1);
  const fCrownMat = new THREE.MeshStandardMaterial({ roughness: 0.87 });
  const fTrunks = new THREE.InstancedMesh(fTrunkGeo, fTrunkMat, orchardSpots.length);
  const fCrownsMain = new THREE.InstancedMesh(fCrownMainGeo, fCrownMat, orchardSpots.length);
  const fCrownsSide = new THREE.InstancedMesh(fCrownSideGeo, fCrownMat, orchardSpots.length);
  const fCrownsTop = new THREE.InstancedMesh(fCrownTopGeo, fCrownMat, orchardSpots.length);
  fTrunks.castShadow = true;
  fCrownsMain.castShadow = true;
  fCrownsSide.castShadow = true;
  orchardSpots.forEach(([ox, oz, sc], idx) => {
    const gy = getTerrainHeight(ox, oz);
    const tilt = ((idx % 3) - 1) * 0.06;
    const ang = idx * 1.9;
    dummy.position.set(ox, gy + 1.05 * sc, oz);
    dummy.rotation.set(tilt, idx * 1.1, -tilt * 0.7);
    dummy.scale.set(sc, sc, sc);
    dummy.updateMatrix();
    fTrunks.setMatrixAt(idx, dummy.matrix);

    // Shaded lower-main lobe
    dummy.position.set(ox + Math.cos(ang) * 0.35 * sc, gy + 2.75 * sc, oz + Math.sin(ang) * 0.35 * sc);
    dummy.rotation.set(0.1, ang, 0.08);
    dummy.scale.set(sc * 1.18, sc * 0.86, sc * 1.12);
    dummy.updateMatrix();
    fCrownsMain.setMatrixAt(idx, dummy.matrix);
    col.setHex(idx % 3 === 0 ? 0x4b782e : idx % 3 === 1 ? 0x568433 : 0x446f2b);
    fCrownsMain.setColorAt(idx, col);

    // Side branching foliage lobe
    dummy.position.set(ox - Math.cos(ang + 0.5) * 0.95 * sc, gy + 2.55 * sc, oz - Math.sin(ang + 0.5) * 0.95 * sc);
    dummy.rotation.set(-0.08, ang + 1.4, 0.12);
    dummy.scale.set(sc * 1.1, sc * 0.82, sc * 1.05);
    dummy.updateMatrix();
    fCrownsSide.setMatrixAt(idx, dummy.matrix);
    col.setHex(idx % 3 === 0 ? 0x5c8d37 : idx % 3 === 1 ? 0x67973c : 0x538232);
    fCrownsSide.setColorAt(idx, col);

    // Sunlit upper crown tuft
    dummy.position.set(ox + Math.cos(ang + 1.8) * 0.45 * sc, gy + 3.55 * sc, oz + Math.sin(ang + 1.8) * 0.45 * sc);
    dummy.rotation.set(0.05, ang + 2.6, -0.06);
    dummy.scale.set(sc * 1.05, sc * 0.8, sc * 1.0);
    dummy.updateMatrix();
    fCrownsTop.setMatrixAt(idx, dummy.matrix);
    col.setHex(idx % 3 === 0 ? 0x6fa142 : idx % 3 === 1 ? 0x7aad48 : 0x63943c);
    fCrownsTop.setColorAt(idx, col);
  });
  fTrunks.instanceMatrix.needsUpdate = true;
  fCrownsMain.instanceMatrix.needsUpdate = true;
  fCrownsSide.instanceMatrix.needsUpdate = true;
  fCrownsTop.instanceMatrix.needsUpdate = true;
  if (fCrownsMain.instanceColor) fCrownsMain.instanceColor.needsUpdate = true;
  if (fCrownsSide.instanceColor) fCrownsSide.instanceColor.needsUpdate = true;
  if (fCrownsTop.instanceColor) fCrownsTop.instanceColor.needsUpdate = true;
  scene.add(fTrunks, fCrownsMain, fCrownsSide, fCrownsTop);

  // === 7. ROADSIDE MEADOW GRASS & BAVARIAN WILDFLOWER TUFTS ===
  const tufts: { x: number; z: number; s: number; hex: number }[] = [];
  for (const r of OSM_DATA.roads) {
    if (r.hw !== 'secondary' && r.hw !== 'tertiary') continue;
    for (let i = 0; i < r.pts.length - 1; i += 2) {
      const a = r.pts[i];
      const b = r.pts[i + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 10) continue;
      const nx = -(b[1] - a[1]) / len;
      const nz = (b[0] - a[0]) / len;
      const steps = Math.min(8, Math.floor(len / 18));
      for (let s = 0; s < steps; s++) {
        const t = (s + 0.35) / Math.max(1, steps);
        const side = (i + s) % 2 === 0 ? 1 : -1;
        const tx = a[0] + (b[0] - a[0]) * t + nx * side * (6.2 + ((i + s) % 4) * 1.1);
        const tz = a[1] + (b[1] - a[1]) * t + nz * side * (6.2 + ((i + s) % 4) * 1.1);
        if (getTerrainHeight(tx, tz) < WATER_LEVEL + 0.6) continue;
        tufts.push({
          x: tx,
          z: tz,
          s: 0.45 + ((i * 5 + s * 7) % 5) * 0.1,
          hex: (i + s) % 5 === 0 ? 0xc8b236 : (i + s) % 3 === 0 ? 0x527d32 : 0x628e39
        });
      }
    }
  }
  if (tufts.length > 0) {
    const tuftGeo = new THREE.DodecahedronGeometry(0.32, 0);
    const tuftMat = new THREE.MeshStandardMaterial({ roughness: 0.94 });
    const tuftInst = new THREE.InstancedMesh(tuftGeo, tuftMat, tufts.length);
    tufts.forEach((tf, idx) => {
      const gy = getTerrainHeight(tf.x, tf.z);
      dummy.position.set(tf.x, gy + 0.14 * tf.s, tf.z);
      dummy.rotation.set(0, idx * 1.3, 0);
      dummy.scale.set(tf.s * 1.4, tf.s * 0.72, tf.s * 1.4);
      dummy.updateMatrix();
      tuftInst.setMatrixAt(idx, dummy.matrix);
      col.setHex(tf.hex);
      tuftInst.setColorAt(idx, col);
    });
    tuftInst.instanceMatrix.needsUpdate = true;
    if (tuftInst.instanceColor) tuftInst.instanceColor.needsUpdate = true;
    scene.add(tuftInst);
  }

  // === 8. OPEN-COUNTRY BAVARIAN CROP STRIPS (GOLDEN WHEAT & TALL MAIZE ROWS!) ===
  // Placed cleanly beside Münsinger Straße, Ried & Weipertshausen so fields read lush and cultivated every ~150 m!
  const wheatPos: { x: number; z: number; s: number }[] = [];
  const maizePos: { x: number; z: number; s: number }[] = [];

  const addCropBlock = (
    target: { x: number; z: number; s: number }[],
    x0: number,
    z0: number,
    rows: number,
    cols: number,
    stepX: number,
    stepZ: number,
    rot = 0
  ) => {
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lx = (c - cols * 0.5) * stepX + ((r * 7 + c * 3) % 3) * 0.25;
        const lz = (r - rows * 0.5) * stepZ + ((r * 5 + c * 11) % 3) * 0.25;
        const wx = x0 + lx * cos - lz * sin;
        const wz = z0 + lx * sin + lz * cos;
        if (getTerrainHeight(wx, wz) < WATER_LEVEL + 1.2) continue;
        if (distToPavedRoad(wx, wz) < 10.5) continue;
        target.push({ x: wx, z: wz, s: 0.85 + ((r * 13 + c * 7) % 5) * 0.08 });
      }
    }
  };

  // Golden Wheat / Barley Strips flanking Münsinger Straße & Ried–Weipertshausen
  addCropBlock(wheatPos, 545, 912, 8, 22, 3.6, 3.2, -0.18);
  addCropBlock(wheatPos, 355, 1022, 7, 18, 3.8, 3.4, 0.1);
  addCropBlock(wheatPos, 1015, 932, 7, 18, 3.6, 3.2, 0.06);
  addCropBlock(wheatPos, 35, 295, 7, 16, 3.8, 3.4, -0.1);
  addCropBlock(wheatPos, 610, -915, 7, 16, 3.8, 3.4, 0.08);

  // Tall Bavarian Green Maize (Silomais) Strips with golden tassels!
  addCropBlock(maizePos, 325, 918, 7, 16, 3.2, 3.0, -0.14);
  addCropBlock(maizePos, 775, 922, 8, 20, 3.2, 3.0, 0.08);
  addCropBlock(maizePos, 645, 1022, 7, 18, 3.2, 3.0, -0.06);
  addCropBlock(maizePos, 365, -415, 7, 15, 3.4, 3.0, 0.14);
  addCropBlock(maizePos, -90, 565, 6, 14, 3.4, 3.0, -0.2);

  if (wheatPos.length > 0) {
    const wheatGeo = new THREE.BoxGeometry(2.1, 0.68, 2.3);
    const wheatMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94 });
    const wheatInst = new THREE.InstancedMesh(wheatGeo, wheatMat, wheatPos.length);
    wheatPos.forEach((p, idx) => {
      const gy = getTerrainHeight(p.x, p.z);
      dummy.position.set(p.x, gy + 0.3 * p.s, p.z);
      dummy.rotation.set(((idx % 3) - 1) * 0.04, ((idx % 5) - 2) * 0.14, ((idx % 5) - 2) * 0.04);
      dummy.scale.set(p.s * 1.15, p.s * 0.95, p.s * 1.15);
      dummy.updateMatrix();
      wheatInst.setMatrixAt(idx, dummy.matrix);
      col.setHex(idx % 3 === 0 ? 0xd2b34e : idx % 3 === 1 ? 0xc2a141 : 0xdec25d);
      wheatInst.setColorAt(idx, col);
    });
    wheatInst.instanceMatrix.needsUpdate = true;
    if (wheatInst.instanceColor) wheatInst.instanceColor.needsUpdate = true;
    scene.add(wheatInst);
  }

  if (maizePos.length > 0) {
    // Dense planted Bavarian maize rows (rectangular leafy crop rows + golden tassel crowns — never spaced cones!)
    const stalkGeo = new THREE.BoxGeometry(1.15, 1.55, 2.55);
    const stalkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.91 });
    const tasselGeo = new THREE.BoxGeometry(0.95, 0.24, 2.35);
    const tasselMat = new THREE.MeshStandardMaterial({ color: 0xd4b654, roughness: 0.92 });
    const stalkInst = new THREE.InstancedMesh(stalkGeo, stalkMat, maizePos.length);
    const tasselInst = new THREE.InstancedMesh(tasselGeo, tasselMat, maizePos.length);
    maizePos.forEach((p, idx) => {
      const gy = getTerrainHeight(p.x, p.z);
      dummy.position.set(p.x, gy + 0.72 * p.s, p.z);
      dummy.rotation.set(0, 0.08 + ((idx % 3) - 1) * 0.04, ((idx % 3) - 1) * 0.03);
      dummy.scale.set(p.s, p.s, p.s);
      dummy.updateMatrix();
      stalkInst.setMatrixAt(idx, dummy.matrix);
      col.setHex(idx % 3 === 0 ? 0x43722a : idx % 3 === 1 ? 0x508232 : 0x3a6525);
      stalkInst.setColorAt(idx, col);

      dummy.position.set(p.x, gy + 1.56 * p.s, p.z);
      dummy.scale.set(p.s, p.s, p.s);
      dummy.updateMatrix();
      tasselInst.setMatrixAt(idx, dummy.matrix);
    });
    stalkInst.instanceMatrix.needsUpdate = true;
    tasselInst.instanceMatrix.needsUpdate = true;
    if (stalkInst.instanceColor) stalkInst.instanceColor.needsUpdate = true;
    scene.add(stalkInst, tasselInst);
  }

  // === 9. CONTINUOUS FIELD-EDGE HEDGEROWS (HECKEN) & WOODLAND EDGE UNDERGROWTH ===
  const hedgeLobes: { x: number; z: number; sx: number; sy: number; sz: number; hex: number }[] = [];
  const hedgerowLines: [number, number, number, number][] = [
    // Field edges flanking Münsinger Straße (x = 220..1150)
    [230, 885, 425, 875],
    [455, 868, 668, 862],
    [688, 878, 905, 872],
    [930, 895, 1135, 908],
    [285, 995, 495, 992],
    [545, 992, 765, 992],
    [805, 998, 1035, 1005],
    [445, 760, 445, 925],
    [682, 770, 682, 945],
    [920, 780, 922, 955],
    // Wimpasing -> Ried -> Weipertshausen field borders
    [-165, 615, 75, 608],
    [-130, 355, 145, 345],
    [220, -335, 435, -330],
    [305, -770, 465, -765],
    [545, -830, 745, -825]
  ];
  for (const [x1, z1, x2, z2] of hedgerowLines) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const count = Math.max(4, Math.floor(len / 5.5));
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const hx = x1 + (x2 - x1) * t + Math.sin(i * 2.3) * 0.9;
      const hz = z1 + (z2 - z1) * t + Math.cos(i * 1.9) * 0.9;
      if (getTerrainHeight(hx, hz) < WATER_LEVEL + 1.0) continue;
      if (distToPavedRoad(hx, hz) < 9.5) continue;
      const sc = 1.0 + ((i * 7) % 5) * 0.22;
      hedgeLobes.push({
        x: hx,
        z: hz,
        sx: sc * 1.9,
        sy: sc * 1.25,
        sz: sc * 1.7,
        hex: i % 4 === 0 ? 0x355f27 : i % 4 === 1 ? 0x43702f : i % 4 === 2 ? 0x4f7d34 : 0x3c682b
      });
    }
  }
  // Woodland edge saplings & bushes ringing OSM forest borders
  for (const f of OSM_DATA.forests) {
    const hw = f.w * 0.48;
    const hd = f.d * 0.48;
    for (let side = 0; side < 4; side++) {
      for (let k = 0; k < 5; k++) {
        const u = (k + 0.5) / 5 - 0.5;
        const ex = side < 2 ? f.x + u * f.w * 0.85 : f.x + (side === 2 ? hw : -hw);
        const ez = side >= 2 ? f.z + u * f.d * 0.85 : f.z + (side === 0 ? hd : -hd);
        if (ex < getShorelineX(ez) + 10) continue;
        if (getTerrainHeight(ex, ez) < WATER_LEVEL + 1.0) continue;
        hedgeLobes.push({
          x: ex,
          z: ez,
          sx: 2.2,
          sy: 1.6,
          sz: 2.1,
          hex: k % 2 === 0 ? 0x2f5824 : 0x3d692c
        });
      }
    }
  }
  if (hedgeLobes.length > 0) {
    const hGeo = new THREE.DodecahedronGeometry(1.1, 1);
    const hMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.91 });
    const hInst = new THREE.InstancedMesh(hGeo, hMat, hedgeLobes.length);
    hInst.castShadow = true;
    hedgeLobes.forEach((h, idx) => {
      const gy = getTerrainHeight(h.x, h.z);
      dummy.position.set(h.x, gy + h.sy * 0.58, h.z);
      dummy.rotation.set(0.08, idx * 1.35, -0.05);
      dummy.scale.set(h.sx, h.sy, h.sz);
      dummy.updateMatrix();
      hInst.setMatrixAt(idx, dummy.matrix);
      col.setHex(h.hex);
      hInst.setColorAt(idx, col);
    });
    hInst.instanceMatrix.needsUpdate = true;
    if (hInst.instanceColor) hInst.instanceColor.needsUpdate = true;
    scene.add(hInst);
  }

  // === 10. BAVARIAN HAY HUTS (HEUSTADL), CATTLE FEEDING RACKS & GRAZING FLECKVIEH COWS ===
  const hutWoodMat = new THREE.MeshStandardMaterial({ map: createBarnWoodTexture(), color: 0x8f6642, roughness: 0.93 });
  const hutRoofMat = new THREE.MeshStandardMaterial({ color: 0x6f432b, roughness: 0.86 });
  const realHayMat = new THREE.MeshStandardMaterial({ map: createHayTexture(), roughness: 0.94 });
  const stoneCornerMat = new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 0.94 });
  const troughMat = new THREE.MeshStandardMaterial({ color: 0x7e8a92, roughness: 0.45, metalness: 0.45 });
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x3b7a8c, roughness: 0.18 });

  // 7 Wooden Bavarian Field Hay Huts (Heustadl) placed along open-country pastures every ~180 m!
  const hayHutSpots: [number, number, number][] = [
    [390, 932, 0.25], // Open country Münsinger Straße west
    [595, 978, -0.35], // Open country Münsinger Straße mid
    [855, 922, 0.18], // Open country Münsinger Straße east
    [1110, 952, -0.22], // Approach to Münsing
    [-85, 535, 0.6], // Wimpasing–Ried meadow
    [335, -280, -0.15], // Weipertshausener Straße south
    [435, -890, 0.2] // Weipertshausener Straße north
  ];
  for (const [hx, hz, rot] of hayHutSpots) {
    if (distToPavedRoad(hx, hz) < 11.0) continue;
    const gy = getTerrainHeight(hx, hz);
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.48, 4.4), stoneCornerMat);
    base.position.y = 0.24;
    g.add(base);
    const body = new THREE.Mesh(new THREE.BoxGeometry(5.5, 3.1, 4.1), hutWoodMat);
    body.position.y = 1.95;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    // Double barn door & golden hay peeking from upper hayloft opening
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.2, 0.12), darkWood);
    door.position.set(0, 1.45, 2.08);
    g.add(door);
    const loftHay = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.72, 0.24), realHayMat);
    loftHay.position.set(1.6, 2.75, 2.05);
    g.add(loftHay);
    // Overhanging pitched timber roof
    const roofL = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.18, 2.85), hutRoofMat);
    roofL.position.set(0, 4.02, -1.15);
    roofL.rotation.x = -0.38;
    roofL.castShadow = true;
    g.add(roofL);
    const roofR = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.18, 2.85), hutRoofMat);
    roofR.position.set(0, 4.02, 1.15);
    roofR.rotation.x = 0.38;
    roofR.castShadow = true;
    g.add(roofR);
    // Pair of hay bales resting beside the hut
    const b1 = new THREE.Mesh(baleGeo, realHayMat);
    b1.position.set(3.8, 0.78, 0.5);
    b1.castShadow = true;
    g.add(b1);
    const b2 = new THREE.Mesh(baleGeo, realHayMat);
    b2.position.set(3.8, 0.78, -0.9);
    g.add(b2);

    g.position.set(hx, gy - 0.08, hz);
    g.rotation.y = rot;
    scene.add(g);
  }

  // Cattle Feeding Racks (Heuraufen) & Water Troughs + Grazing Bavarian Fleckvieh Dairy Cows!
  const cowWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf6f3ea, roughness: 0.85 });
  const cowPatchMat = new THREE.MeshStandardMaterial({ color: 0x8e4c24, roughness: 0.88 });
  const cowDarkMat = new THREE.MeshStandardMaterial({ color: 0x3b2618, roughness: 0.9 });
  const cowPinkMat = new THREE.MeshStandardMaterial({ color: 0xe6a89c, roughness: 0.82 });

  const makeFleckviehCow = (seed: number): THREE.Group => {
    const cg = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.86, 1.85), cowWhiteMat);
    torso.position.y = 1.18;
    torso.castShadow = true;
    cg.add(torso);
    // Warm chestnut-brown Bavarian Fleckvieh saddle & flank patches
    const patch1 = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.56, 0.78), cowPatchMat);
    patch1.position.set(0, 1.28, -0.15 + (seed % 2) * 0.25);
    cg.add(patch1);
    const patch2 = new THREE.Mesh(new THREE.BoxGeometry(0.91, 0.42, 0.48), cowPatchMat);
    patch2.position.set(0, 1.12, 0.55);
    cg.add(patch2);
    // Grazing head (tilted slightly down toward grass on even cows, looking up on odd cows)
    const grazing = seed % 2 === 0;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.46, 0.62), cowWhiteMat);
    head.position.set(0, grazing ? 0.78 : 1.38, -1.16);
    head.rotation.x = grazing ? 0.52 : 0.05;
    cg.add(head);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.16), cowPinkMat);
    snout.position.set(0, grazing ? 0.6 : 1.3, -1.48);
    cg.add(snout);
    for (const ex of [-0.32, 0.32]) {
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.12), cowPatchMat);
      ear.position.set(ex, grazing ? 0.92 : 1.54, -1.04);
      cg.add(ear);
    }
    // 4 sturdy legs
    for (const lx of [-0.3, 0.3]) {
      for (const lz of [-0.66, 0.66]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.82, 0.18), cowWhiteMat);
        leg.position.set(lx, 0.41, lz);
        cg.add(leg);
        const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.12, 0.19), cowDarkMat);
        hoof.position.set(lx, 0.06, lz);
        cg.add(hoof);
      }
    }
    return cg;
  };

  const pastures: { x: number; z: number; cows: number }[] = [
    { x: 520, z: 985, cows: 5 }, // Directly beside Münsinger Straße open country!
    { x: 705, z: 928, cows: 5 }, // North pasture along Münsinger Straße
    { x: 965, z: 1015, cows: 4 }, // South pasture approaching Münsing
    { x: -120, z: 665, cows: 4 }, // Wimpasing–Ried meadow pasture
    { x: 405, z: -690, cows: 4 }, // Weipertshausener Straße pasture
    { x: 275, z: 960, cows: 4 } // East of Wimpasing slope pasture
  ];

  pastures.forEach((p, pi) => {
    // Feeding rack (Heuraufe) + galvanized water trough at each pasture
    if (distToPavedRoad(p.x, p.z) < 10.5) return;
    const ry = getTerrainHeight(p.x, p.z);
    const rack = new THREE.Group();
    for (const sx of [-1.2, 1.2]) {
      for (const sz of [-0.7, 0.7]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.12), darkWood);
        leg.position.set(sx, 1.1, sz);
        rack.add(leg);
      }
    }
    const hayFill = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.95, 1.15), realHayMat);
    hayFill.position.y = 1.05;
    hayFill.castShadow = true;
    rack.add(hayFill);
    const rackRoof = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.14, 2.0), hutRoofMat);
    rackRoof.position.y = 2.28;
    rackRoof.castShadow = true;
    rack.add(rackRoof);
    const trough = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.62, 0.86), troughMat);
    trough.position.set(3.4, 0.31, 0.4);
    rack.add(trough);
    const water = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.08, 0.72), waterMat);
    water.position.set(3.4, 0.58, 0.4);
    rack.add(water);
    rack.position.set(p.x, ry - 0.05, p.z);
    rack.rotation.y = pi * 0.6;
    scene.add(rack);

    // Grazing Bavarian Fleckvieh herd around the feeding rack
    for (let c = 0; c < p.cows; c++) {
      const ang = (c / p.cows) * Math.PI * 2 + pi * 0.9;
      const dist = 6.5 + (c % 3) * 4.5;
      const cx = p.x + Math.cos(ang) * dist;
      const cz = p.z + Math.sin(ang) * dist;
      if (distToPavedRoad(cx, cz) < 8.5) continue;
      const cy = getTerrainHeight(cx, cz);
      const cow = makeFleckviehCow(pi * 7 + c);
      cow.position.set(cx, cy - 0.04, cz);
      cow.rotation.y = ang + 1.2;
      scene.add(cow);
    }
  });

  // === 11. PARKED VINTAGE BAVARIAN FARM TRACTORS & TRAILERS AT FIELD GATES ===
  const tractorColors = [0x2a6d33, 0xc23526, 0x26628c, 0x3b7a38, 0xb83824]; // Fendt green, IHC red, Eicher blue
  const parkedTractors: [number, number, number][] = [
    [308, 944, 0.6], // Field gate east of Wimpasing
    [486, 914, -0.8], // Open-country Münsinger Straße wheat field gate!
    [640, 998, -1.2], // Mid Münsinger Straße meadow gate!
    [945, 954, 0.4], // East Münsinger Straße approach
    [-192, 472, 1.2], // Ried south field gate
    [455, -525, -0.3] // Weipertshausener Straße meadow gate
  ];
  const cabGlassMat = new THREE.MeshStandardMaterial({ color: 0x223340, roughness: 0.15, metalness: 0.45 });
  const rimYellowMat = new THREE.MeshStandardMaterial({ color: 0xd93a28, roughness: 0.4 });
  const trailerWoodMat = new THREE.MeshStandardMaterial({ color: 0x6f5534, roughness: 0.9 });

  parkedTractors.forEach(([tx, tz, rot], ti) => {
    if (distToPavedRoad(tx, tz) < 10.5) return;
    const gy = getTerrainHeight(tx, tz);
    const tg = new THREE.Group();
    const bodyPaint = new THREE.MeshStandardMaterial({
      color: tractorColors[ti % tractorColors.length],
      roughness: 0.42,
      metalness: 0.25
    });
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.72, 3.1), metalGrey);
    chassis.position.y = 0.85;
    chassis.castShadow = true;
    tg.add(chassis);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.92, 1.95), bodyPaint);
    hood.position.set(0, 1.48, -0.52);
    hood.castShadow = true;
    tg.add(hood);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.38, 1.25, 1.28), cabGlassMat);
    cab.position.set(0, 1.92, 0.85);
    cab.castShadow = true;
    tg.add(cab);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.14, 1.42), cowWhiteMat);
    roof.position.set(0, 2.58, 0.85);
    tg.add(roof);
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 1.25, 6), metalGrey);
    exhaust.position.set(0.45, 2.25, -0.65);
    tg.add(exhaust);

    // Big rear agricultural lug tires + smaller front steered tires
    for (const sx of [-0.92, 0.92]) {
      const rTire = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.42, 12), tireMat);
      rTire.rotation.z = Math.PI / 2;
      rTire.position.set(sx, 0.78, 0.92);
      rTire.castShadow = true;
      tg.add(rTire);
      const rRim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.45, 10), rimYellowMat);
      rRim.rotation.z = Math.PI / 2;
      rRim.position.set(sx, 0.78, 0.92);
      tg.add(rRim);

      const fTire = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.3, 10), tireMat);
      fTire.rotation.z = Math.PI / 2;
      fTire.position.set(sx * 0.88, 0.52, -1.05);
      tg.add(fTire);
      const fRim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.33, 8), rimYellowMat);
      fRim.rotation.z = Math.PI / 2;
      fRim.position.set(sx * 0.88, 0.52, -1.05);
      tg.add(fRim);
    }

    // Parked hay wagon hitched behind alternating field-gate tractors
    if (ti % 2 === 0) {
      const bed = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.95, 4.2), trailerWoodMat);
      bed.position.set(0, 1.25, 4.4);
      bed.castShadow = true;
      tg.add(bed);
      const loadHay = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.65, 3.8), realHayMat);
      loadHay.position.set(0, 1.92, 4.4);
      tg.add(loadHay);
      for (const sx of [-1.05, 1.05]) {
        for (const tzOff of [3.2, 5.4]) {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.26, 10), tireMat);
          w.rotation.z = Math.PI / 2;
          w.position.set(sx, 0.44, tzOff);
          tg.add(w);
        }
      }
    }

    tg.position.set(tx, gy - 0.04, tz);
    tg.rotation.y = rot;
    scene.add(tg);
  });
}
