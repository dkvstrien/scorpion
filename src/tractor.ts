import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createClaasDoorTexture } from './textures';
import { FarmProp } from './props';

export type AttachmentType = 'none' | 'forks' | 'spike' | 'grabber' | 'grapple' | 'bucket';
export type SteeringMode = '4WS' | '2WS' | 'CRAB';

export interface TractorInput {
  throttle: number; // -1..1
  steer: number; // -1..1
  boost: boolean;
  creep: boolean;
  boomLift: number; // -1..1
  boomExtend: number; // -1..1
  headTilt: number; // -1..1
  actionHeld: boolean;
}

export interface DroppedAttachment {
  type: Exclude<AttachmentType, 'none'>;
  mesh: THREE.Group;
  pos: THREE.Vector3;
  rotY: number;
}

export interface TractorCallbacks {
  onSilagePopped: (prop: FarmProp, reason: string) => void;
  onPropDamaged: (prop: FarmProp, reason: string) => void;
  onPropFling: (prop: FarmProp, speed: number) => void;
  onPropGrabbed: (prop: FarmProp, tool: AttachmentType) => void;
  onWrongTool: (message: string) => void;
  onToolChanged: (tool: AttachmentType, attached: boolean) => void;
  onDust: (pos: THREE.Vector3) => void;
}

export const TOOL_META: Record<AttachmentType, { name: string; tip: string }> = {
  none: { name: 'Quick-Hitch Empty', tip: 'Drive to the Tool Shed & press [T] to couple a tool' },
  forks: { name: 'Pallet Forks', tip: 'Level forks low under Produce Pallets · keep level while stacking!' },
  spike: { name: 'Bale Spike', tip: 'Skewer Dry Hay Bales · keep sharp spears away from Wrapped Silage!' },
  grabber: { name: 'Bale Grabber', tip: 'Tap [Space] for gentle silage grip · hold [Space] to squeeze/crush!' },
  grapple: { name: 'Grapple Claw', tip: 'Clamp Fallen Logs, Oil Drums, Tires & smashed scrap' },
  bucket: { name: 'Scoop Bucket', tip: 'Scoop Pumpkins level, curl back [Z] to carry, tilt [C] to pour' }
};

export function buildAttachmentMesh(type: Exclude<AttachmentType, 'none'>): THREE.Group {
  const g = new THREE.Group();
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x33393e, roughness: 0.54, metalness: 0.45 });
  const accentSteel = new THREE.MeshStandardMaterial({ color: 0x525a60, roughness: 0.48, metalness: 0.52 });
  const claasGreen = new THREE.MeshStandardMaterial({ color: 0x9fd32e, roughness: 0.42, metalness: 0.14 });
  const claasRed = new THREE.MeshStandardMaterial({ color: 0xd94420, roughness: 0.48, metalness: 0.2 });
  const yellowTip = new THREE.MeshStandardMaterial({ color: 0xe6b822, roughness: 0.48, metalness: 0.2 });

  const backplate = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.72, 0.14), darkSteel);
  backplate.position.set(0, 0.08, -0.08);
  backplate.castShadow = true;
  g.add(backplate);

  if (type === 'forks') {
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.14, 0.16), accentSteel);
    topRail.position.set(0, 0.42, -0.14);
    topRail.castShadow = true;
    g.add(topRail);

    for (const sx of [-0.42, 0.42]) {
      const upright = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.78, 0.14), darkSteel);
      upright.position.set(sx, 0.04, -0.2);
      upright.castShadow = true;
      g.add(upright);

      const tine = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.075, 1.56), darkSteel);
      tine.position.set(sx, -0.32, -0.96);
      tine.castShadow = true;
      g.add(tine);

      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.08, 0.26), yellowTip);
      tip.position.set(sx, -0.32, -1.62);
      g.add(tip);
    }
  } else if (type === 'spike') {
    const guard = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.92, 0.12), claasRed);
    guard.position.set(0, 0.2, -0.12);
    guard.castShadow = true;
    g.add(guard);

    for (const sx of [-0.42, 0.42]) {
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.22, 10), darkSteel);
      collar.rotation.x = Math.PI / 2;
      collar.position.set(sx, -0.16, -0.22);
      g.add(collar);

      const spear = new THREE.Mesh(new THREE.ConeGeometry(0.055, 1.55, 10), accentSteel);
      spear.rotation.x = -Math.PI / 2;
      spear.position.set(sx, -0.16, -1.02);
      spear.castShadow = true;
      g.add(spear);
    }
    const topSpear = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.9, 10), accentSteel);
    topSpear.rotation.x = -Math.PI / 2;
    topSpear.position.set(0, 0.42, -0.6);
    topSpear.castShadow = true;
    g.add(topSpear);
  } else if (type === 'grabber') {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.22, 0.24), darkSteel);
    rail.position.set(0, 0.1, -0.2);
    rail.castShadow = true;
    g.add(rail);

    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.35, 10), claasGreen);
    cyl.rotation.z = Math.PI / 2;
    cyl.position.set(0, 0.32, -0.2);
    g.add(cyl);

    for (const side of [-1, 1]) {
      const armPivot = new THREE.Group();
      armPivot.name = side < 0 ? 'grabberLeft' : 'grabberRight';
      armPivot.position.set(side * 0.88, 0.08, -0.24);

      const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.56, 0.24), claasGreen);
      shoulder.castShadow = true;
      armPivot.add(shoulder);

      const reach = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.52, 1.26), darkSteel);
      reach.position.set(side * 0.04, 0, -0.72);
      reach.castShadow = true;
      armPivot.add(reach);

      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.62, 12), claasGreen);
      pad.scale.set(0.45, 1, 1.65);
      pad.position.set(-side * 0.05, 0, -1.24);
      pad.rotation.y = side * 0.28;
      pad.castShadow = true;
      armPivot.add(pad);

      g.add(armPivot);
    }
  } else if (type === 'grapple') {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.66, 0.18), darkSteel);
    frame.position.set(0, 0.08, -0.15);
    frame.castShadow = true;
    g.add(frame);

    for (const sx of [-0.62, -0.21, 0.21, 0.62]) {
      const tine = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.32), darkSteel);
      tine.position.set(sx, -0.24, -0.82);
      tine.castShadow = true;
      g.add(tine);

      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.24, 6), accentSteel);
      tooth.rotation.x = -Math.PI / 2;
      tooth.position.set(sx, -0.24, -1.52);
      g.add(tooth);
    }

    const jawPivot = new THREE.Group();
    jawPivot.name = 'grappleJaw';
    jawPivot.position.set(0, 0.42, -0.22);

    const jawBar = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.16, 0.16), claasRed);
    jawBar.castShadow = true;
    jawPivot.add(jawBar);

    for (const sx of [-0.52, 0, 0.52]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.14, 1.05), darkSteel);
      arm.position.set(sx, 0.12, -0.52);
      arm.rotation.x = 0.22;
      arm.castShadow = true;
      jawPivot.add(arm);

      const fang = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.58, 0.12), claasRed);
      fang.position.set(sx, -0.16, -1.04);
      fang.rotation.x = 0.35;
      fang.castShadow = true;
      jawPivot.add(fang);
    }
    g.add(jawPivot);
  } else if (type === 'bucket') {
    const bw = 2.15;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.12, 1.38), darkSteel);
    floor.position.set(0, -0.34, -0.78);
    floor.castShadow = true;
    floor.receiveShadow = true;
    g.add(floor);

    const back = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.92, 0.12), accentSteel);
    back.position.set(0, 0.12, -0.14);
    back.castShadow = true;
    g.add(back);

    const topLip = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.12, 0.42), claasGreen);
    topLip.position.set(0, 0.56, -0.3);
    topLip.castShadow = true;
    g.add(topLip);

    for (const sx of [-bw * 0.5 + 0.06, bw * 0.5 - 0.06]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 1.28), darkSteel);
      side.position.set(sx, 0.1, -0.72);
      side.castShadow = true;
      g.add(side);
    }

    const edge = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.04, 0.08, 0.18), yellowTip);
    edge.position.set(0, -0.36, -1.5);
    g.add(edge);
  }

  return g;
}

