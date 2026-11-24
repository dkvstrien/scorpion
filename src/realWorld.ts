import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
  FARM_YARD_CENTER,
  getShorelineX,
  getTerrainHeight,
  OSM_DATA,
  REAL_SPOTS,
  SEBALD_PIER,
  WATER_LEVEL
} from './terrain';
import {
  createAsphaltTexture,
  createBaroqueChurchTexture,
  createBaroquePalaceEmissiveMap,
  createBaroquePalaceTexture,
  createBavarianParasolTexture,
  createCrispGravelPadTexture,
  createGravelRoadTexture,
  createLampGlowTexture,
  createVillageAsphaltTexture
} from './textures';
import { buildBavarianWorldDetails } from './worldDetails';

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
 * 8 Rich 512x512 Upper Bavarian Architectural Facade Textures (varied render, wood cladding, Lüftlmalerei frescos,
 * varied shutter styles & colors, barn boards, modern steel halls & contemporary homes — paired with real 3D
 * projecting balconies, chimneys, barn doors, overhanging roof fascia & PV solar panels from LoD2!).
 */
function createBavarianArchetypeTexture(
  kind:
    | 'einfirsthof'
    | 'einfirsthof_b'
    | 'lueftlmalerei'
    | 'timber'
    | 'landhaus'
    | 'barn'
    | 'machine_hall'
    | 'detached'
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.scale(2, 2); // Draw crisp 2x retina vector detail on 256x256 logical coordinates!

  const addPlasterGrain = (y0: number, y1: number) => {
    for (let i = 0; i < 900; i++) {
      const gx = ((i * 73) % 256);
      const gy = y0 + ((i * 41) % Math.max(1, y1 - y0));
      ctx.fillStyle = i % 2 === 0 ? 'rgba(65,52,36,0.035)' : 'rgba(255,252,244,0.05)';
      ctx.fillRect(gx, gy, 3, 2);
    }
  };

  const drawPlanks = (y0: number, y1: number, baseHex: string, vertical = false, step = 11) => {
    ctx.fillStyle = baseHex;
    ctx.fillRect(0, y0, 256, y1 - y0);
    if (vertical) {
      for (let x = 0; x < 256; x += step) {
        const shade = ((x * 13) % 3);
        ctx.fillStyle = shade === 0 ? 'rgba(0,0,0,0.14)' : shade === 1 ? 'rgba(255,220,175,0.07)' : 'rgba(40,22,8,0.06)';
        ctx.fillRect(x, y0, step - 2, y1 - y0);
        ctx.fillStyle = 'rgba(22,12,5,0.38)';
        ctx.fillRect(x + step - 2, y0, 2, y1 - y0);
      }
    } else {
      for (let y = y0; y < y1; y += step) {
        const shade = ((y * 7) % 3);
        ctx.fillStyle = shade === 0 ? 'rgba(0,0,0,0.12)' : shade === 1 ? 'rgba(255,222,182,0.07)' : 'rgba(42,24,10,0.05)';
        ctx.fillRect(0, y, 256, step - 2);
        ctx.fillStyle = 'rgba(26,14,6,0.34)';
        ctx.fillRect(0, y + step - 2, 256, 2);
      }
    }
  };

  const drawWindow = (
    wx: number,
    wy: number,
    opts: {
      w?: number;
      h?: number;
      shutter?: string;
      flowers?: boolean;
      lueftl?: boolean;
      frame?: string;
      modern?: boolean;
      arched?: boolean;
    }
  ) => {
    const ww = opts.w ?? 26;
    const wh = opts.h ?? 36;
    const hw = ww * 0.5;
    const hh = wh * 0.5;

    if (opts.lueftl) {
      // Authentic Upper Bavarian Lüftlmalerei Baroque frescoed window frame!
      ctx.fillStyle = 'rgba(186, 134, 72, 0.25)';
      ctx.fillRect(wx - hw - 10, wy - hh - 10, ww + 20, wh + 18);
      ctx.strokeStyle = '#9b5c34';
      ctx.lineWidth = 2.4;
      ctx.strokeRect(wx - hw - 8, wy - hh - 8, ww + 16, wh + 15);
      // Painted Baroque scroll pediment above window
      ctx.fillStyle = '#3b6b8c';
      ctx.beginPath();
      ctx.moveTo(wx - hw - 9, wy - hh - 8);
      ctx.quadraticCurveTo(wx, wy - hh - 20, wx + hw + 9, wy - hh - 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#d49a42';
      ctx.beginPath();
      ctx.arc(wx, wy - hh - 12, 3.5, 0, Math.PI * 2);
      ctx.fill();
      // Subtle painted sill garland
      ctx.strokeStyle = '#487442';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(wx - hw - 4, wy + hh + 7);
      ctx.quadraticCurveTo(wx, wy + hh + 12, wx + hw + 4, wy + hh + 7);
      ctx.stroke();
    }

    if (opts.shutter) {
      const sw = 10;
      ctx.fillStyle = opts.shutter;
      ctx.fillRect(wx - hw - sw - 1, wy - hh - 1, sw, wh + 2);
      ctx.fillRect(wx + hw + 1, wy - hh - 1, sw, wh + 2);
      // Louver slats on shutters
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      for (let sy = wy - hh + 3; sy < wy + hh - 2; sy += 4) {
        ctx.fillRect(wx - hw - sw + 1, sy, sw - 4, 1.4);
        ctx.fillRect(wx + hw + 3, sy, sw - 4, 1.4);
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.34)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(wx - hw - sw - 1, wy - hh - 1, sw, wh + 2);
      ctx.strokeRect(wx + hw + 1, wy - hh - 1, sw, wh + 2);
    }

    // Recessed window shadow + surround frame
    ctx.fillStyle = opts.frame ?? '#ebe4d6';
    ctx.fillRect(wx - hw - 2, wy - hh - 2, ww + 4, wh + 4);
    // Glass pane with realistic sky reflection gradient
    const gGrad = ctx.createLinearGradient(wx, wy - hh, wx, wy + hh);
    gGrad.addColorStop(0, '#2a3d4d');
    gGrad.addColorStop(0.55, '#3b5263');
    gGrad.addColorStop(1, '#24303a');
    ctx.fillStyle = gGrad;
    ctx.fillRect(wx - hw, wy - hh, ww, wh);
    // Subtle warm interior reflection
    ctx.fillStyle = 'rgba(255, 228, 168, 0.22)';
    ctx.fillRect(wx - hw + 2, wy - hh + 2, ww - 4, wh * 0.45);
    // Mullions
    ctx.fillStyle = opts.modern ? '#363b40' : '#f2ece0';
    ctx.fillRect(wx - 1, wy - hh, 2, wh);
    if (!opts.modern) {
      ctx.fillRect(wx - hw, wy - 2, ww, 2);
    }
    // Stone / wooden sill
    ctx.fillStyle = opts.modern ? '#4f5559' : '#7b7468';
    ctx.fillRect(wx - hw - 3, wy + hh + 1, ww + 6, 3.5);

    if (opts.flowers) {
      ctx.fillStyle = '#523219';
      ctx.fillRect(wx - hw - 2, wy + hh + 1, ww + 4, 6);
      ctx.fillStyle = '#2c6430';
      ctx.fillRect(wx - hw - 1, wy + hh - 2, ww + 2, 4);
      ctx.fillStyle = '#d9322b';
      ctx.fillRect(wx - hw + 2, wy + hh - 5, 4.5, 4.5);
      ctx.fillRect(wx - 2, wy + hh - 6, 5, 4.5);
      ctx.fillRect(wx + hw - 7, wy + hh - 5, 4.5, 4.5);
    }
  };

  if (kind === 'einfirsthof') {
    // Upper story: Horizontal dark weathered Bavarian larch cladding; Lower story: Warm cream lime render
    drawPlanks(0, 126, '#6d4528', false, 10);
    ctx.fillStyle = '#f3ecdc';
    ctx.fillRect(0, 126, 256, 102);
    addPlasterGrain(126, 228);
    // Carved timber floor belt beam (clean—no flat fake red flowers since real 3D balconies project out!)
    ctx.fillStyle = '#472a16';
    ctx.fillRect(0, 120, 256, 8);
    ctx.fillStyle = '#827b6f';
    ctx.fillRect(0, 228, 256, 28);
    // Varied asymmetric window spacing (2 wide upstairs, 3 downstairs)
    drawWindow(64, 58, { w: 28, h: 36, shutter: '#264f33', flowers: false });
    drawWindow(192, 58, { w: 28, h: 36, shutter: '#264f33', flowers: false });
    drawWindow(42, 174, { w: 24, h: 34, shutter: '#264f33', flowers: true });
    drawWindow(128, 174, { w: 26, h: 34, shutter: '#264f33', flowers: false });
    drawWindow(214, 174, { w: 24, h: 34, shutter: '#264f33', flowers: true });
  } else if (kind === 'einfirsthof_b') {
    // Variant B: Vertical weathered larch upper + warm ochre-sand render lower + brown shutters!
    drawPlanks(0, 132, '#5e3c22', true, 12);
    ctx.fillStyle = '#eee1c6';
    ctx.fillRect(0, 132, 256, 98);
    addPlasterGrain(132, 230);
    ctx.fillStyle = '#442915';
    ctx.fillRect(0, 127, 256, 7);
    ctx.fillStyle = '#787166';
    ctx.fillRect(0, 230, 256, 26);
    for (const wx of [48, 128, 208]) {
      drawWindow(wx, 62, { w: 24, h: 34, shutter: '#5a381d', flowers: false });
    }
    drawWindow(52, 176, { w: 26, h: 34, shutter: '#5a381d', flowers: true });
    drawWindow(146, 176, { w: 26, h: 34, shutter: '#5a381d', flowers: false });
    // Arched timber front door on right
    ctx.fillStyle = '#53331b';
    ctx.fillRect(202, 166, 28, 64);
    ctx.strokeStyle = '#331d0e';
    ctx.lineWidth = 2;
    ctx.strokeRect(202, 166, 28, 64);
  } else if (kind === 'lueftlmalerei') {
    // Authentic Upper Bavarian Lüftlmalerei painted townhouse / Bauernhaus!
    ctx.fillStyle = '#f6eedb';
    ctx.fillRect(0, 0, 256, 228);
    addPlasterGrain(0, 228);
    // Decorative painted Bavarian eaves frieze band & corner quoins
    ctx.fillStyle = '#4d301a';
    ctx.fillRect(0, 0, 256, 10);
    ctx.fillStyle = '#d49a42';
    ctx.fillRect(0, 10, 256, 4);
    ctx.fillStyle = '#3b6b8c';
    for (let x = 8; x < 256; x += 24) {
      ctx.beginPath();
      ctx.arc(x, 18, 5, 0, Math.PI);
      ctx.fill();
    }
    // Painted Baroque corner quoin blocks
    ctx.fillStyle = 'rgba(168, 124, 72, 0.24)';
    for (let y = 24; y < 224; y += 22) {
      const qw = (y / 22) % 2 === 0 ? 14 : 9;
      ctx.fillRect(0, y, qw, 18);
      ctx.fillRect(256 - qw, y, qw, 18);
    }
    ctx.fillStyle = '#81796c';
    ctx.fillRect(0, 228, 256, 28);
    for (const wx of [54, 128, 202]) {
      drawWindow(wx, 66, { w: 24, h: 34, shutter: '#295738', flowers: true, lueftl: true });
      drawWindow(wx, 170, { w: 24, h: 34, shutter: '#295738', flowers: false, lueftl: true });
    }
  } else if (kind === 'timber') {
    // Full warm honey-weathered Bavarian timber chalet / farmhouse!
    drawPlanks(0, 226, '#7e522e', false, 10);
    ctx.fillStyle = '#7b7469';
    ctx.fillRect(0, 226, 256, 30);
    ctx.fillStyle = '#4a2c16';
    ctx.fillRect(0, 118, 256, 8);
    drawWindow(56, 56, { w: 26, h: 34, shutter: '#2a5636', flowers: true });
    drawWindow(176, 56, { w: 32, h: 34, shutter: '', flowers: true, frame: '#e8dfc9' });
    drawWindow(48, 170, { w: 26, h: 34, shutter: '#2a5636', flowers: false });
    drawWindow(128, 170, { w: 26, h: 34, shutter: '#2a5636', flowers: false });
    drawWindow(208, 170, { w: 26, h: 34, shutter: '#2a5636', flowers: true });
  } else if (kind === 'barn') {
    // Weathered vertical dark-brown rough-sawn timber Stadl with hayloft vent & stone lower foundation!
    drawPlanks(0, 212, '#5c3b22', true, 10);
    // Weathered fieldstone base masonry
    ctx.fillStyle = '#736c62';
    ctx.fillRect(0, 212, 256, 44);
    for (let y = 216; y < 252; y += 10) {
      for (let x = (y % 20 === 0 ? 0 : 12); x < 256; x += 26) {
        ctx.fillStyle = (x + y) % 3 === 0 ? '#847c70' : '#655f55';
        ctx.fillRect(x + 1, y, 22, 8);
      }
    }
    // Timber cross-beams & gable ventilation slats
    ctx.fillStyle = '#3c2413';
    ctx.fillRect(0, 108, 256, 9);
    ctx.fillRect(0, 10, 256, 7);
    ctx.fillStyle = '#24160d';
    ctx.fillRect(46, 34, 42, 46);
    ctx.fillRect(168, 34, 42, 46);
    ctx.strokeStyle = '#7d5432';
    ctx.lineWidth = 3;
    ctx.strokeRect(46, 34, 42, 46);
    ctx.strokeRect(168, 34, 42, 46);
  } else if (kind === 'machine_hall') {
    // Modern Bavarian agricultural machine hall / cattle shed: ribbed steel + translucent skylight strip + bay door!
    ctx.fillStyle = '#8b9794';
    ctx.fillRect(0, 0, 256, 228);
    for (let x = 0; x < 256; x += 7) {
      ctx.fillStyle = x % 14 === 0 ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)';
      ctx.fillRect(x, 0, 3.5, 228);
    }
    ctx.fillStyle = '#d5e4e1';
    ctx.fillRect(0, 18, 256, 34);
    ctx.strokeStyle = '#5c6967';
    ctx.lineWidth = 2.5;
    for (let x = 0; x < 256; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 18);
      ctx.lineTo(x, 52);
      ctx.stroke();
    }
    ctx.fillStyle = '#7b7f7d';
    ctx.fillRect(0, 220, 256, 36);
    ctx.fillStyle = '#586264';
    ctx.fillRect(68, 104, 120, 118);
    ctx.strokeStyle = '#363d40';
    ctx.lineWidth = 2;
    for (let y = 118; y < 222; y += 15) {
      ctx.beginPath();
      ctx.moveTo(68, y);
      ctx.lineTo(188, y);
      ctx.stroke();
    }
    ctx.strokeRect(68, 104, 120, 118);
  } else if (kind === 'detached') {
    // Newer Bavarian detached home: clean render, modern anthracite windows, vertical larch timber accent strip!
    ctx.fillStyle = '#f2f0ea';
    ctx.fillRect(0, 0, 256, 228);
    addPlasterGrain(0, 228);
    // Contemporary vertical larch accent band between windows
    drawPlanks(20, 228, '#966c42', true, 7);
    ctx.fillStyle = '#f2f0ea';
    ctx.fillRect(0, 0, 104, 228);
    ctx.fillRect(156, 0, 100, 228);
    addPlasterGrain(0, 228);
    ctx.fillStyle = '#707477';
    ctx.fillRect(0, 228, 256, 28);
    drawWindow(52, 60, { w: 34, h: 32, modern: true, frame: '#3b4147' });
    drawWindow(204, 60, { w: 34, h: 32, modern: true, frame: '#3b4147' });
    drawWindow(52, 166, { w: 38, h: 40, modern: true, frame: '#3b4147' });
    drawWindow(204, 166, { w: 30, h: 34, modern: true, frame: '#3b4147' });
  } else {
    // Traditional Bavarian pastel village house (base neutral warm-white so per-building pastel tints read richly!)
    ctx.fillStyle = '#f4efe2';
    ctx.fillRect(0, 0, 256, 226);
    addPlasterGrain(0, 226);
    ctx.fillStyle = '#53351d';
    ctx.fillRect(0, 0, 256, 12);
    ctx.fillStyle = '#827b70';
    ctx.fillRect(0, 226, 256, 30);
    // Varied blue-grey & brown wooden shutters + classic front entry door!
    drawWindow(48, 58, { w: 24, h: 34, shutter: '#495f6e', flowers: true });
    drawWindow(128, 58, { w: 24, h: 34, shutter: '#495f6e', flowers: false });
    drawWindow(208, 58, { w: 24, h: 34, shutter: '#495f6e', flowers: true });
    drawWindow(48, 168, { w: 24, h: 34, shutter: '#495f6e', flowers: false });
    drawWindow(208, 168, { w: 24, h: 34, shutter: '#495f6e', flowers: false });
    // Arched/framed village front door with stone steps
    ctx.fillStyle = '#5c3b20';
    ctx.fillRect(113, 158, 30, 68);
    ctx.strokeStyle = '#ebe4d6';
    ctx.lineWidth = 3;
    ctx.strokeRect(113, 158, 30, 68);
    ctx.fillStyle = '#324858';
    ctx.fillRect(119, 165, 18, 14);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Matching window-pane emissive glow map for every habitable Bavarian archetype so village houses light up warmly
 * at Golden Sunset and Blue Hour dusk while keeping stucco/timber walls and mullions crisp and dark!
 */
function createBavarianWindowEmissiveMap(
  kind: 'einfirsthof' | 'einfirsthof_b' | 'lueftlmalerei' | 'timber' | 'landhaus' | 'detached'
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.scale(2, 2);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 256, 256);

  const litWindow = (wx: number, wy: number, ww: number, wh: number, modern = false, warmHex = '#ffce70') => {
    const hw = ww * 0.5;
    const hh = wh * 0.5;
    ctx.fillStyle = warmHex;
    ctx.fillRect(wx - hw + 1.5, wy - hh + 1.5, ww - 3, wh - 3);
    ctx.fillStyle = '#000000';
    ctx.fillRect(wx - 1.2, wy - hh, 2.4, wh);
    if (!modern) {
      ctx.fillRect(wx - hw, wy - 2.2, ww, 2.4);
    }
  };

  if (kind === 'einfirsthof') {
    litWindow(64, 58, 28, 36, false, '#ffc966');
    litWindow(42, 174, 24, 34, false, '#ffd682');
    litWindow(128, 174, 26, 34, false, '#f2b858');
    litWindow(214, 174, 24, 34, false, '#ffcf74');
  } else if (kind === 'einfirsthof_b') {
    litWindow(48, 62, 24, 34, false, '#f7c162');
    litWindow(208, 62, 24, 34, false, '#ffd178');
    litWindow(52, 176, 26, 34, false, '#ffca68');
    litWindow(146, 176, 26, 34, false, '#ffd988');
  } else if (kind === 'lueftlmalerei') {
    litWindow(54, 66, 24, 34, false, '#ffd47e');
    litWindow(202, 66, 24, 34, false, '#f5bd5c');
    litWindow(54, 170, 24, 34, false, '#ffcb6b');
    litWindow(128, 170, 24, 34, false, '#ffda8c');
    litWindow(202, 170, 24, 34, false, '#f7c162');
  } else if (kind === 'timber') {
    litWindow(176, 56, 32, 34, false, '#ffd27a');
    litWindow(48, 170, 26, 34, false, '#f2b858');
    litWindow(128, 170, 26, 34, false, '#ffce70');
  } else if (kind === 'detached') {
    litWindow(52, 60, 34, 32, true, '#ffdfa0');
    litWindow(52, 166, 38, 40, true, '#ffd584');
    litWindow(204, 166, 30, 34, true, '#f8c86e');
  } else {
    // landhaus
    litWindow(48, 58, 24, 34, false, '#f7c264');
    litWindow(208, 58, 24, 34, false, '#ffd37c');
    litWindow(48, 168, 24, 34, false, '#ffcb6c');
    litWindow(208, 168, 24, 34, false, '#ffd886');
    // Warm porch transom light over front door
    ctx.fillStyle = '#ffd27a';
    ctx.fillRect(120, 166, 16, 12);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  return tex;
}

function createSolarPanelTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0e1d3b';
  ctx.fillRect(0, 0, 256, 256);
  // Crisp deep-navy silicon PV cell grid with fine silver busbars
  for (let y = 0; y < 256; y += 32) {
    for (let x = 0; x < 256; x += 32) {
      const shade = ((x + y) / 32) % 2 === 0 ? '#12264d' : '#0c1b36';
      ctx.fillStyle = shade;
      ctx.fillRect(x + 2, y + 2, 28, 28);
    }
  }
  ctx.strokeStyle = 'rgba(218, 232, 248, 0.72)';
  ctx.lineWidth = 2.4;
  for (let i = 0; i <= 256; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(180, 206, 232, 0.32)';
  ctx.lineWidth = 1.2;
  for (let i = 32; i < 256; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function createNeutralRoofTileTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#eae6e0';
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 16) {
    for (let x = 0; x < 256; x += 16) {
      const v = 226 + (((x * 7 + y * 13) % 24) - 12);
      ctx.fillStyle = `rgb(${v},${v - 2},${v - 5})`;
      ctx.fillRect(x + 1, y + 1, 14, 13);
    }
    ctx.fillStyle = 'rgba(40,32,26,0.28)';
    ctx.fillRect(0, y + 14, 256, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
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
  public litFacadeMats: THREE.MeshStandardMaterial[] = [];
  public lampGlowSprites: THREE.Sprite[] = [];
  public lampPoolMats: THREE.MeshBasicMaterial[] = [];
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
    buildBavarianWorldDetails(scene);
    this.buildInteractivePropsAndCars();
    this.buildDestructibleTreesAndLamps();
    this.buildPedestrians();
  }

  public setNightMode(nightAmount: number): void {
    this.warmWindowMat.emissiveIntensity = 0.22 + nightAmount * 1.65;
    this.lampBulbMat.emissiveIntensity = 0.45 + nightAmount * 3.6;
    for (const mat of this.litFacadeMats) {
      mat.emissiveIntensity = nightAmount * 1.35;
    }
    for (const pl of this.lampPointLights) {
      pl.intensity = nightAmount * 52;
    }
    for (const sp of this.lampGlowSprites) {
      sp.visible = nightAmount > 0.15;
      (sp.material as THREE.SpriteMaterial).opacity = Math.min(0.95, nightAmount * 0.92);
    }
    for (const pm of this.lampPoolMats) {
      pm.opacity = nightAmount * 0.42;
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
    const gravelTracks: { pts: [number, number][]; halfWidth: number }[] = [];

    for (const r of OSM_DATA.roads) {
      if (r.hw === 'track' || r.hw === 'service') {
        gravelTracks.push({ pts: r.pts, halfWidth: r.hw === 'track' ? 1.85 : 2.15 });
        continue;
      }
      if (r.hw === 'secondary' || r.hw === 'tertiary') {
        mainPaved.push({ pts: r.pts, halfWidth: 4.5 });
      } else {
        villagePaved.push({ pts: r.pts, halfWidth: 3.3 });
      }
    }

    // Home Farm access lanes linking the courtyard east past the farmhouse to the village road, and west to the farm lane
    gravelTracks.push({
      pts: [
        [FARM_YARD_CENTER.x + 22, FARM_YARD_CENTER.z - 4],
        [-305, 921.5],
        [-277.6, 922.2]
      ],
      halfWidth: 2.6
    });
    gravelTracks.push({
      pts: [
        [FARM_YARD_CENTER.x - 21, FARM_YARD_CENTER.z - 5],
        [-379, 914],
        [-395.1, 904.6]
      ],
      halfWidth: 2.5
    });

    const asphaltTex = createAsphaltTexture();
    const villageAsphaltTex = createVillageAsphaltTexture();
    const gravelTex = createGravelRoadTexture();

    const mainAsphaltMat = new THREE.MeshStandardMaterial({
      map: asphaltTex,
      roughness: 0.9,
      metalness: 0.04,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3
    });
    const villageAsphaltMat = new THREE.MeshStandardMaterial({
      map: villageAsphaltTex,
      roughness: 0.92,
      metalness: 0.03,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    const gravelMat = new THREE.MeshStandardMaterial({
      map: gravelTex,
      roughness: 0.95,
      metalness: 0.01,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });

    scene.add(buildMergedRibbonMesh(mainPaved, 0.30, mainAsphaltMat));
    scene.add(buildMergedRibbonMesh(villagePaved, 0.24, villageAsphaltMat));
    if (gravelTracks.length > 0) {
      scene.add(buildMergedRibbonMesh(gravelTracks, 0.18, gravelMat));
    }

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
   * Loads official Bavaria OpenData LoD2 CityGML 3D buildings (1,692 real survey-grade footprints, heights & roof
   * shapes — gable, hip, half-hip, shed, flat, L/T roofs) compiled into 6 merged draw calls with DOP20-sampled roof
   * colors and 5 Upper Bavarian architectural wall materials!
   */
  private buildRealBavarianBuildings(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    const makeLitFacadeMat = (
      kind: 'einfirsthof' | 'einfirsthof_b' | 'lueftlmalerei' | 'timber' | 'landhaus' | 'detached',
      roughness: number,
      metalness = 0.02
    ): THREE.MeshStandardMaterial => {
      const m = new THREE.MeshStandardMaterial({
        map: createBavarianArchetypeTexture(kind),
        emissive: 0xffc666,
        emissiveMap: createBavarianWindowEmissiveMap(kind),
        emissiveIntensity: 0,
        vertexColors: true,
        roughness,
        metalness
      });
      this.litFacadeMats.push(m);
      return m;
    };

    const materials: THREE.MeshStandardMaterial[] = [
      // 0: Einfirsthof A (cream render lower + horizontal dark weathered larch upper)
      makeLitFacadeMat('einfirsthof', 0.86),
      // 1: Einfirsthof B (warm sand render lower + vertical weathered larch upper + brown shutters)
      makeLitFacadeMat('einfirsthof_b', 0.87),
      // 2: Lüftlmalerei Bavarian House (ornamental painted Baroque fresco window frames & frieze)
      makeLitFacadeMat('lueftlmalerei', 0.84),
      // 3: Timber-Clad Alpine Chalet / Bauernhaus (full horizontal wood cladding)
      makeLitFacadeMat('timber', 0.89),
      // 4: Traditional Pastel Bavarian Village House (varied cream/yellow/peach/sage render + blue-grey shutters & front door)
      makeLitFacadeMat('landhaus', 0.84),
      // 5: Dark Weathered Vertical Timber Barn / Stadl + stone foundation
      new THREE.MeshStandardMaterial({
        map: createBavarianArchetypeTexture('barn'),
        vertexColors: true,
        roughness: 0.92,
        metalness: 0.02
      }),
      // 6: Modern Agricultural Machine Hall / Cattle Shed (ribbed steel cladding + skylight strip)
      new THREE.MeshStandardMaterial({
        map: createBavarianArchetypeTexture('machine_hall'),
        vertexColors: true,
        roughness: 0.62,
        metalness: 0.25
      }),
      // 7: Newer Contemporary Detached Home (clean render + modern anthracite windows + larch wood accent)
      makeLitFacadeMat('detached', 0.84, 0.03),
      // 8: ALL Overhanging LoD2 Roofs — clay tile relief multiplied by each building's REAL DOP20-sampled RGB roof color!
      new THREE.MeshStandardMaterial({
        map: createNeutralRoofTileTexture(),
        vertexColors: true,
        roughness: 0.78,
        metalness: 0.06,
        side: THREE.DoubleSide
      }),
      // 9: 3D Architectural Trim (projecting balconies, geranium boxes, chimneys, barn doors, overhanging roof fascia!)
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.86,
        metalness: 0.04
      }),
      // 10: 3D Rooftop Solar Panel Arrays (deep glossy navy photovoltaic cell grid!)
      new THREE.MeshStandardMaterial({
        map: createSolarPanelTexture(),
        vertexColors: true,
        roughness: 0.28,
        metalness: 0.22
      })
    ];

    fetch('./map/lod2_buildings.zbin')
      .then((res) => {
        if (!res.ok || !res.body) return Promise.reject(new Error(`HTTP ${res.status}`));
        const ds = new DecompressionStream('gzip');
        return new Response(res.body.pipeThrough(ds)).arrayBuffer();
      })
      .then((buf) => {
        const dv = new DataView(buf);
        const magic =
          String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
        if (magic !== 'LOD2') throw new Error('Invalid LOD2 binary');
        const groupCount = dv.getUint32(4, true);
        let offset = 8;

        for (let g = 0; g < groupCount; g++) {
          const styleId = dv.getUint32(offset, true);
          const vCount = dv.getUint32(offset + 4, true);
          offset += 8;

          const posBytes = vCount * 3 * 4;
          const normBytes = vCount * 3 * 4;
          const uvBytes = vCount * 2 * 4;
          const colBytes = vCount * 3;
          const colPad = (4 - (colBytes % 4)) % 4;

          const pos = new Float32Array(buf, offset, vCount * 3);
          offset += posBytes;
          const norm = new Float32Array(buf, offset, vCount * 3);
          offset += normBytes;
          const uv = new Float32Array(buf, offset, vCount * 2);
          offset += uvBytes;
          const col = new Uint8Array(buf, offset, vCount * 3);
          offset += colBytes + colPad;

          if (vCount === 0) continue;

          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
          geo.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
          geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
          geo.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
          geo.computeBoundingSphere();

          const mesh = new THREE.Mesh(geo, materials[styleId] ?? materials[1]);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          scene.add(mesh);
        }
      })
      .catch((err) => {
        console.error('Failed to load Bavaria LoD2 buildings:', err);
      });

    fetch('./map/lod2_colliders.json')
      .then((res) => (res.ok ? res.json() : []))
      .then((boxes: [number, number, number, number, number, number][]) => {
        for (const [x, y, z, w, h, d] of boxes) {
          this.addStaticBox(world, groundMat, x, y, z, w, h, d, 0);
        }
      })
      .catch(() => {
        // colliders optional fallback
      });
  }

  /**
   * Photo-referenced hero landmarks at exact GPS coordinates:
   * 1. Pfarrkirche St. Mariä Himmelfahrt (modeled directly from real 2023 Am Kirchberg 2 photo!)
   * 2. Gasthaus & Metzgerei Zum Altwirt + Chestnut-Shaded Biergarten & Münsing Maibaum
   * 3. Schloss Ammerland (authentic 1685 lakeside baroque palace with TWO copper Zwiebeltürme!)
   * 4. Fischereihofladen & Bootsverleih Sebald + 58m Wooden Pier, Rowboats & Sailboats
   */
  private addCrispCourtyardPad(
    scene: THREE.Scene,
    cx: number,
    cz: number,
    w: number,
    d: number,
    rotY = 0
  ): void {
    const tex = createCrispGravelPadTexture(Math.max(4, Math.round(w / 4)), Math.max(4, Math.round(d / 4)));
    const geo = new THREE.PlaneGeometry(w, d, 14, 14);
    geo.rotateX(-Math.PI / 2);
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i);
      const lz = pos.getZ(i);
      const wx = cx + lx * cos + lz * sin;
      const wz = cz - lx * sin + lz * cos;
      pos.setY(i, getTerrainHeight(wx, wz) + 0.09);
    }
    geo.computeVertexNormals();
    const hw = w * 0.44;
    const hd = d * 0.44;
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.93,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uHalf = { value: new THREE.Vector2(hw, hd) };
      shader.vertexShader =
        'varying vec2 vPadXZ;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvPadXZ = transformed.xz;'
        );
      shader.fragmentShader =
        'uniform vec2 uHalf;\nvarying vec2 vPadXZ;\n' +
        shader.fragmentShader.replace(
          '#include <dithering_fragment>',
          `vec2 q = abs(vPadXZ) - uHalf;
          float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
          gl_FragColor.a *= 1.0 - smoothstep(0.2, 2.0, sd);
          #include <dithering_fragment>`
        );
    };
    mat.customProgramCacheKey = () => 'bavaria-courtyard-pad-v1';
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, 0, cz);
    mesh.rotation.y = rotY;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  private buildHeroLandmarks(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    const tileTex = createTileRoofTexture();
    const gableGeo = createBavarianGableRoofGeometry();
    const parasolTex = createBavarianParasolTexture();

    // Crisp high-res tiled gravel courtyards for Münsing Church, Zum Altwirt & Schloss Ammerland (replaces blurry ground masks!)
    this.addCrispCourtyardPad(scene, REAL_SPOTS.muensingChurch.x - 1, REAL_SPOTS.muensingChurch.z + 2, 34, 24, 0);
    this.addCrispCourtyardPad(scene, REAL_SPOTS.muensingAltwirt.x - 2, REAL_SPOTS.muensingAltwirt.z - 2, 30, 22, 0);
    this.addCrispCourtyardPad(scene, REAL_SPOTS.schlossAmmerland.x + 12, REAL_SPOTS.schlossAmmerland.z, 32, 34, 0.14);

    // === 1. PFARRKIRCHE ST. MARIÄ HIMMELFAHRT AT REAL GPS ===
    {
      const cx = REAL_SPOTS.muensingChurch.x;
      const cz = REAL_SPOTS.muensingChurch.z;
      const gy = getTerrainHeight(cx, cz);

      const churchTex = createBaroqueChurchTexture();
      churchTex.repeat.set(2, 1);
      const stucco = new THREE.MeshStandardMaterial({ map: churchTex, color: 0xfbf5e8, roughness: 0.84 });
      const trimCream = new THREE.MeshStandardMaterial({ color: 0xf7efe0, roughness: 0.78 });
      const plinthStone = new THREE.MeshStandardMaterial({ color: 0xb9b09f, roughness: 0.92 });
      const tileRed = new THREE.MeshStandardMaterial({ map: tileTex, color: 0xc55638, roughness: 0.78 });
      const verdigrisCopper = new THREE.MeshStandardMaterial({ color: 0x356455, roughness: 0.36, metalness: 0.48 });
      const gold = new THREE.MeshStandardMaterial({ color: 0xebbf42, roughness: 0.2, metalness: 0.9 });
      const oakMat = new THREE.MeshStandardMaterial({ color: 0x4d311c, roughness: 0.86 });
      const ironMat = new THREE.MeshStandardMaterial({ color: 0x222628, roughness: 0.55, metalness: 0.6 });
      const louverMat = new THREE.MeshStandardMaterial({ color: 0x262928, roughness: 0.9 });

      // Baroque Hall Nave (Saalbau) + sandstone plinth + stepped Baroque eaves cornice
      const nave = new THREE.Mesh(new THREE.BoxGeometry(20, 9.6, 10.6), stucco);
      nave.position.set(cx, gy + 4.2, cz);
      nave.castShadow = true;
      nave.receiveShadow = true;
      scene.add(nave);
      this.addStaticBox(world, groundMat, cx, gy + 4.8, cz, 20, 9.6, 10.6);

      const navePlinth = new THREE.Mesh(new THREE.BoxGeometry(20.4, 1.35, 11.0), plinthStone);
      navePlinth.position.set(cx, gy + 0.35, cz);
      navePlinth.receiveShadow = true;
      scene.add(navePlinth);

      const naveCornice = new THREE.Mesh(new THREE.BoxGeometry(20.55, 0.46, 11.15), trimCream);
      naveCornice.position.set(cx, gy + 8.88, cz);
      naveCornice.castShadow = true;
      scene.add(naveCornice);

      // 3D Baroque Vertical Pilasters (Lisenen) articulating the North, South & West nave walls
      for (const side of [-1, 1]) {
        for (const px of [-9.7, -4.15, 0, 4.15, 9.7]) {
          const pil = new THREE.Mesh(new THREE.BoxGeometry(0.46, 8.6, 0.22), trimCream);
          pil.position.set(cx + px, gy + 4.65, cz + side * 5.36);
          pil.castShadow = true;
          scene.add(pil);
        }
      }
      for (const pz of [-5.0, -2.2, 2.2, 5.0]) {
        const wPil = new THREE.Mesh(new THREE.BoxGeometry(0.22, 8.6, 0.46), trimCream);
        wPil.position.set(cx - 10.06, gy + 4.65, cz + pz);
        scene.add(wPil);
      }

      // Steep terracotta gable roof over nave + timber gable bargeboard trim
      const naveRoof = new THREE.Mesh(gableGeo, tileRed);
      naveRoof.position.set(cx, gy + 9.0, cz);
      naveRoof.scale.set(20.8, 5.5, 11.5);
      naveRoof.castShadow = true;
      scene.add(naveRoof);

      // Indented octagonal late-Gothic East Choir Apse with stone plinth & cornice ring
      const apse = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 8.8, 6), stucco);
      apse.position.set(cx + 11.2, gy + 3.9, cz);
      apse.castShadow = true;
      scene.add(apse);
      const apsePlinth = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.65, 1.3, 6), plinthStone);
      apsePlinth.position.set(cx + 11.2, gy + 0.35, cz);
      scene.add(apsePlinth);
      const apseCornice = new THREE.Mesh(new THREE.CylinderGeometry(4.75, 4.55, 0.4, 6), trimCream);
      apseCornice.position.set(cx + 11.2, gy + 8.2, cz);
      scene.add(apseCornice);
      const apseRoof = new THREE.Mesh(new THREE.ConeGeometry(5.1, 4.3, 6), tileRed);
      apseRoof.position.set(cx + 11.2, gy + 10.45, cz);
      apseRoof.castShadow = true;
      scene.add(apseRoof);

      // Arched stained-glass nave windows with 3D Baroque stone arch surrounds, sills & dark wrought-iron mullions
      for (const side of [-1, 1]) {
        for (const wx of [-6.9, -2.1, 2.1, 6.9]) {
          // Cream Baroque outer frame & sill
          const frame = new THREE.Mesh(new THREE.BoxGeometry(1.56, 3.62, 0.16), trimCream);
          frame.position.set(cx + wx, gy + 5.1, cz + side * 5.33);
          scene.add(frame);
          const archFrame = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.16, 14), trimCream);
          archFrame.rotation.x = Math.PI / 2;
          archFrame.position.set(cx + wx, gy + 6.82, cz + side * 5.33);
          scene.add(archFrame);
          const sill = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.22, 0.34), plinthStone);
          sill.position.set(cx + wx, gy + 3.28, cz + side * 5.4);
          scene.add(sill);

          // Glowing stained-glass pane + vertical/horizontal lead muntin bars
          const wMesh = new THREE.Mesh(new THREE.BoxGeometry(1.16, 3.3, 0.18), this.warmWindowMat);
          wMesh.position.set(cx + wx, gy + 5.1, cz + side * 5.36);
          scene.add(wMesh);
          const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.18, 12), this.warmWindowMat);
          arch.rotation.x = Math.PI / 2;
          arch.position.set(cx + wx, gy + 6.75, cz + side * 5.36);
          scene.add(arch);
          const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 3.8, 0.2), ironMat);
          vBar.position.set(cx + wx, gy + 5.35, cz + side * 5.37);
          scene.add(vBar);
          for (const hy of [4.2, 5.4, 6.5]) {
            const hBar = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.06, 0.2), ironMat);
            hBar.position.set(cx + wx, gy + hy, cz + side * 5.37);
            scene.add(hBar);
          }
        }
      }

      // Articulated West Portal: stone steps, carved arched oak double door, copper porch canopy on twin columns, Baroque oculus!
      const step1 = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.32, 3.8), plinthStone);
      step1.position.set(cx - 10.85, gy + 0.05, cz);
      scene.add(step1);
      const portalFrame = new THREE.Mesh(new THREE.BoxGeometry(0.32, 3.9, 3.1), trimCream);
      portalFrame.position.set(cx - 10.05, gy + 2.0, cz);
      scene.add(portalFrame);
      const portal = new THREE.Mesh(new THREE.BoxGeometry(0.34, 3.55, 2.35), oakMat);
      portal.position.set(cx - 10.08, gy + 1.85, cz);
      scene.add(portal);
      const doorSplit = new THREE.Mesh(new THREE.BoxGeometry(0.38, 3.55, 0.08), ironMat);
      doorSplit.position.set(cx - 10.1, gy + 1.85, cz);
      scene.add(doorSplit);

      // Pitched verdigris-copper entrance canopy supported on twin slender stone columns
      const canopyRoof = new THREE.Mesh(gableGeo, verdigrisCopper);
      canopyRoof.position.set(cx - 11.15, gy + 4.15, cz);
      canopyRoof.rotation.y = Math.PI / 2;
      canopyRoof.scale.set(3.8, 1.15, 2.5);
      canopyRoof.castShadow = true;
      scene.add(canopyRoof);
      for (const colZ of [-1.55, 1.55]) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 3.95, 10), plinthStone);
        col.position.set(cx - 12.05, gy + 2.1, cz + colZ);
        col.castShadow = true;
        scene.add(col);
      }

      // Circular Baroque Oculus / Rose Window centered above the west portal
      const oculusRing = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.2, 10, 22), trimCream);
      oculusRing.rotation.y = Math.PI / 2;
      oculusRing.position.set(cx - 10.06, gy + 6.85, cz);
      scene.add(oculusRing);
      const oculusGlass = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.18, 18), this.warmWindowMat);
      oculusGlass.rotation.z = Math.PI / 2;
      oculusGlass.position.set(cx - 10.06, gy + 6.85, cz);
      scene.add(oculusGlass);
      const oculusCross1 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.05, 0.08), ironMat);
      oculusCross1.position.set(cx - 10.08, gy + 6.85, cz);
      scene.add(oculusCross1);
      const oculusCross2 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 2.05), ironMat);
      oculusCross2.position.set(cx - 10.08, gy + 6.85, cz);
      scene.add(oculusCross2);

      // Iconic Tall Southern Bell Tower (articulated plinth -> pilastered shaft -> cornice -> octagonal belfry -> copper lantern -> Zwiebelturm!)
      const tx = cx + 5.5;
      const tz = cz + 6.6;
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(5.2, 16.5, 5.2), stucco);
      shaft.position.set(tx, gy + 7.8, tz);
      shaft.castShadow = true;
      shaft.receiveShadow = true;
      scene.add(shaft);
      this.addStaticBox(world, groundMat, tx, gy + 8.2, tz, 5.2, 16.5, 5.2);

      const towerPlinth = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.6, 5.6), plinthStone);
      towerPlinth.position.set(tx, gy + 0.45, tz);
      scene.add(towerPlinth);
      for (const cy of [8.6, 15.85]) {
        const belt = new THREE.Mesh(new THREE.BoxGeometry(5.72, 0.44, 5.72), trimCream);
        belt.position.set(tx, gy + cy, tz);
        belt.castShadow = true;
        scene.add(belt);
      }
      // Corner pilasters on square tower shaft
      for (const sx of [-2.48, 2.48]) {
        for (const sz of [-2.48, 2.48]) {
          const cp = new THREE.Mesh(new THREE.BoxGeometry(0.45, 15.4, 0.45), trimCream);
          cp.position.set(tx + sx, gy + 8.0, tz + sz);
          scene.add(cp);
        }
      }

      // Octagonal white upper belfry with cornice crown, stone-framed arched sound-holes & gold-rimmed clock dials
      const belfry = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.85, 9.2, 8), stucco);
      belfry.position.set(tx, gy + 20.5, tz);
      belfry.castShadow = true;
      scene.add(belfry);
      const belfryCornice = new THREE.Mesh(new THREE.CylinderGeometry(3.12, 2.85, 0.48, 8), trimCream);
      belfryCornice.position.set(tx, gy + 24.95, tz);
      scene.add(belfryCornice);

      const clockMat = new THREE.MeshStandardMaterial({ map: createClockTexture(), roughness: 0.4 });
      for (const [ox, oz, ry] of [
        [0, 2.82, 0],
        [0, -2.82, Math.PI],
        [2.82, 0, Math.PI / 2],
        [-2.82, 0, -Math.PI / 2]
      ]) {
        const face = new THREE.Mesh(new THREE.CircleGeometry(0.98, 20), clockMat);
        face.position.set(tx + ox, gy + 18.2, tz + oz);
        face.rotation.y = ry;
        scene.add(face);
        const lFrame = new THREE.Mesh(new THREE.BoxGeometry(1.18, 2.55, 0.14), trimCream);
        lFrame.position.set(tx + ox * 0.94, gy + 21.85, tz + oz * 0.94);
        lFrame.rotation.y = ry;
        scene.add(lFrame);
        const louver = new THREE.Mesh(new THREE.BoxGeometry(0.86, 2.22, 0.18), louverMat);
        louver.position.set(tx + ox * 0.96, gy + 21.85, tz + oz * 0.96);
        louver.rotation.y = ry;
        scene.add(louver);
      }

      // Authentic plump fluted dark-verdigris copper onion dome + copper collar
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
      onion.position.set(tx, gy + 25.15, tz);
      onion.castShadow = true;
      scene.add(onion);

      // Shiny gold orb & Baroque cross finial
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.46, 12, 10), gold);
      orb.position.set(tx, gy + 32.95, tz);
      scene.add(orb);
      const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.75, 0.14), gold);
      crossV.position.set(tx, gy + 34.15, tz);
      scene.add(crossV);
      const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.14, 0.14), gold);
      crossH.position.set(tx, gy + 34.4, tz);
      scene.add(crossH);

      // Warm-plaster Kirchhofmauer (Churchyard Retaining Wall) with terracotta saddle coping tiles & pilasters
      const wallMat = new THREE.MeshStandardMaterial({ color: 0xe6dcc9, roughness: 0.9 });
      const wallSeg = new THREE.Mesh(new THREE.BoxGeometry(19, 1.85, 0.58), wallMat);
      wallSeg.position.set(cx + 1, gy + 0.6, cz + 8.9);
      wallSeg.castShadow = true;
      wallSeg.receiveShadow = true;
      scene.add(wallSeg);
      const wallCap = new THREE.Mesh(new THREE.BoxGeometry(19.4, 0.26, 0.86), tileRed);
      wallCap.position.set(cx + 1, gy + 1.6, cz + 8.9);
      wallCap.castShadow = true;
      scene.add(wallCap);
      for (const wp of [-8.2, -2.4, 3.4, 9.2]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.76, 2.05, 0.78), trimCream);
        pillar.position.set(cx + wp, gy + 0.72, cz + 8.9);
        scene.add(pillar);
      }
    }

    // === 2. HERO GASTHAUS "ZUM ALTWIRT" INN, CHESTNUT BIERGARTEN & MÜNSING MAIBAUM ===
    {
      const ax = REAL_SPOTS.muensingAltwirt.x + 2;
      const az = REAL_SPOTS.muensingAltwirt.z + 4;
      const gy = getTerrainHeight(ax, az);

      const innMat = new THREE.MeshStandardMaterial({
        map: createBavarianArchetypeTexture('lueftlmalerei'),
        emissive: 0xffc666,
        emissiveMap: createBavarianWindowEmissiveMap('lueftlmalerei'),
        emissiveIntensity: 0,
        color: 0xfdf1d4,
        roughness: 0.84
      });
      this.litFacadeMats.push(innMat);
      const innRoofMat = new THREE.MeshStandardMaterial({ map: tileTex, color: 0xaa4428, roughness: 0.78 });
      const darkWood = new THREE.MeshStandardMaterial({ color: 0x4b2e18, roughness: 0.88 });
      const plinthStone = new THREE.MeshStandardMaterial({ color: 0xaba292, roughness: 0.92 });
      const flowerMat = new THREE.MeshStandardMaterial({ color: 0xc9312a, roughness: 0.82 });
      const leafBoxMat = new THREE.MeshStandardMaterial({ color: 0x38662c, roughness: 0.88 });
      const chimneyPlaster = new THREE.MeshStandardMaterial({ color: 0xe9e1d2, roughness: 0.88 });

      const innBody = new THREE.Mesh(new THREE.BoxGeometry(16.5, 7.6, 11.0), innMat);
      innBody.position.set(ax, gy + 3.2, az);
      innBody.castShadow = true;
      innBody.receiveShadow = true;
      scene.add(innBody);
      this.addStaticBox(world, groundMat, ax, gy + 3.6, az, 16.5, 7.6, 11.0);

      // Ground stone plinth
      const innPlinth = new THREE.Mesh(new THREE.BoxGeometry(16.85, 1.1, 11.35), plinthStone);
      innPlinth.position.set(ax, gy + 0.25, az);
      scene.add(innPlinth);

      // Broad overhanging Upper Bavarian gable roof + dark timber fascia beam & twin chimneys
      const innRoof = new THREE.Mesh(gableGeo, innRoofMat);
      innRoof.position.set(ax, gy + 6.95, az);
      innRoof.scale.set(17.9, 4.2, 12.6);
      innRoof.castShadow = true;
      scene.add(innRoof);

      const fascia = new THREE.Mesh(new THREE.BoxGeometry(17.8, 0.34, 12.5), darkWood);
      fascia.position.set(ax, gy + 6.86, az);
      scene.add(fascia);

      for (const chx of [-4.2, 4.6]) {
        const chim = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.4, 0.95), chimneyPlaster);
        chim.position.set(ax + chx, gy + 10.6, az + 1.2);
        chim.castShadow = true;
        scene.add(chim);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.22, 1.18), innRoofMat);
        cap.position.set(ax + chx, gy + 11.86, az + 1.2);
        scene.add(cap);
      }

      // Carved dark-timber Bavarian balcony with deck, posts, rail & vibrant red geranium window boxes!
      const balcDeck = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.22, 1.55), darkWood);
      balcDeck.position.set(ax, gy + 3.72, az - 6.05);
      balcDeck.castShadow = true;
      scene.add(balcDeck);
      const balcRail = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.92, 0.16), darkWood);
      balcRail.position.set(ax, gy + 4.3, az - 6.72);
      balcRail.castShadow = true;
      scene.add(balcRail);
      for (const bx of [-4.5, 4.5]) {
        const sideRail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.92, 1.5), darkWood);
        sideRail.position.set(ax + bx, gy + 4.3, az - 6.05);
        scene.add(sideRail);
      }
      for (const fx of [-3.4, -1.1, 1.1, 3.4]) {
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.32, 0.42), leafBoxMat);
        leaf.position.set(ax + fx, gy + 4.78, az - 6.82);
        scene.add(leaf);
        const bloom = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.24, 0.34), flowerMat);
        bloom.position.set(ax + fx, gy + 4.98, az - 6.84);
        scene.add(bloom);
      }

      // Tavern entrance oak door + warm glowing lantern beside it
      const door = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.6, 0.2), darkWood);
      door.position.set(ax, gy + 1.4, az - 5.56);
      scene.add(door);

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
        new THREE.BoxGeometry(7.4, 1.55, 0.18),
        new THREE.MeshStandardMaterial({ map: altTex, roughness: 0.45 })
      );
      signBoard.position.set(ax, gy + 6.0, az - 5.65);
      signBoard.rotation.y = Math.PI;
      scene.add(signBoard);

      // Authentic Bavarian Weiß-Blau striped Biergarten Parasols outside Zum Altwirt!
      const umbrellaMat = new THREE.MeshStandardMaterial({ map: parasolTex, roughness: 0.7 });
      const whitePole = new THREE.MeshStandardMaterial({ color: 0xeeeae0, roughness: 0.6 });
      for (const [ux, uz] of [
        [ax - 9.5, az - 6.5],
        [ax - 4.0, az - 8.5],
        [ax + 2.5, az - 8.5]
      ]) {
        const uy = getTerrainHeight(ux, uz);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.85, 8), whitePole);
        pole.position.set(ux, uy + 1.42, uz);
        scene.add(pole);
        const canopy = new THREE.Mesh(new THREE.ConeGeometry(2.2, 0.78, 12), umbrellaMat);
        canopy.position.set(ux, uy + 2.8, uz);
        canopy.castShadow = true;
        scene.add(canopy);
      }

      // Tall Blue-and-White Münsing Maibaum with painted Bavarian guild signs (Zunfttafeln) & spruce wreath!
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

      // 4 pairs of traditional Bavarian craft/guild arms (Zunfttafeln) projecting along the Maibaum!
      const guildColors = [0xd64531, 0x266eb5, 0xdca52a, 0x357a3c];
      for (let gi = 0; gi < 4; gi++) {
        const armY = 5.4 + gi * 2.05;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 0.1), darkWood);
        arm.position.y = armY;
        arm.rotation.y = gi * 0.85;
        g.add(arm);
        const signMat = new THREE.MeshStandardMaterial({ color: guildColors[gi], roughness: 0.6 });
        for (const side of [-1.15, 1.15]) {
          const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.08), signMat);
          plaque.position.set(Math.cos(gi * 0.85) * side, armY + 0.32, -Math.sin(gi * 0.85) * side);
          plaque.rotation.y = gi * 0.85;
          g.add(plaque);
        }
      }

      const wreath = new THREE.Mesh(
        new THREE.TorusGeometry(1.38, 0.28, 10, 18),
        new THREE.MeshStandardMaterial({ color: 0x2d6630, roughness: 0.88 })
      );
      wreath.rotation.x = Math.PI / 2;
      wreath.position.y = 13.8;
      g.add(wreath);

      const crown = new THREE.Mesh(
        new THREE.ConeGeometry(1.1, 2.7, 8),
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

    // === 3. SCHLOSS AMMERLAND — AUTHENTIC 1685 BAROQUE LAKESIDE PALACE WITH TWIN ONION TOWERS ===
    {
      const sx = REAL_SPOTS.schlossAmmerland.x;
      const sz = REAL_SPOTS.schlossAmmerland.z;
      const gy = Math.max(WATER_LEVEL + 1.2, getTerrainHeight(sx, sz));

      const palaceTex = createBaroquePalaceTexture();
      palaceTex.repeat.set(1.5, 1);
      const palaceEmissive = createBaroquePalaceEmissiveMap();
      palaceEmissive.repeat.set(1.5, 1);
      const castlePlaster = new THREE.MeshStandardMaterial({
        map: palaceTex,
        emissive: 0xffc866,
        emissiveMap: palaceEmissive,
        emissiveIntensity: 0,
        color: 0xfdf3db,
        roughness: 0.8
      });
      this.litFacadeMats.push(castlePlaster);
      const towerPlaster = new THREE.MeshStandardMaterial({ color: 0xf6e6be, roughness: 0.82 });
      const trimCream = new THREE.MeshStandardMaterial({ color: 0xfaf2e1, roughness: 0.78 });
      const plinthStone = new THREE.MeshStandardMaterial({ color: 0xc2b7a2, roughness: 0.9 });
      const tileRed = new THREE.MeshStandardMaterial({ map: tileTex, color: 0xb4482c, roughness: 0.78 });
      const verdigrisCopper = new THREE.MeshStandardMaterial({ color: 0x3b7660, roughness: 0.36, metalness: 0.48 });
      const gold = new THREE.MeshStandardMaterial({ color: 0xebbf42, roughness: 0.22, metalness: 0.88 });
      const winGlass = new THREE.MeshStandardMaterial({ color: 0x253749, roughness: 0.2, metalness: 0.45 });

      const keep = new THREE.Mesh(new THREE.BoxGeometry(15, 11.2, 22), castlePlaster);
      keep.position.set(sx, gy + 5.0, sz);
      keep.castShadow = true;
      keep.receiveShadow = true;
      scene.add(keep);
      this.addStaticBox(world, groundMat, sx, gy + 5.4, sz, 15, 11.2, 22);

      // Stone plinth & Baroque stepped cornice around palace keep
      const kPlinth = new THREE.Mesh(new THREE.BoxGeometry(15.5, 1.3, 22.5), plinthStone);
      kPlinth.position.set(sx, gy + 0.3, sz);
      scene.add(kPlinth);
      const kCornice = new THREE.Mesh(new THREE.BoxGeometry(15.7, 0.5, 22.7), trimCream);
      kCornice.position.set(sx, gy + 10.45, sz);
      scene.add(kCornice);

      const roof = new THREE.Mesh(gableGeo, tileRed);
      roof.position.set(sx, gy + 10.6, sz);
      roof.rotation.y = Math.PI / 2;
      roof.scale.set(23.0, 4.8, 16.0);
      roof.castShadow = true;
      scene.add(roof);

      // Central Baroque Roof Dormer Pediment on both East (road) and West (lake) facades + twin palace chimneys
      for (const side of [-1, 1]) {
        const dormer = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.9, 5.0), towerPlaster);
        dormer.position.set(sx + side * 6.5, gy + 11.9, sz);
        dormer.castShadow = true;
        scene.add(dormer);
        const dormerRoof = new THREE.Mesh(gableGeo, tileRed);
        dormerRoof.position.set(sx + side * 6.5, gy + 13.3, sz);
        dormerRoof.scale.set(3.1, 1.5, 5.5);
        scene.add(dormerRoof);
        const dormerWin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.7, 1.25), winGlass);
        dormerWin.position.set(sx + side * 7.82, gy + 11.95, sz);
        scene.add(dormerWin);
      }
      for (const czOff of [-5.8, 5.8]) {
        const chim = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.5, 1.1), trimCream);
        chim.position.set(sx, gy + 15.2, sz + czOff);
        scene.add(chim);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.25, 1.35), tileRed);
        cap.position.set(sx, gy + 16.5, sz + czOff);
        scene.add(cap);
      }

      // Authentic TWO prominent copper onion-domed lakeside towers (Zwiebeltürme) of Caspar Feichtmayr's 1685 Schloss Ammerland!
      const castleOnionPts = [
        new THREE.Vector2(0.01, 5.3),
        new THREE.Vector2(0.24, 4.3),
        new THREE.Vector2(0.95, 3.5),
        new THREE.Vector2(2.22, 2.35),
        new THREE.Vector2(2.4, 1.0),
        new THREE.Vector2(1.9, 0)
      ];
      const castleOnionGeo = new THREE.LatheGeometry(castleOnionPts, 16);
      for (const oz of [-10.2, 10.2]) {
        const tx = sx - 6.8;
        const tz = sz + oz;
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.88, 2.04, 14.5, 10), towerPlaster);
        tower.position.set(tx, gy + 6.8, tz);
        tower.castShadow = true;
        scene.add(tower);

        // Stone plinth & Baroque horizontal cornice collars around each tower
        const tPlinth = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.28, 1.5, 10), plinthStone);
        tPlinth.position.set(tx, gy + 0.4, tz);
        scene.add(tPlinth);
        for (const collarY of [6.8, 10.8, 13.9]) {
          const collar = new THREE.Mesh(new THREE.CylinderGeometry(2.24, 2.1, 0.38, 10), trimCream);
          collar.position.set(tx, gy + collarY, tz);
          scene.add(collar);
        }

        // Tall narrow Baroque tower windows facing West, North/South & East
        for (let a = 0; a < 4; a++) {
          const ang = (a / 4) * Math.PI * 2;
          const tw = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.65, 0.16), winGlass);
          tw.position.set(tx + Math.sin(ang) * 1.94, gy + 12.35, tz + Math.cos(ang) * 1.94);
          tw.rotation.y = ang;
          scene.add(tw);
        }

        const cap = new THREE.Mesh(castleOnionGeo, verdigrisCopper);
        cap.position.set(tx, gy + 14.05, tz);
        cap.castShadow = true;
        scene.add(cap);

        // Gilded orb & finial spire crowning each twin tower
        const tOrb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), gold);
        tOrb.position.set(tx, gy + 19.45, tz);
        scene.add(tOrb);
        const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 1.35, 6), gold);
        spire.position.set(tx, gy + 20.3, tz);
        scene.add(spire);
      }

      // Stone lakeside garden terrace wall west of palace
      const parkWall = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.35, 28), plinthStone);
      parkWall.position.set(sx - 10.6, gy + 0.4, sz);
      parkWall.castShadow = true;
      scene.add(parkWall);
      const parkCap = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.22, 28.4), trimCream);
      parkCap.position.set(sx - 10.6, gy + 1.15, sz);
      scene.add(parkCap);

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
      const darkTimber = new THREE.MeshStandardMaterial({ color: 0x4a311a, roughness: 0.9 });
      const awningMat = new THREE.MeshStandardMaterial({ map: parasolTex, roughness: 0.72, side: THREE.DoubleSide });
      const crateMat = new THREE.MeshStandardMaterial({ color: 0x9b764a, roughness: 0.9 });
      const buoyMat = new THREE.MeshStandardMaterial({ color: 0xd93a28, roughness: 0.55 });

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
      shopRoof.scale.set(12.6, 2.9, 8.8);
      shopRoof.castShadow = true;
      scene.add(shopRoof);

      const shopFascia = new THREE.Mesh(new THREE.BoxGeometry(12.5, 0.28, 8.7), darkTimber);
      shopFascia.position.set(shopX, shopY + 4.4, shopZ);
      scene.add(shopFascia);

      // Bavarian blue-and-white Brotzeitgarten awning shading the lakeside shop front
      const awning = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.12, 2.6), awningMat);
      awning.position.set(shopX, shopY + 2.75, shopZ + 4.95);
      awning.rotation.x = 0.28;
      awning.castShadow = true;
      scene.add(awning);

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
      sign.position.set(shopX, shopY + 3.6, shopZ + 3.9);
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
          // Raised mooring bollards along pier edge
          const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.72, 8), darkTimber);
          bollard.position.set(x, deckY + 0.5, pz + oz);
          bollard.castShadow = true;
          scene.add(bollard);
        }
      }

      // Stacked wooden fish crates & red lifebuoy ring at the pier head
      const crate1 = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.58, 0.72), crateMat);
      crate1.position.set(SEBALD_PIER.westX + 3.0, deckY + 0.44, pz - 1.6);
      crate1.castShadow = true;
      scene.add(crate1);
      const crate2 = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.48, 0.66), crateMat);
      crate2.position.set(SEBALD_PIER.westX + 3.15, deckY + 0.96, pz - 1.55);
      crate2.rotation.y = 0.28;
      scene.add(crate2);
      const lifebuoy = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.12, 8, 16), buoyMat);
      lifebuoy.position.set(SEBALD_PIER.westX + 1.2, deckY + 0.85, pz + SEBALD_PIER.halfWidth - 0.32);
      scene.add(lifebuoy);

      // Gently bobbing white sailboats (with blue waterline trim, jib + mainsail) moored off Fischerei Sebald & Schloss Ammerland!
      const hullMat = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.32 });
      const stripeMat = new THREE.MeshStandardMaterial({ color: 0x1b5c96, roughness: 0.4 });
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
        const hull = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.78, 4.4), hullMat);
        hull.position.y = 0.24;
        hull.castShadow = true;
        boat.add(hull);
        // Tapered pointed bow + blue lake waterline stripe
        const bow = new THREE.Mesh(new THREE.ConeGeometry(1.02, 1.85, 4), hullMat);
        bow.rotation.x = -Math.PI / 2;
        bow.rotation.z = Math.PI / 4;
        bow.scale.set(1.0, 1.0, 0.56);
        bow.position.set(0, 0.24, -3.0);
        boat.add(bow);
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.16, 4.44), stripeMat);
        stripe.position.y = 0.08;
        boat.add(stripe);
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.068, 7.2, 8), timber);
        mast.position.y = 3.75;
        boat.add(mast);
        // Mainsail + forward triangular jib sail
        const mainSailGeo = new THREE.BufferGeometry();
        mainSailGeo.setAttribute(
          'position',
          new THREE.BufferAttribute(new Float32Array([0, 0.95, 0.1, 0, 6.95, 0.1, 0, 1.25, 3.0]), 3)
        );
        mainSailGeo.computeVertexNormals();
        boat.add(new THREE.Mesh(mainSailGeo, sailMat));
        const jibSailGeo = new THREE.BufferGeometry();
        jibSailGeo.setAttribute(
          'position',
          new THREE.BufferAttribute(new Float32Array([0, 1.05, -0.1, 0, 6.1, -0.1, 0, 1.1, -2.5]), 3)
        );
        jibSailGeo.computeVertexNormals();
        boat.add(new THREE.Mesh(jibSailGeo, sailMat));

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
      if (Math.abs(tx - FARM_YARD_CENTER.x) < 34 && Math.abs(tz - FARM_YARD_CENTER.z) < 32) return false;
      if (tx > -330 && tx < -274 && Math.abs(tz - 922) < 10) return false;
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

    // Instanced 3-Tiered Alpine Spruces with rich vertical needle color depth (deep shaded base -> bright alpine tip!)
    if (spruces.length > 0) {
      const sTrunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.42, 3.8, 6), trunkMat, spruces.length);
      const boughMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 });
      const tier1 = new THREE.InstancedMesh(new THREE.ConeGeometry(2.75, 4.1, 7), boughMat, spruces.length);
      const tier2 = new THREE.InstancedMesh(new THREE.ConeGeometry(2.12, 3.8, 7), boughMat, spruces.length);
      const tier3 = new THREE.InstancedMesh(new THREE.ConeGeometry(1.42, 3.4, 7), boughMat, spruces.length);
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

        dummy.rotation.set(0, idx * 1.3 + 0.45, 0);
        dummy.position.set(t.x, gy + 6.4 * t.s, t.z);
        dummy.updateMatrix();
        tier2.setMatrixAt(idx, dummy.matrix);

        dummy.rotation.set(0, idx * 1.3 + 0.9, 0);
        dummy.position.set(t.x, gy + 8.6 * t.s, t.z);
        dummy.updateMatrix();
        tier3.setMatrixAt(idx, dummy.matrix);

        col.setHex(idx % 3 === 0 ? 0x1e3f1e : idx % 3 === 1 ? 0x254b23 : 0x2c5628);
        tier1.setColorAt(idx, col);
        col.setHex(idx % 3 === 0 ? 0x285225 : idx % 3 === 1 ? 0x31602c : 0x396b32);
        tier2.setColorAt(idx, col);
        col.setHex(idx % 3 === 0 ? 0x356830 : idx % 3 === 1 ? 0x3f7537 : 0x49813d);
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

    // Instanced Broadleaf Bavarian Oaks, Lindens & Chestnuts (tapered trunk + 3-lobe shaded organic crowns!)
    if (oaks.length > 0) {
      const oTrunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.5, 4.0, 6), trunkMat, oaks.length);
      const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 });
      const canopyMain = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(2.55, 1), leafMat, oaks.length);
      const canopySide = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1.95, 1), leafMat, oaks.length);
      const canopyTop = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1.75, 1), leafMat, oaks.length);
      canopyMain.castShadow = true;
      canopySide.castShadow = true;

      oaks.forEach((t, idx) => {
        const gy = getTerrainHeight(t.x, t.z);
        const ang = idx * 1.75;
        dummy.rotation.set(((idx % 3) - 1) * 0.04, idx * 2.1, 0);
        dummy.scale.setScalar(t.s);

        dummy.position.set(t.x, gy + 1.85 * t.s, t.z);
        dummy.updateMatrix();
        oTrunk.setMatrixAt(idx, dummy.matrix);

        // Shaded lower-main broadleaf lobe
        dummy.position.set(t.x + Math.cos(ang) * 0.45 * t.s, gy + 4.75 * t.s, t.z + Math.sin(ang) * 0.45 * t.s);
        dummy.rotation.set(0.08, ang, 0.06);
        dummy.scale.set(t.s * 1.18, t.s * 0.86, t.s * 1.1);
        dummy.updateMatrix();
        canopyMain.setMatrixAt(idx, dummy.matrix);

        // Asymmetric branching side lobe
        dummy.position.set(t.x - Math.cos(ang + 0.4) * 1.55 * t.s, gy + 4.35 * t.s, t.z - Math.sin(ang + 0.4) * 1.55 * t.s);
        dummy.rotation.set(-0.1, ang + 1.3, 0.12);
        dummy.scale.set(t.s * 1.12, t.s * 0.84, t.s * 1.05);
        dummy.updateMatrix();
        canopySide.setMatrixAt(idx, dummy.matrix);

        // Sunlit upper crown crest lobe
        dummy.position.set(t.x + Math.cos(ang + 1.9) * 0.72 * t.s, gy + 6.05 * t.s, t.z + Math.sin(ang + 1.9) * 0.72 * t.s);
        dummy.rotation.set(0.05, ang + 2.4, -0.08);
        dummy.scale.set(t.s * 1.08, t.s * 0.82, t.s * 1.04);
        dummy.updateMatrix();
        canopyTop.setMatrixAt(idx, dummy.matrix);

        col.setHex(idx % 4 === 0 ? 0x3b6629 : idx % 4 === 1 ? 0x45742f : idx % 4 === 2 ? 0x345c26 : 0x4d7b33);
        canopyMain.setColorAt(idx, col);
        col.setHex(idx % 4 === 0 ? 0x4b7b33 : idx % 4 === 1 ? 0x588a38 : idx % 4 === 2 ? 0x41702e : 0x62903c);
        canopySide.setColorAt(idx, col);
        col.setHex(idx % 4 === 0 ? 0x60923d : idx % 4 === 1 ? 0x6ea043 : idx % 4 === 2 ? 0x548537 : 0x79a646);
        canopyTop.setColorAt(idx, col);
      });

      oTrunk.instanceMatrix.needsUpdate = true;
      canopyMain.instanceMatrix.needsUpdate = true;
      canopySide.instanceMatrix.needsUpdate = true;
      canopyTop.instanceMatrix.needsUpdate = true;
      if (canopyMain.instanceColor) canopyMain.instanceColor.needsUpdate = true;
      if (canopySide.instanceColor) canopySide.instanceColor.needsUpdate = true;
      if (canopyTop.instanceColor) canopyTop.instanceColor.needsUpdate = true;
      scene.add(oTrunk, canopyMain, canopySide, canopyTop);
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
      [-283, 906, 0.3]
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
      { name: 'Forest Green SUV', color: 0x2d5e3a, x: -275, z: 902, rotY: 0.1 },
      { name: 'Blue Sedan', color: 0x244878, x: 491, z: -1206, rotY: 0.2 },
      // Parked right outside the west farm lane so you can test lifting a 1.4-ton vehicle!
      { name: 'Old Farm Pickup', color: 0x9c3d28, x: FARM_YARD_CENTER.x - 28, z: FARM_YARD_CENTER.z - 1, rotY: 1.45 }
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
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x583c24, roughness: 0.95 });
    const leafDark = new THREE.MeshStandardMaterial({ color: 0x3a672a, roughness: 0.9 });
    const leafMid = new THREE.MeshStandardMaterial({ color: 0x4d8035, roughness: 0.87 });
    const leafSun = new THREE.MeshStandardMaterial({ color: 0x689a42, roughness: 0.84 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x262b2e, roughness: 0.5, metalness: 0.65 });

    const treeSpots: [number, number][] = [
      [REAL_SPOTS.muensingAltwirt.x + 14, REAL_SPOTS.muensingAltwirt.z - 6],
      [REAL_SPOTS.muensingAltwirt.x - 9, REAL_SPOTS.muensingAltwirt.z + 12],
      [REAL_SPOTS.muensingChurch.x - 16, REAL_SPOTS.muensingChurch.z - 8],
      [REAL_SPOTS.sebaldPier.x - 2, REAL_SPOTS.sebaldPier.z + 18],
      [REAL_SPOTS.schlossAmmerland.x + 22, REAL_SPOTS.schlossAmmerland.z - 22],
      [REAL_SPOTS.wimpasing.x - 42, REAL_SPOTS.wimpasing.z + 20],
      [FARM_YARD_CENTER.x - 29, FARM_YARD_CENTER.z + 22]
    ];
    // Handcrafted multi-cluster Bavarian Chestnut & Linden canopies (branched trunk + 5 layered foliage lobes!)
    const lobeGeo = new THREE.DodecahedronGeometry(1.0, 1);
    treeSpots.forEach(([tx, tz], ti) => {
      const ty = getTerrainHeight(tx, tz);
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.48, 3.2, 8), trunkMat);
      trunk.position.y = 1.6;
      trunk.castShadow = true;
      g.add(trunk);

      // 3 angled upper structural branches fanning out into the chestnut crown
      for (let bi = 0; bi < 3; bi++) {
        const bAng = ti * 1.1 + bi * ((Math.PI * 2) / 3);
        const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 1.85, 6), trunkMat);
        branch.position.set(Math.cos(bAng) * 0.55, 3.35, Math.sin(bAng) * 0.55);
        branch.rotation.z = -Math.cos(bAng) * 0.55;
        branch.rotation.x = Math.sin(bAng) * 0.55;
        branch.castShadow = true;
        g.add(branch);
      }

      // 5 organic shaded foliage lobes (deep lower canopy -> lush mid lobes -> sunlit upper crest)
      const lobes: [number, number, number, number, number, number, THREE.Material][] = [
        [0.0, 4.35, 0.0, 2.05, 1.48, 1.95, leafDark],
        [1.35, 4.15, 0.55, 1.62, 1.25, 1.55, leafMid],
        [-1.25, 4.25, -0.75, 1.68, 1.3, 1.52, leafMid],
        [-0.35, 4.45, 1.3, 1.5, 1.22, 1.48, leafDark],
        [0.25, 5.45, -0.15, 1.65, 1.28, 1.58, leafSun]
      ];
      for (const [lx, ly, lz, sx, sy, sz, mat] of lobes) {
        const lobe = new THREE.Mesh(lobeGeo, mat);
        lobe.position.set(lx, ly, lz);
        lobe.scale.set(sx, sy, sz);
        lobe.rotation.set(lx * 0.3, ly + ti, lz * 0.3);
        lobe.castShadow = true;
        lobe.receiveShadow = true;
        g.add(lobe);
      }

      g.position.set(tx, ty - 0.1, tz);
      g.rotation.y = ti * 1.4;
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
    });

    const lampGlowTex = createLampGlowTexture();
    const lampSpots: [number, number, boolean][] = [
      // Münsing village main street (Church -> Maibaum -> Zum Altwirt -> EDEKA)
      [REAL_SPOTS.muensingChurch.x - 36, REAL_SPOTS.muensingChurch.z + 20, true],
      [REAL_SPOTS.muensingChurch.x - 14, REAL_SPOTS.muensingChurch.z + 18, true],
      [REAL_SPOTS.muensingChurch.x + 16, REAL_SPOTS.muensingChurch.z + 22, true],
      [REAL_SPOTS.muensingAltwirt.x - 16, REAL_SPOTS.muensingAltwirt.z - 16, true],
      [REAL_SPOTS.muensingAltwirt.x + 14, REAL_SPOTS.muensingAltwirt.z - 18, true],
      [REAL_SPOTS.muensingAltwirt.x + 42, REAL_SPOTS.muensingAltwirt.z - 22, false],
      [REAL_SPOTS.edeka.x - 14, REAL_SPOTS.edeka.z + 14, false],
      // Ammerland & Schloss Ammerland & Fischerei Sebald lakeside road (flanking Schloss sightline cleanly!)
      [REAL_SPOTS.schlossAmmerland.x + 44, REAL_SPOTS.schlossAmmerland.z - 30, true],
      [REAL_SPOTS.schlossAmmerland.x + 44, REAL_SPOTS.schlossAmmerland.z + 24, true],
      [REAL_SPOTS.sebaldPier.x + 8, REAL_SPOTS.sebaldPier.z + 10, true],
      [REAL_SPOTS.sebaldPier.x + 12, REAL_SPOTS.sebaldPier.z - 26, false],
      // Wimpasing & Home Farm village street
      [FARM_YARD_CENTER.x + 24, FARM_YARD_CENTER.z - 11, true],
      [-282, 910, true],
      [-286, 944, false],
      [REAL_SPOTS.wimpasing.x + 60, REAL_SPOTS.wimpasing.z - 5, false],
      // Weipertshausen hamlet
      [489, -1178, true],
      [489, -1210, false],
      // Ried
      [REAL_SPOTS.ried.x + 12, REAL_SPOTS.ried.z + 8, false]
    ];
    for (const [lx, lz, hasRealLight] of lampSpots) {
      const ly = getTerrainHeight(lx, lz);
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 4.8, 8), ironMat);
      pole.position.y = 2.4;
      g.add(pole);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.24, 6), ironMat);
      cap.position.y = 5.32;
      g.add(cap);
      const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.54, 0.42), this.lampBulbMat);
      lantern.position.y = 4.95;
      g.add(lantern);

      // Soft additive warm halo sprite around the lantern globe at Sunset & Dusk
      const haloMat = new THREE.SpriteMaterial({
        map: lampGlowTex,
        color: 0xffd27a,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const halo = new THREE.Sprite(haloMat);
      halo.position.y = 4.95;
      halo.scale.set(3.8, 3.8, 1);
      halo.visible = false;
      g.add(halo);
      this.lampGlowSprites.push(halo);

      // Warm glowing light pool on the ground directly beneath every street lamp!
      const poolMat = new THREE.MeshBasicMaterial({
        map: lampGlowTex,
        color: 0xffc664,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(11.5, 11.5), poolMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.y = 0.16;
      g.add(pool);
      this.lampPoolMats.push(poolMat);

      if (hasRealLight) {
        const pl = new THREE.PointLight(0xffcb74, 0, 34, 1.5);
        pl.position.set(0, 4.75, 0);
        g.add(pl);
        this.lampPointLights.push(pl);
      }

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
      [-278, 932],
      [-282, 888],
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
