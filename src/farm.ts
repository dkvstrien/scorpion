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
  FARM_GROUND_Y,
  FARM_YARD_CENTER,
  getTerrainHeight,
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

/**
 * Real Wimpasing Home Farm working yard laid out immediately beside the real LoD2 farmhouse (-312.5, 909.6),
 * the 27x15m Einfirsthof/barn to the NE and the 31x23m farmstead cluster to the SE — keeping every real LoD2
 * building intact while giving a clean, flat working gravel courtyard opening straight out onto the village roads!
 */
export class FarmEnvironment {
  public zones: TidyZone[] = [];
  public rackSpots: RackSpot[] = [];
  public pondCenter = new THREE.Vector3(FARM_YARD_CENTER.x - 19, FARM_GROUND_Y, FARM_YARD_CENTER.z + 24);
  public pondRadius = 3.4;
  public trailerDeckY = FARM_GROUND_Y + 1.02;
  public lakeWaterMesh!: THREE.Mesh;

  private ox = FARM_YARD_CENTER.x;
  private oy = FARM_GROUND_Y;
  private oz = FARM_YARD_CENTER.z;
  private ducks: { group: THREE.Group; angle: number; radius: number; speed: number }[] = [];
  private hintsVisible = false;

  constructor(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material) {
    this.buildTerrainAndApron(scene, world, groundMat);
    this.buildBoundaries(scene, world, groundMat);
    this.buildHayBarn(scene, world, groundMat);
    this.buildSilageClamp(scene, world, groundMat);
    this.buildFarmSilos(scene, world, groundMat);
    this.buildFlatbedTrailer(scene, world, groundMat);
    this.buildProduceBin(scene, world, groundMat);
    this.buildFirewoodLogRack(scene, world, groundMat);
    this.buildScrapSkip(scene, world, groundMat);
    this.buildWorkshopAndToolShed(scene, world, groundMat);
    this.buildFarmPond(scene);
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

    // Compacted Bavarian gravel farmyard apron conformed smoothly to terrain mesh so grass NEVER pokes through!
    const groundTex = createFarmGroundTexture();
    const apronGeo = new THREE.PlaneGeometry(52, 48, 26, 24);
    apronGeo.rotateX(-Math.PI / 2);
    const apos = apronGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < apos.count; i++) {
      const wx = apos.getX(i) + this.ox;
      const wz = apos.getZ(i) + this.oz;
      apos.setY(i, getTerrainHeight(wx, wz) + 0.14);
    }
    apronGeo.computeVertexNormals();
    const ground = new THREE.Mesh(
      apronGeo,
      new THREE.MeshStandardMaterial({
        map: groundTex,
        bumpMap: detailBump,
        bumpScale: 0.08,
        roughness: 0.95,
        metalness: 0.02,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
      })
    );
    ground.position.set(this.ox, 0, this.oz);
    ground.receiveShadow = true;
    scene.add(ground);
  }

  private buildBoundaries(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    const stoneTex = createStoneWallTexture();
    const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.95 });
    const copeMat = new THREE.MeshStandardMaterial({ color: 0x857f75, roughness: 0.93 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x765533, roughness: 0.92 });

    // Stone gate pillars framing the wide East farmyard exit lane (z = oz - 4) straight past the farmhouse to the road!
    const gateX = this.ox + 23.5;
    for (const gz of [this.oz - 10.5, this.oz + 2.5]) {
      const gy = getTerrainHeight(gateX, gz);
      const post = new THREE.Mesh(new THREE.BoxGeometry(1.05, 2.0, 1.05), stoneMat);
      post.position.set(gateX, gy + 1.0, gz);
      post.castShadow = true;
      post.receiveShadow = true;
      scene.add(post);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.2, 1.22), copeMat);
      cap.position.set(gateX, gy + 2.08, gz);
      scene.add(cap);
      this.addStaticBox(world, groundMat, gateX, gy + 1.0, gz, 1.1, 2.0, 1.1);
    }

    // Bavarian timber post-and-rail paddock fencing along North & West edges (leaving wide East & West farm lane exits!)
    const sides = [
      { x1: this.ox - 23, z1: this.oz - 23.5, x2: this.ox + 21, z2: this.oz - 23.5 },
      { x1: this.ox - 23, z1: this.oz - 23.5, x2: this.ox - 23, z2: this.oz - 11.5 },
      { x1: this.ox - 23, z1: this.oz + 1.5, x2: this.ox - 23, z2: this.oz + 21.5 }
    ];
    for (const s of sides) {
      const dx = s.x2 - s.x1;
      const dz = s.z2 - s.z1;
      const len = Math.hypot(dx, dz);
      const angle = Math.atan2(dx, dz);
      const posts = Math.max(2, Math.floor(len / 3.8));
      for (let i = 0; i <= posts; i++) {
        const t = i / posts;
        const px = s.x1 + dx * t;
        const pz = s.z1 + dz * t;
        const gy = getTerrainHeight(px, pz);
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.35, 0.2), woodMat);
        post.position.set(px, gy + 0.65, pz);
        post.castShadow = true;
        scene.add(post);
      }
      const mx = (s.x1 + s.x2) * 0.5;
      const mz = (s.z1 + s.z2) * 0.5;
      const mgy = getTerrainHeight(mx, mz);
      for (const ry of [0.5, 1.02]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, len), woodMat);
        rail.position.set(mx, mgy + ry, mz);
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
    // Open-fronted Bavarian timber hay barn on the south side of the yard, opening NORTH into the courtyard!
    const cx = this.ox + 8.5;
    const cz = this.oz + 16.5;
    const y = this.oy;
    const w = 11.4;
    const d = 8.2;
    const h = 5.6;

    const barnWood = new THREE.MeshStandardMaterial({ map: createBarnWoodTexture(), roughness: 0.88 });
    const roofMetal = new THREE.MeshStandardMaterial({
      map: createCorrugatedMetalTexture(),
      roughness: 0.62,
      metalness: 0.35
    });
    const timber = new THREE.MeshStandardMaterial({ color: 0x624326, roughness: 0.92 });

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.6, 0.14, d + 0.6),
      new THREE.MeshStandardMaterial({ map: createConcreteTexture(), roughness: 0.94 })
    );
    floor.position.set(cx, y + 0.06, cz);
    floor.receiveShadow = true;
    scene.add(floor);

    // Back wall on SOUTH (+Z) so front opens NORTH (-Z) into the yard!
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.4), barnWood);
    backWall.position.set(cx, y + h * 0.5, cz + d * 0.5);
    backWall.castShadow = true;
    scene.add(backWall);
    this.addStaticBox(world, groundMat, cx, y + h * 0.5, cz + d * 0.5, w, h, 0.5);

    for (const s of [-1, 1]) {
      const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.4, h, d), barnWood);
      sideWall.position.set(cx + s * (w * 0.5), y + h * 0.5, cz);
      sideWall.castShadow = true;
      scene.add(sideWall);
      this.addStaticBox(world, groundMat, cx + s * (w * 0.5), y + h * 0.5, cz, 0.5, h, d);
    }

    const roofLen = Math.hypot(w * 0.58, 2.5);
    const roofAngle = Math.atan2(2.5, w * 0.58);
    for (const s of [-1, 1]) {
      const slope = new THREE.Mesh(new THREE.BoxGeometry(roofLen, 0.2, d + 1.8), roofMetal);
      slope.position.set(cx + s * (w * 0.28), y + h + 1.15, cz);
      slope.rotation.z = -s * roofAngle;
      slope.castShadow = true;
      scene.add(slope);
    }

    const lintel = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.36, 0.34), timber);
    lintel.position.set(cx, y + h - 0.15, cz - d * 0.5);
    scene.add(lintel);

    const hayMat = new THREE.MeshStandardMaterial({ map: createHayTexture(), roughness: 0.94 });
    for (const [bx, bz] of [
      [cx + 3.4, cz + 2.1],
      [cx + 1.4, cz + 2.1]
    ]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 1.38, 16), hayMat);
      b.rotation.z = Math.PI / 2;
      b.position.set(bx, y + 0.92, bz);
      b.castShadow = true;
      scene.add(b);
      this.addStaticBox(world, groundMat, bx, y + 0.92, bz, 1.4, 1.6, 1.6);
    }

    this.registerZone(scene, 'hay', 'Hay Barn', new THREE.Vector3(cx, y, cz - 0.3), w - 1.0, d - 1.0, y, 0xf2b705);
  }

  private buildSilageClamp(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    // Concrete silage clamp on the SW edge of the yard, opening NORTH (-Z) into the courtyard!
    const cx = this.ox - 6.5;
    const cz = this.oz + 16.5;
    const y = this.oy;
    const w = 10.6;
    const d = 8.2;
    const wallH = 2.05;

    const concreteMat = new THREE.MeshStandardMaterial({ map: createConcreteTexture(), roughness: 0.92 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.14, d + 0.8), concreteMat);
    slab.position.set(cx, y + 0.06, cz);
    slab.receiveShadow = true;
    scene.add(slab);

    // Back wall on SOUTH (+Z) so clamp opens NORTH (-Z) into the yard
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, 0.45), concreteMat);
    backWall.position.set(cx, y + wallH * 0.5, cz + d * 0.5);
    backWall.castShadow = true;
    scene.add(backWall);
    this.addStaticBox(world, groundMat, cx, y + wallH * 0.5, cz + d * 0.5, w, wallH, 0.5);

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
      [cx - 3.1, y + 0.82, cz + 2.3, whiteMat],
      [cx - 1.2, y + 0.82, cz + 2.3, mintMat]
    ].forEach(([bx, by, bz, m]) => {
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 1.35, 18), m as THREE.Material);
      cyl.position.set(bx as number, by as number, bz as number);
      cyl.castShadow = true;
      scene.add(cyl);
      this.addStaticBox(world, groundMat, bx as number, by as number, bz as number, 1.65, 1.5, 1.65);
    });

    this.registerZone(scene, 'silage', 'Silage Clamp', new THREE.Vector3(cx, y, cz - 0.3), w - 1.0, d - 1.0, y, 0xc8f2b6);
  }

  private buildFarmSilos(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    // Authentic Upper Bavarian twin feed/grain tower silos + concrete slurry ring tucked beside the silage clamp!
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x9aa3a6, roughness: 0.45, metalness: 0.52 });
    const greenRingMat = new THREE.MeshStandardMaterial({ color: 0x385e3e, roughness: 0.55, metalness: 0.28 });
    const darkSteel = new THREE.MeshStandardMaterial({ color: 0x3b4045, roughness: 0.65, metalness: 0.45 });

    const silos: [number, number, number, number, THREE.Material][] = [
      [this.ox - 17.5, this.oz + 16.5, 2.2, 8.8, steelMat],
      [this.ox - 13.8, this.oz + 18.8, 1.75, 6.8, greenRingMat]
    ];
    for (const [sx, sz, r, h, mat] of silos) {
      const gy = getTerrainHeight(sx, sz);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 18), mat);
      body.position.set(sx, gy + h * 0.5 + 0.4, sz);
      body.castShadow = true;
      body.receiveShadow = true;
      scene.add(body);

      const cone = new THREE.Mesh(new THREE.ConeGeometry(r + 0.14, r * 0.82, 18), darkSteel);
      cone.position.set(sx, gy + h + 0.4 + r * 0.41, sz);
      cone.castShadow = true;
      scene.add(cone);

      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.25, r + 0.3, 0.6, 18), darkSteel);
      plinth.position.set(sx, gy + 0.3, sz);
      scene.add(plinth);

      this.addStaticBox(world, groundMat, sx, gy + h * 0.5, sz, r * 1.85, h, r * 1.85);
    }
  }

  private buildFlatbedTrailer(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    // Parked neatly along the south-east side of the working yard ready for pallet loading!
    const cx = this.ox + 17.5;
    const cz = this.oz + 6.5;
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
    headboard.position.set(cx, deckY + 0.68, cz + deckL * 0.5 - 0.08);
    headboard.castShadow = true;
    scene.add(headboard);
    this.addStaticBox(world, groundMat, cx, deckY + 0.68, cz + deckL * 0.5 - 0.08, deckW, 1.35, 0.24);

    for (const wz of [-2.2, -0.2, 1.8]) {
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
    drawbar.position.set(cx, y + 0.56, cz - deckL * 0.5 - 1.0);
    scene.add(drawbar);

    this.registerZone(scene, 'crates', 'Flatbed Trailer', new THREE.Vector3(cx, y, cz), deckW + 0.3, deckL + 0.2, deckY, 0x3898ec);
  }

  private buildProduceBin(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    // Timber harvest produce bin seated flush on local terrain height near the NE corner of the yard
    const bx = this.ox + 15.5;
    const bz = this.oz - 14.5;
    const y = Math.max(this.oy, getTerrainHeight(bx, bz));
    const bw = 4.2;
    const bd = 4.4;
    const bh = 1.05;
    const timber = new THREE.MeshStandardMaterial({ color: 0x7c5532, roughness: 0.9 });

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
    const cx = this.ox - 16.5;
    const cz = this.oz - 10.5;
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
    const cx = this.ox - 16.5;
    const cz = this.oz + 4.5;
    const y = this.oy;
    const w = 5.4;
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
    // Bavarian Workshop & 5-Bay Tool Shed along the NORTH edge of the yard, opening SOUTH straight toward spawn!
    const wx = this.ox + 0.5;
    const wz = this.oz - 20.0;
    const y = this.oy;
    const pebbleMat = new THREE.MeshStandardMaterial({ map: createPebbledashTexture(), roughness: 0.94 });
    const roofMetal = new THREE.MeshStandardMaterial({
      map: createCorrugatedMetalTexture(),
      roughness: 0.62,
      metalness: 0.32
    });
    const timber = new THREE.MeshStandardMaterial({ color: 0x6f4f2f, roughness: 0.92 });

    const workshop = new THREE.Mesh(new THREE.BoxGeometry(17.8, 5.2, 5.2), pebbleMat);
    workshop.position.set(wx, y + 2.6, wz);
    workshop.castShadow = true;
    workshop.receiveShadow = true;
    scene.add(workshop);
    this.addStaticBox(world, groundMat, wx, y + 2.6, wz, 17.8, 5.2, 5.2);

    const canopy = new THREE.Mesh(new THREE.BoxGeometry(17.2, 0.2, 5.2), roofMetal);
    canopy.position.set(wx, y + 4.1, wz + 4.7);
    canopy.rotation.x = 0.14;
    canopy.castShadow = true;
    scene.add(canopy);

    for (const sx of [-7.7, -2.55, 2.55, 7.7]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.26, 3.8, 0.26), timber);
      post.position.set(wx + sx, y + 1.9, wz + 7.0);
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
      const px = wx - 6.0 + idx * 3.0;
      const pz = wz + 4.9;
      const stand = new THREE.Group();
      stand.position.set(px, y, pz);
      stand.rotation.y = -Math.PI / 2; // Local +X faces South (+Z) into yard; local -X plaque mounts cleanly on north wall!

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
      plaque.position.set(-2.22, 2.45, 0);
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

  private buildFarmPond(scene: THREE.Scene): void {
    const x = this.pondCenter.x;
    const z = this.pondCenter.z;
    const y = getTerrainHeight(x, z);
    this.pondCenter.y = y;

    const bank = new THREE.Mesh(
      new THREE.CircleGeometry(this.pondRadius + 0.65, 22),
      new THREE.MeshStandardMaterial({ color: 0x7f755d, roughness: 0.96 })
    );
    bank.rotation.x = -Math.PI / 2;
    bank.position.set(x, y + 0.06, z);
    scene.add(bank);

    const water = new THREE.Mesh(
      new THREE.CircleGeometry(this.pondRadius, 22),
      new THREE.MeshStandardMaterial({
        color: 0x387892,
        roughness: 0.2,
        metalness: 0.25,
        transparent: true,
        opacity: 0.88
      })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(x, y + 0.08, z);
    scene.add(water);

    for (let i = 0; i < 2; i++) {
      const duck = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 8, 6),
        new THREE.MeshStandardMaterial({ color: i === 0 ? 0xf2f0e8 : 0x7c6852 })
      );
      body.scale.set(1.25, 0.85, 0.9);
      body.position.y = 0.2;
      duck.add(body);
      scene.add(duck);
      this.ducks.push({
        group: duck,
        angle: i * 2.5,
        radius: 1.1 + i * 0.7,
        speed: 0.42 + i * 0.14
      });
    }
  }

  public update(dt: number, elapsed: number): void {
    const ripple = this.lakeWaterMesh?.userData?.rippleTex as THREE.Texture | undefined;
    if (ripple) {
      ripple.offset.x = (elapsed * 0.014) % 1;
      ripple.offset.y = (elapsed * 0.009) % 1;
    }
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
