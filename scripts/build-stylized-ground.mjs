import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ORIGIN_E, ORIGIN_N, wgs84ToUtm32 } from './build-bavaria-terrain.mjs';

const muensingData = JSON.parse(fs.readFileSync(path.resolve('src/data/muensingData.json'), 'utf8'));
const { minX: WORLD_MIN_X, maxX: WORLD_MAX_X, minZ: WORLD_MIN_Z, maxZ: WORLD_MAX_Z } = muensingData.meta;
const MID_X = (WORLD_MIN_X + WORLD_MAX_X) * 0.5;
const MID_Z = (WORLD_MIN_Z + WORLD_MAX_Z) * 0.5;

const rawDir = path.resolve('data-cache/dop_raw');
const outDir = path.resolve('public/map');
fs.mkdirSync(rawDir, { recursive: true });

function projectLatLon(lat, lon) {
  const [E, N] = wgs84ToUtm32(lat, lon);
  return [E - ORIGIN_E, -(N - ORIGIN_N)];
}

function getShorelineX(z) {
  const pts = [
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

function loadOsmFeatures() {
  const osm = JSON.parse(fs.readFileSync(path.resolve('data-cache/osm_1to1.json'), 'utf8'));
  const nodeMap = new Map();
  for (const el of osm.elements) {
    if (el.type === 'node') nodeMap.set(el.id, el);
  }

  const forests = [];
  const farmlands = [];
  const meadows = [];
  const residentials = [];
  const waters = [];
  const buildings = [];
  const roadsMain = [];
  const roadsVillage = [];
  const roadsTrack = [];

  for (const el of osm.elements) {
    if (el.type !== 'way' || !el.nodes || !el.tags) continue;
    const pts = [];
    for (const nid of el.nodes) {
      const n = nodeMap.get(nid);
      if (n) pts.push(projectLatLon(n.lat, n.lon));
    }
    if (pts.length < 2) continue;

    const t = el.tags;
    if (t.highway) {
      if (t.highway === 'secondary' || t.highway === 'tertiary') roadsMain.push(pts);
      else if (t.highway === 'track' || t.highway === 'service') roadsTrack.push(pts);
      else roadsVillage.push(pts);
    } else if (t.building && pts.length >= 3) {
      buildings.push(pts);
    } else if ((t.landuse === 'forest' || t.natural === 'wood') && pts.length >= 3) {
      forests.push(pts);
    } else if (t.landuse === 'farmland' && pts.length >= 3) {
      farmlands.push({ id: el.id, pts });
    } else if (t.landuse === 'meadow' && pts.length >= 3) {
      meadows.push({ id: el.id, pts });
    } else if (t.landuse === 'residential' && pts.length >= 3) {
      residentials.push(pts);
    } else if (t.natural === 'water' && pts.length >= 3) {
      waters.push(pts);
    }
  }

  return { forests, farmlands, meadows, residentials, waters, buildings, roadsMain, roadsVillage, roadsTrack };
}

/**
 * Sanitizes a raw Bavaria DOP20 aerial tile into a clean, glare-free Bavarian countryside colour base:
 * removes ALL bright white roofs, pale concrete/gravel smears, and black cast shadows that otherwise read
 * as "melting snow" on the terrain, while preserving subtle natural field/meadow tonal rhythm!
 */
function sanitizeDopToMeadowBase(rawBuf, w, h, ch) {
  const out = Buffer.alloc(w * h * 3);
  // Target rich Upper Bavarian meadow green (sRGB): RGB(92, 134, 62)
  const baseR = 92;
  const baseG = 134;
  const baseB = 62;

  for (let i = 0, o = 0; i < rawBuf.length; i += ch, o += 3) {
    const r = rawBuf[i];
    const g = rawBuf[i + 1];
    const b = rawBuf[i + 2];

    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const sat = maxC > 1 ? (maxC - minC) / maxC : 0;

    // 1. Any bright white/grey/purple concrete, roof, road, car, or pale smear -> clean meadow green!
    // 2. Any pitch-black tree/building cast shadow -> clean deep meadow green!
    // 3. Any red/orange roof tiles or blue/purple glare leaking through raw aerial -> clean meadow green!
    const isWhiteOrGreySmear = lum > 128 && sat < 0.30;
    const isPurpleOrBlueSmear = b > g * 0.88 && lum > 50;
    const isGlare = lum > 168 || (b > 128 && r > 128);
    const isRoofRed = r > g + 16 && r > b + 20;

    if (isWhiteOrGreySmear || isPurpleOrBlueSmear || isGlare || isRoofRed) {
      out[o] = baseR;
      out[o + 1] = baseG;
      out[o + 2] = baseB;
      continue;
    }

    if (lum < 56) {
      // Dark forest / shadow -> rich woodland green (never charcoal smudge!)
      out[o] = 68;
      out[o + 1] = 104;
      out[o + 2] = 48;
      continue;
    }

    // Natural vegetation / pasture / soil pixels: preserve genuine Bavarian crop & meadow color differences
    // (golden harvest, ploughed earth, lush clover, dark pasture) with zero muddy grey/purple smears!
    const isSoil = r > g * 0.96 && r > b * 1.18 && lum < 146;
    if (isSoil) {
      out[o] = Math.round(baseR * 0.32 + Math.min(156, r) * 0.68);
      out[o + 1] = Math.round(baseG * 0.36 + Math.min(142, g) * 0.64);
      out[o + 2] = Math.round(baseB * 0.44 + Math.min(84, b) * 0.56);
    } else {
      const lumFactor = Math.max(0.74, Math.min(1.2, lum / 104));
      const nr = Math.round(baseR * (0.58 + 0.42 * lumFactor) + (r - lum) * 0.34);
      const ng = Math.round(baseG * (0.58 + 0.42 * lumFactor) + (g - lum) * 0.38);
      const nb = Math.round(baseB * (0.58 + 0.42 * lumFactor) + (b - lum) * 0.16);
      out[o] = Math.max(58, Math.min(142, nr));
      out[o + 1] = Math.max(92, Math.min(162, ng));
      out[o + 2] = Math.max(40, Math.min(76, nb));
    }
  }
  return out;
}

function buildQuadrantSvg(q, W, H, osm) {
  const sx = (wx) => (((wx - q.minX) / (q.maxX - q.minX)) * W).toFixed(1);
  const sy = (wz) => (((wz - q.minZ) / (q.maxZ - q.minZ)) * H).toFixed(1);
  const pxPerM = W / (q.maxX - q.minX);
  const pad = 60;

  const overlaps = (pts) => {
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (const [x, z] of pts) {
      if (x < minx) minx = x;
      if (x > maxx) maxx = x;
      if (z < minz) minz = z;
      if (z > maxz) maxz = z;
    }
    return maxx >= q.minX - pad && minx <= q.maxX + pad && maxz >= q.minZ - pad && minz <= q.maxZ + pad;
  };

  const toPointsAttr = (pts) => pts.map(([x, z]) => `${sx(x)},${sy(z)}`).join(' ');

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  parts.push(`<defs>
    <pattern id="plough" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(24)">
      <rect width="14" height="14" fill="#826846"/>
      <line x1="0" y1="3" x2="14" y2="3" stroke="#6c5335" stroke-width="2.8"/>
      <line x1="0" y1="10" x2="14" y2="10" stroke="#987d56" stroke-width="2.0"/>
    </pattern>
    <pattern id="stubble" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(-18)">
      <rect width="16" height="16" fill="#a8984e"/>
      <line x1="0" y1="4" x2="16" y2="4" stroke="#92823d" stroke-width="2.8"/>
      <line x1="0" y1="12" x2="16" y2="12" stroke="#bdb062" stroke-width="2.2"/>
    </pattern>
    <pattern id="wheat" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(8)">
      <rect width="14" height="14" fill="#c2a44c"/>
      <rect x="0" y="0" width="14" height="7" fill="#cfb35c" fill-opacity="0.55"/>
    </pattern>
    <pattern id="mown" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(14)">
      <rect width="18" height="18" fill="#63903d"/>
      <rect x="0" y="0" width="18" height="9" fill="#77a74b" fill-opacity="0.62"/>
    </pattern>
    <pattern id="mown2" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(-28)">
      <rect width="18" height="18" fill="#578538"/>
      <rect x="0" y="0" width="18" height="9" fill="#6ea046" fill-opacity="0.58"/>
    </pattern>
    <pattern id="clover" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(36)">
      <rect width="16" height="16" fill="#4f7e34"/>
      <rect x="0" y="0" width="16" height="8" fill="#5d8f3e" fill-opacity="0.52"/>
    </pattern>
  </defs>`);

  // 1. OSM Farmland patchwork (mown hay stripes, golden wheat, maize stubble, ploughed earth, clover)
  const farmFills = ['url(#mown)', 'url(#stubble)', 'url(#plough)', 'url(#wheat)', 'url(#mown2)', 'url(#clover)'];
  for (const f of osm.farmlands) {
    if (!overlaps(f.pts)) continue;
    const fill = farmFills[f.id % farmFills.length];
    // Crisp earthen headland track & hedgerow border along every field boundary
    parts.push(`<polygon points="${toPointsAttr(f.pts)}" fill="${fill}" fill-opacity="0.90" stroke="#7d7452" stroke-width="${(3.2 * pxPerM).toFixed(1)}" stroke-linejoin="round"/>`);
    parts.push(`<polygon points="${toPointsAttr(f.pts)}" fill="none" stroke="#476e2e" stroke-width="${(1.5 * pxPerM).toFixed(1)}" stroke-linejoin="round"/>`);
  }

  // 2. OSM Meadows (striped mown hayfields & varied Bavarian pasture greens with crisp boundaries!)
  const meadowFills = ['url(#mown)', 'url(#mown2)', 'url(#clover)', '#639040', '#709c48'];
  for (const m of osm.meadows) {
    if (!overlaps(m.pts)) continue;
    const fill = meadowFills[m.id % meadowFills.length];
    parts.push(`<polygon points="${toPointsAttr(m.pts)}" fill="${fill}" fill-opacity="0.86" stroke="#5c783f" stroke-width="${(2.2 * pxPerM).toFixed(1)}" stroke-linejoin="round"/>`);
  }

  // 2b. Break up any large unmapped open-country slopes along Münsinger Straße (x 200..1180, z 450..1180)
  // with authentic Bavarian mowed hay stripes, barley/maize field patches & dirt field-edge tracks!
  const openCountryFields = [
    { pts: [[210, 880], [435, 865], [448, 955], [220, 975]], fill: 'url(#mown)' },
    { pts: [[448, 840], [670, 835], [682, 950], [456, 955]], fill: 'url(#wheat)' },
    { pts: [[682, 855], [910, 845], [925, 960], [690, 965]], fill: 'url(#mown2)' },
    { pts: [[922, 860], [1145, 875], [1155, 975], [932, 970]], fill: 'url(#stubble)' },
    { pts: [[260, 995], [510, 985], [525, 1110], [275, 1125]], fill: 'url(#stubble)' },
    { pts: [[525, 980], [775, 978], [790, 1115], [538, 1115]], fill: 'url(#mown)' },
    { pts: [[790, 985], [1055, 995], [1065, 1120], [802, 1115]], fill: 'url(#plough)' },
    { pts: [[235, 675], [465, 670], [480, 820], [248, 825]], fill: 'url(#plough)' },
    { pts: [[480, 675], [735, 685], [748, 825], [492, 820]], fill: 'url(#clover)' },
    { pts: [[748, 695], [1015, 705], [1025, 835], [760, 825]], fill: 'url(#mown)' },
    // North meadow corridor toward Ried & Weipertshausen
    { pts: [[-180, 480], [95, 470], [105, 610], [-165, 620]], fill: 'url(#mown2)' },
    { pts: [[-140, 180], [160, 175], [175, 345], [-125, 355]], fill: 'url(#wheat)' },
    { pts: [[195, -520], [440, -510], [450, -320], [210, -330]], fill: 'url(#stubble)' },
    { pts: [[280, -960], [475, -955], [482, -760], [295, -770]], fill: 'url(#mown)' },
    { pts: [[535, -1040], [765, -1030], [772, -820], [545, -830]], fill: 'url(#wheat)' }
  ];
  for (const cf of openCountryFields) {
    if (!overlaps(cf.pts)) continue;
    parts.push(`<polygon points="${toPointsAttr(cf.pts)}" fill="${cf.fill}" fill-opacity="0.82" stroke="#7d7252" stroke-width="${(3.0 * pxPerM).toFixed(1)}" stroke-linejoin="round"/>`);
  }

  // 3. OSM Forests / Woods (deep mossy Bavarian woodland floor with rich darker forest edge)
  for (const pts of osm.forests) {
    if (!overlaps(pts)) continue;
    parts.push(`<polygon points="${toPointsAttr(pts)}" fill="#3d602f" fill-opacity="0.88" stroke="#325226" stroke-width="${(3.8 * pxPerM).toFixed(1)}" stroke-linejoin="round"/>`);
  }

  // 4. OSM Residential village zones (crisp clean Bavarian garden lawns — 96% opaque so ZERO purple/grey DOP20 smears bleed through!)
  for (const pts of osm.residentials) {
    if (!overlaps(pts)) continue;
    parts.push(`<polygon points="${toPointsAttr(pts)}" fill="#5c8a3f" fill-opacity="0.96" stroke="#527d38" stroke-width="${(2.2 * pxPerM).toFixed(1)}"/>`);
  }

  // 5. Only EDEKA asphalt loading lot & Sebald compact pad stay on map; Church, Altwirt, Schloss, Home Farm & Demo Site
  // use crisp high-resolution tiled 3D gravel/cobble meshes in Three.js (zero blurry 1 m/px oval discs!)
  const spots = muensingData.spots;
  const plazas = [
    { x: spots.edeka[0], z: spots.edeka[1] + 4, rx: 22, ry: 16, col: '#5a5f63', edge: '#4a5052' }
  ];
  for (const p of plazas) {
    if (p.x + p.rx < q.minX - 20 || p.x - p.rx > q.maxX + 20 || p.z + p.ry < q.minZ - 20 || p.z - p.ry > q.maxZ + 20) continue;
    parts.push(`<rect x="${sx(p.x - p.rx)}" y="${sy(p.z - p.ry)}" width="${(p.rx * 2 * pxPerM).toFixed(1)}" height="${(p.ry * 2 * pxPerM).toFixed(1)}" rx="6" fill="${p.col}" stroke="${p.edge}" stroke-width="${(1.8 * pxPerM).toFixed(1)}"/>`);
  }

  // 6. Clean warm gravel farm tracks & driveways (track + service)
  for (const pts of osm.roadsTrack) {
    if (!overlaps(pts)) continue;
    const pAttr = toPointsAttr(pts);
    parts.push(`<polyline points="${pAttr}" fill="none" stroke="#6a7a46" stroke-width="${(5.2 * pxPerM).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
    parts.push(`<polyline points="${pAttr}" fill="none" stroke="#8e836e" stroke-width="${(3.2 * pxPerM).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }

  // 7. Tight Building Foundation Pads ONLY under real buildings (skip hero landmark zones so zero ghost dark rectangles appear in front of Schloss Ammerland or Münsing Church!)
  const heroClearZones = [
    [spots.schlossAmmerland[0], spots.schlossAmmerland[1], 46],
    [spots.muensingChurch[0], spots.muensingChurch[1], 36],
    [spots.muensingAltwirt[0], spots.muensingAltwirt[1], 28],
    [spots.sebaldPier[0], spots.sebaldPier[1], 24]
  ];
  for (const pts of osm.buildings) {
    if (!overlaps(pts)) continue;
    let cx = 0, cz = 0;
    for (const [bx, bz] of pts) { cx += bx; cz += bz; }
    cx /= pts.length; cz /= pts.length;
    if (heroClearZones.some(([hx, hz, hr]) => Math.hypot(cx - hx, cz - hz) < hr)) continue;
    const pAttr = toPointsAttr(pts);
    // Crisp tight contact-shadow pad strictly inside footprint (no blurry 4.4 m grey halo smear!)
    parts.push(`<polygon points="${pAttr}" fill="#4d6138" stroke="#6f7a58" stroke-width="${(1.1 * pxPerM).toFixed(1)}" stroke-linejoin="round"/>`);
  }

  // 8. Crisp Paved Road Corridors (clean green verge + dark charcoal asphalt roadbed right under the 3D road ribbons!)
  // First draw grass shoulders, then dark asphalt beds so intersections join seamlessly!
  for (const pts of osm.roadsVillage) {
    if (!overlaps(pts)) continue;
    parts.push(`<polyline points="${toPointsAttr(pts)}" fill="none" stroke="#587e3d" stroke-width="${(10.0 * pxPerM).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  for (const pts of osm.roadsMain) {
    if (!overlaps(pts)) continue;
    parts.push(`<polyline points="${toPointsAttr(pts)}" fill="none" stroke="#567c3c" stroke-width="${(13.6 * pxPerM).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  for (const pts of osm.roadsVillage) {
    if (!overlaps(pts)) continue;
    parts.push(`<polyline points="${toPointsAttr(pts)}" fill="none" stroke="#4c5055" stroke-width="${(6.8 * pxPerM).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  for (const pts of osm.roadsMain) {
    if (!overlaps(pts)) continue;
    parts.push(`<polyline points="${toPointsAttr(pts)}" fill="none" stroke="#3e4247" stroke-width="${(9.4 * pxPerM).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }

  // Home Farm East & West access driveways
  const farmYardX = spots.farm[0] - 33.5;
  const farmYardZ = spots.farm[1] + 16.4;
  const farmLanes = [
    [[farmYardX + 20, farmYardZ - 4], [-305, 921.5], [-277.6, 922.2]],
    [[farmYardX - 21, farmYardZ - 5], [-379, 914], [-395.1, 904.6]]
  ];
  for (const pts of farmLanes) {
    if (!overlaps(pts)) continue;
    parts.push(`<polyline points="${toPointsAttr(pts)}" fill="none" stroke="#857d6e" stroke-width="${(6.2 * pxPerM).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }

  // 9. Starnberger See Shoreline Pebble Bank & Deep Emerald Lakebed (west quadrants)
  if (q.minX < -900) {
    const shorePoly = [];
    const bedPoly = [];
    for (let z = q.minZ - 30; z <= q.maxZ + 30; z += 25) {
      const sh = getShorelineX(z);
      shorePoly.push([sh + 6, z]);
      bedPoly.push([sh - 2, z]);
    }
    shorePoly.push([q.minX - 50, q.maxZ + 30], [q.minX - 50, q.minZ - 30]);
    bedPoly.push([q.minX - 50, q.maxZ + 30], [q.minX - 50, q.minZ - 30]);
    parts.push(`<polygon points="${toPointsAttr(shorePoly)}" fill="#928770"/>`);
    parts.push(`<polygon points="${toPointsAttr(bedPoly)}" fill="#23555e"/>`);
  }

  // 10. Small inland OSM ponds/water
  for (const pts of osm.waters) {
    if (!overlaps(pts)) continue;
    // Skip giant Starnberger See way if it covers the whole lake (handled smoothly above)
    if (pts.some(([x]) => x < -1300)) continue;
    parts.push(`<polygon points="${toPointsAttr(pts)}" fill="#2b6e78" stroke="#7d7761" stroke-width="${(1.8 * pxPerM).toFixed(1)}"/>`);
  }

  parts.push('</svg>');
  return Buffer.from(parts.join('\n'));
}

async function main() {
  const osm = loadOsmFeatures();
  const quads = [
    { name: 'dop_nw.jpg', minX: WORLD_MIN_X, maxX: MID_X, minZ: WORLD_MIN_Z, maxZ: MID_Z },
    { name: 'dop_ne.jpg', minX: MID_X, maxX: WORLD_MAX_X, minZ: WORLD_MIN_Z, maxZ: MID_Z },
    { name: 'dop_sw.jpg', minX: WORLD_MIN_X, maxX: MID_X, minZ: MID_Z, maxZ: WORLD_MAX_Z },
    { name: 'dop_se.jpg', minX: MID_X, maxX: WORLD_MAX_X, minZ: MID_Z, maxZ: WORLD_MAX_Z }
  ];

  for (const q of quads) {
    const rawPath = path.join(rawDir, q.name);
    const outPath = path.join(outDir, q.name);
    if (!fs.existsSync(rawPath)) {
      fs.copyFileSync(outPath, rawPath);
    }

    const { data, info } = await sharp(rawPath).raw().toBuffer({ resolveWithObject: true });
    const sanitized = sanitizeDopToMeadowBase(data, info.width, info.height, info.channels);
    const svgBuf = buildQuadrantSvg(q, info.width, info.height, osm);

    await sharp(sanitized, { raw: { width: info.width, height: info.height, channels: 3 } })
      .blur(2.0)
      .composite([{ input: svgBuf, top: 0, left: 0 }])
      .jpeg({ quality: 88, chromaSubsampling: '4:4:4' })
      .toFile(outPath);

    console.log(`Built clean stylized ground tile ${q.name}: ${Math.round(fs.statSync(outPath).size / 1024)} KB`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