export class ClaasScorpion {
  public root = new THREE.Group();
  public chassisGroup = new THREE.Group();
  public chassisBody: CANNON.Body;
  public headBody: CANNON.Body;

  public position = new THREE.Vector3(-2, 0, 14.5);
  public heading = 0.18;
  public speed = 0;
  public yawRate = 0;
  public steerAngle = 0;
  public steeringMode: SteeringMode = '4WS';

  public boomPitch = 0.06;
  public boomExt = 0;
  public headTilt = 0.0;
  public prevHeadTilt = 0.0;

  // Start with Grapple Claw OR Pallet Forks? Start with Pallet Forks, and notice fallen logs block the lane!
  public activeTool: AttachmentType = 'forks';
  public heldProps: FarmProp[] = [];
  public clampClosed = false;
  public squeezePressure = 0;
  public hydroLoad = 0;
  public droppedAttachments: DroppedAttachment[] = [];

  private wheelPivots: { pivot: THREE.Group; spin: THREE.Group; isFront: boolean }[] = [];
  private steeringWheelMesh!: THREE.Group;
  private beaconLight!: THREE.Mesh;
  private boomPivot = new THREE.Group();
  private innerBoom = new THREE.Group();
  private headPivot = new THREE.Group();
  private attachmentMount = new THREE.Group();
  private activeAttachmentMesh: THREE.Group | null = null;
  private liftCylOuter!: THREE.Mesh;
  private liftCylRod!: THREE.Mesh;
  private boomBaseLocal = new THREE.Vector3(0.18, 1.72, 1.38);
  private cylAnchorLocal = new THREE.Vector3(0.18, 0.96, 0.12);

  private holdWorldPos = new THREE.Vector3();
  private prevHoldWorldPos = new THREE.Vector3();
  private tipWorldVel = new THREE.Vector3();
  private smoothedTipVel = new THREE.Vector3();
  private holdOffsets = new Map<number, THREE.Vector3>();
  private dustTimer = 0;
  private actionWasHeld = false;
  private holdTimer = 0;
  private grabLockedOnPress = false;
  private lastWarnAt = 0;
  private scene: THREE.Scene;
  private callbacks: TractorCallbacks;

