import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
  createBarnWoodTexture,
  createConcreteTexture,
  createCorrugatedMetalTexture,
  createDetailBumpTexture,
  createFarmGroundTexture,
  createHayTexture,
  createMeadowDetailTexture,
  createPebbledashTexture,
  createStoneWallTexture,
  createWrappedSilageTexture
} from './textures';
import {
  buildRealMuensingTerrain,
  FARM_CENTER,
  FARM_GROUND_Y,
  WORLD_MAX_X,
  WORLD_MAX_Z,
  WORLD_MIN_X,
  WORLD_MIN_Z
} from './terrain';
import { ZoneKey } from './props';

export interface TidyZone {
  key: ZoneKey;
  title: string;
  center: THREE.Vector3;
  halfSize: THREE.Vector2;
  minY: number;
  hintMesh: THREE.Group;
}

export interface RackSpot {
  tool: 'forks' | 'spike' | 'grabber' | 'grapple' | 'bucket';
  label: string;
  pos: THREE.Vector3;
  standMesh: THREE.Group;
  ringMesh: THREE.Mesh;
}

export class FarmEnvironment {
  public zones: TidyZone[] = [];
  public rackSpots: RackSpot[] = [];
  public pondCenter = new THREE.Vector3(FARM_CENTER.x + 12, FARM_GROUND_Y, FARM_CENTER.z + 21);
  public pondRadius = 4.9;
  public trailerDeckY = FARM_GROUND_Y + 1.02;
  public lakeWaterMesh!: THREE.Mesh;

  private ox = FARM_CENTER.x;
  private oy = FARM_GROUND_Y;
  private oz = FARM_CENTER.z;
  private windmillBlades!: THREE.Group;
  private ducks: { group: THREE.Group; angle: number; radius: number; speed: number }[] = [];
  private hintsVisible = false;

  constructor(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material) {
    this.buildTerrainAndApron(scene, world, groundMat);
    this.buildBoundaries(scene, world, groundMat);
    this.buildHayBarn(scene, world, groundMat);
    this.buildSilageClamp(scene, world, groundMat);
    this.buildFlatbedTrailer(scene, world, groundMat);
    this.buildFarmShopAndProduceBin(scene, world, groundMat);
    this.buildFirewoodLogRack(scene, world, groundMat);
    this.buildScrapSkip(scene, world, groundMat);
    this.buildWorkshopAndToolShed(scene, world, groundMat);
    this.buildDuckPond(scene);
    this.buildWindmill(scene);
  }

