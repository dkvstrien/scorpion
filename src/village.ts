import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export interface DynamicVillageObj {
  id: number;
  kind: 'car' | 'bench' | 'postbox' | 'stall' | 'fallen_tree' | 'lamp';
  label: string;
  mesh: THREE.Group;
  body: CANNON.Body;
  radius: number;
  halfHeight: number;
  heldByTractor: boolean;
  wrecked: boolean;
  cruiseDir?: number;
  cruiseMinX?: number;
  cruiseMaxX?: number;
  cruiseZ?: number;
  cruiseActive?: boolean;
  valueGBP: number;
}

export interface DestructibleStatic {
  kind: 'tree' | 'lamp' | 'maibaum';
  label: string;
  pos: THREE.Vector3;
  standingMesh: THREE.Group;
  toppled: boolean;
  radius: number;
  height: number;
  valueGBP: number;
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
  countedPanic: boolean;
  phase: number;
}

export interface VillageCallbacks {
  onChaosEvent: (
    category: 'car' | 'tree' | 'prop' | 'ped',
    label: string,
    costEUR: number,
    pos: THREE.Vector3
  ) => void;
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
    ctx.font = `bold ${Math.floor(h * 0.34)}px sans-serif`;
    ctx.fillText(line1, w / 2, h * 0.38);
    ctx.fillStyle = accentColor;
    ctx.font = `bold ${Math.floor(h * 0.2)}px sans-serif`;
    ctx.fillText(line2, w / 2, h * 0.72);
  } else {
    ctx.font = `bold ${Math.floor(h * 0.44)}px sans-serif`;
    ctx.fillText(line1, w / 2, h * 0.52);
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
  // Clock hands (10:10!)
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

export class VillageWorld {
  public objects: DynamicVillageObj[] = [];
  public destructibles: DestructibleStatic[] = [];
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

    this.buildMuensingStreets(scene);
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
    const g = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.055, 2.9, 8),
      new THREE.MeshStandardMaterial({ color: 0x62686e, roughness: 0.5, metalness: 0.5 })
    );
    pole.position.y = 1.45;
    g.add(pole);

    const tex = makeSignTexture(256, 56, '#f6f7f8', '#1f2833', name, null, '#131920');
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(1.85, 0.4, 0.06),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 })
    );
    board.position.y = 2.75;
    g.add(board);

    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    scene.add(g);
  }

  private buildMuensingStreets(scene: THREE.Scene): void {
    const asphalt = new THREE.MeshStandardMaterial({ color: 0x3c4045, roughness: 0.92 });
    const cobble = new THREE.MeshStandardMaterial({ color: 0xa29c90, roughness: 0.94 });
    const dashMat = new THREE.MeshStandardMaterial({ color: 0xebe9e0, roughness: 0.8 });

    // 1. Hauptstraße (East-West main village artery at z = -40, x = -84..+84)
    const hauptstrasse = new THREE.Mesh(new THREE.PlaneGeometry(168, 10.4), asphalt);
    hauptstrasse.rotation.x = -Math.PI / 2;
    hauptstrasse.position.set(0, 0.025, -40);
    hauptstrasse.receiveShadow = true;
    scene.add(hauptstrasse);

    // Connecting farm drive from the open north dry-stone gate (x = -1.5, z = -31..-35)
    const gateDrive = new THREE.Mesh(new THREE.PlaneGeometry(11.6, 8.2), asphalt);
    gateDrive.rotation.x = -Math.PI / 2;
    gateDrive.position.set(-1.5, 0.022, -33.0);
    gateDrive.receiveShadow = true;
    scene.add(gateDrive);

    // 2. Weipertshausener Straße (North-South civic street at x = +2, z = -40..-104)
    const weipertStr = new THREE.Mesh(new THREE.PlaneGeometry(9.4, 66), asphalt);
    weipertStr.rotation.x = -Math.PI / 2;
    weipertStr.position.set(2, 0.028, -73);
    weipertStr.receiveShadow = true;
    scene.add(weipertStr);

    // 3. Am Kirchberg West Leg (x = -38, z = -40..-86)
    const kirchbergW = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 48), asphalt);
    kirchbergW.rotation.x = -Math.PI / 2;
    kirchbergW.position.set(-38, 0.028, -64);
    kirchbergW.receiveShadow = true;
    scene.add(kirchbergW);

    // 4. Am Kirchberg North Loop (z = -84, x = -38..+42) connecting all 3 streets!
    const kirchbergN = new THREE.Mesh(new THREE.PlaneGeometry(88, 8.4), asphalt);
    kirchbergN.rotation.x = -Math.PI / 2;
    kirchbergN.position.set(2, 0.03, -84);
    kirchbergN.receiveShadow = true;
    scene.add(kirchbergN);

    // 5. Bachstraße (East street at x = +38, z = -40..-84, past Alter Wirt & EDEKA!)
    const bachStr = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 48), asphalt);
    bachStr.rotation.x = -Math.PI / 2;
    bachStr.position.set(38, 0.028, -64);
    bachStr.receiveShadow = true;
    scene.add(bachStr);

    // Paved sidewalks & Cobblestone Dorfplatz!
    const walkNorth = new THREE.Mesh(new THREE.PlaneGeometry(164, 2.8), cobble);
    walkNorth.rotation.x = -Math.PI / 2;
    walkNorth.position.set(0, 0.02, -46.6);
    walkNorth.receiveShadow = true;
    scene.add(walkNorth);

    const dorfplatz = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), cobble);
    dorfplatz.rotation.x = -Math.PI / 2;
    dorfplatz.position.set(-8.5, 0.024, -52.5);
    dorfplatz.receiveShadow = true;
    scene.add(dorfplatz);

    // EDEKA Parking Apron (x = 42.5..51, z = -46..-66)
    const edekaLot = new THREE.Mesh(new THREE.PlaneGeometry(10, 21), asphalt);
    edekaLot.rotation.x = -Math.PI / 2;
    edekaLot.position.set(46.5, 0.024, -56);
    edekaLot.receiveShadow = true;
    scene.add(edekaLot);

    // Road center dashes along Hauptstraße & Weipertshausener Straße
    for (let x = -78; x <= 78; x += 6) {
      if (Math.abs(x - 2) < 5 || Math.abs(x + 38) < 5 || Math.abs(x - 38) < 5) continue;
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.2), dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.036, -40);
      scene.add(dash);
    }
    for (let z = -48; z >= -100; z -= 6) {
      if (Math.abs(z + 84) < 5) continue;
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 2.8), dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(2, 0.036, z);
      scene.add(dash);
    }

    // German Zebra Crossing at the Hauptstraße / Dorfplatz center!
    for (let sx = -3.4; sx <= 1.0; sx += 0.85) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 3.2), dashMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(sx - 6, 0.037, -40);
      scene.add(stripe);
    }

    // Authentic Münsing Street Name Signs!
    this.addStreetSign(scene, 'Hauptstraße', -4.2, -46.2, 0);
    this.addStreetSign(scene, 'Weipertshausener Str.', 7.6, -46.2, Math.PI / 2);
    this.addStreetSign(scene, 'Am Kirchberg', -32.8, -46.2, Math.PI / 2);
    this.addStreetSign(scene, 'Bachstraße', 43.2, -46.2, Math.PI / 2);
  }

  private buildChurchStMariaeHimmelfahrt(
    scene: THREE.Scene,
    world: CANNON.World,
    groundMat: CANNON.Material
  ): void {
    // Katholische Pfarrkirche St. Mariä Himmelfahrt (Am Kirchberg 2, Münsing!)
    // Iconic Baroque whitewashed nave + towering southern Zwiebelturm (green copper onion dome!)
    const cx = -21;
    const cz = -67.5;

    const stuccoWhite = new THREE.MeshStandardMaterial({ color: 0xf4f0e6, roughness: 0.86 });
    const trimCream = new THREE.MeshStandardMaterial({ color: 0xe3dccb, roughness: 0.88 });
    const tileRed = new THREE.MeshStandardMaterial({ color: 0xa6422c, roughness: 0.78 });
    const copperGreen = new THREE.MeshStandardMaterial({ color: 0x4b8a6b, roughness: 0.42, metalness: 0.35 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xe8bd42, roughness: 0.25, metalness: 0.8 });
    const glassStained = new THREE.MeshStandardMaterial({
      color: 0x3b6c94,
      emissive: 0x1b344a,
      roughness: 0.25
    });
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x4f3520, roughness: 0.88 });

    // Raised stone churchyard lawn & low whitewashed churchyard wall
    const yard = new THREE.Mesh(
      new THREE.BoxGeometry(24, 0.28, 21),
      new THREE.MeshStandardMaterial({ color: 0x628c45, roughness: 0.95 })
    );
    yard.position.set(cx, 0.14, cz);
    yard.receiveShadow = true;
    scene.add(yard);

    // Churchyard perimeter walls (with wide opening facing the Dorfplatz on the east!)
    const wallH = 1.1;
    const backW = new THREE.Mesh(new THREE.BoxGeometry(24, wallH, 0.45), trimCream);
    backW.position.set(cx, wallH * 0.5, cz - 10.5);
    backW.castShadow = true;
    scene.add(backW);
    this.addStaticBox(world, groundMat, cx, wallH * 0.5, cz - 10.5, 24, wallH, 0.55);

    const westW = new THREE.Mesh(new THREE.BoxGeometry(0.45, wallH, 21), trimCream);
    westW.position.set(cx - 12, wallH * 0.5, cz);
    westW.castShadow = true;
    scene.add(westW);
    this.addStaticBox(world, groundMat, cx - 12, wallH * 0.5, cz, 0.55, wallH, 21);

    // Main Baroque Church Nave (oriented East-West like the real church!)
    const naveW = 16.5;
    const naveH = 8.4;
    const naveD = 9.4;
    const nave = new THREE.Mesh(new THREE.BoxGeometry(naveW, naveH, naveD), stuccoWhite);
    nave.position.set(cx - 1.2, naveH * 0.5 + 0.25, cz - 0.5);
    nave.castShadow = true;
    nave.receiveShadow = true;
    scene.add(nave);
    this.addStaticBox(world, groundMat, cx - 1.2, naveH * 0.5, cz - 0.5, naveW, naveH, naveD);

    // Semi-octagonal eastern choir apse
    const apse = new THREE.Mesh(new THREE.CylinderGeometry(4.3, 4.3, naveH - 0.6, 8), stuccoWhite);
    apse.position.set(cx + 7.2, (naveH - 0.6) * 0.5 + 0.25, cz - 0.5);
    apse.castShadow = true;
    scene.add(apse);

    // Steep Bavarian terracotta tile gable roof
    const slopeLen = Math.hypot(naveD * 0.58, 4.2);
    const slopeAng = Math.atan2(4.2, naveD * 0.58);
    for (const s of [-1, 1]) {
      const slope = new THREE.Mesh(new THREE.BoxGeometry(naveW + 1.2, 0.26, slopeLen), tileRed);
      slope.position.set(cx - 1.2, naveH + 2.25, cz - 0.5 + s * (naveD * 0.28));
      slope.rotation.x = s * slopeAng;
      slope.castShadow = true;
      scene.add(slope);
    }
    const apseRoof = new THREE.Mesh(new THREE.ConeGeometry(4.8, 3.8, 8), tileRed);
    apseRoof.position.set(cx + 7.2, naveH + 1.5, cz - 0.5);
    apseRoof.castShadow = true;
    scene.add(apseRoof);

    // Arched Baroque windows along the south & north nave walls
    for (let wx = -5.5; wx <= 4.5; wx += 3.3) {
      for (const sz of [-1, 1]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.9, 0.14), glassStained);
        win.position.set(cx - 1.2 + wx, 4.4, cz - 0.5 + sz * (naveD * 0.5 + 0.04));
        scene.add(win);
      }
    }

    // Arched heavy oak church portal on the south side
    const portal = new THREE.Mesh(new THREE.BoxGeometry(2.1, 3.2, 0.22), darkWood);
    portal.position.set(cx - 5.2, 1.85, cz + naveD * 0.5 - 0.45);
    scene.add(portal);

    // === ICONIC SOUTHERN BELL TOWER WITH COPPER ONION DOME (ZWIEBELHAUBE)! ===
    const tx = cx + 4.8;
    const tz = cz + 5.2;

    // Square lower tower shaft
    const towerBase = new THREE.Mesh(new THREE.BoxGeometry(4.4, 15.2, 4.4), stuccoWhite);
    towerBase.position.set(tx, 7.6 + 0.25, tz);
    towerBase.castShadow = true;
    towerBase.receiveShadow = true;
    scene.add(towerBase);
    this.addStaticBox(world, groundMat, tx, 7.6, tz, 4.5, 15.2, 4.5);

    // Decorative cornice belt
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(4.85, 0.35, 4.85), trimCream);
    cornice.position.set(tx, 15.3, tz);
    scene.add(cornice);

    // Octagonal upper belfry with 4 arched bell windows & golden clocks!
    const belfry = new THREE.Mesh(new THREE.CylinderGeometry(2.25, 2.35, 4.2, 8), stuccoWhite);
    belfry.position.set(tx, 17.5, tz);
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
      face.position.set(tx + ox, 13.6, tz + oz);
      face.rotation.y = ry;
      scene.add(face);
    }

    // Classic Copper-Green Bavarian Onion Dome (Zwiebelhaube) using LatheGeometry!
    const onionPts = [
      new THREE.Vector2(0.01, 6.2),
      new THREE.Vector2(0.28, 5.2),
      new THREE.Vector2(0.75, 4.3),
      new THREE.Vector2(0.55, 3.6), // lantern waist
      new THREE.Vector2(1.45, 2.8),
      new THREE.Vector2(2.65, 1.85), // classic plump onion bulge!
      new THREE.Vector2(2.45, 0.8),
      new THREE.Vector2(2.25, 0.0)
    ];
    const onionDome = new THREE.Mesh(new THREE.LatheGeometry(onionPts, 18), copperGreen);
    onionDome.position.set(tx, 19.55, tz);
    onionDome.castShadow = true;
    scene.add(onionDome);

    // Golden finial sphere & cross atop the spire (~27m total height — visible across the entire valley!)
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), goldMat);
    orb.position.set(tx, 25.9, tz);
    scene.add(orb);
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.35, 0.12), goldMat);
    crossV.position.set(tx, 26.75, tz);
    scene.add(crossV);
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.12, 0.12), goldMat);
    crossH.position.set(tx, 26.95, tz);
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
    const g = new THREE.Group();
    const plaster = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.88 });
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x5c3d22, roughness: 0.9 });
    const roofTile = new THREE.MeshStandardMaterial({ color: 0xa8452c, roughness: 0.8 });
    const shutterGreen = new THREE.MeshStandardMaterial({ color: 0x2d5e3b, roughness: 0.78 });
    const warmWin = new THREE.MeshStandardMaterial({
      color: 0xffdfa2,
      emissive: 0x6e4716,
      emissiveIntensity: 0.3
    });
    const flowerRed = new THREE.MeshStandardMaterial({ color: 0xd62e24, roughness: 0.7 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), plaster);
    body.position.y = h * 0.5;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    // Wide overhanging Bavarian chalet gable roof!
    const slopeLen = Math.hypot(d * 0.62, 2.35);
    const slopeAng = Math.atan2(2.35, d * 0.62);
    for (const s of [-1, 1]) {
      const slope = new THREE.Mesh(new THREE.BoxGeometry(w + 1.3, 0.22, slopeLen), roofTile);
      slope.position.set(0, h + 1.1, s * (d * 0.29));
      slope.rotation.x = s * slopeAng;
      slope.castShadow = true;
      g.add(slope);
    }

    // Wooden carved balcony with bright red geranium flower boxes!
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

    // Front door & shuttered Bavarian windows
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.2, 0.14), darkWood);
    door.position.set(0, 1.1, d * 0.5 + 0.04);
    g.add(door);

    for (const wx of [-w * 0.3, w * 0.3]) {
      for (const wy of [1.75, h * 0.72]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.1, 0.12), warmWin);
        win.position.set(wx, wy, d * 0.5 + 0.04);
        g.add(win);
        for (const ss of [-0.74, 0.74]) {
          const shutter = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1.15, 0.08), shutterGreen);
          shutter.position.set(wx + ss, wy, d * 0.5 + 0.06);
          g.add(shutter);
        }
      }
    }

    g.position.set(cx, 0, cz);
    g.rotation.y = rotY;
    scene.add(g);

    const bw = Math.abs(Math.sin(rotY)) > 0.7 ? d : w;
    const bd = Math.abs(Math.sin(rotY)) > 0.7 ? w : d;
    this.addStaticBox(world, groundMat, cx, h * 0.5, cz, bw, h, bd);
    return g;
  }

  private buildGasthofAlterWirt(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    // Historic Gasthof Alter Wirt (Hauptstraße 2, Münsing — since 1609!)
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

    // Biergarten gravel terrace right in front (south side toward Hauptstraße!)
    const gravel = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 6.2),
      new THREE.MeshStandardMaterial({ color: 0xc2b59c, roughness: 0.95 })
    );
    gravel.rotation.x = -Math.PI / 2;
    gravel.position.set(22, 0.025, -48.2);
    gravel.receiveShadow = true;
    scene.add(gravel);
  }

  private buildRathausGemeindeMuensing(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    // Gemeinde Münsing / Rathaus (Weipertshausener Straße 3!)
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

    // Bavarian blue-white flag pole out front
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.07, 7.2, 8),
      new THREE.MeshStandardMaterial({ color: 0xd8dce0, roughness: 0.4, metalness: 0.6 })
    );
    pole.position.set(11.5, 3.6, -70);
    scene.add(pole);
    const flagTop = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.55, 0.04),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    flagTop.position.set(12.4, 6.7, -70);
    scene.add(flagTop);
    const flagBot = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.55, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x1b7fd6 })
    );
    flagBot.position.set(12.4, 6.15, -70);
    scene.add(flagBot);
  }

  private buildBakeryAndEdeka(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    // Bäckerei Krümel & Korn (Hauptstraße 6, west of Am Kirchberg!)
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

    // EDEKA Aktivmarkt Graf (Bachstraße 3, east side of Bachstraße!)
    const ex = 61;
    const ez = -56;
    const edekaBody = new THREE.Mesh(
      new THREE.BoxGeometry(15, 5.2, 18),
      new THREE.MeshStandardMaterial({ color: 0xebe9e0, roughness: 0.85 })
    );
    edekaBody.position.set(ex, 2.6, ez);
    edekaBody.castShadow = true;
    edekaBody.receiveShadow = true;
    scene.add(edekaBody);
    this.addStaticBox(world, groundMat, ex, 2.6, ez, 15, 5.2, 18);

    const blueBand = new THREE.Mesh(
      new THREE.BoxGeometry(15.3, 1.15, 18.3),
      new THREE.MeshStandardMaterial({ color: 0x1359a8, roughness: 0.5 })
    );
    blueBand.position.set(ex, 4.85, ez);
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
    edekaSign.position.set(ex - 7.62, 4.5, ez);
    scene.add(edekaSign);
  }

  private buildBavarianHouses(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    const specs: [number, number, number, number, number, number, boolean, number][] = [
      // North side of Am Kirchberg / Weipertshausener Str.
      [-30, -96, 11.5, 5.4, 8.2, 0xf3eee2, true, 0],
      [-14, -96, 12.0, 5.8, 8.5, 0xefe2c9, true, 0],
      [18, -96, 11.5, 5.4, 8.2, 0xf2efe8, true, 0],
      [36, -96, 11.0, 5.2, 8.2, 0xe9dfd0, false, 0],
      // West Münsing cottages along Hauptstraße
      [-68, -55, 10.5, 5.2, 8.2, 0xf4efe4, true, 0],
      [-55, -72, 10.5, 5.4, 8.2, 0xeee4d2, true, Math.PI / 2],
      // East cottages along Hauptstraße south side
      [52, -26, 11.0, 5.2, 8.2, 0xf4f0e6, true, Math.PI],
      [68, -26, 10.5, 5.0, 8.0, 0xefe3ce, false, Math.PI]
    ];
    for (const [x, z, w, h, d, col, balc, rot] of specs) {
      this.buildBavarianBuilding(scene, world, groundMat, x, z, w, h, d, col, balc, rot);
    }
  }

  private buildDorfplatzMaibaum(): void {
    // Iconic Blue-and-White Bavarian Maibaum right on Münsing's Dorfplatz!
    const mx = -7.8;
    const mz = -51.5;
    const g = new THREE.Group();

    const poleTex = createMaibaumTexture();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.25, 13.5, 14),
      new THREE.MeshStandardMaterial({ map: poleTex, roughness: 0.45 })
    );
    pole.position.y = 6.75;
    pole.castShadow = true;
    g.add(pole);

    // Traditional spruce wreath near the top!
    const wreath = new THREE.Mesh(
      new THREE.TorusGeometry(1.15, 0.24, 10, 18),
      new THREE.MeshStandardMaterial({ color: 0x2d6630, roughness: 0.88 })
    );
    wreath.rotation.x = Math.PI / 2;
    wreath.position.y = 11.2;
    wreath.castShadow = true;
    g.add(wreath);

    // Guild signs (Zunfttafeln) mounted on crossbars
    const signMat = new THREE.MeshStandardMaterial({ color: 0xe6be4c, roughness: 0.45, metalness: 0.35 });
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

    // Little spruce tree crown on the very tip!
    const crown = new THREE.Mesh(
      new THREE.ConeGeometry(0.9, 2.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x2d6630, roughness: 0.88 })
    );
    crown.position.y = 14.3;
    g.add(crown);

    g.position.set(mx, 0, mz);
    this.scene.add(g);
    this.destructibles.push({
      kind: 'maibaum',
      label: 'Münsing Maibaum!',
      pos: new THREE.Vector3(mx, 0, mz),
      standingMesh: g,
      toppled: false,
      radius: 0.85,
      height: 13.5,
      valueGBP: 2500
    });
  }

  private addDynamicProp(
    kind: DynamicVillageObj['kind'],
    label: string,
    mesh: THREE.Group,
    halfExtents: CANNON.Vec3,
    mass: number,
    pos: THREE.Vector3,
    rotY: number,
    valueGBP: number
  ): DynamicVillageObj {
    const body = new CANNON.Body({
      mass,
      material: this.propMat,
      linearDamping: 0.2,
      angularDamping: 0.34
    });
    body.addShape(new CANNON.Box(halfExtents));
    body.position.set(pos.x, pos.y, pos.z);
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
      wrecked: false,
      valueGBP
    };
    this.objects.push(obj);
    return obj;
  }

  private buildVillageProps(): void {
    const yellowPost = new THREE.MeshStandardMaterial({ color: 0xf4c414, roughness: 0.38, metalness: 0.2 });
    const darkPost = new THREE.MeshStandardMaterial({ color: 0x24282b, roughness: 0.6 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x875c34, roughness: 0.88 });
    const clothColors = [0x1b7fd6, 0xc93a2b, 0x3b8045];

    // Classic Yellow German Deutsche Post Briefkästen!
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
      this.addDynamicProp('postbox', 'Deutsche Post Briefkasten', g, new CANNON.Vec3(0.32, 0.72, 0.28), 16, new THREE.Vector3(px, 0.74, pz), 0, 550);
    }

    // Bavarian Biergarten Tables & Benches outside Gasthof Alter Wirt & Dorfplatz!
    const benchCoords: [number, number, number][] = [
      [17.5, -47.8, 0],
      [22.5, -47.8, 0],
      [27.5, -47.8, 0],
      [-11.8, -55.2, Math.PI / 2]
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
      this.addDynamicProp('bench', 'Biergarten Table', g, new CANNON.Vec3(1.1, 0.42, 0.8), 18, new THREE.Vector3(bx, 0.44, bz), rot, 450);
    }

    // Weekly Münsing Farmers' Market Stalls on Dorfplatz & by Bäckerei!
    const stallCoords: [number, number, number][] = [
      [-5.8, -56.8, -0.1],
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

      this.addDynamicProp('stall', 'Münsing Market Stall', g, new CANNON.Vec3(1.45, 1.15, 0.8), 26, new THREE.Vector3(sx, 1.18, sz), rot, 950);
    });
  }

  private buildCars(): void {
    const carConfigs: {
      name: string;
      color: number;
      pos: THREE.Vector3;
      rotY: number;
      isVan?: boolean;
      isPolizei?: boolean;
      cruiseDir?: number;
      cruiseZ?: number;
    }[] = [
      // Classic Bavarian White-and-Blue Polizei patrol car outside the Rathaus!
      { name: 'Bayerische Polizei Car', color: 0xf4f6f8, pos: new THREE.Vector3(9.4, 0.85, -72.5), rotY: 0, isPolizei: true },
      // Bright yellow Deutsche Post / DHL van parked near Bäckerei!
      { name: 'Deutsche Post Van', color: 0xf5c414, pos: new THREE.Vector3(-48, 1.05, -47.5), rotY: Math.PI / 2, isVan: true },
      // Parked village cars at EDEKA lot & village streets
      { name: 'Silver Bavarian Touring', color: 0xb6bec4, pos: new THREE.Vector3(46.5, 0.85, -52.0), rotY: Math.PI / 2 },
      { name: 'Red Compact', color: 0xc93126, pos: new THREE.Vector3(46.5, 0.85, -60.5), rotY: Math.PI / 2 },
      { name: 'Dark Blue Sedan', color: 0x244878, pos: new THREE.Vector3(-31.5, 0.85, -52.5), rotY: 0 },
      { name: 'Forest Green SUV', color: 0x2d5e3a, pos: new THREE.Vector3(10.5, 0.85, -48.5), rotY: -Math.PI / 2 },
      // Two cruising village cars driving gently along Hauptstraße!
      {
        name: 'White Hatchback',
        color: 0xeaece8,
        pos: new THREE.Vector3(-48, 0.85, -37.6),
        rotY: -Math.PI / 2,
        cruiseDir: 1,
        cruiseZ: -37.6
      },
      {
        name: 'Burgundy Estate',
        color: 0x7c222e,
        pos: new THREE.Vector3(45, 0.85, -42.4),
        rotY: Math.PI / 2,
        cruiseDir: -1,
        cruiseZ: -42.4
      }
    ];

    const glassMat = new THREE.MeshStandardMaterial({ color: 0x22323a, roughness: 0.16, metalness: 0.35 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x1e2022, roughness: 0.92 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xc8cfd4, roughness: 0.4, metalness: 0.6 });
    const headLight = new THREE.MeshStandardMaterial({ color: 0xfff4c2, emissive: 0xffe488, emissiveIntensity: 0.6 });
    const tailLight = new THREE.MeshStandardMaterial({ color: 0xcc2218, emissive: 0x660800 });
    const polizeiBlue = new THREE.MeshStandardMaterial({ color: 0x1362b8, roughness: 0.35 });
    const beaconBlue = new THREE.MeshStandardMaterial({ color: 0x29a6ff, emissive: 0x1388ff, emissiveIntensity: 1.1 });

    for (const cfg of carConfigs) {
      const g = new THREE.Group();
      const paint = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.32, metalness: 0.25 });
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

      for (const lx of [-0.62, 0.62]) {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.08), headLight);
        hl.position.set(lx, 0.02, -len * 0.5 - 0.02);
        g.add(hl);
        const tl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.08), tailLight);
        tl.position.set(lx, 0.04, len * 0.5 + 0.02);
        g.add(tl);
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
        48,
        cfg.pos,
        cfg.rotY,
        cfg.isPolizei ? 6500 : 4500
      );
      if (cfg.cruiseDir) {
        obj.cruiseDir = cfg.cruiseDir;
        obj.cruiseMinX = -76;
        obj.cruiseMaxX = 76;
        obj.cruiseZ = cfg.cruiseZ;
        obj.cruiseActive = true;
      }
    }
  }

  private buildDestructibleTreesAndLamps(): void {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4028, roughness: 0.95 });
    const leafDark = new THREE.MeshStandardMaterial({ color: 0x35622e, roughness: 0.9 });
    const leafBright = new THREE.MeshStandardMaterial({ color: 0x4b7e39, roughness: 0.88 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x262b2e, roughness: 0.5, metalness: 0.65 });
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffd570, emissiveIntensity: 0.7 });

    // Chestnut & spruce trees placed cleanly along Biergarten, churchyard & road verges (never inside roads!)
    const treeCoords: [number, number, boolean][] = [
      [14.5, -49.5, false], // Biergarten chestnut!
      [30.5, -49.5, false], // Biergarten chestnut!
      [-26, -53, false],
      [-32, -74, true],
      [-10, -76, false],
      [-15, -33.2, false],
      [16, -33.2, true],
      [30, -33.2, false],
      [-45, -33.2, true],
      [48, -33.2, false],
      [-46, -80, true],
      [48, -76, false]
    ];

    for (const [tx, tz, isPine] of treeCoords) {
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

      g.position.set(tx, 0, tz);
      this.scene.add(g);
      this.destructibles.push({
        kind: 'tree',
        label: isPine ? 'Bavarian Spruce' : 'Biergarten Chestnut',
        pos: new THREE.Vector3(tx, 0, tz),
        standingMesh: g,
        toppled: false,
        radius: 1.05,
        height: 5.5,
        valueGBP: 850
      });
    }

    // German Village Streetlamps along Hauptstraße & Weipertshausener Straße
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
    for (const [lx, lz] of lampCoords) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.12, 4.5, 8), ironMat);
      pole.position.y = 2.25;
      pole.castShadow = true;
      g.add(pole);

      const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.5, 0.38), bulbMat);
      lantern.position.y = 4.68;
      g.add(lantern);

      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.24, 6), ironMat);
      cap.position.y = 5.05;
      g.add(cap);

      g.position.set(lx, 0, lz);
      this.scene.add(g);
      this.destructibles.push({
        kind: 'lamp',
        label: 'Münsing Streetlamp',
        pos: new THREE.Vector3(lx, 0, lz),
        standingMesh: g,
        toppled: false,
        radius: 0.72,
        height: 4.8,
        valueGBP: 750
      });
    }
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
      [-64, -47.2],
      [58, -47.2]
    ];

    spots.forEach(([px, pz], idx) => {
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

      // Cute Bavarian Alpine hat!
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

      g.position.set(px, 0, pz);
      this.scene.add(g);

      this.pedestrians.push({
        group: g,
        leftLeg,
        rightLeg,
        leftArm,
        rightArm,
        pos: new THREE.Vector3(px, 0, pz),
        vel: new THREE.Vector3(),
        homePos: new THREE.Vector3(px, 0, pz),
        wanderAngle: Math.random() * Math.PI * 2,
        panicTimer: 0,
        tumbleTimer: 0,
        tumbleVel: new THREE.Vector3(),
        countedPanic: false,
        phase: Math.random() * 10
      });
    });
  }

  public scarePedestriansNear(origin: THREE.Vector3, radius: number): number {
    let newlyScared = 0;
    for (const p of this.pedestrians) {
      if (p.pos.distanceTo(origin) < radius) {
        p.panicTimer = Math.max(p.panicTimer, 4.5);
        if (!p.countedPanic) {
          p.countedPanic = true;
          newlyScared++;
        }
      }
    }
    return newlyScared;
  }

  private toppleDestructible(d: DestructibleStatic, impactPos: THREE.Vector3, impactSpeed: number): void {
    if (d.toppled) return;
    d.toppled = true;

    if (d.kind === 'tree') {
      const stump = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.4, 0.55, 8),
        new THREE.MeshStandardMaterial({ color: 0x624228, roughness: 0.95 })
      );
      stump.position.set(d.pos.x, 0.27, d.pos.z);
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
    body.position.set(d.pos.x, 0.55, d.pos.z);

    const push = Math.max(4.5, impactSpeed * 0.85);
    body.velocity.set(fallDir.x * push, 1.8, fallDir.z * push);
    body.angularVelocity.set(fallDir.z * 3.8, (Math.random() - 0.5) * 1.5, -fallDir.x * 3.8);
    this.world.addBody(body);

    const obj: DynamicVillageObj = {
      id: this.nextId++,
      kind: d.kind === 'lamp' ? 'lamp' : 'fallen_tree',
      label: d.kind === 'maibaum' ? 'Fallen Maibaum' : d.kind === 'tree' ? 'Toppled Tree' : 'Knocked Streetlamp',
      mesh: d.standingMesh,
      body,
      radius: 1.1,
      halfHeight: 0.5,
      heldByTractor: false,
      wrecked: true,
      valueGBP: d.valueGBP
    };
    this.objects.push(obj);

    this.callbacks.onChaosEvent('tree', d.label, d.valueGBP, d.pos.clone().add(new THREE.Vector3(0, 1.8, 0)));
  }

  public update(
    dt: number,
    elapsed: number,
    tractorPos: THREE.Vector3,
    tractorSpeed: number,
    tipPos: THREE.Vector3,
    tipSpeed: number,
    chaosMode: boolean
  ): void {
    for (const d of this.destructibles) {
      if (d.toppled) continue;
      const dChassis = Math.hypot(d.pos.x - tractorPos.x, d.pos.z - tractorPos.z);
      const dTip = Math.hypot(d.pos.x - tipPos.x, d.pos.z - tipPos.z);

      if (dChassis < d.radius + 1.55 && Math.abs(tractorSpeed) > 2.4) {
        this.toppleDestructible(d, tractorPos, Math.abs(tractorSpeed));
      } else if (dTip < d.radius + 1.2 && tipPos.y < d.height && tipSpeed > 3.0) {
        this.toppleDestructible(d, tipPos, tipSpeed);
      }
    }

    for (const o of this.objects) {
      if (o.kind === 'car' && o.cruiseActive && !o.heldByTractor && !o.wrecked) {
        const distToTractor = Math.hypot(o.body.position.x - tractorPos.x, o.body.position.z - tractorPos.z);
        const speedNow = o.body.velocity.length();
        const upVec = new CANNON.Vec3(0, 1, 0);
        o.body.quaternion.vmult(upVec, upVec);
        if (upVec.y < 0.85 || Math.abs(o.body.position.z - (o.cruiseZ ?? -40)) > 2.4 || speedNow > 8.5) {
          o.cruiseActive = false;
        } else if (distToTractor > 7.5) {
          o.body.wakeUp();
          const dir = o.cruiseDir ?? 1;
          const targetSpeed = 5.4;
          o.body.velocity.x += (dir * targetSpeed - o.body.velocity.x) * Math.min(1, dt * 3);
          o.body.velocity.z *= 0.88;
          o.body.quaternion.setFromEuler(0, dir > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
          if (o.body.position.x > (o.cruiseMaxX ?? 76)) o.cruiseDir = -1;
          if (o.body.position.x < (o.cruiseMinX ?? -76)) o.cruiseDir = 1;
        } else {
          o.body.velocity.x *= 0.85;
        }
      }

      if (!o.wrecked) {
        const upVec = new CANNON.Vec3(0, 1, 0);
        o.body.quaternion.vmult(upVec, upVec);
        const movedFast = o.body.velocity.length() > (o.kind === 'car' ? 5.2 : 3.4);
        const tiltedOver = upVec.y < 0.65;
        const liftedHigh = o.body.position.y > o.halfHeight + 1.2;

        if (movedFast || tiltedOver || liftedHigh || o.heldByTractor) {
          o.wrecked = true;
          o.cruiseActive = false;
          const pos = new THREE.Vector3(o.body.position.x, o.body.position.y + 0.8, o.body.position.z);
          this.callbacks.onChaosEvent(o.kind === 'car' ? 'car' : 'prop', o.label, o.valueGBP, pos);
        }
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

      const toTip = p.pos.clone().sub(tipPos);
      toTip.y = 0;
      const distTip = toTip.length();

      if (
        p.tumbleTimer <= 0 &&
        ((dist < 2.35 && Math.abs(tractorSpeed) > 1.2) || (distTip < 1.5 && tipSpeed > 2.2))
      ) {
        p.tumbleTimer = 1.25;
        p.panicTimer = 6.0;
        const pushDir = (dist < 2.35 ? toTractor : toTip).normalize();
        p.tumbleVel.set(pushDir.x * 7.5, 5.2, pushDir.z * 7.5);
        if (!p.countedPanic || chaosMode) {
          p.countedPanic = true;
          this.callbacks.onChaosEvent('ped', 'Startled Münsinger!', 250, p.pos.clone().add(new THREE.Vector3(0, 1.4, 0)));
        }
      }

      if (p.tumbleTimer > 0) {
        p.tumbleTimer -= dt;
        p.tumbleVel.y -= 16 * dt;
        p.pos.addScaledVector(p.tumbleVel, dt);
        if (p.pos.y < 0) {
          p.pos.y = 0;
          p.tumbleVel.y = Math.abs(p.tumbleVel.y) * 0.35;
          p.tumbleVel.x *= 0.72;
          p.tumbleVel.z *= 0.72;
        }
        p.group.position.copy(p.pos);
        p.group.rotation.x += dt * 9;
        p.group.rotation.z += dt * 7;
        continue;
      }

      p.pos.y = 0;
      p.group.rotation.x = 0;
      p.group.rotation.z = 0;

      if (dist < (chaosMode ? 12 : 7.5) && Math.abs(tractorSpeed) > 1.5) {
        p.panicTimer = Math.max(p.panicTimer, 3.2);
        if (!p.countedPanic) {
          p.countedPanic = true;
          this.callbacks.onChaosEvent('ped', 'Fleeing Villager', 150, p.pos.clone().add(new THREE.Vector3(0, 1.5, 0)));
        }
      }

      let moveSpeed = 1.35;
      if (p.panicTimer > 0) {
        p.panicTimer -= dt;
        moveSpeed = 5.6;
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
      p.pos.x = THREE.MathUtils.clamp(p.pos.x, -82, 82);
      p.pos.z = THREE.MathUtils.clamp(p.pos.z, -104, -26);

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