  constructor(scene: THREE.Scene, world: CANNON.World, tractorMat: CANNON.Material, callbacks: TractorCallbacks) {
    this.scene = scene;
    this.callbacks = callbacks;

    this.buildTractorVisuals();
    this.root.add(this.chassisGroup);
    scene.add(this.root);

    this.chassisBody = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.KINEMATIC,
      material: tractorMat
    });
    this.chassisBody.addShape(new CANNON.Box(new CANNON.Vec3(1.16, 0.92, 2.18)), new CANNON.Vec3(0, 1.12, 0.1));
    this.chassisBody.addShape(new CANNON.Box(new CANNON.Vec3(0.65, 0.72, 1.15)), new CANNON.Vec3(-0.52, 2.25, 0.2));
    world.addBody(this.chassisBody);

    this.headBody = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.KINEMATIC,
      material: tractorMat
    });
    this.headBody.addShape(new CANNON.Box(new CANNON.Vec3(0.72, 0.24, 0.62)));
    world.addBody(this.headBody);

    this.equipTool('forks', false);
    this.syncTransforms(0.016);
    this.prevHoldWorldPos.copy(this.holdWorldPos);
  }

  private buildTractorVisuals(): void {
    const claasGreen = new THREE.MeshStandardMaterial({ color: 0x9fd32e, roughness: 0.4, metalness: 0.12 });
    const darkSlate = new THREE.MeshStandardMaterial({ color: 0x363c40, roughness: 0.6, metalness: 0.35 });
    const midSlate = new THREE.MeshStandardMaterial({ color: 0x525a60, roughness: 0.52, metalness: 0.4 });
    const wheelOrange = new THREE.MeshStandardMaterial({ color: 0xe34822, roughness: 0.4, metalness: 0.18 });
    const tireRubber = new THREE.MeshStandardMaterial({ color: 0x222528, roughness: 0.94 });
    const roofWhite = new THREE.MeshStandardMaterial({ color: 0xf1f3ee, roughness: 0.44 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xd8e0e6, roughness: 0.18, metalness: 0.88 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x1e3038,
      roughness: 0.14,
      metalness: 0.24,
      transparent: true,
      opacity: 0.44
    });
    const doorTex = createClaasDoorTexture();

    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.78, 4.15), darkSlate);
    frame.position.set(0, 0.96, 0.12);
    frame.castShadow = true;
    frame.receiveShadow = true;
    this.chassisGroup.add(frame);

    const counterweight = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.98, 0.72), darkSlate);
    counterweight.position.set(0, 1.18, 2.1);
    counterweight.castShadow = true;
    this.chassisGroup.add(counterweight);

    const rearGreenCap = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.46, 0.75), claasGreen);
    rearGreenCap.position.set(0, 1.75, 1.98);
    rearGreenCap.castShadow = true;
    this.chassisGroup.add(rearGreenCap);

    const tailMat = new THREE.MeshStandardMaterial({ color: 0xd92518, emissive: 0x550800, roughness: 0.3 });
    for (const sx of [-0.74, 0.74]) {
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.08), tailMat);
      tl.position.set(sx, 1.48, 2.47);
      this.chassisGroup.add(tl);
    }

    const stepBox = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.52, 0.95), midSlate);
    stepBox.position.set(-0.92, 0.74, 0.18);
    stepBox.castShadow = true;
    this.chassisGroup.add(stepBox);
    for (const sy of [0.62, 0.84]) {
      const tread = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.68), chrome);
      tread.position.set(-0.96, sy, 0.18);
      this.chassisGroup.add(tread);
    }

    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.92, 2.75), claasGreen);
    hood.position.set(0.56, 1.56, 0.56);
    hood.castShadow = true;
    hood.receiveShadow = true;
    this.chassisGroup.add(hood);

    const grille = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.46, 1.1), darkSlate);
    grille.position.set(1.06, 1.6, 0.65);
    this.chassisGroup.add(grille);

    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.72, 1.15), claasGreen);
    nose.position.set(0.56, 1.46, -1.25);
    nose.castShadow = true;
    this.chassisGroup.add(nose);

    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.9, 8), darkSlate);
    exhaust.position.set(0.94, 2.38, 1.48);
    exhaust.rotation.z = -0.12;
    this.chassisGroup.add(exhaust);

    // Panoramic Left Cab
    const cab = new THREE.Group();
    cab.position.set(-0.56, 1.45, 0.18);

    const doorLeft = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.86, 1.66), [
      darkSlate,
      new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.42 }),
      darkSlate,
      darkSlate,
      darkSlate,
      darkSlate
    ]);
    doorLeft.position.set(-0.56, 0.12, 0.02);
    doorLeft.castShadow = true;
    cab.add(doorLeft);

    const rearPillar = new THREE.Mesh(new THREE.BoxGeometry(1.16, 1.46, 0.24), claasGreen);
    rearPillar.position.set(0, 0.48, 0.84);
    rearPillar.castShadow = true;
    cab.add(rearPillar);

    const pillarPositions: [number, number, number, number][] = [
      [-0.55, 0.86, -0.78, 0.18],
      [0.55, 0.86, -0.78, 0.18],
      [-0.55, 0.86, 0.74, 0],
      [0.55, 0.86, 0.74, 0]
    ];
    for (const [px, py, pz, rx] of pillarPositions) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.32, 0.09), darkSlate);
      p.position.set(px, py, pz);
      p.rotation.x = rx;
      p.castShadow = true;
      cab.add(p);
    }

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.06, 1.24, 0.06), glassMat);
    windshield.position.set(0, 0.84, -0.82);
    windshield.rotation.x = 0.22;
    cab.add(windshield);

    const sideGlassL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, 1.54), glassMat);
    sideGlassL.position.set(-0.56, 0.96, -0.02);
    cab.add(sideGlassL);

    const sideGlassR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, 1.54), glassMat);
    sideGlassR.position.set(0.56, 0.96, -0.02);
    cab.add(sideGlassR);

    const seatBase = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.24, 0.54), darkSlate);
    seatBase.position.set(0, 0.18, 0.26);
    cab.add(seatBase);
    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.16), darkSlate);
    seatBack.position.set(0, 0.56, 0.48);
    seatBack.rotation.x = -0.12;
    cab.add(seatBack);

    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.46, 0.44), darkSlate);
    dash.position.set(0, 0.25, -0.58);
    cab.add(dash);

    this.steeringWheelMesh = new THREE.Group();
    this.steeringWheelMesh.position.set(0, 0.62, -0.38);
    this.steeringWheelMesh.rotation.x = 0.55;
    this.steeringWheelMesh.add(new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.03, 8, 16), darkSlate));
    this.steeringWheelMesh.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.035, 0.035), midSlate));
    cab.add(this.steeringWheelMesh);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.18, 1.88), roofWhite);
    roof.position.set(0, 1.52, 0.04);
    roof.castShadow = true;
    cab.add(roof);

    const ledMat = new THREE.MeshStandardMaterial({
      color: 0xfff8dc,
      emissive: 0xffe49e,
      emissiveIntensity: 0.75
    });
    for (const lx of [-0.42, -0.16, 0.16, 0.42]) {
      const lampHousing = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.13, 0.12), darkSlate);
      lampHousing.position.set(lx, 1.66, -0.78);
      cab.add(lampHousing);
      const lens = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 0.03), ledMat);
      lens.position.set(lx, 1.66, -0.85);
      cab.add(lens);
    }

    const beaconBase = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 10), darkSlate);
    beaconBase.position.set(0.36, 1.66, 0.52);
    cab.add(beaconBase);
    this.beaconLight = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.085, 0.18, 12),
      new THREE.MeshStandardMaterial({
        color: 0xffa000,
        emissive: 0xff8800,
        emissiveIntensity: 0.9,
        roughness: 0.25
      })
    );
    this.beaconLight.position.set(0.36, 1.78, 0.52);
    cab.add(this.beaconLight);

    this.chassisGroup.add(cab);

    // 4 Lugged Agricultural Wheels
    const wheelCoords: [number, number, boolean][] = [
      [-1.08, -1.28, true],
      [1.08, -1.28, true],
      [-1.08, 1.38, false],
      [1.08, 1.38, false]
    ];

    for (const [wx, wz, isFront] of wheelCoords) {
      const fender = new THREE.Mesh(
        new THREE.CylinderGeometry(0.86, 0.86, 0.56, 14, 1, true, -Math.PI * 0.36, Math.PI * 0.72),
        darkSlate
      );
      fender.rotation.z = Math.PI / 2;
      fender.position.set(wx, 0.74, wz);
      fender.castShadow = true;
      this.chassisGroup.add(fender);

      const pivot = new THREE.Group();
      pivot.position.set(wx, 0.74, wz);

      const spin = new THREE.Group();
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.74, 0.52, 20), tireRubber);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      tire.receiveShadow = true;
      spin.add(tire);

      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const lug = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.14), tireRubber);
        lug.position.set(0, Math.cos(a) * 0.74, Math.sin(a) * 0.74);
        lug.rotation.x = -a;
        spin.add(lug);
      }

      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.54, 18), wheelOrange);
      rim.rotation.z = Math.PI / 2;
      spin.add(rim);

      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.19, 0.59, 12), midSlate);
      hub.rotation.z = Math.PI / 2;
      spin.add(hub);

      pivot.add(spin);
      this.chassisGroup.add(pivot);
      this.wheelPivots.push({ pivot, spin, isFront });
    }

    // Telescopic Boom
    this.boomPivot.position.copy(this.boomBaseLocal);
    this.chassisGroup.add(this.boomPivot);

    const outerBoom = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.52, 3.65), claasGreen);
    outerBoom.position.set(0, 0, -1.78);
    outerBoom.castShadow = true;
    outerBoom.receiveShadow = true;
    this.boomPivot.add(outerBoom);

    const boomLamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.14), darkSlate);
    boomLamp.position.set(-0.28, 0.18, -3.35);
    this.boomPivot.add(boomLamp);

    this.innerBoom.position.set(0, 0, -3.55);
    const innerBeam = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.38, 3.85), midSlate);
    innerBeam.position.set(0, 0, 1.75);
    innerBeam.castShadow = true;
    this.innerBoom.add(innerBeam);

    const boomNose = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.44, 0.58), darkSlate);
    boomNose.position.set(0, -0.1, -0.26);
    boomNose.rotation.x = 0.28;
    boomNose.castShadow = true;
    this.innerBoom.add(boomNose);

    for (const hx of [-0.14, 0.14]) {
      const hose = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.028, 6, 12, Math.PI), tireRubber);
      hose.position.set(hx, 0.12, -0.22);
      hose.rotation.y = Math.PI / 2;
      this.innerBoom.add(hose);
    }
    this.boomPivot.add(this.innerBoom);

    this.headPivot.position.set(0, -0.26, -0.52);
    const couplerPlate = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.56, 0.18), darkSlate);
    couplerPlate.castShadow = true;
    this.headPivot.add(couplerPlate);

    this.attachmentMount.position.set(0, -0.05, -0.08);
    this.headPivot.add(this.attachmentMount);
    this.innerBoom.add(this.headPivot);

    this.liftCylOuter = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.72, 10), darkSlate);
    this.liftCylOuter.castShadow = true;
    this.chassisGroup.add(this.liftCylOuter);

    this.liftCylRod = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 1.0, 10), chrome);
    this.chassisGroup.add(this.liftCylRod);
  }

  public cycleSteeringMode(): SteeringMode {
    const order: SteeringMode[] = ['4WS', '2WS', 'CRAB'];
    const next = order[(order.indexOf(this.steeringMode) + 1) % order.length];
    this.steeringMode = next;
    return next;
  }

  public equipTool(tool: AttachmentType, notify = true): void {
    this.releaseAll(false);

    if (this.activeAttachmentMesh) {
      this.attachmentMount.remove(this.activeAttachmentMesh);
      this.activeAttachmentMesh = null;
    }

    this.activeTool = tool;
    this.clampClosed = false;
    this.squeezePressure = 0;

    if (tool !== 'none') {
      const dropIdx = this.droppedAttachments.findIndex((d) => d.type === tool);
      if (dropIdx >= 0) {
        this.scene.remove(this.droppedAttachments[dropIdx].mesh);
        this.droppedAttachments.splice(dropIdx, 1);
      }

      const mesh = buildAttachmentMesh(tool);
      this.activeAttachmentMesh = mesh;
      this.attachmentMount.add(mesh);
    }

    if (notify) {
      this.callbacks.onToolChanged(tool, tool !== 'none');
    }
  }

  public dropCurrentTool(): boolean {
    if (this.activeTool === 'none') return false;
    const droppedType = this.activeTool;
    this.releaseAll(false);

    const worldPos = new THREE.Vector3();
    this.attachmentMount.getWorldPosition(worldPos);
    worldPos.y = 0.42;

    const mesh = buildAttachmentMesh(droppedType);
    mesh.position.copy(worldPos);
    mesh.rotation.y = this.heading;
    this.scene.add(mesh);

    this.droppedAttachments.push({
      type: droppedType,
      mesh,
      pos: worldPos.clone(),
      rotY: this.heading
    });

    this.equipTool('none', true);
    return true;
  }

  public tryHitchNearby(rackSpots: { tool: Exclude<AttachmentType, 'none'>; pos: THREE.Vector3 }[]): boolean {
    const tipPos = this.getHoldWorldPos();

    // 1. Check physically dropped tools on the ground
    for (let i = 0; i < this.droppedAttachments.length; i++) {
      const d = this.droppedAttachments[i];
      if (d.pos.distanceTo(tipPos) < 3.4 || d.pos.distanceTo(this.position) < 4.4) {
        const old = this.activeTool;
        this.scene.remove(d.mesh);
        this.droppedAttachments.splice(i, 1);
        if (old !== 'none') {
          this.equipTool('none', false);
        }
        this.equipTool(d.type, true);
        return true;
      }
    }

    // 2. Check Shed Tool Rack stands (returns current tool neatly to its bay!)
    for (const spot of rackSpots) {
      if (spot.tool !== this.activeTool && (spot.pos.distanceTo(tipPos) < 3.6 || spot.pos.distanceTo(this.position) < 4.8)) {
        this.equipTool(spot.tool, true);
        return true;
      }
    }

    // 3. Otherwise uncouple current tool right where you are
    if (this.activeTool !== 'none') {
      return this.dropCurrentTool();
    }
    return false;
  }

  public getHoldWorldPos(): THREE.Vector3 {
    const local = new THREE.Vector3(0, -0.05, -1.05);
    if (this.activeTool === 'forks') local.set(0, 0.36, -0.96);
    else if (this.activeTool === 'spike') local.set(0, -0.08, -1.05);
    else if (this.activeTool === 'grabber') local.set(0, 0.08, -1.02);
    else if (this.activeTool === 'grapple') local.set(0, 0.04, -1.02);
    else if (this.activeTool === 'bucket') local.set(0, 0.18, -0.84);
    return this.attachmentMount.localToWorld(local);
  }

  public getCabEyeWorldPos(): THREE.Vector3 {
    return this.chassisGroup.localToWorld(new THREE.Vector3(-0.56, 2.38, -0.08));
  }

  public getBoomTipWorldPos(): THREE.Vector3 {
    return this.headPivot.localToWorld(new THREE.Vector3(0, 0.4, -0.4));
  }

  public releaseAll(allowFling = true): void {
    if (this.heldProps.length === 0) return;
    const tipSpeed = this.smoothedTipVel.length();
    const isFling = allowFling && tipSpeed > 3.6;

    for (const p of this.heldProps) {
      p.heldByTractor = false;
      p.body.wakeUp();
      this.holdOffsets.delete(p.id);

      const vx = this.smoothedTipVel.x;
      const vy = this.smoothedTipVel.y;
      const vz = this.smoothedTipVel.z;

      if (isFling) {
        const boost = 1.38;
        p.body.velocity.set(vx * boost, Math.max(2.4, vy * boost + tipSpeed * 0.32), vz * boost);
        p.body.angularVelocity.set(
          (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 5
        );
        p.wasThrown = true;
        p.throwOrigin.set(p.body.position.x, p.body.position.y, p.body.position.z);
        this.callbacks.onPropFling(p, tipSpeed * boost);
      } else {
        // Gentle set-down for accurate pallet & bale stacking!
        p.body.velocity.set(vx * 0.25, Math.max(-0.4, vy * 0.25), vz * 0.25);
        p.body.angularVelocity.scale(0.15, p.body.angularVelocity);
        p.wasThrown = false;
      }
    }

    this.heldProps = [];
    this.clampClosed = false;
    this.squeezePressure = 0;
  }

  private warnOnce(msg: string): void {
    const now = performance.now();
    if (now - this.lastWarnAt > 1400) {
      this.lastWarnAt = now;
      this.callbacks.onWrongTool(msg);
    }
  }

  private tryGrabNearest(props: FarmProp[]): boolean {
    if (this.activeTool === 'none') {
      this.warnOnce('No attachment hitched! Drive to the Tool Shed & press [T]');
      return false;
    }

    const holdPos = this.getHoldWorldPos();
    const maxCount = this.activeTool === 'bucket' ? 4 : 1;
    const grabRadius =
      this.activeTool === 'bucket'
        ? 1.95
        : this.activeTool === 'forks'
          ? 1.48
          : this.activeTool === 'grabber'
            ? 1.75
            : 1.65;

    const candidates = props
      .filter((p) => !p.heldByTractor)
      .map((p) => {
        const dp = new THREE.Vector3(p.body.position.x, p.body.position.y, p.body.position.z);
        return { prop: p, dist: dp.distanceTo(holdPos), dy: dp.y - holdPos.y };
      })
      .filter((c) => c.dist < grabRadius + c.prop.radius * 0.3)
      .sort((a, b) => a.dist - b.dist);

    if (candidates.length === 0) return false;

    let grabbedAny = false;
    for (const c of candidates) {
      if (this.heldProps.length >= maxCount) break;
      const prop = c.prop;

      // === REALISTIC TOOL-TO-TASK SKILL RULES ===
      if (this.activeTool === 'forks') {
        if (prop.kind !== 'crate') {
          this.warnOnce(`Forks won't grip a ${prop.label} — swap tools at the Shed!`);
          continue;
        }
        // Must have forks reasonably level & aligned beneath pallet height!
        if (Math.abs(this.headTilt) > 0.34) {
          this.warnOnce('Level your forks [Z / C] before lifting a pallet!');
          continue;
        }
        if (Math.abs(c.dy) > 0.65) {
          this.warnOnce('Adjust boom height [Q / E] to slide forks cleanly under the pallet!');
          continue;
        }
      } else if (this.activeTool === 'spike') {
        if (prop.isWrappedSilage) {
          this.callbacks.onSilagePopped(prop, 'POP! Bale Spike punctured the silage plastic!');
          continue;
        }
        if (prop.kind === 'crate') {
          this.callbacks.onPropDamaged(prop, 'CRUNCH! Bale Spike splintered the produce pallet!');
          continue;
        }
        if (prop.kind !== 'hay_round' && prop.kind !== 'hay_square') {
          this.warnOnce(`Bale Spike is for Dry Hay Bales — swap tools at the Shed!`);
          continue;
        }
      } else if (this.activeTool === 'grabber') {
        if (prop.kind === 'log' || prop.kind === 'pumpkin') {
          this.warnOnce(`Bale Grabber slips on ${prop.label} — try Grapple or Bucket!`);
          continue;
        }
        if (prop.kind === 'crate' && !prop.isDamaged) {
          this.warnOnce('Careful! Use Pallet Forks for intact Produce Pallets (Grabber can crush!)');
        }
      } else if (this.activeTool === 'grapple') {
        if (prop.isWrappedSilage && !prop.isPopped) {
          this.callbacks.onSilagePopped(prop, 'POP! Sharp Grapple teeth tore the silage wrap!');
        }
        if (prop.kind === 'crate' && !prop.isDamaged) {
          this.callbacks.onPropDamaged(prop, 'CRUNCH! Grapple Claw crushed the produce pallet!');
        }
        if (prop.kind === 'pumpkin' && !prop.isDamaged) {
          this.callbacks.onPropDamaged(prop, 'SPLAT! Grapple jaws squashed the pumpkin!');
        }
      } else if (this.activeTool === 'bucket') {
        if (prop.kind === 'log' || prop.kind === 'hay_round' || prop.kind === 'silage_wrapped') {
          this.warnOnce(`${prop.label} is too big for the Scoop Bucket!`);
          continue;
        }
        if (this.headTilt > 0.36) {
          this.warnOnce('Level or curl back the Scoop Bucket [Z] to scoop items!');
          continue;
        }
      }

      prop.heldByTractor = true;
      prop.wasThrown = false;
      prop.body.wakeUp();
      this.heldProps.push(prop);

      const idx = this.heldProps.length - 1;
      const offset =
        this.activeTool === 'bucket'
          ? new THREE.Vector3(((idx % 2) - 0.5) * 0.62, 0.08 + Math.floor(idx / 2) * 0.36, (idx % 2) * 0.08)
          : new THREE.Vector3(0, 0, 0);
      this.holdOffsets.set(prop.id, offset);
      this.callbacks.onPropGrabbed(prop, this.activeTool);
      grabbedAny = true;
    }

    if (grabbedAny) {
      this.clampClosed = true;
    }
    return grabbedAny;
  }

  public resetPosition(): void {
    this.releaseAll(false);
    this.position.set(-2, 0, 14.5);
    this.heading = 0.18;
    this.speed = 0;
    this.yawRate = 0;
    this.boomPitch = 0.06;
    this.boomExt = 0;
    this.headTilt = 0;
  }

  public update(dt: number, elapsed: number, input: TractorInput, props: FarmProp[]): void {
    // --- 1. Driving, Precision Creep & Multi-Mode Steering ---
    const maxSpeed = input.creep ? 3.2 : input.boost ? 13.5 : 8.8;
    const accel = input.creep ? 10 : input.boost ? 20 : 14;

    if (Math.abs(input.throttle) > 0.01) {
      const target = input.throttle * maxSpeed;
      const diff = target - this.speed;
      this.speed += Math.sign(diff) * Math.min(Math.abs(diff), accel * dt);
    } else {
      const drag = 14 * dt;
      if (Math.abs(this.speed) <= drag) this.speed = 0;
      else this.speed -= Math.sign(this.speed) * drag;
    }

    const targetSteer = input.steer * (input.creep ? 0.44 : 0.6);
    this.steerAngle += (targetSteer - this.steerAngle) * Math.min(1, dt * 9);

    const prevPos = this.position.clone();
    const prevHeading = this.heading;

    if (this.steeringMode === 'CRAB') {
      this.yawRate = 0;
      const moveAngle = this.heading + this.steerAngle * 0.9;
      this.position.x -= Math.sin(moveAngle) * this.speed * dt;
      this.position.z -= Math.cos(moveAngle) * this.speed * dt;
    } else {
      const turnMult = this.steeringMode === '4WS' ? 0.54 : 0.34;
      const effectiveSpeed =
        Math.abs(this.speed) > 0.25
          ? this.speed
          : Math.sign(input.throttle || 1) * (input.creep ? 0.45 : 0.95) * Math.abs(input.steer);
      this.yawRate = this.steerAngle * effectiveSpeed * turnMult;
      this.heading += this.yawRate * dt;
      this.position.x -= Math.sin(this.heading) * this.speed * dt;
      this.position.z -= Math.cos(this.heading) * this.speed * dt;
    }

    const limit = 29.2;
    if (this.position.x < -limit) {
      this.position.x = -limit;
      this.speed *= 0.3;
    } else if (this.position.x > limit) {
      this.position.x = limit;
      this.speed *= 0.3;
    }
    if (this.position.z < -28.2) {
      this.position.z = -28.2;
      this.speed *= 0.3;
    } else if (this.position.z > 28.2) {
      this.position.z = 28.2;
      this.speed *= 0.3;
    }

    // --- 2. Telescopic Boom Hydraulics (with fine precision in Creep mode!) ---
    const fine = input.creep ? 0.45 : 1.0;
    this.prevHeadTilt = this.headTilt;
    this.boomPitch = THREE.MathUtils.clamp(this.boomPitch + input.boomLift * 0.98 * fine * dt, -0.15, 1.06);
    this.boomExt = THREE.MathUtils.clamp(this.boomExt + input.boomExtend * 2.9 * fine * dt, 0, 3.6);
    this.headTilt = THREE.MathUtils.clamp(this.headTilt + input.headTilt * 1.9 * fine * dt, -0.78, 1.15);

    this.hydroLoad = Math.min(
      1,
      Math.abs(input.boomLift) + Math.abs(input.boomExtend) + Math.abs(input.headTilt) * 0.8
    );

    // --- 3. Wheels, Steering, Beacon & Dust ---
    const wheelRadius = 0.74;
    const wheelDelta = (this.speed * dt) / wheelRadius;
    for (const w of this.wheelPivots) {
      w.spin.rotation.x -= wheelDelta;
      if (this.steeringMode === '4WS') {
        w.pivot.rotation.y = w.isFront ? this.steerAngle : -this.steerAngle * 0.85;
      } else if (this.steeringMode === '2WS') {
        w.pivot.rotation.y = w.isFront ? this.steerAngle : 0;
      } else {
        w.pivot.rotation.y = this.steerAngle;
      }
    }
    this.steeringWheelMesh.rotation.z = this.steerAngle * 2.4;

    const flash = 0.4 + 0.6 * Math.abs(Math.sin(elapsed * 7.5));
    (this.beaconLight.material as THREE.MeshStandardMaterial).emissiveIntensity = flash * 1.35;

    if (Math.abs(this.speed) > 4.5) {
      this.dustTimer += dt;
      if (this.dustTimer > 0.15) {
        this.dustTimer = 0;
        const rearL = this.chassisGroup.localToWorld(new THREE.Vector3(-1.05, 0.15, 1.45));
        const rearR = this.chassisGroup.localToWorld(new THREE.Vector3(1.05, 0.15, 1.45));
        this.callbacks.onDust(rearL);
        this.callbacks.onDust(rearR);
      }
    }

    // --- 4. Action Input: Grab / Release / Fling / Hydraulic Squeeze ---
    const justPressed = input.actionHeld && !this.actionWasHeld;
    const justReleased = !input.actionHeld && this.actionWasHeld;

    if (justPressed) {
      this.holdTimer = 0;
      this.grabLockedOnPress = false;
      if (this.heldProps.length === 0) {
        if (this.tryGrabNearest(props)) {
          this.grabLockedOnPress = true;
        } else {
          this.clampClosed = !this.clampClosed;
        }
      }
    }

    if (input.actionHeld && this.heldProps.length > 0 && !this.grabLockedOnPress) {
      this.holdTimer += dt;
      if (this.activeTool === 'grabber' && this.holdTimer > 0.24) {
        this.squeezePressure = Math.min(1, this.squeezePressure + dt * 0.72);
        const held = this.heldProps[0];
        if (held) {
          if (held.isWrappedSilage && !held.isPopped && this.squeezePressure >= 0.85) {
            this.callbacks.onSilagePopped(held, 'POP! Squeezed too hard — air got in the silage!');
            this.squeezePressure = 0.25;
            this.holdTimer = 0;
          } else if (held.crushable && !held.isDamaged && this.squeezePressure >= 0.82) {
            this.callbacks.onPropDamaged(held, `CRUSHED ${held.label}!`);
            this.squeezePressure = 0.2;
            this.holdTimer = 0;
          }
        }
      }
    }

    if (justReleased) {
      if (this.heldProps.length > 0 && !this.grabLockedOnPress && this.holdTimer < 0.3) {
        this.releaseAll(true);
      }
      this.squeezePressure = Math.max(0, this.squeezePressure - 0.5);
      this.holdTimer = 0;
      this.grabLockedOnPress = false;
    }

    if (!input.actionHeld) {
      this.squeezePressure = Math.max(0, this.squeezePressure - dt * 2.2);
    }
    this.actionWasHeld = input.actionHeld;

    // REALISTIC BALANCE / SPILL MECHANICS!
    // 1. Pallets on Forks slide off if you tilt forward too far (> 0.42) or whip recklessly high!
    if (this.activeTool === 'forks' && this.heldProps.length > 0) {
      const recklessWhip = this.boomPitch > 0.5 && Math.abs(this.yawRate) > 1.8 && Math.abs(this.speed) > 6.5;
      if (this.headTilt > 0.42) {
        this.releaseAll(false);
        this.warnOnce('Forks tilted too far forward — pallet slid off!');
      } else if (recklessWhip) {
        this.releaseAll(true);
        this.warnOnce('Too fast with a high load — pallet slipped off forks!');
      }
    }
    // 2. Bucket naturally pours out when tilted forward past 0.52!
    if (this.activeTool === 'bucket' && this.heldProps.length > 0 && this.headTilt > 0.52) {
      this.releaseAll(true);
    }

    // --- 5. Animate Attachment Jaws & Bale Grabber Arms ---
    if (this.activeAttachmentMesh) {
      if (this.activeTool === 'grabber') {
        const left = this.activeAttachmentMesh.getObjectByName('grabberLeft');
        const right = this.activeAttachmentMesh.getObjectByName('grabberRight');
        const targetSpread = this.clampClosed ? 0.68 - this.squeezePressure * 0.22 : 1.02;
        if (left && right) {
          left.position.x += (-targetSpread - left.position.x) * Math.min(1, dt * 12);
          right.position.x += (targetSpread - right.position.x) * Math.min(1, dt * 12);
        }
      } else if (this.activeTool === 'grapple') {
        const jaw = this.activeAttachmentMesh.getObjectByName('grappleJaw');
        if (jaw) {
          const targetRot = this.clampClosed ? -0.05 : 0.72;
          jaw.rotation.x += (targetRot - jaw.rotation.x) * Math.min(1, dt * 12);
        }
      }
    }

    // --- 6. Sync Visuals, Physics Colliders & Held Props ---
    this.syncTransforms(dt);

    // Passive Bale Spike puncture check (sharp spears poke wrapped silage!)
    if (this.activeTool === 'spike') {
      const tipPos = this.getHoldWorldPos();
      for (const p of props) {
        if (p.isWrappedSilage && !p.isPopped && !p.heldByTractor) {
          const dist = Math.hypot(
            p.body.position.x - tipPos.x,
            p.body.position.y - tipPos.y,
            p.body.position.z - tipPos.z
          );
          if (dist < 1.02) {
            this.callbacks.onSilagePopped(p, 'POP! Bale Spike poked the wrapped silage!');
          }
        }
      }
    }

    // --- 7. 8-TON WHEEL RUN-OVER CRUSH DETECTION! ---
    if (Math.abs(this.speed) > 0.55) {
      const wheelWorld = new THREE.Vector3();
      for (const w of this.wheelPivots) {
        w.pivot.getWorldPosition(wheelWorld);
        for (const p of props) {
          if (p.heldByTractor || p.isDamaged || p.body.position.y > 1.1) continue;
          const dx = p.body.position.x - wheelWorld.x;
          const dz = p.body.position.z - wheelWorld.z;
          const distXZ = Math.hypot(dx, dz);
          if (distXZ < p.radius + 0.42) {
            if (p.isWrappedSilage && !p.isPopped) {
              this.callbacks.onSilagePopped(p, 'SQUISH-POP! You drove right over a wrapped silage bale!');
            } else if (p.crushable) {
              this.callbacks.onPropDamaged(p, `CRUNCH! Your 8-ton tires ran over a ${p.label}!`);
            }
          }
        }
      }
    }

    // Update kinematic chassis velocity
    const safeDt = Math.max(0.004, dt);
    this.chassisBody.position.set(this.position.x, this.position.y, this.position.z);
    this.chassisBody.quaternion.setFromEuler(0, this.heading, 0);
    this.chassisBody.velocity.set(
      (this.position.x - prevPos.x) / safeDt,
      0,
      (this.position.z - prevPos.z) / safeDt
    );
    this.chassisBody.angularVelocity.set(0, (this.heading - prevHeading) / safeDt, 0);

    // Keep held props cleanly aligned with attachment
    const attachQuat = new THREE.Quaternion();
    this.attachmentMount.getWorldQuaternion(attachQuat);

    for (const p of this.heldProps) {
      const localOff = this.holdOffsets.get(p.id) ?? new THREE.Vector3();
      const targetPos = this.holdWorldPos.clone().add(localOff.clone().applyQuaternion(attachQuat));
      targetPos.y = Math.max(p.halfHeight + 0.04, targetPos.y);

      p.body.position.set(targetPos.x, targetPos.y, targetPos.z);
      p.body.velocity.set(0, 0, 0);
      p.body.angularVelocity.set(0, 0, 0);
      p.body.quaternion.set(attachQuat.x, attachQuat.y, attachQuat.z, attachQuat.w);

      if (this.activeTool === 'grabber' && this.squeezePressure > 0.05 && !p.isDamaged) {
        const sq = this.squeezePressure * 0.24;
        p.mesh.scale.set(1 - sq, 1 + sq * 0.35, 1 + sq * 0.35);
      } else if (!p.isDamaged && !p.isPopped) {
        p.mesh.scale.set(1, 1, 1);
      }
    }
  }

  private syncTransforms(dt: number): void {
    // Realistic suspension nose-dip when carrying heavy loads with boom extended!
    const loadMoment = this.heldProps.length > 0 ? 0.018 + this.boomExt * 0.012 : 0;
    const pitchTilt = THREE.MathUtils.clamp(-this.speed * 0.004 - loadMoment, -0.085, 0.04);
    const rollTilt = THREE.MathUtils.clamp(this.yawRate * 0.045, -0.06, 0.06);

    this.root.position.copy(this.position);
    this.root.rotation.y = this.heading;
    this.chassisGroup.rotation.x = pitchTilt;
    this.chassisGroup.rotation.z = rollTilt;

    this.boomPivot.rotation.x = this.boomPitch;
    this.innerBoom.position.z = -3.55 - this.boomExt;
    // True telehandler self-leveling carriage compensated by boomPitch + operator headTilt
    this.headPivot.rotation.x = -this.boomPitch - this.headTilt;

    // Hydraulic lift cylinder tracking
    const boomMidLocal = new THREE.Vector3(0, -0.22, -1.75)
      .applyAxisAngle(new THREE.Vector3(1, 0, 0), this.boomPitch)
      .add(this.boomBaseLocal);

    const cylDir = boomMidLocal.clone().sub(this.cylAnchorLocal);
    const cylLen = cylDir.length();
    const cylUnit = cylDir.clone().normalize();
    const cylMid = this.cylAnchorLocal.clone().addScaledVector(cylUnit, Math.min(0.36, cylLen * 0.4));
    const rodMid = this.cylAnchorLocal.clone().addScaledVector(cylDir, 0.55);
    const up = new THREE.Vector3(0, 1, 0);
    const cylQuat = new THREE.Quaternion().setFromUnitVectors(up, cylUnit);

    this.liftCylOuter.position.copy(cylMid);
    this.liftCylOuter.quaternion.copy(cylQuat);
    this.liftCylRod.position.copy(rodMid);
    this.liftCylRod.quaternion.copy(cylQuat);
    this.liftCylRod.scale.y = Math.max(0.35, cylLen * 0.85);

    this.root.updateMatrixWorld(true);

    this.holdWorldPos.copy(this.getHoldWorldPos());
    const safeDt = Math.max(0.004, dt);
    this.tipWorldVel.copy(this.holdWorldPos).sub(this.prevHoldWorldPos).divideScalar(safeDt);
    this.smoothedTipVel.lerp(this.tipWorldVel, 0.42);
    this.prevHoldWorldPos.copy(this.holdWorldPos);

    const headWorldPos = this.headPivot.localToWorld(new THREE.Vector3(0, -0.18, -0.78));
    const headWorldQuat = new THREE.Quaternion();
    this.headPivot.getWorldQuaternion(headWorldQuat);
    this.headBody.position.set(headWorldPos.x, Math.max(0.26, headWorldPos.y), headWorldPos.z);
    this.headBody.quaternion.set(headWorldQuat.x, headWorldQuat.y, headWorldQuat.z, headWorldQuat.w);
    this.headBody.velocity.set(this.smoothedTipVel.x, this.smoothedTipVel.y, this.smoothedTipVel.z);
  }
}
