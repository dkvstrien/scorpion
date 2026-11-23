import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { buildConformingStrip, getTerrainHeight, WATER_LEVEL } from './terrain';
import { createAsphaltTexture, createCobbleTexture } from './textures';

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
  cruiseDir?: number;
  cruiseMinX?: number;
  cruiseMaxX?: number;
  cruiseZ?: number;
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
  ctx.fillStyle = '#1d2530';
  ctx.beginPath();
  ctx.arc(64, 64, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e5c158';
  ctx.lineWidth = 7;
  ctx.stroke();

  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.strokeStyle = '#f2d36b';
    ctx.lineWidth = i % 3 === 0 ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(64 + Math.cos(a) * 42, 64 + Math.sin(a) * 42);
    ctx.lineTo(64 + Math.cos(a) * 53, 64 + Math.sin(a) * 53);
    ctx.stroke();
  }
  ctx.strokeStyle = '#f7df7c';
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

export function createMaibaumTexture(): THREE.CanvasTexture {
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

export class VillageWorld {
  public objects: DynamicVillageObj[] = [];
  public destructibles: DestructibleStatic[] = [];
  public warmWindowMat: THREE.MeshStandardMaterial;
  public lampBulbMat: THREE.MeshStandardMaterial;
  public lampPointLights: THREE.PointLight[] = [];
  public churchPos = new THREE.Vector3(-21, 3.4, -67.5);
  public maibaumSocketPos = new THREE.Vector3(-7.8, 0, -51.5);

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

    this.buildMuensingStreets(scene);
    this.buildStarnbergerSeePierAndBoats(scene, world, groundMat);
    this.buildChurchStMariaeHimmelfahrt(scene, world, groundMat);
    this.buildGasthofAlterWirt(scene, world, groundMat);
    this.buildRathausGemeindeMuensing(scene, world, groundMat);
    this.buildBakeryAndEdeka(scene, world, groundMat);
    this.buildBavarianHouses(scene, world, groundMat);
    this.buildDorfplatzMaibaum();
    this.buildVillageProps();
    this.buildCars();
    this.buildDestructibleTreesAndLamps();
    this.buildPedestrians();
  }

  public setNightMode(nightAmount: number): void {
    // Smoothly glow Bavarian cottage windows & streetlamps at sunset / blue-hour dusk!
    this.warmWindowMat.emissiveIntensity = 0.22 + nightAmount * 1.45;
    this.lampBulbMat.emissiveIntensity = 0.35 + nightAmount * 2.0;
    for (const pl of this.lampPointLights) {
      pl.intensity = nightAmount * 14;
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
    d: number
  ): void {
    const body = new CANNON.Body({ mass: 0, material: mat });
    body.addShape(new CANNON.Box(new CANNON.Vec3(w * 0.5, h * 0.5, d * 0.5)));
    body.position.set(x, y, z);
    world.addBody(body);
  }

  private addStreetSign(scene: THREE.Scene, name: string, x: number, z: number, rotY = 0): void {
    const gy = getTerrainHeight(x, z);
    const g = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.055, 2.9, 8),
      new THREE.MeshStandardMaterial({ color: 0x62686e, roughness: 0.5, metalness: 0.5 })
    );
    pole.position.y = 1.45;
    g.add(pole);

    const tex = makeSignTexture(256, 56, '#f6f7f8', '#1f2833', name, null, '#131920');
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.4, 0.06),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 })
    );
    board.position.y = 2.75;
    g.add(board);

    g.position.set(x, gy, z);
    g.rotation.y = rotY;
    scene.add(g);
  }

  private buildMuensingStreets(scene: THREE.Scene): void {
    const asphaltTex = createAsphaltTexture();
    const cobbleTex = createCobbleTexture();

    const asphaltMat = new THREE.MeshStandardMaterial({
      map: asphaltTex,
      roughness: 0.88,
      metalness: 0.05
    });
    const cobbleMat = new THREE.MeshStandardMaterial({
      map: cobbleTex,
      roughness: 0.9,
      metalness: 0.04
    });
    const dashMat = new THREE.MeshStandardMaterial({ color: 0xebe9e0, roughness: 0.8 });

    // 1. Hauptstraße + Ammerlander Straße heading west down to Starnberger See shore (x = -102..+84)!
    scene.add(buildConformingStrip(186, 10.2, -9, -40, false, 0.045, asphaltMat, 48));

    // Connecting farm drive from the open north gate (x = -1.5, z = -30.5..-36)
    scene.add(buildConformingStrip(11.6, 8.2, -1.5, -33.2, true, 0.04, asphaltMat, 8));

    // 2. Weipertshausener Straße (North-South civic street x = +2, z = -40..-104)
    scene.add(buildConformingStrip(9.4, 66, 2, -73, true, 0.048, asphaltMat, 24));

    // 3. Am Kirchberg West Leg (x = -38, z = -40..-86) climbing along the hillside!
    scene.add(buildConformingStrip(8.2, 48, -38, -64, true, 0.048, asphaltMat, 22));

    // 4. Am Kirchberg North Loop (z = -84, x = -38..+42)
    scene.add(buildConformingStrip(88, 8.4, 2, -84, false, 0.052, asphaltMat, 28));

    // 5. Bachstraße (x = +38, z = -40..-84)
    scene.add(buildConformingStrip(8.4, 48, 38, -64, true, 0.048, asphaltMat, 20));

    // Cobblestone sidewalks & Dorfplatz!
    scene.add(buildConformingStrip(160, 2.8, -4, -46.5, false, 0.038, cobbleMat, 40));
    scene.add(buildConformingStrip(14, 14, -8.5, -52.5, false, 0.042, cobbleMat, 8));

    // EDEKA Parking Lot
    scene.add(buildConformingStrip(10, 21, 46.5, -56, true, 0.04, asphaltMat, 8));

    // Road center dashes along Hauptstraße & Ammerlander Straße (conforming to slope!)
    for (let x = -96; x <= 78; x += 6) {
      if (Math.abs(x - 2) < 5 || Math.abs(x + 38) < 5 || Math.abs(x - 38) < 5) continue;
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.2), dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, getTerrainHeight(x, -40) + 0.06, -40);
      scene.add(dash);
    }

    // German Zebra Crossing at Dorfplatz center
    for (let sx = -3.4; sx <= 1.0; sx += 0.85) {
      const x = sx - 6;
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 3.2), dashMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(x, getTerrainHeight(x, -40) + 0.062, -40);
      scene.add(stripe);
    }

    // Authentic Münsing Street Name Signs (cleanly placed on corners clear of stalls!)
    this.addStreetSign(scene, 'Hauptstraße', -3.2, -45.6, 0);
    this.addStreetSign(scene, 'Weipertshausener Str.', 7.6, -46.2, Math.PI / 2);
    this.addStreetSign(scene, 'Am Kirchberg', -32.8, -46.2, Math.PI / 2);
    this.addStreetSign(scene, 'Bachstraße', 43.2, -46.2, Math.PI / 2);
    this.addStreetSign(scene, '← Starnberger See', -64.0, -46.0, 0);
  }

  private buildStarnbergerSeePierAndBoats(
    scene: THREE.Scene,
    world: CANNON.World,
    groundMat: CANNON.Material
  ): void {
    // Charming wooden lakeside pier (Ammerland Steg) jutting out onto Starnberger See!
    const timber = new THREE.MeshStandardMaterial({ color: 0x7a5735, roughness: 0.9 });
    const deckY = WATER_LEVEL + 0.58;

    // Sloped ramp connecting Ammerlander Straße down onto the pier deck
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.24, 5.2), timber);
    ramp.position.set(-99.5, deckY + 0.05, -40);
    ramp.rotation.z = -0.05;
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    scene.add(ramp);

    // Main wooden pier deck extending out into Starnberger See (-103..-123)
    const pierDeck = new THREE.Mesh(new THREE.BoxGeometry(20, 0.24, 5.2), timber);
    pierDeck.position.set(-113, deckY, -40);
    pierDeck.castShadow = true;
    pierDeck.receiveShadow = true;
    scene.add(pierDeck);
    this.addStaticBox(world, groundMat, -113, deckY - 0.05, -40, 20, 0.34, 5.2);

    // Timber pilings, low rope-style guard posts & warm pier lantern at the end of the Steg!
    for (let px = -104; px >= -122; px -= 4.5) {
      for (const pz of [-42.3, -37.7]) {
        const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 3.8, 8), timber);
        pile.position.set(px, deckY - 1.0, pz);
        pile.castShadow = true;
        scene.add(pile);
      }
    }
    const pierLantern = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.32), this.lampBulbMat);
    pierLantern.position.set(-122, deckY + 1.25, -42.3);
    scene.add(pierLantern);
    const pierLight = new THREE.PointLight(0xffcb78, 0, 16, 1.8);
    pierLight.position.set(-122, deckY + 1.25, -42.3);
    scene.add(pierLight);
    this.lampPointLights.push(pierLight);

    // Welcome sign at the lakeside shore (wide crisp canvas!)
    const signPost = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.4, 8), timber);
    signPost.position.set(-98, getTerrainHeight(-98, -44.2) + 1.2, -44.2);
    scene.add(signPost);
    const tex = makeSignTexture(
      384,
      112,
      '#1d5478',
      '#ffffff',
      'STARNBERGER SEE',
      'AMMERLAND · 584m ü. NN',
      '#ffffff',
      '#b8e6ff'
    );
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.85, 0.08),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 })
    );
    board.position.set(-98, getTerrainHeight(-98, -44.2) + 2.2, -44.2);
    board.rotation.y = Math.PI / 2;
    scene.add(board);

    // Gently bobbing Bavarian sailboats on Lake Starnberg!
    const hullMat = new THREE.MeshStandardMaterial({ color: 0xf4f2eb, roughness: 0.35, metalness: 0.1 });
    const sailMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, side: THREE.DoubleSide });
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0x1b6db8, roughness: 0.4 });
    const boatCoords: [number, number, number][] = [
      [-132, -25, 0.4],
      [-148, -58, -0.7],
      [-126, -72, 1.1],
      [-165, -10, 0.2],
      [-142, 12, -0.5]
    ];
    boatCoords.forEach(([bx, bz, rot], idx) => {
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.75, 4.6), hullMat);
      hull.position.y = 0.2;
      hull.castShadow = true;
      boat.add(hull);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.16, 4.64), stripeMat);
      stripe.position.y = 0.38;
      boat.add(stripe);

      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.06, 6.2, 8),
        new THREE.MeshStandardMaterial({ color: 0x7c5734 })
      );
      mast.position.set(0, 3.3, 0);
      boat.add(mast);

      const sailGeo = new THREE.BufferGeometry();
      sailGeo.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array([0, 0.8, 0, 0, 6.0, 0, 0, 1.1, 2.5]), 3)
      );
      sailGeo.computeVertexNormals();
      const sail = new THREE.Mesh(sailGeo, sailMat);
      sail.castShadow = true;
      boat.add(sail);

      boat.position.set(bx, WATER_LEVEL + 0.05, bz);
      boat.rotation.y = rot;
      scene.add(boat);
      this.sailboats.push({
        group: boat,
        basePos: new THREE.Vector3(bx, WATER_LEVEL + 0.05, bz),
        phase: idx * 1.4,
        driftAmp: 1.5 + idx * 0.4
      });
    });

    // Shoreline boulders & lakeside reeds
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x7a7770, roughness: 0.92 });
    const reedMat = new THREE.MeshStandardMaterial({ color: 0x5c7538, roughness: 0.9 });
    for (let z = -95; z <= 18; z += 9) {
      if (Math.abs(z - -40) < 7) continue;
      const rx = -101 + Math.sin(z * 0.2) * 2.2;
      const ry = getTerrainHeight(rx, z);
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.65 + (Math.abs(z) % 3) * 0.25, 0), rockMat);
      rock.scale.y = 0.55;
      rock.position.set(rx, ry + 0.15, z);
      scene.add(rock);

      const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.14, 1.4, 6), reedMat);
      reed.position.set(rx - 1.2, WATER_LEVEL + 0.45, z + 2);
      scene.add(reed);
    }
  }

  private buildChurchStMariaeHimmelfahrt(
    scene: THREE.Scene,
    world: CANNON.World,
    groundMat: CANNON.Material
  ): void {
    // Katholische Pfarrkirche St. Mariä Himmelfahrt perched proudly atop the +3.4m Am Kirchberg hill!
    const cx = -21;
    const cz = -67.5;
    const hillY = getTerrainHeight(cx, cz);
    this.churchPos.set(cx, hillY, cz);

    const stuccoWhite = new THREE.MeshStandardMaterial({ color: 0xf4f0e6, roughness: 0.84 });
    const trimCream = new THREE.MeshStandardMaterial({ color: 0xe3dccb, roughness: 0.88 });
    const tileRed = new THREE.MeshStandardMaterial({ color: 0xa6422c, roughness: 0.78 });
    const copperGreen = new THREE.MeshStandardMaterial({ color: 0x4b8a6b, roughness: 0.36, metalness: 0.48 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xe8bd42, roughness: 0.22, metalness: 0.88 });
    const glassStained = new THREE.MeshStandardMaterial({
      color: 0x4579a6,
      emissive: 0x4f3d1e,
      emissiveIntensity: 0.35,
      roughness: 0.25
    });
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x4f3520, roughness: 0.88 });

    // Stone retaining terrace embedded into the Kirchberg hill crest so the church sits 100% flush!
    const terrace = new THREE.Mesh(
      new THREE.BoxGeometry(24, 2.2, 21),
      new THREE.MeshStandardMaterial({ color: 0x918c82, roughness: 0.94 })
    );
    terrace.position.set(cx, hillY - 1.0, cz);
    terrace.receiveShadow = true;
    scene.add(terrace);

    const lawn = new THREE.Mesh(
      new THREE.BoxGeometry(23.6, 0.16, 20.6),
      new THREE.MeshStandardMaterial({ color: 0x5f8944, roughness: 0.95 })
    );
    lawn.position.set(cx, hillY + 0.12, cz);
    lawn.receiveShadow = true;
    scene.add(lawn);

    // Churchyard perimeter walls
    const wallH = 1.1;
    const backW = new THREE.Mesh(new THREE.BoxGeometry(24, wallH, 0.45), trimCream);
    backW.position.set(cx, hillY + wallH * 0.5, cz - 10.5);
    backW.castShadow = true;
    scene.add(backW);
    this.addStaticBox(world, groundMat, cx, hillY + wallH * 0.5, cz - 10.5, 24, wallH, 0.55);

    const westW = new THREE.Mesh(new THREE.BoxGeometry(0.45, wallH, 21), trimCream);
    westW.position.set(cx - 12, hillY + wallH * 0.5, cz);
    westW.castShadow = true;
    scene.add(westW);
    this.addStaticBox(world, groundMat, cx - 12, hillY + wallH * 0.5, cz, 0.55, wallH, 21);

    // Main Baroque Church Nave
    const naveW = 16.5;
    const naveH = 8.4;
    const naveD = 9.4;
    const nave = new THREE.Mesh(new THREE.BoxGeometry(naveW, naveH, naveD), stuccoWhite);
    nave.position.set(cx - 1.2, hillY + naveH * 0.5 + 0.15, cz - 0.5);
    nave.castShadow = true;
    nave.receiveShadow = true;
    scene.add(nave);
    this.addStaticBox(world, groundMat, cx - 1.2, hillY + naveH * 0.5, cz - 0.5, naveW, naveH, naveD);

    const apse = new THREE.Mesh(new THREE.CylinderGeometry(4.3, 4.3, naveH - 0.6, 8), stuccoWhite);
    apse.position.set(cx + 7.2, hillY + (naveH - 0.6) * 0.5 + 0.15, cz - 0.5);
    apse.castShadow = true;
    scene.add(apse);

    const slopeLen = Math.hypot(naveD * 0.58, 4.2);
    const slopeAng = Math.atan2(4.2, naveD * 0.58);
    for (const s of [-1, 1]) {
      const slope = new THREE.Mesh(new THREE.BoxGeometry(naveW + 1.2, 0.26, slopeLen), tileRed);
      slope.position.set(cx - 1.2, hillY + naveH + 2.15, cz - 0.5 + s * (naveD * 0.28));
      slope.rotation.x = s * slopeAng;
      slope.castShadow = true;
      scene.add(slope);
    }
    const apseRoof = new THREE.Mesh(new THREE.ConeGeometry(4.8, 3.8, 8), tileRed);
    apseRoof.position.set(cx + 7.2, hillY + naveH + 1.4, cz - 0.5);
    apseRoof.castShadow = true;
    scene.add(apseRoof);

    for (let wx = -5.5; wx <= 4.5; wx += 3.3) {
      for (const sz of [-1, 1]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.9, 0.14), glassStained);
        win.position.set(cx - 1.2 + wx, hillY + 4.3, cz - 0.5 + sz * (naveD * 0.5 + 0.04));
        scene.add(win);
      }
    }

    const portal = new THREE.Mesh(new THREE.BoxGeometry(2.1, 3.2, 0.22), darkWood);
    portal.position.set(cx - 5.2, hillY + 1.75, cz + naveD * 0.5 - 0.45);
    scene.add(portal);

    // Towering Southern Bell Tower with Copper Onion Dome (Zwiebelhaube!)
    const tx = cx + 4.8;
    const tz = cz + 5.2;

    const towerBase = new THREE.Mesh(new THREE.BoxGeometry(4.4, 15.2, 4.4), stuccoWhite);
    towerBase.position.set(tx, hillY + 7.6 + 0.15, tz);
    towerBase.castShadow = true;
    towerBase.receiveShadow = true;
    scene.add(towerBase);
    this.addStaticBox(world, groundMat, tx, hillY + 7.6, tz, 4.5, 15.2, 4.5);

    const cornice = new THREE.Mesh(new THREE.BoxGeometry(4.85, 0.35, 4.85), trimCream);
    cornice.position.set(tx, hillY + 15.2, tz);
    scene.add(cornice);

    const belfry = new THREE.Mesh(new THREE.CylinderGeometry(2.25, 2.35, 4.2, 8), stuccoWhite);
    belfry.position.set(tx, hillY + 17.4, tz);
    belfry.castShadow = true;
    scene.add(belfry);

    const clockTex = createClockTexture();
    const clockMat = new THREE.MeshStandardMaterial({ map: clockTex, roughness: 0.4 });
    const clockDirs: [number, number, number][] = [
      [0, 2.26, 0],
      [0, -2.26, Math.PI],
      [2.26, 0, Math.PI / 2],
      [-2.26, 0, -Math.PI / 2]
    ];
    for (const [ox, oz, ry] of clockDirs) {
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.92, 18), clockMat);
      face.position.set(tx + ox, hillY + 13.5, tz + oz);
      face.rotation.y = ry;
      scene.add(face);
    }

    const onionPts = [
      new THREE.Vector2(0.01, 6.2),
      new THREE.Vector2(0.28, 5.2),
      new THREE.Vector2(0.75, 4.3),
      new THREE.Vector2(0.55, 3.6),
      new THREE.Vector2(1.45, 2.8),
      new THREE.Vector2(2.65, 1.85),
      new THREE.Vector2(2.45, 0.8),
      new THREE.Vector2(2.25, 0.0)
    ];
    const onionDome = new THREE.Mesh(new THREE.LatheGeometry(onionPts, 18), copperGreen);
    onionDome.position.set(tx, hillY + 19.45, tz);
    onionDome.castShadow = true;
    scene.add(onionDome);

    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), goldMat);
    orb.position.set(tx, hillY + 25.8, tz);
    scene.add(orb);
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.35, 0.12), goldMat);
    crossV.position.set(tx, hillY + 26.65, tz);
    scene.add(crossV);
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.12, 0.12), goldMat);
    crossH.position.set(tx, hillY + 26.85, tz);
    scene.add(crossH);
  }

  private buildBavarianBuilding(
    scene: THREE.Scene,
    world: CANNON.World,
    groundMat: CANNON.Material,
    cx: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    wallColor: number,
    hasBalcony: boolean,
    rotY = 0
  ): THREE.Group {
    const gy = getTerrainHeight(cx, cz);
    const g = new THREE.Group();
    const plaster = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.86 });
    const plinthMat = new THREE.MeshStandardMaterial({ color: 0x7c7870, roughness: 0.94 });
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x5c3d22, roughness: 0.9 });
    const roofTile = new THREE.MeshStandardMaterial({ color: 0xa8452c, roughness: 0.78 });
    const shutterGreen = new THREE.MeshStandardMaterial({ color: 0x2d5e3b, roughness: 0.78 });
    const flowerRed = new THREE.MeshStandardMaterial({ color: 0xd62e24, roughness: 0.7 });

    // Stone foundation skirt extending 1.5m down so hillside houses NEVER float!
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 1.6, d + 0.2), plinthMat);
    plinth.position.y = -0.75;
    g.add(plinth);

    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), plaster);
    body.position.y = h * 0.5;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    const slopeLen = Math.hypot(d * 0.62, 2.35);
    const slopeAng = Math.atan2(2.35, d * 0.62);
    for (const s of [-1, 1]) {
      const slope = new THREE.Mesh(new THREE.BoxGeometry(w + 1.3, 0.22, slopeLen), roofTile);
      slope.position.set(0, h + 1.1, s * (d * 0.29));
      slope.rotation.x = s * slopeAng;
      slope.castShadow = true;
      g.add(slope);
    }

    if (hasBalcony) {
      const balcFloor = new THREE.Mesh(new THREE.BoxGeometry(w * 0.76, 0.14, 1.05), darkWood);
      balcFloor.position.set(0, h * 0.54, d * 0.5 + 0.45);
      g.add(balcFloor);
      const balcRail = new THREE.Mesh(new THREE.BoxGeometry(w * 0.76, 0.78, 0.1), darkWood);
      balcRail.position.set(0, h * 0.54 + 0.42, d * 0.5 + 0.94);
      g.add(balcRail);
      const flowers = new THREE.Mesh(new THREE.BoxGeometry(w * 0.68, 0.28, 0.28), flowerRed);
      flowers.position.set(0, h * 0.54 + 0.85, d * 0.5 + 1.02);
      g.add(flowers);
    }

    const door = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.2, 0.14), darkWood);
    door.position.set(0, 1.1, d * 0.5 + 0.04);
    g.add(door);

    for (const wx of [-w * 0.3, w * 0.3]) {
      for (const wy of [1.75, h * 0.72]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.1, 0.12), this.warmWindowMat);
        win.position.set(wx, wy, d * 0.5 + 0.04);
        g.add(win);
        for (const ss of [-0.74, 0.74]) {
          const shutter = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1.15, 0.08), shutterGreen);
          shutter.position.set(wx + ss, wy, d * 0.5 + 0.06);
          g.add(shutter);
        }
      }
    }

    g.position.set(cx, gy, cz);
    g.rotation.y = rotY;
    scene.add(g);

    const bw = Math.abs(Math.sin(rotY)) > 0.7 ? d : w;
    const bd = Math.abs(Math.sin(rotY)) > 0.7 ? w : d;
    this.addStaticBox(world, groundMat, cx, gy + h * 0.5, cz, bw, h, bd);
    return g;
  }

  private buildGasthofAlterWirt(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    const g = this.buildBavarianBuilding(scene, world, groundMat, 22, -55, 13.5, 6.4, 9.5, 0xf2ebd9, true, 0);

    const signTex = makeSignTexture(
      512,
      128,
      '#1e3b26',
      '#e5be49',
      'GASTHOF ALTER WIRT',
      'MÜNSING · SEIT 1609 · BIERGARTEN',
      '#faf4dc',
      '#a8db3e'
    );
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(6.8, 1.35, 0.14),
      new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.55 })
    );
    sign.position.set(0, 3.25, 4.86);
    g.add(sign);

    const gravel = buildConformingStrip(
      16,
      6.2,
      22,
      -48.2,
      false,
      0.032,
      new THREE.MeshStandardMaterial({ color: 0xc2b59c, roughness: 0.95 }),
      6
    );
    scene.add(gravel);
  }

  private buildRathausGemeindeMuensing(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    const g = this.buildBavarianBuilding(scene, world, groundMat, 21.5, -72.5, 12.0, 6.2, 8.8, 0xf5f2ea, true, -Math.PI / 2);

    const signTex = makeSignTexture(
      512,
      110,
      '#ffffff',
      '#1b7fd6',
      'RATHAUS MÜNSING',
      'WEIPERTSHAUSENER STR. 3',
      '#133559',
      '#1b7fd6'
    );
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(5.6, 1.1, 0.14),
      new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.5 })
    );
    sign.position.set(0, 3.3, 4.5);
    g.add(sign);

    const fy = getTerrainHeight(11.5, -70);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.07, 7.2, 8),
      new THREE.MeshStandardMaterial({ color: 0xd8dce0, roughness: 0.4, metalness: 0.6 })
    );
    pole.position.set(11.5, fy + 3.6, -70);
    scene.add(pole);
    const flagTop = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 0.04), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    flagTop.position.set(12.4, fy + 6.7, -70);
    scene.add(flagTop);
    const flagBot = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 0.04), new THREE.MeshStandardMaterial({ color: 0x1b7fd6 }));
    flagBot.position.set(12.4, fy + 6.15, -70);
    scene.add(flagBot);
  }

  private buildBakeryAndEdeka(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    const bak = this.buildBavarianBuilding(scene, world, groundMat, -52, -55, 11.0, 5.4, 8.6, 0xf2e4c4, true, 0);
    const bakTex = makeSignTexture(
      512,
      110,
      '#5c3317',
      '#f2be35',
      'BÄCKEREI KRÜMEL & KORN',
      'FRISCHE BREZEN · HAUPTSTR. 6',
      '#fff4d6',
      '#f5c842'
    );
    const bakSign = new THREE.Mesh(
      new THREE.BoxGeometry(5.6, 1.1, 0.14),
      new THREE.MeshStandardMaterial({ map: bakTex, roughness: 0.55 })
    );
    bakSign.position.set(0, 3.05, 4.4);
    bak.add(bakSign);

    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(7.2, 0.16, 1.8),
      new THREE.MeshStandardMaterial({ color: 0xc93a2b, roughness: 0.78 })
    );
    awning.position.set(0, 2.55, 5.1);
    awning.rotation.x = 0.25;
    bak.add(awning);

    const ex = 61;
    const ez = -56;
    const ey = getTerrainHeight(ex, ez);
    const edekaBody = new THREE.Mesh(
      new THREE.BoxGeometry(15, 5.2, 18),
      new THREE.MeshStandardMaterial({ color: 0xebe9e0, roughness: 0.85 })
    );
    edekaBody.position.set(ex, ey + 2.6, ez);
    edekaBody.castShadow = true;
    edekaBody.receiveShadow = true;
    scene.add(edekaBody);
    this.addStaticBox(world, groundMat, ex, ey + 2.6, ez, 15, 5.2, 18);

    const blueBand = new THREE.Mesh(
      new THREE.BoxGeometry(15.3, 1.15, 18.3),
      new THREE.MeshStandardMaterial({ color: 0x1359a8, roughness: 0.5 })
    );
    blueBand.position.set(ex, ey + 4.85, ez);
    scene.add(blueBand);

    const edekaTex = makeSignTexture(
      512,
      140,
      '#1359a8',
      '#f7cf1d',
      'EDEKA',
      'AKTIVMARKT MÜNSING · BACHSTR. 3',
      '#f7cf1d',
      '#ffffff'
    );
    const edekaSign = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 2.2, 8.2),
      new THREE.MeshStandardMaterial({ map: edekaTex, roughness: 0.45 })
    );
    edekaSign.position.set(ex - 7.62, ey + 4.5, ez);
    scene.add(edekaSign);
  }

  private buildBavarianHouses(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    const specs: [number, number, number, number, number, number, boolean, number][] = [
      [-30, -96, 11.5, 5.4, 8.2, 0xf3eee2, true, 0],
      [-14, -96, 12.0, 5.8, 8.5, 0xefe2c9, true, 0],
      [18, -96, 11.5, 5.4, 8.2, 0xf2efe8, true, 0],
      [36, -96, 11.0, 5.2, 8.2, 0xe9dfd0, false, 0],
      [-68, -55, 10.5, 5.2, 8.2, 0xf4efe4, true, 0],
      [-55, -72, 10.5, 5.4, 8.2, 0xeee4d2, true, Math.PI / 2],
      // Lakeside Bavarian Boathouse / Villa near Ammerland shore!
      [-86, -54, 10.0, 4.8, 7.6, 0xf2ede0, true, 0],
      [52, -26, 11.0, 5.2, 8.2, 0xf4f0e6, true, Math.PI],
      [68, -26, 10.5, 5.0, 8.0, 0xefe3ce, false, Math.PI]
    ];
    for (const [x, z, w, h, d, col, balc, rot] of specs) {
      this.buildBavarianBuilding(scene, world, groundMat, x, z, w, h, d, col, balc, rot);
    }
  }

  private buildDorfplatzMaibaum(): void {
    const mx = -7.8;
    const mz = -51.5;
    const my = getTerrainHeight(mx, mz);
    this.maibaumSocketPos.set(mx, my, mz);
    const g = new THREE.Group();

    const poleTex = createMaibaumTexture();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.25, 13.5, 14),
      new THREE.MeshStandardMaterial({ map: poleTex, roughness: 0.42 })
    );
    pole.position.y = 6.75;
    pole.castShadow = true;
    g.add(pole);

    const wreath = new THREE.Mesh(
      new THREE.TorusGeometry(1.15, 0.24, 10, 18),
      new THREE.MeshStandardMaterial({ color: 0x2d6630, roughness: 0.88 })
    );
    wreath.rotation.x = Math.PI / 2;
    wreath.position.y = 11.2;
    wreath.castShadow = true;
    g.add(wreath);

    const signMat = new THREE.MeshStandardMaterial({ color: 0xe6be4c, roughness: 0.4, metalness: 0.45 });
    for (const y of [5.8, 7.8, 9.6]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.1, 0.1), signMat);
      bar.position.y = y;
      g.add(bar);
      for (const sx of [-0.85, 0.85]) {
        const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.62, 0.08), signMat);
        plaque.position.set(sx, y + 0.35, 0);
        g.add(plaque);
      }
    }

    const crown = new THREE.Mesh(
      new THREE.ConeGeometry(0.9, 2.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x2d6630, roughness: 0.88 })
    );
    crown.position.y = 14.3;
    g.add(crown);

    g.position.set(mx, my, mz);
    this.scene.add(g);
    this.destructibles.push({
      kind: 'maibaum',
      label: 'Münsing Maibaum',
      pos: new THREE.Vector3(mx, my, mz),
      standingMesh: g,
      toppled: false,
      radius: 0.85,
      height: 13.5
    });
  }

  private addDynamicProp(
    kind: DynamicVillageObj['kind'],
    label: string,
    mesh: THREE.Group,
    halfExtents: CANNON.Vec3,
    mass: number,
    x: number,
    z: number,
    rotY: number,
    extraY = 0
  ): DynamicVillageObj {
    const gy = getTerrainHeight(x, z);
    const body = new CANNON.Body({
      mass,
      material: this.propMat,
      linearDamping: 0.22,
      angularDamping: 0.36
    });
    body.addShape(new CANNON.Box(halfExtents));
    body.position.set(x, gy + halfExtents.y + 0.04 + extraY, z);
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

  private buildVillageProps(): void {
    const yellowPost = new THREE.MeshStandardMaterial({ color: 0xf4c414, roughness: 0.38, metalness: 0.2 });
    const darkPost = new THREE.MeshStandardMaterial({ color: 0x24282b, roughness: 0.6 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x875c34, roughness: 0.88 });
    const clothColors = [0x1b7fd6, 0xc93a2b, 0x3b8045];

    for (const [px, pz] of [
      [-12.5, -47.2],
      [11.0, -64.0],
      [-45.0, -47.2]
    ]) {
      const g = new THREE.Group();
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.95, 8), darkPost);
      leg.position.y = -0.22;
      g.add(leg);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.72, 0.44), yellowPost);
      box.position.y = 0.35;
      box.castShadow = true;
      g.add(box);
      this.addDynamicProp('postbox', 'Deutsche Post Briefkasten', g, new CANNON.Vec3(0.32, 0.72, 0.28), 16, px, pz, 0);
    }

    const benchCoords: [number, number, number][] = [
      [17.5, -47.8, 0],
      [22.5, -47.8, 0],
      [27.5, -47.8, 0],
      [-11.8, -55.2, Math.PI / 2],
      // Lakeside bench looking out over Starnberger See!
      [-94.5, -33.5, Math.PI / 2]
    ];
    for (const [bx, bz, rot] of benchCoords) {
      const g = new THREE.Group();
      const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.84), woodMat);
      top.position.y = 0.36;
      top.castShadow = true;
      g.add(top);
      for (const sz of [-0.68, 0.68]) {
        const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.09, 0.3), woodMat);
        seat.position.set(0, 0.04, sz);
        seat.castShadow = true;
        g.add(seat);
      }
      for (const sx of [-0.82, 0.82]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.72, 1.38), darkPost);
        leg.position.set(sx, 0, 0);
        g.add(leg);
      }
      this.addDynamicProp('bench', 'Biergarten Table', g, new CANNON.Vec3(1.1, 0.42, 0.8), 18, bx, bz, rot);
    }

    const stallCoords: [number, number, number][] = [
      [-11.5, -51.0, 0.25],
      [-43.5, -55.0, Math.PI / 2],
      [44.0, -47.5, 0]
    ];
    stallCoords.forEach(([sx, sz, rot], idx) => {
      const g = new THREE.Group();
      const counter = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.95, 1.25), woodMat);
      counter.position.y = -0.65;
      counter.castShadow = true;
      g.add(counter);

      for (const lx of [-1.25, 1.25]) {
        const pole = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.25, 0.12), woodMat);
        pole.position.set(lx, 0.0, -0.5);
        g.add(pole);
      }

      const canopy = new THREE.Mesh(
        new THREE.BoxGeometry(3.0, 0.16, 1.65),
        new THREE.MeshStandardMaterial({ color: clothColors[idx % clothColors.length], roughness: 0.8 })
      );
      canopy.position.set(0, 1.05, 0.05);
      canopy.rotation.x = 0.18;
      canopy.castShadow = true;
      g.add(canopy);

      this.addDynamicProp('stall', 'Münsing Market Stall', g, new CANNON.Vec3(1.45, 1.15, 0.8), 26, sx, sz, rot);
    });
  }

  private buildCars(): void {
    const carConfigs: {
      name: string;
      color: number;
      x: number;
      z: number;
      rotY: number;
      isVan?: boolean;
      isPolizei?: boolean;
      cruiseDir?: number;
      cruiseZ?: number;
    }[] = [
      { name: 'Bayerische Polizei Car', color: 0xf4f6f8, x: 9.4, z: -72.5, rotY: 0, isPolizei: true },
      { name: 'Deutsche Post Van', color: 0xf5c414, x: -48, z: -47.5, rotY: Math.PI / 2, isVan: true },
      { name: 'Silver Touring', color: 0xb6bec4, x: 46.5, z: -52.0, rotY: Math.PI / 2 },
      { name: 'Red Compact', color: 0xc93126, x: 46.5, z: -60.5, rotY: Math.PI / 2 },
      { name: 'Dark Blue Sedan', color: 0x244878, x: -31.5, z: -52.5, rotY: 0 },
      { name: 'Forest Green SUV', color: 0x2d5e3a, x: 10.5, z: -48.5, rotY: -Math.PI / 2 },
      {
        name: 'White Hatchback',
        color: 0xeaece8,
        x: -48,
        z: -37.6,
        rotY: -Math.PI / 2,
        cruiseDir: 1,
        cruiseZ: -37.6
      },
      {
        name: 'Burgundy Estate',
        color: 0x7c222e,
        x: 45,
        z: -42.4,
        rotY: Math.PI / 2,
        cruiseDir: -1,
        cruiseZ: -42.4
      }
    ];

    const glassMat = new THREE.MeshStandardMaterial({ color: 0x1d2d36, roughness: 0.1, metalness: 0.55 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x1e2022, roughness: 0.92 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xc8cfd4, roughness: 0.35, metalness: 0.65 });
    const headLight = new THREE.MeshStandardMaterial({ color: 0xfff4c2, emissive: 0xffe488, emissiveIntensity: 0.65 });
    const tailLight = new THREE.MeshStandardMaterial({ color: 0xcc2218, emissive: 0x660800 });
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
      lower.receiveShadow = true;
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

      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.09, cabLen * 0.92), paint);
      roof.position.set(0, bodyH * 0.5 + cabH - 0.08, cabZ);
      g.add(roof);

      if (cfg.isPolizei) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.26), beaconBlue);
        bar.position.set(0, bodyH * 0.5 + cabH + 0.06, cabZ);
        g.add(bar);
      }

      const hazards: THREE.Mesh[] = [];
      for (const lx of [-0.62, 0.62]) {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.08), headLight);
        hl.position.set(lx, 0.02, -len * 0.5 - 0.02);
        g.add(hl);
        const tl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.08), tailLight);
        tl.position.set(lx, 0.04, len * 0.5 + 0.02);
        g.add(tl);

        // Amber hazard indicators (flash when car is bumped or hoisted!)
        const hzMat = new THREE.MeshStandardMaterial({
          color: 0xffa500,
          emissive: 0xff8800,
          emissiveIntensity: 0
        });
        const hzF = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.09), hzMat);
        hzF.position.set(lx * 1.28, 0.02, -len * 0.5 - 0.02);
        g.add(hzF);
        hazards.push(hzF);
      }

      for (const wx of [-0.88, 0.88]) {
        for (const wz of [-len * 0.31, len * 0.31]) {
          const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.24, 14), tireMat);
          tire.rotation.z = Math.PI / 2;
          tire.position.set(wx, -0.44, wz);
          tire.castShadow = true;
          g.add(tire);
          const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.26, 10), rimMat);
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
        52,
        cfg.x,
        cfg.z,
        cfg.rotY
      );
      obj.hazardLights = hazards;
      if (cfg.cruiseDir) {
        obj.cruiseDir = cfg.cruiseDir;
        obj.cruiseMinX = -76;
        obj.cruiseMaxX = 76;
        obj.cruiseZ = cfg.cruiseZ;
        obj.cruiseActive = true;
        obj.honkCooldown = 0;
      }
    }
  }

  private buildDestructibleTreesAndLamps(): void {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4028, roughness: 0.95 });
    const leafDark = new THREE.MeshStandardMaterial({ color: 0x35622e, roughness: 0.9 });
    const leafBright = new THREE.MeshStandardMaterial({ color: 0x4b7e39, roughness: 0.88 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x262b2e, roughness: 0.5, metalness: 0.65 });

    const treeCoords: [number, number, boolean][] = [
      [14.5, -49.5, false],
      [30.5, -49.5, false],
      [-26, -53, false],
      [-32, -74, true],
      [-10, -76, false],
      [-15, -33.2, false],
      [16, -33.2, true],
      [30, -33.2, false],
      [-45, -33.2, true],
      [48, -33.2, false],
      [-46, -80, true],
      [48, -76, false],
      // Lakeside willows / chestnuts along Ammerlander Straße down to Starnberger See!
      [-74, -33.5, false],
      [-86, -33.0, true],
      [-84, -46.8, false]
    ];

    for (const [tx, tz, isPine] of treeCoords) {
      const ty = getTerrainHeight(tx, tz);
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.38, 2.6, 8), trunkMat);
      trunk.position.y = 1.3;
      trunk.castShadow = true;
      g.add(trunk);

      if (isPine) {
        for (let tier = 0; tier < 3; tier++) {
          const cone = new THREE.Mesh(
            new THREE.ConeGeometry(1.9 - tier * 0.42, 2.3, 9),
            tier % 2 === 0 ? leafDark : leafBright
          );
          cone.position.y = 2.6 + tier * 1.35;
          cone.castShadow = true;
          g.add(cone);
        }
      } else {
        const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(2.15, 1), leafBright);
        crown.position.y = 3.7;
        crown.scale.y = 0.9;
        crown.castShadow = true;
        g.add(crown);
      }

      g.position.set(tx, ty - 0.1, tz);
      this.scene.add(g);
      this.destructibles.push({
        kind: 'tree',
        label: isPine ? 'Bavarian Spruce' : 'Chestnut Tree',
        pos: new THREE.Vector3(tx, ty, tz),
        standingMesh: g,
        toppled: false,
        radius: 1.05,
        height: 5.5
      });
    }

    const lampCoords: [number, number][] = [
      [-60, -46.2],
      [-26, -46.2],
      [-2, -46.2],
      [22, -46.2],
      [48, -46.2],
      [7.8, -62],
      [7.8, -78],
      [-33, -64]
    ];
    lampCoords.forEach(([lx, lz], idx) => {
      const ly = getTerrainHeight(lx, lz);
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.12, 4.5, 8), ironMat);
      pole.position.y = 2.25;
      pole.castShadow = true;
      g.add(pole);

      const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.5, 0.38), this.lampBulbMat);
      lantern.position.y = 4.68;
      g.add(lantern);

      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.24, 6), ironMat);
      cap.position.y = 5.05;
      g.add(cap);

      // Warm twilight glow pools on alternate key Münsing lamps (fast & gorgeous at Sunset/Dusk!)
      if (idx % 2 === 0) {
        const pl = new THREE.PointLight(0xffcb78, 0, 18, 1.8);
        pl.position.set(0, 4.5, 0);
        g.add(pl);
        this.lampPointLights.push(pl);
      }

      g.position.set(lx, ly, lz);
      this.scene.add(g);
      this.destructibles.push({
        kind: 'lamp',
        label: 'Münsing Streetlamp',
        pos: new THREE.Vector3(lx, ly, lz),
        standingMesh: g,
        toppled: false,
        radius: 0.72,
        height: 4.8
      });
    });
  }

  private buildPedestrians(): void {
    const jacketColors = [0x2d6638, 0xc9422c, 0x1b6db8, 0xdba624, 0x6b3e5e, 0x4b5b63];
    const trouserMat = new THREE.MeshStandardMaterial({ color: 0x3b2c20, roughness: 0.9 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf2c59d, roughness: 0.75 });

    const spots: [number, number][] = [
      [-52, -47.2],
      [-32, -47.0],
      [-14, -47.2],
      [-6, -53.0],
      [-10, -56.0],
      [16, -47.2],
      [25, -47.2],
      [44, -47.2],
      [48, -56.0],
      [8.5, -60.0],
      [8.5, -74.0],
      [-33.5, -62.0],
      [-20, -88.5],
      [12, -88.5],
      [-88, -46.5], // Lakeside walker admiring Starnberger See!
      [-94, -36.0]
    ];

    spots.forEach(([px, pz], idx) => {
      const py = getTerrainHeight(px, pz);
      const g = new THREE.Group();
      const coatMat = new THREE.MeshStandardMaterial({ color: jacketColors[idx % jacketColors.length], roughness: 0.8 });

      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.28), coatMat);
      torso.position.y = 1.04;
      torso.castShadow = true;
      g.add(torso);

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), skinMat);
      head.position.y = 1.54;
      head.castShadow = true;
      g.add(head);

      const hat = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.24, 0.14, 10),
        new THREE.MeshStandardMaterial({ color: 0x325736, roughness: 0.9 })
      );
      hat.position.y = 1.72;
      g.add(hat);

      const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.64, 0.16), trouserMat);
      leftLeg.position.set(-0.12, 0.36, 0);
      leftLeg.castShadow = true;
      g.add(leftLeg);

      const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.64, 0.16), trouserMat);
      rightLeg.position.set(0.12, 0.36, 0);
      rightLeg.castShadow = true;
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

    if (d.kind === 'tree') {
      const stump = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.4, 0.55, 8),
        new THREE.MeshStandardMaterial({ color: 0x624228, roughness: 0.95 })
      );
      stump.position.set(d.pos.x, d.pos.y + 0.27, d.pos.z);
      stump.castShadow = true;
      this.scene.add(stump);
    }

    const fallDir = d.pos.clone().sub(impactPos);
    fallDir.y = 0;
    if (fallDir.lengthSq() < 0.01) fallDir.set(1, 0, 0);
    fallDir.normalize();

    const body = new CANNON.Body({
      mass: d.kind === 'maibaum' ? 36 : d.kind === 'tree' ? 28 : 16,
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

    const obj: DynamicVillageObj = {
      id: this.nextId++,
      kind: d.kind === 'maibaum' ? 'maibaum' : d.kind === 'lamp' ? 'lamp' : 'fallen_tree',
      label: d.kind === 'maibaum' ? 'Münsing Maibaum' : d.kind === 'tree' ? 'Toppled Tree' : 'Streetlamp',
      mesh: d.standingMesh,
      body,
      radius: 1.1,
      halfHeight: 0.5,
      heldByTractor: false,
      alarmActive: false
    };
    this.objects.push(obj);

    this.callbacks.onTreeOrLampToppled(d.label, d.kind, d.pos.clone().add(new THREE.Vector3(0, 1.8, 0)));
  }

  public update(
    dt: number,
    elapsed: number,
    tractorPos: THREE.Vector3,
    tractorSpeed: number,
    tipPos: THREE.Vector3,
    tipSpeed: number,
    freePlayMode: boolean
  ): void {
    // 1. Gently bob Starnberger See sailboats
    for (const b of this.sailboats) {
      b.group.position.y = b.basePos.y + Math.sin(elapsed * 1.4 + b.phase) * 0.08;
      b.group.position.z = b.basePos.z + Math.sin(elapsed * 0.25 + b.phase) * b.driftAmp;
      b.group.rotation.z = Math.sin(elapsed * 1.1 + b.phase) * 0.06;
    }

    // 2. Check destructible trees, streetlamps & Maibaum
    for (const d of this.destructibles) {
      if (d.toppled) continue;
      const dChassis = Math.hypot(d.pos.x - tractorPos.x, d.pos.z - tractorPos.z);
      const dTip = Math.hypot(d.pos.x - tipPos.x, d.pos.z - tipPos.z);

      if (dChassis < d.radius + 1.5 && Math.abs(tractorSpeed) > 2.5) {
        this.toppleDestructible(d, tractorPos, Math.abs(tractorSpeed));
      } else if (dTip < d.radius + 1.15 && tipPos.y < d.pos.y + d.height && tipSpeed > 3.2) {
        this.toppleDestructible(d, tipPos, tipSpeed);
      }
    }

    // 3. Living Village Cars & Dynamic Props
    const hazardBlink = Math.sin(elapsed * 11) > 0 ? 1.5 : 0;
    for (const o of this.objects) {
      if (o.kind === 'car' && o.cruiseActive && !o.heldByTractor && !o.alarmActive) {
        const distToTractor = Math.hypot(o.body.position.x - tractorPos.x, o.body.position.z - tractorPos.z);
        const speedNow = o.body.velocity.length();
        const upVec = new CANNON.Vec3(0, 1, 0);
        o.body.quaternion.vmult(upVec, upVec);

        if (upVec.y < 0.82 || Math.abs(o.body.position.z - (o.cruiseZ ?? -40)) > 2.6 || speedNow > 8.5) {
          o.cruiseActive = false;
        } else if (distToTractor > 8.5) {
          o.body.wakeUp();
          const dir = o.cruiseDir ?? 1;
          const targetSpeed = 5.2;
          o.body.velocity.x += (dir * targetSpeed - o.body.velocity.x) * Math.min(1, dt * 3);
          o.body.velocity.z *= 0.88;
          o.body.quaternion.setFromEuler(0, dir > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
          if (o.body.position.x > (o.cruiseMaxX ?? 76)) o.cruiseDir = -1;
          if (o.body.position.x < (o.cruiseMinX ?? -76)) o.cruiseDir = 1;
        } else {
          // Politely stop & honk when the CLAAS Scorpion blocks Hauptstraße!
          o.body.velocity.x *= 0.82;
          o.honkCooldown = (o.honkCooldown ?? 0) - dt;
          if (o.honkCooldown <= 0) {
            o.honkCooldown = 3.6;
            this.callbacks.onCarHonk(false);
          }
        }
      }

      // Car alarm + flashing hazards when hoisted or flipped!
      if (o.kind === 'car') {
        const upVec = new CANNON.Vec3(0, 1, 0);
        o.body.quaternion.vmult(upVec, upVec);
        const disturbed = o.heldByTractor || upVec.y < 0.7 || o.body.position.y > getTerrainHeight(o.body.position.x, o.body.position.z) + 1.8;
        if (disturbed && !o.alarmActive) {
          o.alarmActive = true;
          o.cruiseActive = false;
          this.callbacks.onCarHonk(true);
        }
        if (o.alarmActive && o.hazardLights) {
          for (const hl of o.hazardLights) {
            (hl.material as THREE.MeshStandardMaterial).emissiveIntensity = hazardBlink;
          }
        }
      }

      // Lake Starnberg splash check!
      const inWater = o.body.position.x < -99 && o.body.position.y < WATER_LEVEL + 0.4;
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

    // 4. Natural Bavarian Village Pedestrians (zero cash spam, pure playful physics reactions!)
    for (const p of this.pedestrians) {
      const toTractor = p.pos.clone().sub(tractorPos);
      toTractor.y = 0;
      const dist = toTractor.length();

      const toTip = p.pos.clone().sub(tipPos);
      toTip.y = 0;
      const distTip = toTip.length();

      if (
        p.tumbleTimer <= 0 &&
        ((dist < 2.25 && Math.abs(tractorSpeed) > 1.2) || (distTip < 1.45 && tipSpeed > 2.2))
      ) {
        p.tumbleTimer = 1.2;
        p.panicTimer = 5.5;
        const pushDir = (dist < 2.25 ? toTractor : toTip).normalize();
        p.tumbleVel.set(pushDir.x * 7.0, 4.8, pushDir.z * 7.0);
      }

      if (p.tumbleTimer > 0) {
        p.tumbleTimer -= dt;
        p.tumbleVel.y -= 16 * dt;
        p.pos.addScaledVector(p.tumbleVel, dt);
        const floorY = getTerrainHeight(p.pos.x, p.pos.z);
        if (p.pos.y < floorY) {
          p.pos.y = floorY;
          p.tumbleVel.y = Math.abs(p.tumbleVel.y) * 0.32;
          p.tumbleVel.x *= 0.72;
          p.tumbleVel.z *= 0.72;
        }
        p.group.position.copy(p.pos);
        p.group.rotation.x += dt * 9;
        p.group.rotation.z += dt * 7;
        continue;
      }

      p.group.rotation.x = 0;
      p.group.rotation.z = 0;

      if (dist < (freePlayMode ? 10 : 7) && Math.abs(tractorSpeed) > 1.4) {
        p.panicTimer = Math.max(p.panicTimer, 3.0);
      }

      let moveSpeed = 1.3;
      if (p.panicTimer > 0) {
        p.panicTimer -= dt;
        moveSpeed = 5.4;
        const flee = toTractor.lengthSq() > 0.01 ? toTractor.normalize() : new THREE.Vector3(1, 0, 0);
        p.vel.lerp(flee.multiplyScalar(moveSpeed), Math.min(1, dt * 6));
      } else {
        p.wanderAngle += Math.sin(elapsed * 0.7 + p.phase) * 0.8 * dt;
        const backHome = p.homePos.clone().sub(p.pos);
        if (backHome.length() > 7.5) {
          p.wanderAngle = Math.atan2(backHome.x, backHome.z);
        }
        p.vel.set(Math.sin(p.wanderAngle) * moveSpeed, 0, Math.cos(p.wanderAngle) * moveSpeed);
      }

      p.pos.addScaledVector(p.vel, dt);
      p.pos.x = THREE.MathUtils.clamp(p.pos.x, -96, 82);
      p.pos.z = THREE.MathUtils.clamp(p.pos.z, -104, -26);
      p.pos.y = getTerrainHeight(p.pos.x, p.pos.z);

      p.group.position.copy(p.pos);
      if (p.vel.lengthSq() > 0.04) {
        p.group.rotation.y = Math.atan2(p.vel.x, p.vel.z);
      }

      const stride = Math.sin(elapsed * (p.panicTimer > 0 ? 18 : 6.5) + p.phase);
      p.leftLeg.rotation.x = stride * 0.65;
      p.rightLeg.rotation.x = -stride * 0.65;
      if (p.panicTimer > 0) {
        p.leftArm.rotation.x = -2.6 + stride * 0.45;
        p.rightArm.rotation.x = -2.6 - stride * 0.45;
      } else {
        p.leftArm.rotation.x = -stride * 0.4;
        p.rightArm.rotation.x = stride * 0.4;
      }
    }
  }
}