  public setHintsVisible(show: boolean): void {
    this.hintsVisible = show;
    for (const z of this.zones) {
      z.hintMesh.visible = show;
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

  private registerZone(
    scene: THREE.Scene,
    key: ZoneKey,
    title: string,
    center: THREE.Vector3,
    w: number,
    d: number,
    minY: number,
    color: number
  ): void {
    const hintGroup = new THREE.Group();
    const borderGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.14, d));
    const border = new THREE.LineSegments(borderGeo, new THREE.LineBasicMaterial({ color }));
    border.position.set(center.x, minY + 0.12, center.z);
    hintGroup.add(border);

    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 4.2, 10),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32 })
    );
    pillar.position.set(center.x, minY + 2.2, center.z);
    hintGroup.add(pillar);

    hintGroup.visible = this.hintsVisible;
    scene.add(hintGroup);

    this.zones.push({
      key,
      title,
      center: center.clone(),
      halfSize: new THREE.Vector2(w * 0.5, d * 0.5),
      minY,
      hintMesh: hintGroup
    });
  }

  private buildTerrainAndApron(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    const detailBump = createDetailBumpTexture();
    const meadowTex = createMeadowDetailTexture();
    const { waterMesh } = buildRealMuensingTerrain(scene, world, groundMat, detailBump, meadowTex);
    this.lakeWaterMesh = waterMesh;

    // Wimpasing Home Farmyard gravel/concrete courtyard cleanly seated on the carved flat terrace
    const groundTex = createFarmGroundTexture();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(64, 62),
      new THREE.MeshStandardMaterial({
        map: groundTex,
        bumpMap: detailBump,
        bumpScale: 0.08,
        roughness: 0.94,
        metalness: 0.02
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(this.ox, this.oy + 0.04, this.oz);
    ground.receiveShadow = true;
    scene.add(ground);
  }

  private buildBoundaries(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    const stoneTex = createStoneWallTexture();
    const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.95 });
    const copeMat = new THREE.MeshStandardMaterial({ color: 0x857f75, roughness: 0.93 });

    // South dry-stone wall facing Münsinger Straße with wide open farm gate (x = ox - 7..ox + 7)!
    const wallZ = this.oz + 30;
    for (const [dx, ww] of [
      [-19.5, 25],
      [19.5, 25]
    ]) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(ww, 1.5, 0.95), stoneMat);
      seg.position.set(this.ox + dx, this.oy + 0.75, wallZ);
      seg.castShadow = true;
      seg.receiveShadow = true;
      scene.add(seg);
      const cope = new THREE.Mesh(new THREE.BoxGeometry(ww + 0.15, 0.22, 1.12), copeMat);
      cope.position.set(this.ox + dx, this.oy + 1.58, wallZ);
      scene.add(cope);
      this.addStaticBox(world, groundMat, this.ox + dx, this.oy + 1.0, wallZ, ww, 2.0, 1.1);
    }

    for (const gx of [-7, 7]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.2, 1.15), stoneMat);
      post.position.set(this.ox + gx, this.oy + 1.1, wallZ);
      post.castShadow = true;
      scene.add(post);
    }

    // Timber post-and-rail fencing on North & East (West has an open lane into Wimpasing!)
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x7c5a37, roughness: 0.92 });
    const sides = [
      { x1: this.ox - 32, z1: this.oz - 30, x2: this.ox + 32, z2: this.oz - 30 },
      { x1: this.ox + 32, z1: this.oz - 30, x2: this.ox + 32, z2: this.oz + 30 }
    ];
    for (const s of sides) {
      const dx = s.x2 - s.x1;
      const dz = s.z2 - s.z1;
      const len = Math.hypot(dx, dz);
      const angle = Math.atan2(dx, dz);
      const posts = Math.floor(len / 4);
      for (let i = 0; i <= posts; i++) {
        const t = i / posts;
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.4, 0.22), woodMat);
        post.position.set(s.x1 + dx * t, this.oy + 0.7, s.z1 + dz * t);
        post.castShadow = true;
        scene.add(post);
      }
      for (const ry of [0.52, 1.06]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, len), woodMat);
        rail.position.set((s.x1 + s.x2) * 0.5, this.oy + ry, (s.z1 + s.z2) * 0.5);
        rail.rotation.y = angle;
        scene.add(rail);
      }
    }

    // Outer world safety perimeter matching the full real OSM Münsing–Ammerland–Weipertshausen map
    const wX = WORLD_MAX_X - WORLD_MIN_X;
    const wZ = WORLD_MAX_Z - WORLD_MIN_Z;
    const cX = (WORLD_MIN_X + WORLD_MAX_X) * 0.5;
    const cZ = (WORLD_MIN_Z + WORLD_MAX_Z) * 0.5;
    this.addStaticBox(world, groundMat, cX, 20, WORLD_MIN_Z - 4, wX, 60, 4);
    this.addStaticBox(world, groundMat, cX, 20, WORLD_MAX_Z + 4, wX, 60, 4);
    this.addStaticBox(world, groundMat, WORLD_MIN_X - 4, 20, cZ, 4, 60, wZ);
    this.addStaticBox(world, groundMat, WORLD_MAX_X + 4, 20, cZ, 4, 60, wZ);
  }

  private buildHayBarn(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    const cx = this.ox + 11.2;
    const cz = this.oz - 21;
    const y = this.oy;
    const w = 11.4;
    const d = 8.4;
    const h = 5.8;

    const barnWood = new THREE.MeshStandardMaterial({ map: createBarnWoodTexture(), roughness: 0.88 });
    const roofMetal = new THREE.MeshStandardMaterial({
      map: createCorrugatedMetalTexture(),
      roughness: 0.62,
      metalness: 0.35
    });
    const timber = new THREE.MeshStandardMaterial({ color: 0x6b4b2b, roughness: 0.92 });

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.6, 0.14, d + 0.6),
      new THREE.MeshStandardMaterial({ map: createConcreteTexture(), roughness: 0.94 })
    );
    floor.position.set(cx, y + 0.05, cz);
    floor.receiveShadow = true;
    scene.add(floor);

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.4), barnWood);
    backWall.position.set(cx, y + h * 0.5, cz - d * 0.5);
    backWall.castShadow = true;
    scene.add(backWall);
    this.addStaticBox(world, groundMat, cx, y + h * 0.5, cz - d * 0.5, w, h, 0.5);

    for (const s of [-1, 1]) {
      const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.4, h, d), barnWood);
      sideWall.position.set(cx + s * (w * 0.5), y + h * 0.5, cz);
      sideWall.castShadow = true;
      scene.add(sideWall);
      this.addStaticBox(world, groundMat, cx + s * (w * 0.5), y + h * 0.5, cz, 0.5, h, d);
    }

    const roofLen = Math.hypot(w * 0.56, 2.6);
    const roofAngle = Math.atan2(2.6, w * 0.56);
    for (const s of [-1, 1]) {
      const slope = new THREE.Mesh(new THREE.BoxGeometry(roofLen, 0.2, d + 1.5), roofMetal);
      slope.position.set(cx + s * (w * 0.27), y + h + 1.2, cz);
      slope.rotation.z = -s * roofAngle;
      slope.castShadow = true;
      scene.add(slope);
    }

    const lintel = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.36, 0.34), timber);
    lintel.position.set(cx, y + h - 0.15, cz + d * 0.5);
    scene.add(lintel);

    const hayMat = new THREE.MeshStandardMaterial({ map: createHayTexture(), roughness: 0.94 });
    for (const [bx, bz] of [
      [cx + 3.4, cz - 2.3],
      [cx + 1.4, cz - 2.3]
    ]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 1.38, 16), hayMat);
      b.rotation.z = Math.PI / 2;
      b.position.set(bx, y + 0.92, bz);
      b.castShadow = true;
      scene.add(b);
      this.addStaticBox(world, groundMat, bx, y + 0.92, bz, 1.4, 1.6, 1.6);
    }

    this.registerZone(scene, 'hay', 'Hay Barn', new THREE.Vector3(cx, y, cz + 0.3), w - 1.0, d - 1.0, y, 0xf2b705);
  }

  private buildSilageClamp(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    const cx = this.ox - 13.5;
    const cz = this.oz - 21;
    const y = this.oy;
    const w = 10.6;
    const d = 8.4;
    const wallH = 2.05;

    const concreteMat = new THREE.MeshStandardMaterial({ map: createConcreteTexture(), roughness: 0.92 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.14, d + 0.8), concreteMat);
    slab.position.set(cx, y + 0.05, cz);
    slab.receiveShadow = true;
    scene.add(slab);

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, 0.45), concreteMat);
    backWall.position.set(cx, y + wallH * 0.5, cz - d * 0.5);
    backWall.castShadow = true;
    scene.add(backWall);
    this.addStaticBox(world, groundMat, cx, y + wallH * 0.5, cz - d * 0.5, w, wallH, 0.5);

    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.45, wallH, d), concreteMat);
      side.position.set(cx + s * (w * 0.5), y + wallH * 0.5, cz);
      side.castShadow = true;
      scene.add(side);
      this.addStaticBox(world, groundMat, cx + s * (w * 0.5), y + wallH * 0.5, cz, 0.5, wallH, d);
    }

    const whiteMat = new THREE.MeshStandardMaterial({ map: createWrappedSilageTexture('white', false), roughness: 0.24 });
    const mintMat = new THREE.MeshStandardMaterial({ map: createWrappedSilageTexture('mint', false), roughness: 0.24 });
    [
      [cx - 3.2, y + 0.82, cz - 2.6, whiteMat],
      [cx - 1.3, y + 0.82, cz - 2.6, mintMat]
    ].forEach(([bx, by, bz, m]) => {
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 1.35, 18), m as THREE.Material);
      cyl.position.set(bx as number, by as number, bz as number);
      cyl.castShadow = true;
      scene.add(cyl);
      this.addStaticBox(world, groundMat, bx as number, by as number, bz as number, 1.65, 1.5, 1.65);
    });

    this.registerZone(scene, 'silage', 'Silage Clamp', new THREE.Vector3(cx, y, cz + 0.4), w - 1.0, d - 1.0, y, 0xc8f2b6);
  }

  private buildFlatbedTrailer(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    const cx = this.ox + 19.2;
    const cz = this.oz - 5.5;
    const y = this.oy;
    const deckW = 3.6;
    const deckL = 8.4;
    const deckY = this.trailerDeckY;

    const steelMat = new THREE.MeshStandardMaterial({ color: 0x354b63, roughness: 0.55, metalness: 0.42 });
    const plankMat = new THREE.MeshStandardMaterial({ color: 0x7d5d3b, roughness: 0.9 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x222426, roughness: 0.92 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xd9d4c7, roughness: 0.45 });

    const deck = new THREE.Mesh(new THREE.BoxGeometry(deckW, 0.16, deckL), plankMat);
    deck.position.set(cx, deckY - 0.08, cz);
    deck.castShadow = true;
    deck.receiveShadow = true;
    scene.add(deck);
    this.addStaticBox(world, groundMat, cx, deckY - 0.12, cz, deckW, 0.24, deckL);

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(deckW - 0.4, 0.24, deckL - 0.3), steelMat);
    chassis.position.set(cx, deckY - 0.28, cz);
    scene.add(chassis);

    const headboard = new THREE.Mesh(new THREE.BoxGeometry(deckW, 1.35, 0.16), steelMat);
    headboard.position.set(cx, deckY + 0.68, cz - deckL * 0.5 + 0.08);
    headboard.castShadow = true;
    scene.add(headboard);
    this.addStaticBox(world, groundMat, cx, deckY + 0.68, cz - deckL * 0.5 + 0.08, deckW, 1.35, 0.24);

    for (const wz of [-1.8, 0.2, 2.2]) {
      for (const wx of [-1.45, 1.45]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.34, 14), tireMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(cx + wx, y + 0.46, cz + wz);
        scene.add(wheel);
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.36, 10), rimMat);
        rim.rotation.z = Math.PI / 2;
        rim.position.set(cx + wx, y + 0.46, cz + wz);
        scene.add(rim);
      }
    }

    const drawbar = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 2.2), steelMat);
    drawbar.position.set(cx, y + 0.56, cz + deckL * 0.5 + 1.0);
    scene.add(drawbar);

    this.registerZone(scene, 'crates', 'Flatbed Trailer', new THREE.Vector3(cx, y, cz), deckW + 0.3, deckL + 0.2, deckY, 0x3898ec);
  }

  private buildFarmShopAndProduceBin(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    const shopX = this.ox + 23.5;
    const shopZ = this.oz + 14;
    const y = this.oy;
    const stoneMat = new THREE.MeshStandardMaterial({ map: createPebbledashTexture(), roughness: 0.92 });
    const slateRoof = new THREE.MeshStandardMaterial({ color: 0x3a4046, roughness: 0.78 });
    const timber = new THREE.MeshStandardMaterial({ color: 0x7c5532, roughness: 0.9 });

    const shopBody = new THREE.Mesh(new THREE.BoxGeometry(6.8, 4.4, 8.8), stoneMat);
    shopBody.position.set(shopX, y + 2.2, shopZ);
    shopBody.castShadow = true;
    scene.add(shopBody);
    this.addStaticBox(world, groundMat, shopX, y + 2.2, shopZ, 6.8, 4.4, 8.8);

    for (const s of [-1, 1]) {
      const roof = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.22, 9.4), slateRoof);
      roof.position.set(shopX + s * 1.75, y + 5.15, shopZ);
      roof.rotation.z = -s * 0.42;
      roof.castShadow = true;
      scene.add(roof);
    }

    const bx = this.ox + 17.6;
    const bz = this.oz + 14.0;
    const bw = 3.8;
    const bd = 4.6;
    const bh = 1.05;

    const floor = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.14, bd), timber);
    floor.position.set(bx, y + 0.08, bz);
    scene.add(floor);

    const walls: [number, number, number, number, number, number][] = [
      [bx, y + bh * 0.5, bz - bd * 0.5, bw, bh, 0.22],
      [bx, y + bh * 0.5, bz + bd * 0.5, bw, bh, 0.22],
      [bx + bw * 0.5, y + bh * 0.5, bz, 0.22, bh, bd],
      [bx - bw * 0.5, y + bh * 0.42, bz, 0.22, bh * 0.84, bd]
    ];
    for (const [wx, wy, wz, ww, wh, wd] of walls) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(ww, wh, wd), timber);
      m.position.set(wx, wy, wz);
      m.castShadow = true;
      scene.add(m);
      this.addStaticBox(world, groundMat, wx, wy, wz, ww, wh, wd);
    }

    this.registerZone(scene, 'harvest', 'Produce Bin', new THREE.Vector3(bx, y, bz), bw - 0.1, bd - 0.1, y, 0xf27405);
  }

  private buildFirewoodLogRack(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    const cx = this.ox - 13.5;
    const cz = this.oz + 20.5;
    const y = this.oy;
    const w = 4.6;
    const d = 4.4;
    const timber = new THREE.MeshStandardMaterial({ color: 0x6e4a2a, roughness: 0.92 });
    const barkMat = new THREE.MeshStandardMaterial({ color: 0x624228, roughness: 0.95 });

    for (const sx of [-1.2, 1.2]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, d), timber);
      skid.position.set(cx + sx, y + 0.12, cz);
      scene.add(skid);
    }
    for (const sz of [-d * 0.5, d * 0.5]) {
      for (const sx of [-1.1, 1.1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.95, 0.2), timber);
        post.position.set(cx + sx, y + 0.98, cz + sz);
        post.castShadow = true;
        scene.add(post);
      }
      this.addStaticBox(world, groundMat, cx, y + 0.98, cz + sz, 2.5, 1.95, 0.26);
    }
    for (const lz of [-1.2, -0.45]) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 3.0, 12), barkMat);
      log.rotation.z = Math.PI / 2;
      log.position.set(cx, y + 0.52, cz + lz);
      log.castShadow = true;
      scene.add(log);
    }

    this.registerZone(scene, 'logs', 'Firewood Rack', new THREE.Vector3(cx, y, cz), w, d, y, 0xb8763e);
  }

  private buildScrapSkip(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    const cx = this.ox - 19.5;
    const cz = this.oz + 10.5;
    const y = this.oy;
    const w = 5.6;
    const d = 4.2;
    const h = 1.55;

    const skipYellow = new THREE.MeshStandardMaterial({ color: 0xdba81c, roughness: 0.62, metalness: 0.28 });
    const darkSteel = new THREE.MeshStandardMaterial({ color: 0x3b3f43, roughness: 0.68, metalness: 0.45 });

    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, d), darkSteel);
    floor.position.set(cx, y + 0.11, cz);
    scene.add(floor);
    this.addStaticBox(world, groundMat, cx, y + 0.11, cz, w, 0.22, d);

    const walls: [number, number, number, number, number, number][] = [
      [cx, y + h * 0.5, cz - d * 0.5, w, h, 0.26],
      [cx, y + h * 0.5, cz + d * 0.5, w, h, 0.26],
      [cx - w * 0.5, y + h * 0.5, cz, 0.26, h, d],
      [cx + w * 0.5, y + h * 0.42, cz, 0.26, h * 0.84, d]
    ];
    for (const [wx, wy, wz, ww, wh, wd] of walls) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(ww, wh, wd), skipYellow);
      m.position.set(wx, wy, wz);
      m.castShadow = true;
      scene.add(m);
      this.addStaticBox(world, groundMat, wx, wy, wz, ww, wh, wd);
    }

    this.registerZone(scene, 'scrap', 'Scrap Skip', new THREE.Vector3(cx, y, cz), w + 0.4, d + 0.4, y, 0xe84a22);
  }

  private buildWorkshopAndToolShed(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    const wx = this.ox - 26.2;
    const wz = this.oz - 3.0;
    const y = this.oy;
    const pebbleMat = new THREE.MeshStandardMaterial({ map: createPebbledashTexture(), roughness: 0.94 });
    const roofMetal = new THREE.MeshStandardMaterial({
      map: createCorrugatedMetalTexture(),
      roughness: 0.62,
      metalness: 0.32
    });
    const timber = new THREE.MeshStandardMaterial({ color: 0x6f4f2f, roughness: 0.92 });

    const workshop = new THREE.Mesh(new THREE.BoxGeometry(5.6, 5.4, 17.5), pebbleMat);
    workshop.position.set(wx, y + 2.7, wz);
    workshop.castShadow = true;
    scene.add(workshop);
    this.addStaticBox(world, groundMat, wx, y + 2.7, wz, 5.6, 5.4, 17.5);

    const canopy = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.2, 16.8), roofMetal);
    canopy.position.set(wx + 4.8, y + 4.15, wz);
    canopy.rotation.z = -0.14;
    canopy.castShadow = true;
    scene.add(canopy);

    for (const sz of [-7.6, -2.5, 2.5, 7.6]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.26, 3.85, 0.26), timber);
      post.position.set(wx + 7.1, y + 1.92, wz + sz);
      post.castShadow = true;
      scene.add(post);
    }

    const tools: { tool: RackSpot['tool']; label: string; color: number }[] = [
      { tool: 'forks', label: 'Pallet Forks', color: 0xe6b422 },
      { tool: 'spike', label: 'Bale Spike', color: 0xd94b26 },
      { tool: 'grabber', label: 'Bale Grabber', color: 0x9fd32e },
      { tool: 'grapple', label: 'Grapple Claw', color: 0x707c85 },
      { tool: 'bucket', label: 'Scoop Bucket', color: 0x3b8cd6 }
    ];

    tools.forEach((t, idx) => {
      const pz = wz - 6.0 + idx * 3.0;
      const px = wx + 5.1;
      const stand = new THREE.Group();
      stand.position.set(px, y, pz);

      const skid = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.14, 2.0), timber);
      skid.position.y = 0.08;
      stand.add(skid);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.18, 1.34, 24),
        new THREE.MeshBasicMaterial({ color: t.color, side: THREE.DoubleSide, transparent: true, opacity: 0.35 })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.06;
      stand.add(ring);

      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#262b2e';
      ctx.fillRect(0, 0, 256, 64);
      ctx.fillStyle = '#' + t.color.toString(16).padStart(6, '0');
      ctx.fillRect(0, 0, 14, 64);
      ctx.fillStyle = '#f4f6f0';
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.label.toUpperCase(), 134, 33);

      const plaqueTex = new THREE.CanvasTexture(canvas);
      plaqueTex.colorSpace = THREE.SRGBColorSpace;
      const plaque = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.45, 1.75),
        new THREE.MeshStandardMaterial({ map: plaqueTex, roughness: 0.7 })
      );
      plaque.position.set(-2.24, 2.45, 0);
      stand.add(plaque);

      scene.add(stand);
      this.rackSpots.push({
        tool: t.tool,
        label: t.label,
        pos: new THREE.Vector3(px, y, pz),
        standMesh: stand,
        ringMesh: ring
      });
    });
  }

  private buildDuckPond(scene: THREE.Scene): void {
    const { x, y, z } = this.pondCenter;
    const bank = new THREE.Mesh(
      new THREE.CircleGeometry(this.pondRadius + 0.85, 24),
      new THREE.MeshStandardMaterial({ color: 0x8f8368, roughness: 0.96 })
    );
    bank.rotation.x = -Math.PI / 2;
    bank.position.set(x, y + 0.055, z);
    scene.add(bank);

    const water = new THREE.Mesh(
      new THREE.CircleGeometry(this.pondRadius, 24),
      new THREE.MeshStandardMaterial({
        color: 0x3b7f9c,
        roughness: 0.2,
        metalness: 0.25,
        transparent: true,
        opacity: 0.88
      })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(x, y + 0.075, z);
    scene.add(water);

    for (let i = 0; i < 3; i++) {
      const duck = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 8, 6),
        new THREE.MeshStandardMaterial({ color: i === 0 ? 0xf2f0e8 : 0x7c6852 })
      );
      body.scale.set(1.25, 0.85, 0.9);
      body.position.y = 0.22;
      duck.add(body);
      scene.add(duck);
      this.ducks.push({
        group: duck,
        angle: i * 2.1,
        radius: 1.4 + i * 0.85,
        speed: 0.42 + i * 0.12
      });
    }
  }

  private buildWindmill(scene: THREE.Scene): void {
    const wm = new THREE.Group();
    wm.position.set(this.ox + 26, this.oy, this.oz - 24);
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 1.35, 11.5, 6),
      new THREE.MeshStandardMaterial({ color: 0x7c7972, roughness: 0.72, metalness: 0.35 })
    );
    tower.position.y = 5.75;
    tower.castShadow = true;
    wm.add(tower);

    const blades = new THREE.Group();
    blades.position.set(0, 11.3, 0.7);
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.68 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.55, 3.2, 0.08), bladeMat);
      b.position.set(Math.cos(a) * 1.65, Math.sin(a) * 1.65, 0);
      b.rotation.z = a - Math.PI / 2;
      blades.add(b);
    }
    wm.add(blades);
    this.windmillBlades = blades;
    scene.add(wm);
  }

  public update(dt: number, elapsed: number): void {
    if (this.windmillBlades) this.windmillBlades.rotation.z -= dt * 0.75;
    for (const d of this.ducks) {
      d.angle += dt * d.speed;
      d.group.position.set(
        this.pondCenter.x + Math.cos(d.angle) * d.radius,
        this.pondCenter.y + 0.08 + Math.sin(elapsed * 4 + d.angle) * 0.03,
        this.pondCenter.z + Math.sin(d.angle) * d.radius
      );
      d.group.rotation.y = -d.angle + Math.PI / 2;
    }
    if (this.hintsVisible) {
      for (const z of this.zones) z.hintMesh.position.y = Math.sin(elapsed * 3) * 0.12;
    }
  }
}
