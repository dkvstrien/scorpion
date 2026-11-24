import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { FARM_YARD_CENTER, getTerrainHeight, REAL_SPOTS } from './terrain';
import {
  createBarnWoodTexture,
  createCorrugatedMetalTexture,
  createCrispGravelPadTexture,
  createHayTexture,
  createStoneWallTexture,
  createWeatheredBrickWallTexture
} from './textures';

export const DEMO_SITE_CENTER = { x: 165, z: 620 };

export type BreakableKind =
  | 'fence'
  | 'gate'
  | 'woodpile'
  | 'bale_stack'
  | 'garden_wall'
  | 'shed'
  | 'sign'
  | 'brick_wall'
  | 'roof_slab';

interface BreakableItem {
  kind: BreakableKind;
  label: string;
  pos: THREE.Vector3;
  rotY: number;
  radius: number;
  height: number;
  mesh: THREE.Group;
  broken: boolean;
  isDemoSite: boolean;
  chunkColors: number[];
  chunkSize: [number, number, number];
  chunkCount: number;
  soundMat: 'wood' | 'hay' | 'metal';
  /** Optional roof pieces that collapse automatically when their supporting wall breaks! */
  collapseIds?: number[];
  id: number;
}

interface DebrisChunk {
  mesh: THREE.Mesh;
  body: CANNON.Body;
  life: number;
  maxLife: number;
}

export interface DestructionCallbacks {
  onBreak: (
    label: string,
    pos: THREE.Vector3,
    soundMat: 'wood' | 'hay' | 'metal',
    colors: number[],
    shake: number,
    impact?: { speedKeepFrac: number; pitchKick: number }
  ) => void;
  onStructureBlock?: (pushOutDir: { x: number; z: number; overlap: number }, pitchKick: number) => void;
}

/**
 * Manages breakable world props (fences, gates, bale stacks, woodpiles, garden walls, sheds, signs)
 * AND the self-contained "Old Gravel Pit Farmstead" Demolition Site at (165, 620).
 * Every broken structure shatters into pre-split rigid-body debris chunks (capped at 48 active chunks -> 60 fps!).
 */
export class DestructionManager {
  public items: BreakableItem[] = [];
  private debris: DebrisChunk[] = [];
  private nextId = 1;
  private readonly maxDebris = 48;

  private scene: THREE.Scene;
  private world: CANNON.World;
  private propMat: CANNON.Material;
  private callbacks: DestructionCallbacks;

