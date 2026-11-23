import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
  createBarnWoodTexture,
  createConcreteTexture,
  createCorrugatedMetalTexture,
  createFarmGroundTexture,
  createHayTexture,
  createPebbledashTexture,
  createStoneWallTexture,
  createWrappedSilageTexture
} from './textures';
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
  public pondCenter = new THREE.Vector3(12, 0, 23);
  public pondRadius = 4.9;
  public trailerDeckY = 1.02;

  private windmillBlades!: THREE.Group;
  private ducks: { group: THREE.Group; angle: number; radius: number; speed: number }[] = [];
  private hintsVisible = false;

  constructor(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material) {
    this.buildGroundAndHills(scene, world, groundMat);
    this.buildBoundaries(scene, world, groundMat);
    this.buildHayBarn(scene, world, groundMat);
    this.buildSilageClamp(scene, world, groundMat);
    this.buildFlatbedTrailer(scene, world, groundMat);
    this.buildFarmShopAndProduceBin(scene, world, groundMat);
    this.buildFirewoodLogRack(scene, world, groundMat);
    this.buildScrapSkip(scene, world, groundMat);
    this.buildWorkshopAndToolShed(scene, world, groundMat);
    this.buildDuckPond(scene);
    this.buildScenery(scene);
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
    if (rotY !== 0) {
      body.quaternion.setFromEuler(0, rotY, 0);
    }
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
    // Subtle optional hint beacon (OFF by default so farm looks authentic & puzzle-like!)
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

  private buildGroundAndHills(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    const groundTex = createFarmGroundTexture();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(92, 92),
      new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.96, metalness: 0.02 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const outerGrass = new THREE.Mesh(
      new THREE.CircleGeometry(185, 48),
      new THREE.MeshStandardMaterial({ color: 0x598240, roughness: 0.98 })
    );
    outerGrass.rotation.x = -Math.PI / 2;
    outerGrass.position.y = -0.06;
    scene.add(outerGrass);

    // Rolling Yorkshire dales hills around the farmstead
    const hillColors = [0x527a3b, 0x618c45, 0x4b7036, 0x6a944c];
    const hillCoords: [number, number, number, number][] = [
      [-64, -56, 36, 16],
      [0, -78, 48, 19],
      [66, -54, 38, 17],
      [78, 16, 34, 14],
      [58, 70, 40, 15],
      [-12, 80, 46, 15],
      [-74, 44, 38, 15],
      [-76, -8, 32, 13]
    ];
    hillCoords.forEach(([hx, hz, hr, hh], idx) => {
      const hill = new THREE.Mesh(
        new THREE.SphereGeometry(hr, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5),
        new THREE.MeshStandardMaterial({ color: hillColors[idx % hillColors.length], roughness: 0.97 })
      );
      hill.scale.y = hh / hr;
      hill.position.set(hx, -0.5, hz);
      scene.add(hill);
    });

    const planeBody = new CANNON.Body({ mass: 0, material: groundMat });
    planeBody.addShape(new CANNON.Plane());
    planeBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(planeBody);
  }

  private buildBoundaries(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    // Authentic Yorkshire dry-stone wall along the north edge WITH A WIDE OPEN FARM GATE to the Village!
    const stoneTex = createStoneWallTexture();
    const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.95 });
    const copeMat = new THREE.MeshStandardMaterial({ color: 0x857f75, roughness: 0.93 });

    // Left & Right north wall segments leaving a wide 12m open gate at x = -6..+6!
    const wallSegments: [number, number][] = [
      [-19, 26],
      [19, 26]
    ];
    for (const [wx, ww] of wallSegments) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(ww, 1.5, 0.95), stoneMat);
      seg.position.set(wx, 0.75, -31);
      seg.castShadow = true;
      seg.receiveShadow = true;
      scene.add(seg);

      const cope = new THREE.Mesh(new THREE.BoxGeometry(ww + 0.15, 0.22, 1.12), copeMat);
      cope.position.set(wx, 1.58, -31);
      scene.add(cope);

      this.addStaticBox(world, groundMat, wx, 1.0, -31, ww, 2.0, 1.1);
    }

    // Classic stone gateposts framing the open driveway out to Scorpion Green Village!
    for (const gx of [-6.2, 6.2]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.2, 1.15), stoneMat);
      post.position.set(gx, 1.1, -31);
      post.castShadow = true;
      scene.add(post);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.24, 1.32), copeMat);
      cap.position.set(gx, 2.3, -31);
      scene.add(cap);
    }

    // Wooden farm signpost right beside the gate pointing to Scorpion Green Village!
    const postWood = new THREE.MeshStandardMaterial({ color: 0x6f4a28, roughness: 0.9 });
    const signPost = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 2.7, 8), postWood);
    signPost.position.set(7.4, 1.35, -30.6);
    scene.add(signPost);

    const sc = document.createElement('canvas');
    sc.width = 256;
    sc.height = 64;
    const sctx = sc.getContext('2d')!;
    sctx.fillStyle = '#f5f2e6';
    sctx.fillRect(0, 0, 256, 64);
    sctx.strokeStyle = '#24292b';
    sctx.lineWidth = 6;
    sctx.strokeRect(3, 3, 250, 58);
    sctx.fillStyle = '#1f2622';
    sctx.font = 'bold 22px sans-serif';
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    sctx.fillText('↑ SCORPION VILLAGE', 128, 33);
    const sTex = new THREE.CanvasTexture(sc);
    sTex.colorSpace = THREE.SRGBColorSpace;
    const sBoard = new THREE.Mesh(
      new THREE.BoxGeometry(2.3, 0.62, 0.1),
      new THREE.MeshStandardMaterial({ map: sTex, roughness: 0.65 })
    );
    sBoard.position.set(7.4, 2.45, -30.6);
    scene.add(sBoard);

    // Timber post-and-rail farm fencing on West, East, and South sides of farmyard
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x7c5a37, roughness: 0.92 });
    const sides: { x1: number; z1: number; x2: number; z2: number }[] = [
      { x1: -32, z1: -31, x2: -32, z2: 31 },
      { x1: 32, z1: -31, x2: 32, z2: 31 },
      { x1: -32, z1: 31, x2: 32, z2: 31 }
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
        post.position.set(s.x1 + dx * t, 0.7, s.z1 + dz * t);
        post.castShadow = true;
        scene.add(post);
      }

      for (const ry of [0.52, 1.06]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, len), woodMat);
        rail.position.set((s.x1 + s.x2) * 0.5, ry, (s.z1 + s.z2) * 0.5);
        rail.rotation.y = angle;
        rail.castShadow = true;
        scene.add(rail);
      }
    }

    // Wide outer world boundaries encompassing both Farmyard AND Scorpion Green Village!
    this.addStaticBox(world, groundMat, 0, 4, -74, 144, 8, 1.4);
    this.addStaticBox(world, groundMat, 0, 4, 33, 144, 8, 1.4);
    this.addStaticBox(world, groundMat, -69, 4, -20, 1.4, 8, 110);
    this.addStaticBox(world, groundMat, 69, 4, -20, 1.4, 8, 110);
  }

  private buildHayBarn(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    const cx = 2.5;
    const cz = -21;
    const w = 12.2;
    const d = 8.6;
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
    floor.position.set(cx, 0.04, cz);
    floor.receiveShadow = true;
    scene.add(floor);

    // Back & side walls
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.4), barnWood);
    backWall.position.set(cx, h * 0.5, cz - d * 0.5);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    scene.add(backWall);
    this.addStaticBox(world, groundMat, cx, h * 0.5, cz - d * 0.5, w, h, 0.5);

    for (const s of [-1, 1]) {
      const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.4, h, d), barnWood);
      sideWall.position.set(cx + s * (w * 0.5), h * 0.5, cz);
      sideWall.castShadow = true;
      sideWall.receiveShadow = true;
      scene.add(sideWall);
      this.addStaticBox(world, groundMat, cx + s * (w * 0.5), h * 0.5, cz, 0.5, h, d);
    }

    // Corrugated steel gable roof
    const roofLen = Math.hypot(w * 0.56, 2.6);
    const roofAngle = Math.atan2(2.6, w * 0.56);
    for (const s of [-1, 1]) {
      const slope = new THREE.Mesh(new THREE.BoxGeometry(roofLen, 0.2, d + 1.5), roofMetal);
      slope.position.set(cx + s * (w * 0.27), h + 1.2, cz);
      slope.rotation.z = -s * roofAngle;
      slope.castShadow = true;
      scene.add(slope);
    }

    // Open timber beam across entrance
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.36, 0.34), timber);
    lintel.position.set(cx, h - 0.15, cz + d * 0.5);
    scene.add(lintel);

    // NATURAL VISUAL CLUE: 2 static starter dry hay bales already stacked in the back-right corner!
    const hayMat = new THREE.MeshStandardMaterial({ map: createHayTexture(), roughness: 0.94 });
    const starterPositions: [number, number, number][] = [
      [cx + 3.6, 0.92, cz - 2.4],
      [cx + 1.6, 0.92, cz - 2.4]
    ];
    for (const [bx, by, bz] of starterPositions) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 1.38, 16), hayMat);
      b.rotation.z = Math.PI / 2;
      b.position.set(bx, by, bz);
      b.castShadow = true;
      b.receiveShadow = true;
      scene.add(b);
      this.addStaticBox(world, groundMat, bx, by, bz, 1.4, 1.6, 1.6);
    }

    this.registerZone(scene, 'hay', 'Hay Barn', new THREE.Vector3(cx, 0, cz + 0.3), w - 1.0, d - 1.0, 0, 0xf2b705);
  }

  private buildSilageClamp(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    // Classic UK/European precast concrete silage clamp bunker!
    const cx = -13.5;
    const cz = -21;
    const w = 10.6;
    const d = 8.4;
    const wallH = 2.05;

    const concreteMat = new THREE.MeshStandardMaterial({ map: createConcreteTexture(), roughness: 0.92 });

    const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.14, d + 0.8), concreteMat);
    slab.position.set(cx, 0.04, cz);
    slab.receiveShadow = true;
    scene.add(slab);

    // Back & side concrete bunker panels
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, 0.45), concreteMat);
    backWall.position.set(cx, wallH * 0.5, cz - d * 0.5);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    scene.add(backWall);
    this.addStaticBox(world, groundMat, cx, wallH * 0.5, cz - d * 0.5, w, wallH, 0.5);

    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.45, wallH, d), concreteMat);
      side.position.set(cx + s * (w * 0.5), wallH * 0.5, cz);
      side.castShadow = true;
      side.receiveShadow = true;
      scene.add(side);
      this.addStaticBox(world, groundMat, cx + s * (w * 0.5), wallH * 0.5, cz, 0.5, wallH, d);
    }

    // NATURAL VISUAL CLUE: 2 tidy static wrapped silage bales already lined neatly against the back concrete wall!
    const whiteMat = new THREE.MeshStandardMaterial({ map: createWrappedSilageTexture('white', false), roughness: 0.28 });
    const mintMat = new THREE.MeshStandardMaterial({ map: createWrappedSilageTexture('mint', false), roughness: 0.28 });
    [
      [cx - 3.2, 0.82, cz - 2.6, whiteMat],
      [cx - 1.3, 0.82, cz - 2.6, mintMat]
    ].forEach(([bx, by, bz, m]) => {
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 1.35, 18), m as THREE.Material);
      cyl.position.set(bx as number, by as number, bz as number);
      cyl.castShadow = true;
      cyl.receiveShadow = true;
      scene.add(cyl);
      this.addStaticBox(world, groundMat, bx as number, by as number, bz as number, 1.65, 1.5, 1.65);
    });

    this.registerZone(scene, 'silage', 'Silage Clamp', new THREE.Vector3(cx, 0, cz + 0.4), w - 1.0, d - 1.0, 0, 0xc8f2b6);
  }

  private buildFlatbedTrailer(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    // Authentic agricultural flatbed pallet delivery trailer parked along the east lane!
    const cx = 19.2;
    const cz = -5.5;
    const deckW = 3.6;
    const deckL = 8.4;
    const deckY = this.trailerDeckY;

    const steelMat = new THREE.MeshStandardMaterial({ color: 0x354b63, roughness: 0.55, metalness: 0.42 });
    const plankMat = new THREE.MeshStandardMaterial({ color: 0x7d5d3b, roughness: 0.9 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x222426, roughness: 0.92 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xd9d4c7, roughness: 0.45 });

    // Wooden flatbed deck
    const deck = new THREE.Mesh(new THREE.BoxGeometry(deckW, 0.16, deckL), plankMat);
    deck.position.set(cx, deckY - 0.08, cz);
    deck.castShadow = true;
    deck.receiveShadow = true;
    scene.add(deck);
    this.addStaticBox(world, groundMat, cx, deckY - 0.12, cz, deckW, 0.24, deckL);

    // Steel perimeter chassis beam
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(deckW - 0.4, 0.24, deckL - 0.3), steelMat);
    chassis.position.set(cx, deckY - 0.28, cz);
    chassis.castShadow = true;
    scene.add(chassis);

    // Front steel headboard rack (north end of trailer)
    const headboard = new THREE.Mesh(new THREE.BoxGeometry(deckW, 1.35, 0.16), steelMat);
    headboard.position.set(cx, deckY + 0.68, cz - deckL * 0.5 + 0.08);
    headboard.castShadow = true;
    scene.add(headboard);
    this.addStaticBox(world, groundMat, cx, deckY + 0.68, cz - deckL * 0.5 + 0.08, deckW, 1.35, 0.24);

    // Dual-axle wheels underneath
    for (const wz of [-1.8, 0.2, 2.2]) {
      for (const wx of [-1.45, 1.45]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.34, 16), tireMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(cx + wx, 0.46, cz + wz);
        wheel.castShadow = true;
        scene.add(wheel);

        const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.36, 12), rimMat);
        rim.rotation.z = Math.PI / 2;
        rim.position.set(cx + wx, 0.46, cz + wz);
        scene.add(rim);
      }
    }

    // Drawbar hitch tongue & jack stand pointing south
    const drawbar = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 2.2), steelMat);
    drawbar.position.set(cx, 0.56, cz + deckL * 0.5 + 1.0);
    scene.add(drawbar);

    const jack = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.62, 0.14), steelMat);
    jack.position.set(cx, 0.31, cz + deckL * 0.5 + 0.45);
    scene.add(jack);

    // Painted wheel chocks & subtle yellow corner tie-down posts
    const tieMat = new THREE.MeshStandardMaterial({ color: 0xe6b422, roughness: 0.5 });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.12), tieMat);
        post.position.set(cx + sx * (deckW * 0.5 - 0.08), deckY + 0.11, cz + sz * (deckL * 0.5 - 0.2));
        scene.add(post);
      }
    }

    // Zone requires pallets to be actually UP ON THE TRAILER DECK (minY > 0.9)!
    this.registerZone(scene, 'crates', 'Flatbed Trailer', new THREE.Vector3(cx, 0, cz), deckW + 0.3, deckL + 0.2, deckY, 0x3898ec);
  }

  private buildFarmShopAndProduceBin(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    // Cozy stone farm shop porch + rustic wooden produce bin for scooped pumpkins!
    const shopX = 23.5;
    const shopZ = 14;
    const stoneMat = new THREE.MeshStandardMaterial({ map: createPebbledashTexture(), roughness: 0.92 });
    const slateRoof = new THREE.MeshStandardMaterial({ color: 0x3a4046, roughness: 0.78 });
    const timber = new THREE.MeshStandardMaterial({ color: 0x7c5532, roughness: 0.9 });

    const shopBody = new THREE.Mesh(new THREE.BoxGeometry(6.8, 4.4, 8.8), stoneMat);
    shopBody.position.set(shopX, 2.2, shopZ);
    shopBody.castShadow = true;
    shopBody.receiveShadow = true;
    scene.add(shopBody);
    this.addStaticBox(world, groundMat, shopX, 2.2, shopZ, 6.8, 4.4, 8.8);

    // Slate pitched roof
    const roofL = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.22, 9.4), slateRoof);
    roofL.position.set(shopX - 1.75, 5.15, shopZ);
    roofL.rotation.z = 0.42;
    roofL.castShadow = true;
    scene.add(roofL);
    const roofR = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.22, 9.4), slateRoof);
    roofR.position.set(shopX + 1.75, 5.15, shopZ);
    roofR.rotation.z = -0.42;
    roofR.castShadow = true;
    scene.add(roofR);

    // Warm lit shop window
    const win = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 1.5, 2.4),
      new THREE.MeshStandardMaterial({ color: 0xffdf99, emissive: 0x8f5b1e, emissiveIntensity: 0.45 })
    );
    win.position.set(shopX - 3.42, 2.3, shopZ);
    scene.add(win);

    // Open-top wooden Harvest Produce Bin right beside the shop porch (pour pumpkins in!)
    const bx = 17.6;
    const bz = 14.0;
    const bw = 3.8;
    const bd = 4.6;
    const bh = 1.05;

    const floor = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.14, bd), timber);
    floor.position.set(bx, 0.07, bz);
    floor.receiveShadow = true;
    scene.add(floor);

    const walls: [number, number, number, number, number, number][] = [
      [bx, bh * 0.5, bz - bd * 0.5, bw, bh, 0.22],
      [bx, bh * 0.5, bz + bd * 0.5, bw, bh, 0.22],
      [bx + bw * 0.5, bh * 0.5, bz, 0.22, bh, bd],
      [bx - bw * 0.5, bh * 0.42, bz, 0.22, bh * 0.84, bd]
    ];
    for (const [wx, wy, wz, ww, wh, wd] of walls) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(ww, wh, wd), timber);
      m.position.set(wx, wy, wz);
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
      this.addStaticBox(world, groundMat, wx, wy, wz, ww, wh, wd);
    }

    // NATURAL VISUAL CLUE: 2 static starter pumpkins sitting in the corner of the produce bin!
    const pMat = new THREE.MeshStandardMaterial({ color: 0xd96518, roughness: 0.55 });
    for (const [px, pz] of [
      [bx + 0.9, bz - 1.3],
      [bx + 0.85, bz + 1.25]
    ]) {
      const pm = new THREE.Mesh(new THREE.SphereGeometry(0.46, 12, 10), pMat);
      pm.scale.y = 0.8;
      pm.position.set(px, 0.48, pz);
      pm.castShadow = true;
      scene.add(pm);
    }

    this.registerZone(scene, 'harvest', 'Produce Bin', new THREE.Vector3(bx, 0, bz), bw - 0.1, bd - 0.1, 0, 0xf27405);
  }

  private buildFirewoodLogRack(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    // Timber A-frame firewood log cradle near the south-west corner!
    const cx = -13.5;
    const cz = 20.5;
    const w = 4.6;
    const d = 4.4;

    const timber = new THREE.MeshStandardMaterial({ color: 0x6e4a2a, roughness: 0.92 });
    const barkMat = new THREE.MeshStandardMaterial({ color: 0x624228, roughness: 0.95 });

    // Ground skids
    for (const sx of [-1.2, 1.2]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, d), timber);
      skid.position.set(cx + sx, 0.1, cz);
      skid.castShadow = true;
      scene.add(skid);
    }
    // Side upright stanchions holding logs neatly
    for (const sz of [-d * 0.5, d * 0.5]) {
      for (const sx of [-1.1, 1.1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.95, 0.2), timber);
        post.position.set(cx + sx, 0.98, cz + sz);
        post.castShadow = true;
        scene.add(post);
      }
      this.addStaticBox(world, groundMat, cx, 0.98, cz + sz, 2.5, 1.95, 0.26);
    }

    // NATURAL VISUAL CLUE: 2 static starter logs already stacked inside the rack!
    for (const lz of [-1.2, -0.45]) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 3.0, 12), barkMat);
      log.rotation.z = Math.PI / 2;
      log.position.set(cx, 0.52, cz + lz);
      log.castShadow = true;
      scene.add(log);
    }

    this.registerZone(scene, 'logs', 'Firewood Log Rack', new THREE.Vector3(cx, 0, cz), w, d, 0, 0xb8763e);
  }

  private buildScrapSkip(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    const cx = -19.5;
    const cz = 10.5;
    const w = 5.6;
    const d = 4.2;
    const h = 1.55;

    const skipYellow = new THREE.MeshStandardMaterial({ color: 0xdba81c, roughness: 0.62, metalness: 0.28 });
    const darkSteel = new THREE.MeshStandardMaterial({ color: 0x3b3f43, roughness: 0.68, metalness: 0.45 });

    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, d), darkSteel);
    floor.position.set(cx, 0.11, cz);
    floor.receiveShadow = true;
    scene.add(floor);
    this.addStaticBox(world, groundMat, cx, 0.11, cz, w, 0.22, d);

    const walls: [number, number, number, number, number, number][] = [
      [cx, h * 0.5, cz - d * 0.5, w, h, 0.26],
      [cx, h * 0.5, cz + d * 0.5, w, h, 0.26],
      [cx - w * 0.5, h * 0.5, cz, 0.26, h, d],
      [cx + w * 0.5, h * 0.42, cz, 0.26, h * 0.84, d]
    ];
    for (const [wx, wy, wz, ww, wh, wd] of walls) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(ww, wh, wd), skipYellow);
      m.position.set(wx, wy, wz);
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
      this.addStaticBox(world, groundMat, wx, wy, wz, ww, wh, wd);
    }

    this.registerZone(scene, 'scrap', 'Scrap Skip', new THREE.Vector3(cx, 0, cz), w + 0.4, d + 0.4, 0, 0xe84a22);
  }

  private buildWorkshopAndToolShed(scene: THREE.Scene, world: CANNON.World, groundMat: CANNON.Material): void {
    // Stone pebbledash farm workshop inspired directly by the building behind the Scorpion in the user's photo!
    const wx = -26.2;
    const wz = -3.0;
    const pebbleMat = new THREE.MeshStandardMaterial({ map: createPebbledashTexture(), roughness: 0.94 });
    const roofMetal = new THREE.MeshStandardMaterial({
      map: createCorrugatedMetalTexture(),
      roughness: 0.62,
      metalness: 0.32
    });
    const timber = new THREE.MeshStandardMaterial({ color: 0x6f4f2f, roughness: 0.92 });

    const workshop = new THREE.Mesh(new THREE.BoxGeometry(5.6, 5.4, 17.5), pebbleMat);
    workshop.position.set(wx, 2.7, wz);
    workshop.castShadow = true;
    workshop.receiveShadow = true;
    scene.add(workshop);
    this.addStaticBox(world, groundMat, wx, 2.7, wz, 5.6, 5.4, 17.5);

    // Lean-to timber tool canopy projecting east over the 5 Attachment Bays!
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.2, 16.8), roofMetal);
    canopy.position.set(wx + 4.8, 4.15, wz);
    canopy.rotation.z = -0.14;
    canopy.castShadow = true;
    scene.add(canopy);

    for (const sz of [-7.6, -2.5, 2.5, 7.6]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.26, 3.85, 0.26), timber);
      post.position.set(wx + 7.1, 1.92, wz + sz);
      post.castShadow = true;
      scene.add(post);
    }

    // 5 Attachment Rack stands along the shed bay (physical coupling!)
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
      stand.position.set(px, 0, pz);

      // Timber resting pallet skid
      const skid = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.14, 2.0), timber);
      skid.position.y = 0.07;
      skid.receiveShadow = true;
      stand.add(skid);

      // Subtle highlight ring (glows brighter when nearby!)
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.18, 1.34, 24),
        new THREE.MeshBasicMaterial({ color: t.color, side: THREE.DoubleSide, transparent: true, opacity: 0.35 })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
      stand.add(ring);

      // Clean painted wooden bay plaque on the workshop wall behind each tool
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
        pos: new THREE.Vector3(px, 0, pz),
        standMesh: stand,
        ringMesh: ring
      });
    });
  }

  private buildDuckPond(scene: THREE.Scene): void {
    const { x, z } = this.pondCenter;

    const bank = new THREE.Mesh(
      new THREE.CircleGeometry(this.pondRadius + 0.85, 28),
      new THREE.MeshStandardMaterial({ color: 0x8f8368, roughness: 0.96 })
    );
    bank.rotation.x = -Math.PI / 2;
    bank.position.set(x, 0.015, z);
    scene.add(bank);

    const water = new THREE.Mesh(
      new THREE.CircleGeometry(this.pondRadius, 28),
      new THREE.MeshStandardMaterial({
        color: 0x3b7f9c,
        roughness: 0.22,
        metalness: 0.14,
        transparent: true,
        opacity: 0.88
      })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(x, 0.04, z);
    scene.add(water);

    const lilyMat = new THREE.MeshStandardMaterial({ color: 0x3f7533, roughness: 0.75 });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const r = 2.2 + (i % 2) * 1.2;
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 12), lilyMat);
      pad.position.set(x + Math.cos(a) * r, 0.06, z + Math.sin(a) * r);
      scene.add(pad);
    }

    for (let i = 0; i < 3; i++) {
      const duck = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 10, 8),
        new THREE.MeshStandardMaterial({ color: i === 0 ? 0xf2f0e8 : 0x7c6852, roughness: 0.72 })
      );
      body.scale.set(1.25, 0.85, 0.9);
      body.position.y = 0.21;
      duck.add(body);

      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 10, 8),
        new THREE.MeshStandardMaterial({ color: i === 0 ? 0x1d5e37 : 0x6b5844, roughness: 0.65 })
      );
      head.position.set(0.22, 0.4, 0);
      duck.add(head);

      const beak = new THREE.Mesh(
        new THREE.ConeGeometry(0.06, 0.16, 6),
        new THREE.MeshStandardMaterial({ color: 0xd98a18, roughness: 0.55 })
      );
      beak.rotation.z = -Math.PI / 2;
      beak.position.set(0.39, 0.38, 0);
      duck.add(beak);

      scene.add(duck);
      this.ducks.push({
        group: duck,
        angle: i * 2.1,
        radius: 1.4 + i * 0.85,
        speed: 0.42 + i * 0.12
      });
    }
  }

  private buildScenery(scene: THREE.Scene): void {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4028, roughness: 0.95 });
    const leafDark = new THREE.MeshStandardMaterial({ color: 0x35622e, roughness: 0.9 });
    const leafBright = new THREE.MeshStandardMaterial({ color: 0x4b7e39, roughness: 0.88 });

    const treeSpots: [number, number, boolean][] = [
      [-28, -28, true],
      [-22, -35, false],
      [-8, -35, true],
      [15, -34, false],
      [28, -27, true],
      [35, -14, false],
      [36, 4, true],
      [34, 24, false],
      [24, 34, true],
      [-2, 35, false],
      [-24, 34, true],
      [-36, 18, false],
      [-36, -12, true]
    ];

    for (const [tx, tz, isPine] of treeSpots) {
      const tree = new THREE.Group();
      const s = 0.88 + Math.random() * 0.42;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.38, 2.4, 8), trunkMat);
      trunk.position.y = 1.2;
      trunk.castShadow = true;
      tree.add(trunk);

      if (isPine) {
        for (let tier = 0; tier < 3; tier++) {
          const cone = new THREE.Mesh(
            new THREE.ConeGeometry(1.95 - tier * 0.45, 2.4, 9),
            tier % 2 === 0 ? leafDark : leafBright
          );
          cone.position.y = 2.6 + tier * 1.4;
          cone.castShadow = true;
          tree.add(cone);
        }
      } else {
        const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(2.1, 1), leafBright);
        crown.position.y = 3.5;
        crown.scale.y = 0.9;
        crown.castShadow = true;
        tree.add(crown);
      }
      tree.scale.setScalar(s);
      tree.position.set(tx, 0, tz);
      scene.add(tree);
    }

    // Galvanized farm windmill in NE corner
    const wm = new THREE.Group();
    wm.position.set(27, 0, -25);
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
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 0.44, 10),
      new THREE.MeshStandardMaterial({ color: 0xb83824, roughness: 0.55 })
    );
    hub.rotation.x = Math.PI / 2;
    blades.add(hub);
    wm.add(blades);
    this.windmillBlades = blades;
    scene.add(wm);
  }

  public update(dt: number, elapsed: number): void {
    if (this.windmillBlades) {
      this.windmillBlades.rotation.z -= dt * 0.75;
    }

    for (const d of this.ducks) {
      d.angle += dt * d.speed;
      const nx = this.pondCenter.x + Math.cos(d.angle) * d.radius;
      const nz = this.pondCenter.z + Math.sin(d.angle) * d.radius;
      d.group.position.set(nx, Math.sin(elapsed * 4 + d.angle) * 0.03, nz);
      d.group.rotation.y = -d.angle + Math.PI / 2;
    }

    if (this.hintsVisible) {
      for (const z of this.zones) {
        z.hintMesh.position.y = Math.sin(elapsed * 3) * 0.12;
      }
    }
  }
}
