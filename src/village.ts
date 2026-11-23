import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createPebbledashTexture, createStoneWallTexture } from './textures';

export interface DynamicVillageObj {
  id: number;
  kind: 'car' | 'bench' | 'phonebox' | 'postbox' | 'stall' | 'fallen_tree' | 'lamp';
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
  kind: 'tree' | 'lamp';
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
  onChaosEvent: (category: 'car' | 'tree' | 'prop' | 'ped', label: string, costGBP: number, pos: THREE.Vector3) => void;
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

    this.buildRoadsAndSquare(scene);
    this.buildCottagesAndPub(scene, world, groundMat);
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

  private buildRoadsAndSquare(scene: THREE.Scene): void {
    const asphalt = new THREE.MeshStandardMaterial({ color: 0x3b3f44, roughness: 0.92 });
    const pavement = new THREE.MeshStandardMaterial({ color: 0x9b968c, roughness: 0.94 });
    const dashMat = new THREE.MeshStandardMaterial({ color: 0xe6e4dc, roughness: 0.8 });

    // Main village High Street running East-West right outside the north farm gate (z = -38.5)
    const mainRoad = new THREE.Mesh(new THREE.PlaneGeometry(142, 9.6), asphalt);
    mainRoad.rotation.x = -Math.PI / 2;
    mainRoad.position.set(0, 0.025, -38.5);
    mainRoad.receiveShadow = true;
    scene.add(mainRoad);

    // Connecting farm drive apron through the open stone gate into the road
    const gateApron = new THREE.Mesh(new THREE.PlaneGeometry(11.5, 8.5), asphalt);
    gateApron.rotation.x = -Math.PI / 2;
    gateApron.position.set(0, 0.022, -31.5);
    gateApron.receiveShadow = true;
    scene.add(gateApron);

    // Side lane running North into the Village Green square (x = 18)
    const sideRoad = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 32), asphalt);
    sideRoad.rotation.x = -Math.PI / 2;
    sideRoad.position.set(18, 0.024, -56);
    sideRoad.receiveShadow = true;
    scene.add(sideRoad);

    // Cobblestone / paved Village Square & sidewalks
    const northWalk = new THREE.Mesh(new THREE.PlaneGeometry(138, 3.2), pavement);
    northWalk.rotation.x = -Math.PI / 2;
    northWalk.position.set(0, 0.032, -44.8);
    northWalk.receiveShadow = true;
    scene.add(northWalk);

    const villageSquare = new THREE.Mesh(new THREE.PlaneGeometry(30, 18), pavement);
    villageSquare.rotation.x = -Math.PI / 2;
    villageSquare.position.set(-4, 0.03, -55);
    villageSquare.receiveShadow = true;
    scene.add(villageSquare);

    // Grassy Village Green roundabout island with stone curb
    const greenCircle = new THREE.Mesh(
      new THREE.CylinderGeometry(5.8, 6.0, 0.16, 24),
      new THREE.MeshStandardMaterial({ color: 0x5c8942, roughness: 0.96 })
    );
    greenCircle.position.set(-4, 0.08, -55);
    greenCircle.receiveShadow = true;
    scene.add(greenCircle);

    // White road center dashes
    for (let x = -64; x <= 64; x += 6) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.22), dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.034, -38.5);
      scene.add(dash);
    }
  }

  private buildCottagesAndPub(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    const stoneMat = new THREE.MeshStandardMaterial({ map: createStoneWallTexture(), roughness: 0.94 });
    const pebbleMat = new THREE.MeshStandardMaterial({ map: createPebbledashTexture(), roughness: 0.92 });
    const slateRoof = new THREE.MeshStandardMaterial({ color: 0x393f45, roughness: 0.78 });
    const warmWindow = new THREE.MeshStandardMaterial({
      color: 0xffdfa0,
      emissive: 0x7d4f18,
      emissiveIntensity: 0.35
    });
    const doorColors = [0x2a5738, 0x8f2c24, 0x2c4a6e, 0x6b4528];

    // Row of classic Yorkshire stone cottages across the road (matching the cottages in the user's photo!)
    const cottageSpecs: [number, number, number, number, number, boolean][] = [
      [-48, -50, 9.5, 5.2, 7.2, false],
      [-37, -50, 9.0, 5.0, 7.2, true],
      [-26, -50, 9.5, 5.4, 7.2, false],
      [34, -50, 10.0, 5.2, 7.5, true],
      [46, -50, 9.5, 5.0, 7.5, false],
      [-22, -67, 10.0, 5.2, 7.5, false],
      [-4, -68, 12.0, 5.6, 8.0, true]
    ];

    cottageSpecs.forEach(([cx, cz, w, h, d, usePebble], idx) => {
      const mat = usePebble ? pebbleMat : stoneMat;
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      body.position.set(cx, h * 0.5, cz);
      body.castShadow = true;
      body.receiveShadow = true;
      scene.add(body);
      this.addStaticBox(world, groundMat, cx, h * 0.5, cz, w, h, d);

      // Pitched slate roof
      const slopeLen = Math.hypot(d * 0.56, 2.2);
      const slopeAng = Math.atan2(2.2, d * 0.56);
      for (const s of [-1, 1]) {
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.22, slopeLen), slateRoof);
        roof.position.set(cx, h + 1.05, cz + s * (d * 0.27));
        roof.rotation.x = s * slopeAng;
        roof.castShadow = true;
        scene.add(roof);
      }

      // Chimney stack
      const chim = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.8, 0.9), stoneMat);
      chim.position.set(cx + w * 0.3, h + 2.2, cz);
      chim.castShadow = true;
      scene.add(chim);

      // Front door & cozy lit cottage windows facing south (+Z)
      const door = new THREE.Mesh(
        new THREE.BoxGeometry(1.15, 2.15, 0.14),
        new THREE.MeshStandardMaterial({ color: doorColors[idx % doorColors.length], roughness: 0.7 })
      );
      door.position.set(cx, 1.08, cz + d * 0.5 + 0.04);
      scene.add(door);

      for (const wx of [-w * 0.28, w * 0.28]) {
        for (const wy of [1.7, 3.6]) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.15, 0.12), warmWindow);
          win.position.set(cx + wx, wy, cz + d * 0.5 + 0.04);
          scene.add(win);
        }
      }
    });

    // === "THE GREEN TRACTOR ARMS" Village Pub (East of Village Square!) ===
    const px = 42;
    const pz = -26;
    const pubBody = new THREE.Mesh(new THREE.BoxGeometry(11.5, 6.2, 10.5), new THREE.MeshStandardMaterial({ color: 0xe6decb, roughness: 0.88 }));
    pubBody.position.set(px, 3.1, pz);
    pubBody.castShadow = true;
    pubBody.receiveShadow = true;
    scene.add(pubBody);
    this.addStaticBox(world, groundMat, px, 3.1, pz, 11.5, 6.2, 10.5);

    for (const s of [-1, 1]) {
      const roof = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.24, 11.4), slateRoof);
      roof.position.set(px + s * 3.1, 7.2, pz);
      roof.rotation.z = -s * 0.42;
      roof.castShadow = true;
      scene.add(roof);
    }

    // Pub painted signboard
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 512;
    signCanvas.height = 128;
    const ctx = signCanvas.getContext('2d')!;
    ctx.fillStyle = '#1f3a25';
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, 500, 116);
    ctx.fillStyle = '#f8f2d8';
    ctx.font = 'bold 38px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('THE SCORPION ARMS', 256, 62);
    ctx.fillStyle = '#a2d730';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('VILLAGE PUB & ALEHOUSE', 256, 98);

    const signTex = new THREE.CanvasTexture(signCanvas);
    signTex.colorSpace = THREE.SRGBColorSpace;
    const pubSign = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 1.45, 5.6),
      new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6 })
    );
    pubSign.position.set(px - 5.82, 4.3, pz);
    scene.add(pubSign);
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
    const redMat = new THREE.MeshStandardMaterial({ color: 0xc9251e, roughness: 0.38, metalness: 0.25 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xaad4eb, roughness: 0.18, transparent: true, opacity: 0.55 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x7e5732, roughness: 0.9 });
    const clothColors = [0xd6432b, 0x2d6da3, 0x3b8045];

    // Classic British Red Telephone Box on the Village Green!
    const buildPhoneBox = (x: number, z: number) => {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.35, 1.1), redMat);
      base.castShadow = true;
      g.add(base);
      const pane = new THREE.Mesh(new THREE.BoxGeometry(1.14, 1.45, 0.8), glassMat);
      pane.position.y = 0.12;
      g.add(pane);
      const pane2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.45, 1.14), glassMat);
      pane2.position.y = 0.12;
      g.add(pane2);
      const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.58, 0.25, 10), redMat);
      dome.position.y = 1.28;
      g.add(dome);
      this.addDynamicProp('phonebox', 'Red Telephone Box', g, new CANNON.Vec3(0.55, 1.22, 0.55), 34, new THREE.Vector3(x, 1.24, z), 0, 1200);
    };
    buildPhoneBox(-11.5, -45.2);
    buildPhoneBox(25.5, -44.8);

    // Classic Red Royal Mail Postboxes!
    for (const [px, pz] of [[-21, -44.2], [35, -32.2]]) {
      const g = new THREE.Group();
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 1.4, 12), redMat);
      cyl.castShadow = true;
      g.add(cyl);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.14, 12), redMat);
      cap.position.y = 0.74;
      g.add(cap);
      this.addDynamicProp('postbox', 'Royal Mail Postbox', g, new CANNON.Vec3(0.35, 0.75, 0.35), 22, new THREE.Vector3(px, 0.76, pz), 0, 650);
    }

    // Pub Picnic Benches outside The Scorpion Arms & Village Green!
    const benchCoords: [number, number, number][] = [
      [33.8, -28.5, 0],
      [33.8, -23.5, 0],
      [-11, -55, Math.PI / 2],
      [3.5, -55, Math.PI / 2]
    ];
    for (const [bx, bz, rot] of benchCoords) {
      const g = new THREE.Group();
      const top = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.12, 0.92), woodMat);
      top.position.y = 0.38;
      top.castShadow = true;
      g.add(top);
      for (const sz of [-0.72, 0.72]) {
        const seat = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.1, 0.34), woodMat);
        seat.position.set(0, 0.06, sz);
        seat.castShadow = true;
        g.add(seat);
      }
      for (const sx of [-0.75, 0.75]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.72, 1.45), woodMat);
        leg.position.set(sx, 0.02, 0);
        leg.castShadow = true;
        g.add(leg);
      }
      this.addDynamicProp('bench', 'Pub Picnic Bench', g, new CANNON.Vec3(1.05, 0.44, 0.85), 18, new THREE.Vector3(bx, 0.46, bz), rot, 450);
    }

    // Village Market Stalls around the square (super fun to smash through!)
    const stallCoords: [number, number, number][] = [
      [-14, -60, 0.2],
      [6, -61, -0.15],
      [27, -55, -Math.PI / 2]
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

      this.addDynamicProp('stall', 'Village Market Stall', g, new CANNON.Vec3(1.45, 1.15, 0.8), 26, new THREE.Vector3(sx, 1.18, sz), rot, 950);
    });
  }

  private buildCars(): void {
    const carConfigs: {
      name: string;
      color: number;
      pos: THREE.Vector3;
      rotY: number;
      isVan?: boolean;
      cruiseDir?: number;
      cruiseZ?: number;
    }[] = [
      { name: 'Blue Hatchback', color: 0x2c6eb5, pos: new THREE.Vector3(-28, 0.85, -42.2), rotY: Math.PI / 2 },
      { name: 'Red Compact', color: 0xc93126, pos: new THREE.Vector3(31, 0.85, -34.2), rotY: -Math.PI / 2 },
      { name: 'Yellow Mini', color: 0xe6b822, pos: new THREE.Vector3(11.5, 0.85, -52.5), rotY: 0 },
      { name: 'White Delivery Van', color: 0xedece6, pos: new THREE.Vector3(44, 1.05, -42.5), rotY: Math.PI / 2, isVan: true },
      // Two cruising village cars driving gently along the High Street!
      {
        name: 'Silver Estate Car',
        color: 0xaab2b8,
        pos: new THREE.Vector3(-35, 0.85, -36.4),
        rotY: Math.PI / 2,
        cruiseDir: 1,
        cruiseZ: -36.4
      },
      {
        name: 'Green Country Rover',
        color: 0x2d5e3a,
        pos: new THREE.Vector3(38, 0.85, -40.6),
        rotY: -Math.PI / 2,
        cruiseDir: -1,
        cruiseZ: -40.6
      }
    ];

    const glassMat = new THREE.MeshStandardMaterial({ color: 0x22323a, roughness: 0.16, metalness: 0.35 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x1e2022, roughness: 0.92 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xc8cfd4, roughness: 0.4, metalness: 0.6 });
    const headLight = new THREE.MeshStandardMaterial({ color: 0xfff4c2, emissive: 0xffe488, emissiveIntensity: 0.6 });
    const tailLight = new THREE.MeshStandardMaterial({ color: 0xcc2218, emissive: 0x660800 });

    for (const cfg of carConfigs) {
      const g = new THREE.Group();
      const paint = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.32, metalness: 0.25 });
      const len = cfg.isVan ? 4.4 : 3.8;
      const bodyH = cfg.isVan ? 1.05 : 0.72;

      // Lower car body (oriented along -Z forward)
      const lower = new THREE.Mesh(new THREE.BoxGeometry(1.78, bodyH, len), paint);
      lower.position.y = -0.08;
      lower.castShadow = true;
      lower.receiveShadow = true;
      g.add(lower);

      // Cabin greenhouse
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

      // Headlights & Taillights
      for (const lx of [-0.62, 0.62]) {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.08), headLight);
        hl.position.set(lx, 0.02, -len * 0.5 - 0.02);
        g.add(hl);
        const tl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.08), tailLight);
        tl.position.set(lx, 0.04, len * 0.5 + 0.02);
        g.add(tl);
      }

      // 4 Wheels
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
        4500
      );
      if (cfg.cruiseDir) {
        obj.cruiseDir = cfg.cruiseDir;
        obj.cruiseMinX = -58;
        obj.cruiseMaxX = 58;
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

    // Destructible roadside & village trees! (Hit 'em hard with the Scorpion and they SNAP & FALL!)
    const treeCoords: [number, number, boolean][] = [
      [-17, -33.2, false],
      [14, -33.2, true],
      [-32, -33.2, false],
      [28, -33.2, true],
      [-4, -55, false], // Big centerpiece oak on the Village Green!
      [-18, -56, true],
      [12, -62, false],
      [34, -17, false],
      [40, -10, true],
      [-35, -24, true],
      [35, 16, false],
      [-36, 8, false]
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
        label: isPine ? 'Village Pine Tree' : 'Village Oak Tree',
        pos: new THREE.Vector3(tx, 0, tz),
        standingMesh: g,
        toppled: false,
        radius: 1.05,
        height: 5.5,
        valueGBP: 850
      });
    }

    // Cast-iron Village Streetlamps along the High Street!
    const lampCoords: [number, number][] = [
      [-38, -43.8],
      [-16, -43.8],
      [8, -43.8],
      [28, -43.8],
      [48, -43.8],
      [13.5, -58]
    ];
    for (const [lx, lz] of lampCoords) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, 4.4, 8), ironMat);
      pole.position.y = 2.2;
      pole.castShadow = true;
      g.add(pole);

      const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.52, 0.38), bulbMat);
      lantern.position.y = 4.6;
      g.add(lantern);

      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.25, 6), ironMat);
      cap.position.y = 4.98;
      g.add(cap);

      g.position.set(lx, 0, lz);
      this.scene.add(g);
      this.destructibles.push({
        kind: 'lamp',
        label: 'Cast-Iron Streetlamp',
        pos: new THREE.Vector3(lx, 0, lz),
        standingMesh: g,
        toppled: false,
        radius: 0.75,
        height: 4.8,
        valueGBP: 750
      });
    }
  }

  private buildPedestrians(): void {
    const jacketColors = [0xc9422c, 0x2d6aa3, 0xdba624, 0x3a7a47, 0x7b4785, 0x5c6870];
    const trouserMat = new THREE.MeshStandardMaterial({ color: 0x2e3640, roughness: 0.9 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf2c59d, roughness: 0.75 });

    const spots: [number, number][] = [
      [-34, -44.8],
      [-22, -45.2],
      [-8, -45.0],
      [4, -44.6],
      [16, -44.9],
      [30, -45.1],
      [-10, -56.5],
      [2, -58.0],
      [-2, -49.5],
      [33, -25.5],
      [21, -55.0],
      [-42, -44.8]
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

      // Cute flat cap / beanie
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.09, 10), trouserMat);
      hat.position.y = 1.71;
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

    // Leave a cute wood stump behind for trees!
    if (d.kind === 'tree') {
      const stump = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.4, 0.55, 8),
        new THREE.MeshStandardMaterial({ color: 0x624228, roughness: 0.95 })
      );
      stump.position.set(d.pos.x, 0.27, d.pos.z);
      stump.castShadow = true;
      this.scene.add(stump);
    }

    // Convert the standing mesh into a live falling Cannon physics body!
    const fallDir = d.pos.clone().sub(impactPos);
    fallDir.y = 0;
    if (fallDir.lengthSq() < 0.01) fallDir.set(1, 0, 0);
    fallDir.normalize();

    const body = new CANNON.Body({
      mass: d.kind === 'tree' ? 28 : 16,
      material: this.propMat,
      linearDamping: 0.22,
      angularDamping: 0.28
    });
    const halfH = d.height * 0.45;
    body.addShape(new CANNON.Box(new CANNON.Vec3(0.45, halfH, 0.45)), new CANNON.Vec3(0, halfH, 0));
    body.position.set(d.pos.x, 0.55, d.pos.z);

    // Kick it over in the impact direction!
    const push = Math.max(4.5, impactSpeed * 0.85);
    body.velocity.set(fallDir.x * push, 1.8, fallDir.z * push);
    body.angularVelocity.set(fallDir.z * 3.8, (Math.random() - 0.5) * 1.5, -fallDir.x * 3.8);
    this.world.addBody(body);

    const obj: DynamicVillageObj = {
      id: this.nextId++,
      kind: d.kind === 'tree' ? 'fallen_tree' : 'lamp',
      label: d.kind === 'tree' ? 'Toppled Tree' : 'Knocked Streetlamp',
      mesh: d.standingMesh,
      body,
      radius: 1.1,
      halfHeight: 0.5,
      heldByTractor: false,
      wrecked: true,
      valueGBP: d.valueGBP
    };
    this.objects.push(obj);

    this.callbacks.onChaosEvent('tree', d.label, d.valueGBP, d.pos.clone().add(new THREE.Vector3(0, 1.6, 0)));
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
    // 1. Check destructible trees & streetlamps against tractor chassis & boom tip!
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

    // 2. Sync dynamic village cars & props + cruise village traffic!
    for (const o of this.objects) {
      // Gentle cruising cars along the village High Street (until bumped, lifted, or knocked off-line!)
      if (o.kind === 'car' && o.cruiseActive && !o.heldByTractor && !o.wrecked) {
        const distToTractor = Math.hypot(o.body.position.x - tractorPos.x, o.body.position.z - tractorPos.z);
        const speedNow = o.body.velocity.length();
        // Check if bumped off course or tilted
        const upVec = new CANNON.Vec3(0, 1, 0);
        o.body.quaternion.vmult(upVec, upVec);
        if (upVec.y < 0.85 || Math.abs(o.body.position.z - (o.cruiseZ ?? -38)) > 2.4 || speedNow > 8.5) {
          o.cruiseActive = false;
        } else if (distToTractor > 7.5) {
          o.body.wakeUp();
          const dir = o.cruiseDir ?? 1;
          const targetSpeed = 5.2;
          o.body.velocity.x += (dir * targetSpeed - o.body.velocity.x) * Math.min(1, dt * 3);
          o.body.velocity.z *= 0.88;
          o.body.quaternion.setFromEuler(0, dir > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
          if (o.body.position.x > (o.cruiseMaxX ?? 58)) o.cruiseDir = -1;
          if (o.body.position.x < (o.cruiseMinX ?? -58)) o.cruiseDir = 1;
        } else {
          // Politely brake if the huge CLAAS Scorpion is blocking the road!
          o.body.velocity.x *= 0.85;
        }
      }

      // Detect newly wrecked / flipped / airborne village cars & props for Chaos scoring!
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

    // 3. Animate charming village pedestrians (stroll normally, flee & slapstick-tumble in panic!)
    for (const p of this.pedestrians) {
      const toTractor = p.pos.clone().sub(tractorPos);
      toTractor.y = 0;
      const dist = toTractor.length();

      const toTip = p.pos.clone().sub(tipPos);
      toTip.y = 0;
      const distTip = toTip.length();

      // Playful slapstick tumble if bumped by the Scorpion or swinging boom!
      if (p.tumbleTimer <= 0 && ((dist < 2.35 && Math.abs(tractorSpeed) > 1.2) || (distTip < 1.5 && tipSpeed > 2.2))) {
        p.tumbleTimer = 1.25;
        p.panicTimer = 6.0;
        const pushDir = (dist < 2.35 ? toTractor : toTip).normalize();
        p.tumbleVel.set(pushDir.x * 7.5, 5.2, pushDir.z * 7.5);
        if (!p.countedPanic || chaosMode) {
          p.countedPanic = true;
          this.callbacks.onChaosEvent('ped', 'Startled Villager!', 250, p.pos.clone().add(new THREE.Vector3(0, 1.4, 0)));
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

      // Upright again!
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
        p.wanderAngle += (Math.sin(elapsed * 0.7 + p.phase) * 0.8) * dt;
        const backHome = p.homePos.clone().sub(p.pos);
        if (backHome.length() > 8.5) {
          p.wanderAngle = Math.atan2(backHome.x, backHome.z);
        }
        p.vel.set(Math.sin(p.wanderAngle) * moveSpeed, 0, Math.cos(p.wanderAngle) * moveSpeed);
      }

      p.pos.addScaledVector(p.vel, dt);
      p.pos.x = THREE.MathUtils.clamp(p.pos.x, -62, 62);
      p.pos.z = THREE.MathUtils.clamp(p.pos.z, -65, -24);

      p.group.position.copy(p.pos);
      if (p.vel.lengthSq() > 0.04) {
        p.group.rotation.y = Math.atan2(p.vel.x, p.vel.z);
      }

      const stride = Math.sin(elapsed * (p.panicTimer > 0 ? 18 : 6.5) + p.phase);
      p.leftLeg.rotation.x = stride * 0.65;
      p.rightLeg.rotation.x = -stride * 0.65;
      if (p.panicTimer > 0) {
        // Wave arms overhead in hilarious cartoon panic!
        p.leftArm.rotation.x = -2.6 + stride * 0.45;
        p.rightArm.rotation.x = -2.6 - stride * 0.45;
      } else {
        p.leftArm.rotation.x = -stride * 0.4;
        p.rightArm.rotation.x = stride * 0.4;
      }
    }
  }
}