  private woodMat = new THREE.MeshStandardMaterial({ map: createBarnWoodTexture(), color: 0xb88b62, roughness: 0.9 });
  private darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x4f331c, roughness: 0.94 });
  private brickMat = new THREE.MeshStandardMaterial({ map: createWeatheredBrickWallTexture(), roughness: 0.9 });
  private stoneMat = new THREE.MeshStandardMaterial({ map: createStoneWallTexture(), roughness: 0.94 });
  private roofTileMat = new THREE.MeshStandardMaterial({ map: createCorrugatedMetalTexture(), color: 0xb64a2e, roughness: 0.8 });
  private metalMat = new THREE.MeshStandardMaterial({ map: createCorrugatedMetalTexture(), roughness: 0.62, metalness: 0.32 });
  private hayMat = new THREE.MeshStandardMaterial({ map: createHayTexture(), roughness: 0.94 });
  private signYellowMat = new THREE.MeshStandardMaterial({ color: 0xf0c21a, roughness: 0.4 });

  constructor(
    scene: THREE.Scene,
    world: CANNON.World,
    propMat: CANNON.Material,
    callbacks: DestructionCallbacks
  ) {
    this.scene = scene;
    this.world = world;
    this.propMat = propMat;
    this.callbacks = callbacks;

    this.buildWorldBreakables();
    this.buildDemolitionSite();
  }

  public getBrokenCount(): { broken: number; total: number; demoBroken: number; demoTotal: number } {
    let broken = 0;
    let demoBroken = 0;
    let demoTotal = 0;
    for (const it of this.items) {
      if (it.broken) broken++;
      if (it.isDemoSite) {
        demoTotal++;
        if (it.broken) demoBroken++;
      }
    }
    return { broken, total: this.items.length, demoBroken, demoTotal };
  }

  public resetDemolitionSite(): void {
    // Clear active debris
    for (const d of this.debris) {
      this.scene.remove(d.mesh);
      this.world.removeBody(d.body);
    }
    this.debris = [];

    // Restore all demolition-site structures
    for (const it of this.items) {
      if (it.isDemoSite) {
        it.broken = false;
        it.mesh.visible = true;
      }
    }
  }

  private addBreakable(
    kind: BreakableKind,
    label: string,
    x: number,
    z: number,
    rotY: number,
    radius: number,
    height: number,
    mesh: THREE.Group,
    isDemoSite: boolean,
    chunkColors: number[],
    chunkSize: [number, number, number],
    chunkCount: number,
    soundMat: 'wood' | 'hay' | 'metal',
    yOffset = 0
  ): BreakableItem {
    const gy = getTerrainHeight(x, z) + yOffset;
    mesh.position.set(x, gy, z);
    mesh.rotation.y = rotY;
    this.scene.add(mesh);
    const item: BreakableItem = {
      id: this.nextId++,
      kind,
      label,
      pos: new THREE.Vector3(x, gy, z),
      rotY,
      radius,
      height,
      mesh,
      broken: false,
      isDemoSite,
      chunkColors,
      chunkSize,
      chunkCount,
      soundMat
    };
    this.items.push(item);
    return item;
  }

  private makeFenceMesh(len = 5.4): THREE.Group {
    const g = new THREE.Group();
    for (const px of [-len * 0.46, 0, len * 0.46]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.35, 0.16), this.darkWoodMat);
      post.position.set(px, 0.65, 0);
      post.castShadow = true;
      g.add(post);
    }
    for (const py of [0.55, 1.05]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 0.08), this.woodMat);
      rail.position.set(0, py, 0);
      rail.castShadow = true;
      g.add(rail);
    }
    return g;
  }

  private makeGateMesh(): THREE.Group {
    const g = new THREE.Group();
    for (const sx of [-2.4, 2.4]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.7, 0.24), this.darkWoodMat);
      post.position.set(sx, 0.85, 0);
      post.castShadow = true;
      g.add(post);
    }
    for (const side of [-1, 1]) {
      const leaf = new THREE.Group();
      leaf.position.set(side * 1.15, 0.82, 0);
      for (const py of [-0.35, 0, 0.35]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.12, 0.08), this.woodMat);
        bar.position.y = py;
        bar.castShadow = true;
        leaf.add(bar);
      }
      const diag = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.1, 0.07), this.darkWoodMat);
      diag.rotation.z = side * 0.34;
      leaf.add(diag);
      g.add(leaf);
    }
    return g;
  }

  private makeWoodpileMesh(): THREE.Group {
    const g = new THREE.Group();
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4 - r; c++) {
        const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.23, 2.6, 8), this.darkWoodMat);
        lg.rotation.x = Math.PI / 2;
        lg.position.set(-0.75 + c * 0.48 + r * 0.24, 0.24 + r * 0.38, 0);
        lg.castShadow = true;
        g.add(lg);
      }
    }
    return g;
  }

  private makeBaleStackMesh(): THREE.Group {
    const g = new THREE.Group();
    const baleGeo = new THREE.CylinderGeometry(0.75, 0.75, 1.22, 12);
    baleGeo.rotateZ(Math.PI / 2);
    const pts: [number, number, number][] = [
      [-1.55, 0.75, 0],
      [0, 0.75, 0],
      [1.55, 0.75, 0],
      [-0.78, 2.05, 0],
      [0.78, 2.05, 0],
      [0, 3.3, 0]
    ];
    for (const [bx, by, bz] of pts) {
      const m = new THREE.Mesh(baleGeo, this.hayMat);
      m.position.set(bx, by, bz);
      m.castShadow = true;
      g.add(m);
    }
    return g;
  }

  private makeGardenWallMesh(w = 4.6, h = 1.45, brick = false): THREE.Group {
    const g = new THREE.Group();
    const mat = brick ? this.brickMat : this.stoneMat;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.48), mat);
    body.position.y = h * 0.5;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 0.14, 0.58), this.stoneMat);
    cap.position.y = h + 0.05;
    g.add(cap);
    return g;
  }

  private makeShedMesh(): THREE.Group {
    const g = new THREE.Group();
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(4.36, 0.42, 3.56), this.stoneMat);
    plinth.position.y = 0.21;
    g.add(plinth);
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.75, 3.4), this.woodMat);
    body.position.y = 1.48;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    // Corner framing posts & eaves beam
    for (const sx of [-2.06, 2.06]) {
      for (const sz of [-1.66, 1.66]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.85, 0.16), this.darkWoodMat);
        post.position.set(sx, 1.48, sz);
        g.add(post);
      }
    }
    // Framed timber barn door with cross brace
    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.58, 2.22, 0.1), this.darkWoodMat);
    doorFrame.position.set(0, 1.15, 1.71);
    g.add(doorFrame);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.38, 2.08, 0.14), this.woodMat);
    door.position.set(0, 1.12, 1.73);
    g.add(door);
    const brace = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.12, 0.16), this.darkWoodMat);
    brace.position.set(0, 1.12, 1.74);
    brace.rotation.z = 0.65;
    g.add(brace);
    // Overhanging corrugated pitched roof + timber fascia
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.2, 4.3), this.metalMat);
    roof.position.y = 2.98;
    roof.rotation.x = 0.16;
    roof.castShadow = true;
    g.add(roof);
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(5.06, 0.18, 0.14), this.darkWoodMat);
    fascia.position.set(0, 2.66, 2.1);
    g.add(fascia);
    return g;
  }

  private makeSignMesh(): THREE.Group {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 2.6, 6), this.metalMat);
    pole.position.y = 1.3;
    pole.castShadow = true;
    g.add(pole);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.52, 0.08), this.signYellowMat);
    board.position.y = 2.38;
    board.castShadow = true;
    g.add(board);
    return g;
  }

  /**
   * Breakable roadside props scattered across Wimpasing, Ammerland, Ried, Münsing, and Weipertshausen!
   */
  private buildWorldBreakables(): void {
    // Roadside fences & wooden pasture gates near farms & open meadows
    const fenceSpots: [number, number, number][] = [
      [FARM_YARD_CENTER.x - 24, FARM_YARD_CENTER.z + 24, 0.05],
      [FARM_YARD_CENTER.x - 16, FARM_YARD_CENTER.z + 28, 0.05],
      [FARM_YARD_CENTER.x - 6, FARM_YARD_CENTER.z + 28, -0.05],
      [456, 977, 0.45],
      [466, 973, 0.45],
      [REAL_SPOTS.ried.x + 18, REAL_SPOTS.ried.z + 24, 0.4],
      [482, -1165, 0.12],
      [-965, 790, Math.PI / 2]
    ];
    for (const [x, z, rot] of fenceSpots) {
      this.addBreakable(
        'fence',
        'Wooden Pasture Fence',
        x,
        z,
        rot,
        2.5,
        1.5,
        this.makeFenceMesh(5.4),
        false,
        [0x7b5634, 0x52361d, 0x997046],
        [1.1, 0.18, 0.16],
        5,
        'wood'
      );
    }

    // Wooden farm gates
    const gateSpots: [number, number, number][] = [
      [FARM_YARD_CENTER.x - 32, FARM_YARD_CENTER.z + 8, Math.PI / 2],
      [REAL_SPOTS.ried.x + 28, REAL_SPOTS.ried.z + 12, 0.3],
      [476, -1185, 0.1]
    ];
    for (const [x, z, rot] of gateSpots) {
      this.addBreakable(
        'gate',
        'Wooden Pasture Gate',
        x,
        z,
        rot,
        2.4,
        1.8,
        this.makeGateMesh(),
        false,
        [0x7b5634, 0x52361d],
        [1.2, 0.2, 0.18],
        5,
        'wood'
      );
    }

    // Stacked hay bale pyramids & cordwood piles
    const baleSpots: [number, number, number][] = [
      [FARM_YARD_CENTER.x - 30, FARM_YARD_CENTER.z + 22, 0.4],
      [430, 945, -0.5],
      [REAL_SPOTS.ried.x - 20, REAL_SPOTS.ried.z + 22, 0.8]
    ];
    for (const [x, z, rot] of baleSpots) {
      this.addBreakable(
        'bale_stack',
        'Hay Bale Stack',
        x,
        z,
        rot,
        2.2,
        3.4,
        this.makeBaleStackMesh(),
        false,
        [0xd8b44e, 0xc79e38, 0xe4c66a],
        [0.95, 0.78, 0.85],
        6,
        'hay'
      );
    }

    const woodSpots: [number, number, number][] = [
      [FARM_YARD_CENTER.x - 30, FARM_YARD_CENTER.z - 12, 0.2],
      [1318, 996, -0.3],
      [-946, 755, 1.1]
    ];
    for (const [x, z, rot] of woodSpots) {
      this.addBreakable(
        'woodpile',
        'Cordwood Stack',
        x,
        z,
        rot,
        1.9,
        1.5,
        this.makeWoodpileMesh(),
        false,
        [0x6e4726, 0x4f3018, 0x8f6239],
        [0.36, 0.36, 1.65],
        6,
        'wood'
      );
    }

    // Low village garden stone walls & roadside timber sheds & yellow signs
    const wallSpots: [number, number, number][] = [
      [1378, 1020, 0.18],
      [-958, 725, Math.PI / 2],
      [480, -1212, 0.2]
    ];
    for (const [x, z, rot] of wallSpots) {
      this.addBreakable(
        'garden_wall',
        'Stone Garden Wall',
        x,
        z,
        rot,
        2.2,
        1.6,
        this.makeGardenWallMesh(4.6, 1.4, false),
        false,
        [0x8e8b82, 0x747068, 0xa39f95],
        [0.72, 0.56, 0.48],
        6,
        'metal'
      );
    }

    const shedSpots: [number, number, number][] = [
      [FARM_YARD_CENTER.x - 36, FARM_YARD_CENTER.z + 16, 0.25],
      [REAL_SPOTS.ried.x + 36, REAL_SPOTS.ried.z - 16, -0.4]
    ];
    for (const [x, z, rot] of shedSpots) {
      this.addBreakable(
        'shed',
        'Timber Field Shed',
        x,
        z,
        rot,
        2.6,
        3.0,
        this.makeShedMesh(),
        false,
        [0x7b5634, 0x52361d, 0x677276],
        [1.15, 0.65, 0.35],
        6,
        'wood'
      );
    }

    const signSpots: [number, number, number][] = [
      [FARM_YARD_CENTER.x - 34, FARM_YARD_CENTER.z - 4, 0.1],
      [472, 954, -0.8],
      [1395, 1018, 0.4],
      [-972, 742, Math.PI / 2],
      [502, -1180, 0.15]
    ];
    for (const [x, z, rot] of signSpots) {
      this.addBreakable(
        'sign',
        'Road Direction Sign',
        x,
        z,
        rot,
        0.95,
        2.7,
        this.makeSignMesh(),
        false,
        [0xf0c21a, 0x677276, 0x22262a],
        [0.65, 0.35, 0.14],
        3,
        'metal'
      );
    }
  }

  /**
   * Builds ONE self-contained Free-Play Demolition Site ("Old Gravel Pit Farmstead") at (165, 620)
   * where brick walls, timber shed panels, pitched roof slabs, gates, fences, bale towers & woodpiles
   * collapse piece by piece under the 7,640 kg Scorpion at 60 fps!
   */
  private buildDemolitionSite(): void {
    const cx = DEMO_SITE_CENTER.x;
    const cz = DEMO_SITE_CENTER.z;

    // 0. Crisp high-resolution tiled gravel pad conformed smoothly to terrain (zero blurry grey disc!)
    const padTex = createCrispGravelPadTexture(9, 8);
    const padGeo = new THREE.PlaneGeometry(44, 42, 20, 20);
    padGeo.rotateX(-Math.PI / 2);
    const ppos = padGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < ppos.count; i++) {
      const wx = ppos.getX(i) + cx;
      const wz = ppos.getZ(i) + cz;
      ppos.setY(i, getTerrainHeight(wx, wz) + 0.12);
    }
    padGeo.computeVertexNormals();
    const padMat = new THREE.MeshStandardMaterial({
      map: padTex,
      roughness: 0.94,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    padMat.onBeforeCompile = (shader) => {
      shader.vertexShader =
        'varying vec2 vPadLocal;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvPadLocal = transformed.xz;'
        );
      shader.fragmentShader =
        'varying vec2 vPadLocal;\n' +
        shader.fragmentShader.replace(
          '#include <dithering_fragment>',
          `vec2 q = abs(vPadLocal) - vec2(17.5, 16.5);
          float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
          gl_FragColor.a *= 1.0 - smoothstep(0.8, 3.6, d);
          #include <dithering_fragment>`
        );
    };
    padMat.customProgramCacheKey = () => 'bavaria-demo-pad-v1';
    const padMesh = new THREE.Mesh(padGeo, padMat);
    padMesh.position.set(cx, 0, cz);
    padMesh.receiveShadow = true;
    this.scene.add(padMesh);

    // 1. OLD BAVARIAN BRICK-AND-TIMBER FARMHOUSE SHELL (6 breakable brick wall panels + 4 collapsing roof slabs!)
    const bx = cx - 4;
    const bz = cz - 6;

    const makeBrickPanel = (w: number, h: number, withDoor = false): THREE.Group => {
      const g = new THREE.Group();
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 0.55, 0.64), this.stoneMat);
      plinth.position.y = 0.27;
      g.add(plinth);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.54), this.brickMat);
      wall.position.y = h * 0.5;
      wall.castShadow = true;
      wall.receiveShadow = true;
      g.add(wall);
      // Horizontal eaves plate & vertical corner timber posts
      const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, 0.26, 0.68), this.darkWoodMat);
      beam.position.y = h - 0.12;
      g.add(beam);
      for (const px of [-w * 0.48, w * 0.48]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, h, 0.62), this.darkWoodMat);
        post.position.set(px, h * 0.5, 0);
        g.add(post);
      }
      if (withDoor) {
        const door = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.55, 0.62), this.woodMat);
        door.position.set(0, 1.32, 0);
        g.add(door);
        const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.22, 0.68), this.darkWoodMat);
        lintel.position.set(0, 2.66, 0);
        g.add(lintel);
      }
      return g;
    };

    const makeRoofSlab = (w: number, d: number, tiltX: number): THREE.Group => {
      const g = new THREE.Group();
      const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.24, d), this.roofTileMat);
      slab.rotation.x = tiltX;
      slab.castShadow = true;
      g.add(slab);
      const rafter = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.2, 0.22), this.darkWoodMat);
      rafter.position.y = -0.16;
      g.add(rafter);
      return g;
    };

    // 4 pitched roof slabs sitting at y + 4.0m (linked to walls below so knocking walls drops the roof!)
    const roofSlabs: BreakableItem[] = [
      this.addBreakable(
        'roof_slab',
        'Terracotta Roof Section',
        bx - 2.6,
        bz - 1.8,
        0,
        2.8,
        1.2,
        makeRoofSlab(5.4, 4.0, -0.34),
        true,
        [0xa6412a, 0x7d3221, 0x52361d],
        [1.15, 0.28, 0.95],
        5,
        'wood',
        4.15
      ),
      this.addBreakable(
        'roof_slab',
        'Terracotta Roof Section',
        bx + 2.6,
        bz - 1.8,
        0,
        2.8,
        1.2,
        makeRoofSlab(5.4, 4.0, -0.34),
        true,
        [0xa6412a, 0x7d3221, 0x52361d],
        [1.15, 0.28, 0.95],
        5,
        'wood',
        4.15
      ),
      this.addBreakable(
        'roof_slab',
        'Terracotta Roof Section',
        bx - 2.6,
        bz + 1.8,
        0,
        2.8,
        1.2,
        makeRoofSlab(5.4, 4.0, 0.34),
        true,
        [0xa6412a, 0x7d3221, 0x52361d],
        [1.15, 0.28, 0.95],
        5,
        'wood',
        4.15
      ),
      this.addBreakable(
        'roof_slab',
        'Terracotta Roof Section',
        bx + 2.6,
        bz + 1.8,
        0,
        2.8,
        1.2,
        makeRoofSlab(5.4, 4.0, 0.34),
        true,
        [0xa6412a, 0x7d3221, 0x52361d],
        [1.15, 0.28, 0.95],
        5,
        'wood',
        4.15
      )
    ];

    // 6 brick outer walls of the old farmstead barn (knocking any wall brings down its supported roof slab!)
    const wallConfigs: [number, number, number, number, number[]][] = [
      [bx - 2.6, bz + 3.4, 0, 5.0, [roofSlabs[2].id]],
      [bx + 2.6, bz + 3.4, 0, 5.0, [roofSlabs[3].id]],
      [bx - 2.6, bz - 3.4, 0, 5.0, [roofSlabs[0].id]],
      [bx + 2.6, bz - 3.4, 0, 5.0, [roofSlabs[1].id]],
      [bx - 5.1, bz, Math.PI / 2, 6.6, [roofSlabs[0].id, roofSlabs[2].id]],
      [bx + 5.1, bz, Math.PI / 2, 6.6, [roofSlabs[1].id, roofSlabs[3].id]]
    ];
    wallConfigs.forEach(([wx, wz, wrot, ww, collapseIds], wi) => {
      const wItem = this.addBreakable(
        'brick_wall',
        'Old Brick Barn Wall',
        wx,
        wz,
        wrot,
        2.6,
        3.6,
        makeBrickPanel(ww, 3.5, wi === 1),
        true,
        [0x9c4b36, 0x7e3a29, 0x8e8b82, 0x52361d],
        [0.85, 0.62, 0.52],
        6,
        'metal'
      );
      wItem.collapseIds = collapseIds;
    });

    // 2. Two Breakable Timber Sheds beside the barn
    this.addBreakable(
      'shed',
      'Old Timber Tool Shed',
      cx + 12,
      cz - 5,
      -0.25,
      2.6,
      3.0,
      this.makeShedMesh(),
      true,
      [0x7b5634, 0x52361d, 0x677276],
      [1.1, 0.65, 0.32],
      6,
      'wood'
    );
    this.addBreakable(
      'shed',
      'Old Machinery Lean-To',
      cx + 13,
      cz + 6,
      0.4,
      2.6,
      3.0,
      this.makeShedMesh(),
      true,
      [0x7b5634, 0x52361d, 0x677276],
      [1.1, 0.65, 0.32],
      6,
      'wood'
    );

    // 3. Freestanding Stone & Brick Practice Walls, Hay Bale Tower & Cordwood Stacks
    this.addBreakable(
      'garden_wall',
      'Cracked Brick Wall',
      cx - 14,
      cz + 4,
      0.3,
      2.3,
      1.7,
      this.makeGardenWallMesh(5.2, 1.65, true),
      true,
      [0x9c4b36, 0x823e2c, 0x8e8b82],
      [0.75, 0.58, 0.48],
      6,
      'metal'
    );
    this.addBreakable(
      'bale_stack',
      'Demolition Hay Pyramid',
      cx - 13,
      cz - 8,
      0.15,
      2.2,
      3.4,
      this.makeBaleStackMesh(),
      true,
      [0xd8b44e, 0xc79e38, 0xe4c66a],
      [0.95, 0.78, 0.85],
      6,
      'hay'
    );
    this.addBreakable(
      'woodpile',
      'Old Timber Pile',
      cx + 4,
      cz + 11,
      -0.2,
      1.9,
      1.5,
      this.makeWoodpileMesh(),
      true,
      [0x6e4726, 0x4f3018, 0x8f6239],
      [0.36, 0.36, 1.65],
      6,
      'wood'
    );

    // 4. Front Timber Entry Gate + Perimeter Fences (smash straight through on entry!)
    this.addBreakable(
      'gate',
      'Old Farmstead Entry Gate',
      cx,
      cz + 17,
      0,
      2.5,
      1.8,
      this.makeGateMesh(),
      true,
      [0x7b5634, 0x52361d],
      [1.2, 0.22, 0.16],
      5,
      'wood'
    );
    for (const fx of [-8.5, 8.5]) {
      this.addBreakable(
        'fence',
        'Timber Perimeter Fence',
        cx + fx,
        cz + 17,
        0,
        2.5,
        1.5,
        this.makeFenceMesh(5.6),
        true,
        [0x7b5634, 0x52361d],
        [1.1, 0.18, 0.16],
        5,
        'wood'
      );
    }
  }

  private shatterItem(
    item: BreakableItem,
    impactPos: THREE.Vector3,
    impactSpeed: number,
    isDirectChassisHit = false
  ): void {
    if (item.broken) return;
    item.broken = true;
    item.mesh.visible = false;

    const dir = item.pos.clone().sub(impactPos);
    dir.y = 0;
    if (dir.lengthSq() < 0.01) dir.set(0, 0, -1);
    dir.normalize();

    const [cw, ch, cd] = item.chunkSize;
    const count = item.chunkCount;

    for (let i = 0; i < count; i++) {
      // Respect strict active debris cap so frame rate stays locked at 60 fps!
      if (this.debris.length >= this.maxDebris) {
        const oldest = this.debris.shift()!;
        this.scene.remove(oldest.mesh);
        this.world.removeBody(oldest.body);
      }

      const colorHex = item.chunkColors[i % item.chunkColors.length];
      const scaleVar = 0.78 + (i % 3) * 0.2;
      const sx = cw * scaleVar;
      const sy = ch * scaleVar;
      const sz = cd * scaleVar;

      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(sx, sy, sz),
        new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.9 })
      );
      mesh.castShadow = true;

      const spreadA = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const ox = item.pos.x + Math.cos(spreadA) * Math.min(1.4, item.radius * 0.55);
      const oy = item.pos.y + Math.min(item.height * 0.75, 0.55 + (i % 3) * 0.65);
      const oz = item.pos.z + Math.sin(spreadA) * Math.min(1.4, item.radius * 0.55);

      const body = new CANNON.Body({
        mass: item.soundMat === 'hay' ? 65 : item.soundMat === 'wood' ? 95 : 150,
        material: this.propMat,
        linearDamping: 0.18,
        angularDamping: 0.24
      });
      body.addShape(new CANNON.Box(new CANNON.Vec3(sx * 0.5, sy * 0.5, sz * 0.5)));
      body.position.set(ox, oy, oz);

      const push = Math.max(4.0, Math.min(15.0, impactSpeed * 0.95));
      body.velocity.set(
        dir.x * push + (Math.random() - 0.5) * 4.5,
        2.2 + Math.random() * 3.8,
        dir.z * push + (Math.random() - 0.5) * 4.5
      );
      body.angularVelocity.set(
        (Math.random() - 0.5) * 7,
        (Math.random() - 0.5) * 7,
        (Math.random() - 0.5) * 7
      );

      mesh.position.set(ox, oy, oz);
      this.scene.add(mesh);
      this.world.addBody(body);
      this.debris.push({ mesh, body, life: 0, maxLife: 14.0 });
    }

    const isMasonry = item.kind === 'brick_wall' || item.kind === 'garden_wall';
    const isBuilding = isMasonry || item.kind === 'shed';
    const shake = isMasonry ? 0.62 : item.kind === 'shed' || item.kind === 'roof_slab' ? 0.45 : 0.22;
    const impact = isDirectChassisHit
      ? isMasonry
        ? { speedKeepFrac: 0.44, pitchKick: 0.92 }
        : item.kind === 'shed'
          ? { speedKeepFrac: 0.58, pitchKick: 0.62 }
          : item.kind === 'woodpile' || item.kind === 'bale_stack'
            ? { speedKeepFrac: 0.76, pitchKick: 0.34 }
            : { speedKeepFrac: 0.88, pitchKick: 0.16 }
      : undefined;

    this.callbacks.onBreak(
      item.label,
      item.pos.clone().add(new THREE.Vector3(0, Math.min(1.5, item.height * 0.5), 0)),
      item.soundMat,
      item.chunkColors,
      shake,
      impact
    );

    // Cascade roof-slab collapse when supporting brick barn wall breaks!
    if (item.collapseIds && item.collapseIds.length > 0) {
      for (const cid of item.collapseIds) {
        const linked = this.items.find((x) => x.id === cid);
        if (linked && !linked.broken) {
          this.shatterItem(linked, impactPos, Math.max(4.5, impactSpeed * 0.7), false);
        }
      }
    }
    void isBuilding;
  }

  public update(
    dt: number,
    tractorPos: THREE.Vector3,
    tractorSpeed: number,
    tipPos: THREE.Vector3,
    tipSpeed: number
  ): void {
    const absSpd = Math.abs(tractorSpeed);
    for (const item of this.items) {
      if (item.broken) continue;
      const dChassis = Math.hypot(item.pos.x - tractorPos.x, item.pos.z - tractorPos.z);
      const dTip = Math.hypot(item.pos.x - tipPos.x, item.pos.z - tipPos.z);

      // Minimum momentum required to smash through heavy structures vs light fences!
      const minRamSpd =
        item.kind === 'brick_wall' || item.kind === 'garden_wall'
          ? 4.6 // ~16.5 km/h required to smash brick/stone walls; slower hits stop the machine!
          : item.kind === 'shed'
            ? 3.4 // ~12 km/h for timber sheds
            : 2.1;
      const hitRadius = item.radius + 1.55;

      if (dChassis < hitRadius && Math.abs(tractorPos.y - item.pos.y) < 3.6) {
        if (absSpd >= minRamSpd) {
          this.shatterItem(item, tractorPos, absSpd, true);
        } else if (item.kind !== 'roof_slab') {
          // Below break threshold: solid physical resistance pushes & stops the Scorpion cleanly!
          const dx = tractorPos.x - item.pos.x;
          const dz = tractorPos.z - item.pos.z;
          const len = Math.max(0.01, Math.hypot(dx, dz));
          const overlap = Math.min(0.45, hitRadius - dChassis);
          this.callbacks.onStructureBlock?.({ x: dx / len, z: dz / len, overlap }, 0.25);
        }
      } else if (
        dTip < item.radius + 1.35 &&
        tipPos.y >= item.pos.y - 0.5 &&
        tipPos.y <= item.pos.y + item.height + 0.8 &&
        tipSpeed > (item.kind === 'brick_wall' ? 3.4 : 2.4)
      ) {
        this.shatterItem(item, tipPos, tipSpeed, false);
      }
    }

    // Step active pre-split debris chunks & cleanly despawn after settling!
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life += dt;
      if (d.life >= d.maxLife) {
        this.scene.remove(d.mesh);
        this.world.removeBody(d.body);
        this.debris.splice(i, 1);
        continue;
      }
      // Keep debris above terrain
      const gy = getTerrainHeight(d.body.position.x, d.body.position.z);
      if (d.body.position.y < gy + 0.14) {
        d.body.position.y = gy + 0.14;
        if (d.body.velocity.y < 0) d.body.velocity.y *= -0.15;
      }
      d.mesh.position.set(d.body.position.x, d.body.position.y, d.body.position.z);
      d.mesh.quaternion.set(
        d.body.quaternion.x,
        d.body.quaternion.y,
        d.body.quaternion.z,
        d.body.quaternion.w
      );
      // Smooth shrink out in final 1.2 s before despawn
      if (d.life > d.maxLife - 1.2) {
        const s = Math.max(0.01, (d.maxLife - d.life) / 1.2);
        d.mesh.scale.setScalar(s);
      }
    }
  }
}
