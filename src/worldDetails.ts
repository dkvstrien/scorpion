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

  // Wayside Shrines (Marterl / Feldkreuz) along open country crossroads!
  const marterlSpots: [number, number, number][] = [
    [454, 954, 0.3], // Right beside Open Country Münsinger Straße viewpoint!
    [920, 825, -0.4],
    [-210, 620, 0.8],
    [420, -450, 0.1],
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
    [482, 938], // Open country meadow hay bale stack along Münsinger Straße!
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

    // On real farmyards (not the open-road meadow stack), add a cylindrical green slurry tank & tarped silage clamp!
    if (fIdx !== 3) {
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
  const fTrunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 2.2, 6);
  const fTrunkMat = new THREE.MeshStandardMaterial({ color: 0x563c24, roughness: 0.94 });
  const fCrownGeo = new THREE.DodecahedronGeometry(2.0, 1);
  const fCrownMat = new THREE.MeshStandardMaterial({ roughness: 0.86 });
  const fTrunks = new THREE.InstancedMesh(fTrunkGeo, fTrunkMat, orchardSpots.length);
  const fCrowns = new THREE.InstancedMesh(fCrownGeo, fCrownMat, orchardSpots.length);
  fTrunks.castShadow = true;
  fCrowns.castShadow = true;
  orchardSpots.forEach(([ox, oz, sc], idx) => {
    const gy = getTerrainHeight(ox, oz);
    dummy.position.set(ox, gy + 1.05 * sc, oz);
    dummy.rotation.set(0, idx * 1.1, 0);
    dummy.scale.set(sc, sc, sc);
    dummy.updateMatrix();
    fTrunks.setMatrixAt(idx, dummy.matrix);

    dummy.position.set(ox, gy + 2.95 * sc, oz);
    dummy.scale.set(sc * 1.18, sc * 0.92, sc * 1.12);
    dummy.updateMatrix();
    fCrowns.setMatrixAt(idx, dummy.matrix);
    col.setHex(idx % 3 === 0 ? 0x5c8c38 : idx % 3 === 1 ? 0x6c993c : 0x4f7f32);
    fCrowns.setColorAt(idx, col);
  });
  fTrunks.instanceMatrix.needsUpdate = true;
  fCrowns.instanceMatrix.needsUpdate = true;
  if (fCrowns.instanceColor) fCrowns.instanceColor.needsUpdate = true;
  scene.add(fTrunks, fCrowns);

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
}
