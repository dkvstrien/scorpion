import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createClaasDoorTexture } from './textures';
import {
  FARM_CENTER,
  FARM_GROUND_Y,
  getDrivableGroundY,
  getShorelineX,
  WORLD_MAX_X,
  WORLD_MAX_Z,
  WORLD_MIN_X,
  WORLD_MIN_Z
} from './terrain';
import { FarmProp } from './props';
import { DynamicVillageObj } from './realWorld';

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
  onPropFling: (label: string, speed: number) => void;
  onPropGrabbed: (label: string, tool: AttachmentType, isSilageIntact?: boolean) => void;
  onWrongTool: (message: string) => void;
  onToolChanged: (tool: AttachmentType, attached: boolean) => void;
  onDust: (pos: THREE.Vector3) => void;
  onExhaust: (pos: THREE.Vector3) => void;
  onWheelTrack: (x: number, z: number, heading: number) => void;
  onOverloadAlarm: () => void;
  onTippedOver: (pos: THREE.Vector3) => void;
}

export const TOOL_META: Record<AttachmentType, { name: string; tip: string }> = {
  none: { name: 'Quick-Hitch Empty', tip: 'Drive to the Tool Shed & press [T] to couple a tool' },
  forks: { name: 'Pallet Forks', tip: 'Hold [Alt] for precision laser · keep heavy pallets low when turning!' },
  spike: { name: 'Bale Spike', tip: 'Skewer Dry Hay Bales · keep sharp spears away from Wrapped Silage!' },
  grabber: { name: 'Bale Grabber', tip: 'Tap [Space] for gentle silage grip · hold [Space] to squeeze/crush!' },
  grapple: { name: 'Grapple Claw', tip: 'Clamp Logs, Drums, Tires & Cars — watch your Tip-O-Meter!' },
  bucket: { name: 'Scoop Bucket', tip: 'Scoop Pumpkins level, curl back [Z] to carry, tilt [C] to pour' }
};

export function buildAttachmentMesh(type: Exclude<AttachmentType, 'none'>): THREE.Group {
  const g = new THREE.Group();
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x33393e, roughness: 0.48, metalness: 0.5 });
  const accentSteel = new THREE.MeshStandardMaterial({ color: 0x525a60, roughness: 0.44, metalness: 0.56 });
  const claasGreen = new THREE.MeshStandardMaterial({ color: 0x9fd32e, roughness: 0.36, metalness: 0.16 });
  const claasRed = new THREE.MeshStandardMaterial({ color: 0xd94420, roughness: 0.44, metalness: 0.22 });
  const yellowTip = new THREE.MeshStandardMaterial({ color: 0xe6b822, roughness: 0.45, metalness: 0.22 });

  const backplate = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.72, 0.14), darkSteel);
  backplate.position.set(0, 0.08, -0.08);
  backplate.castShadow = true;
  g.add(backplate);

  if (type === 'forks') {
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.14, 0.16), accentSteel);
    topRail.position.set(0, 0.42, -0.14);
    topRail.castShadow = true;
    g.add(topRail);

    const laserMat = new THREE.MeshBasicMaterial({ color: 0x9fd32e, transparent: true, opacity: 0.58 });
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

      const laser = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 2.2, 6), laserMat);
      laser.name = sx < 0 ? 'forkLaserL' : 'forkLaserR';
      laser.rotation.x = Math.PI / 2;
      laser.position.set(sx, -0.32, -2.85);
      laser.visible = false;
      g.add(laser);
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
      jawPivot.add(arm);

      const fang = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.58, 0.12), claasRed);
      fang.position.set(sx, -0.16, -1.04);
      fang.rotation.x = 0.35;
      jawPivot.add(fang);
    }
    g.add(jawPivot);
  } else if (type === 'bucket') {
    const bw = 2.15;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.12, 1.38), darkSteel);
    floor.position.set(0, -0.34, -0.78);
    floor.castShadow = true;
    g.add(floor);

    const back = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.92, 0.12), accentSteel);
    back.position.set(0, 0.12, -0.14);
    back.castShadow = true;
    g.add(back);

    const topLip = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.12, 0.42), claasGreen);
    topLip.position.set(0, 0.56, -0.3);
    g.add(topLip);

    for (const sx of [-bw * 0.5 + 0.06, bw * 0.5 - 0.06]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 1.28), darkSteel);
      side.position.set(sx, 0.1, -0.72);
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

  public position = new THREE.Vector3(FARM_CENTER.x - 2, FARM_GROUND_Y, FARM_CENTER.z + 14.5);
  public heading = 0.18;
  public speed = 0;
  public yawRate = 0;
  public steerAngle = 0;
  public steeringMode: SteeringMode = '4WS';

  public boomPitch = 0.06;
  public boomExt = 0;
  public headTilt = 0.0;
  public prevHeadTilt = 0.0;

  // Live True Rigid-Body Telemetry!
  public loadMoment = 0;
  public pitchDeg = 0;
  public rollDeg = 0;
  public wheelsOnGround = 4;
  public isTipped = false;
  public workLightsOn = false;
  public distanceMeters = 0;

  public activeTool: AttachmentType = 'forks';
  public freePlayMode = false;
  public heldProps: FarmProp[] = [];
  public heldVillageObj: DynamicVillageObj | null = null;
  public clampClosed = false;
  public squeezePressure = 0;
  public hydroLoad = 0;
  public droppedAttachments: DroppedAttachment[] = [];

  private wheelPivots: {
    pivot: THREE.Group;
    spin: THREE.Group;
    isFront: boolean;
    baseY: number;
    localX: number;
    localZ: number;
    compression: number;
  }[] = [];
  private steeringWheelMesh!: THREE.Group;
  private driverHead!: THREE.Mesh;
  private driverLeftArm!: THREE.Mesh;
  private aPillarLeds: THREE.MeshStandardMaterial[] = [];
  private workSpotLights: THREE.SpotLight[] = [];
  private ledLensMat!: THREE.MeshStandardMaterial;
  private beaconLight!: THREE.Mesh;
  private exhaustTipLocal = new THREE.Vector3(0.94, 2.86, 1.48);

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
  private trackTimer = 0;
  private exhaustTimer = 0;
  private actionWasHeld = false;
  private holdTimer = 0;
  private grabLockedOnPress = false;
  private lastWarnAt = 0;
  private wasTipped = false;
  private uprightTimer = 2.0;
  private rolloverCooldown = 0;
  private readonly comY = 1.05;
  private readonly comZ = 0.28;
  private scene: THREE.Scene;
  private callbacks: TractorCallbacks;

  constructor(scene: THREE.Scene, world: CANNON.World, tractorMat: CANNON.Material, callbacks: TractorCallbacks) {
    this.scene = scene;
    this.callbacks = callbacks;

    this.buildTractorVisuals();
    // Shift visual chassis so root (0,0,0) aligns with the true physical Center of Mass (height 1.05m, rear-biased counterweight)!
    this.chassisGroup.position.set(0, -this.comY, -this.comZ);
    this.root.add(this.chassisGroup);
    scene.add(this.root);

    // === TRUE DYNAMIC 6,800 KG RIGID-BODY CHASSIS (CAN GENUINELY TIP FORWARD OR ROLL ONTO ITS SIDE!) ===
    this.chassisBody = new CANNON.Body({
      mass: 6800,
      type: CANNON.Body.DYNAMIC,
      material: tractorMat,
      linearDamping: 0.06,
      angularDamping: 0.26,
      collisionFilterGroup: 2,
      collisionFilterMask: 1 // Collides with terrain, buildings, props & cars — NEVER with kinematic headBody!
    });
    // Lower steel frame + rear counterweight + ROPS cab cage (offset around CoM so cab hits ground on rollover!)
    this.chassisBody.addShape(
      new CANNON.Box(new CANNON.Vec3(1.06, 0.42, 2.05)),
      new CANNON.Vec3(0, 0.98 - this.comY, 0.12 - this.comZ)
    );
    this.chassisBody.addShape(
      new CANNON.Box(new CANNON.Vec3(0.58, 0.68, 0.88)),
      new CANNON.Vec3(-0.56, 2.25 - this.comY, 0.18 - this.comZ)
    );
    this.chassisBody.addShape(
      new CANNON.Box(new CANNON.Vec3(0.48, 0.44, 1.3)),
      new CANNON.Vec3(0.56, 1.56 - this.comY, 0.56 - this.comZ)
    );
    this.chassisBody.position.set(this.position.x, this.position.y + this.comY, this.position.z);
    this.chassisBody.quaternion.setFromEuler(0, this.heading, 0);
    this.chassisBody.allowSleep = false;
    world.addBody(this.chassisBody);

    this.headBody = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.KINEMATIC,
      material: tractorMat,
      collisionFilterGroup: 4,
      collisionFilterMask: 1 // Pushes props & cars cleanly without EVER touching chassisBody!
    });
    world.addBody(this.headBody);

    this.equipTool('forks', false);
    this.syncVisualsFromBody(0.016, false);
    this.prevHoldWorldPos.copy(this.holdWorldPos);
  }

  private rebuildHeadColliders(tool: AttachmentType): void {
    this.headBody.shapes.length = 0;
    this.headBody.shapeOffsets.length = 0;
    this.headBody.shapeOrientations.length = 0;

    if (tool === 'forks') {
      this.headBody.addShape(new CANNON.Box(new CANNON.Vec3(0.075, 0.045, 0.78)), new CANNON.Vec3(-0.42, -0.32, -0.96));
      this.headBody.addShape(new CANNON.Box(new CANNON.Vec3(0.075, 0.045, 0.78)), new CANNON.Vec3(0.42, -0.32, -0.96));
      this.headBody.addShape(new CANNON.Box(new CANNON.Vec3(0.75, 0.36, 0.09)), new CANNON.Vec3(0, 0.08, -0.14));
    } else if (tool === 'bucket') {
      this.headBody.addShape(new CANNON.Box(new CANNON.Vec3(1.06, 0.07, 0.68)), new CANNON.Vec3(0, -0.34, -0.78));
      this.headBody.addShape(new CANNON.Box(new CANNON.Vec3(1.06, 0.45, 0.07)), new CANNON.Vec3(0, 0.12, -0.14));
      this.headBody.addShape(new CANNON.Box(new CANNON.Vec3(0.07, 0.44, 0.64)), new CANNON.Vec3(-1.01, 0.1, -0.72));
      this.headBody.addShape(new CANNON.Box(new CANNON.Vec3(0.07, 0.44, 0.64)), new CANNON.Vec3(1.01, 0.1, -0.72));
    } else if (tool === 'grabber') {
      this.headBody.addShape(new CANNON.Box(new CANNON.Vec3(0.95, 0.18, 0.14)), new CANNON.Vec3(0, 0.1, -0.2));
      this.headBody.addShape(new CANNON.Box(new CANNON.Vec3(0.12, 0.28, 0.65)), new CANNON.Vec3(-0.88, 0.08, -0.96));
      this.headBody.addShape(new CANNON.Box(new CANNON.Vec3(0.12, 0.28, 0.65)), new CANNON.Vec3(0.88, 0.08, -0.96));
    } else {
      this.headBody.addShape(new CANNON.Box(new CANNON.Vec3(0.68, 0.25, 0.48)), new CANNON.Vec3(0, -0.05, -0.58));
    }
    this.headBody.updateMassProperties();
    this.headBody.updateBoundingRadius();
  }

  public setWorkLights(on: boolean): void {
    this.workLightsOn = on;
    for (const sl of this.workSpotLights) sl.intensity = on ? 26 : 0;
    this.ledLensMat.emissiveIntensity = on ? 2.2 : 0.65;
  }

  private buildTractorVisuals(): void {
    const claasGreen = new THREE.MeshStandardMaterial({ color: 0x9fd32e, roughness: 0.34, metalness: 0.16 });
    const darkSlate = new THREE.MeshStandardMaterial({ color: 0x353b3f, roughness: 0.56, metalness: 0.38 });
    const midSlate = new THREE.MeshStandardMaterial({ color: 0x525a60, roughness: 0.46, metalness: 0.48 });
    const wheelOrange = new THREE.MeshStandardMaterial({ color: 0xe34822, roughness: 0.34, metalness: 0.22 });
    const tireRubber = new THREE.MeshStandardMaterial({ color: 0x202326, roughness: 0.94 });
    const roofWhite = new THREE.MeshStandardMaterial({ color: 0xf1f3ee, roughness: 0.42 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xd8e0e6, roughness: 0.14, metalness: 0.92 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x1d313b,
      roughness: 0.08,
      metalness: 0.42,
      transparent: true,
      opacity: 0.38
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

    const tailMat = new THREE.MeshStandardMaterial({ color: 0xd92518, emissive: 0x660a00, roughness: 0.3 });
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

    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.92, 8), darkSlate);
    exhaust.position.set(0.94, 2.4, 1.48);
    exhaust.rotation.z = -0.1;
    this.chassisGroup.add(exhaust);

    // Panoramic Left Cab + Animated Operator + Live A-Pillar Load-Moment LEDs
    const cab = new THREE.Group();
    cab.position.set(-0.56, 1.45, 0.18);

    const doorLeft = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.86, 1.66), [
      darkSlate,
      new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.36, metalness: 0.1 }),
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

    for (let i = 0; i < 6; i++) {
      const ledColor = i < 3 ? 0x5ee034 : i < 5 ? 0xf5b822 : 0xff3b24;
      const mat = new THREE.MeshStandardMaterial({
        color: ledColor,
        emissive: ledColor,
        emissiveIntensity: 0.08
      });
      this.aPillarLeds.push(mat);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.045, 0.04), mat);
      bar.position.set(0.49, 0.56 + i * 0.07, -0.72);
      cab.add(bar);
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

    const driverCoat = new THREE.MeshStandardMaterial({ color: 0x2d5e3b, roughness: 0.82 });
    const driverSkin = new THREE.MeshStandardMaterial({ color: 0xf0c299, roughness: 0.75 });
    const driverTorso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.54, 0.26), driverCoat);
    driverTorso.position.set(0, 0.54, 0.24);
    cab.add(driverTorso);

    this.driverHead = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), driverSkin);
    this.driverHead.position.set(0, 0.98, 0.2);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.18, 0.08, 10), claasGreen);
    cap.position.y = 0.12;
    this.driverHead.add(cap);
    cab.add(this.driverHead);

    this.driverLeftArm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.45), driverCoat);
    this.driverLeftArm.position.set(-0.18, 0.68, -0.05);
    cab.add(this.driverLeftArm);

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

    this.ledLensMat = new THREE.MeshStandardMaterial({
      color: 0xfff8dc,
      emissive: 0xffe49e,
      emissiveIntensity: 0.65
    });
    for (const lx of [-0.42, -0.16, 0.16, 0.42]) {
      const lampHousing = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.13, 0.12), darkSlate);
      lampHousing.position.set(lx, 1.66, -0.78);
      cab.add(lampHousing);
      const lens = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 0.03), this.ledLensMat);
      lens.position.set(lx, 1.66, -0.85);
      cab.add(lens);
    }

    for (const slx of [-0.36, 0.36]) {
      const sl = new THREE.SpotLight(0xfff1cc, 0, 42, Math.PI * 0.26, 0.55, 1.25);
      sl.position.set(slx, 1.66, -0.9);
      const tgt = new THREE.Object3D();
      tgt.position.set(slx * 1.4, -0.2, -15);
      cab.add(tgt);
      sl.target = tgt;
      cab.add(sl);
      this.workSpotLights.push(sl);
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
        roughness: 0.22
      })
    );
    this.beaconLight.position.set(0.36, 1.78, 0.52);
    cab.add(this.beaconLight);

    this.chassisGroup.add(cab);

    // 4 Chunky Agricultural Wheels with Independent Suspension Compression!
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
      fender.position.set(wx, 0.76, wz);
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
      this.wheelPivots.push({ pivot, spin, isFront, baseY: 0.74, localX: wx, localZ: wz, compression: 0.14 });
    }

    // Telescopic Boom
    this.boomPivot.position.copy(this.boomBaseLocal);
    this.chassisGroup.add(this.boomPivot);

    const outerBoom = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.52, 3.65), claasGreen);
    outerBoom.position.set(0, 0, -1.78);
    outerBoom.castShadow = true;
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

    this.rebuildHeadColliders(tool);
    if (notify) this.callbacks.onToolChanged(tool, tool !== 'none');
  }

  public dropCurrentTool(): boolean {
    if (this.activeTool === 'none') return false;
    const droppedType = this.activeTool;
    this.releaseAll(false);

    const worldPos = new THREE.Vector3();
    this.attachmentMount.getWorldPosition(worldPos);
    worldPos.y = getDrivableGroundY(worldPos.x, worldPos.z) + 0.42;

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

    for (let i = 0; i < this.droppedAttachments.length; i++) {
      const d = this.droppedAttachments[i];
      if (d.pos.distanceTo(tipPos) < 3.4 || d.pos.distanceTo(this.position) < 4.4) {
        const old = this.activeTool;
        this.scene.remove(d.mesh);
        this.droppedAttachments.splice(i, 1);
        if (old !== 'none') this.equipTool('none', false);
        this.equipTool(d.type, true);
        return true;
      }
    }

    for (const spot of rackSpots) {
      if (spot.tool !== this.activeTool && (spot.pos.distanceTo(tipPos) < 3.6 || spot.pos.distanceTo(this.position) < 4.8)) {
        this.equipTool(spot.tool, true);
        return true;
      }
    }

    if (this.activeTool !== 'none') return this.dropCurrentTool();
    return false;
  }

  public getHoldWorldPos(): THREE.Vector3 {
    const local = new THREE.Vector3(0, -0.05, -1.05);
    if (this.activeTool === 'forks') local.set(0, 0.34, -0.96);
    else if (this.activeTool === 'spike') local.set(0, -0.08, -1.05);
    else if (this.activeTool === 'grabber') local.set(0, 0.08, -1.02);
    else if (this.activeTool === 'grapple') local.set(0, 0.04, -1.02);
    else if (this.activeTool === 'bucket') local.set(0, 0.18, -0.84);
    return this.attachmentMount.localToWorld(local);
  }

  public getCabEyeWorldPos(): THREE.Vector3 {
    return this.chassisGroup.localToWorld(new THREE.Vector3(-0.56, 2.38, -0.06));
  }

  public getBoomTipWorldPos(): THREE.Vector3 {
    return this.headPivot.localToWorld(new THREE.Vector3(0, 0.4, -0.4));
  }

  public getTipSpeed(): number {
    return this.smoothedTipVel.length();
  }

  /**
   * Computes realistic kilogram mass of currently carried load (used for true dynamic tipping torque!).
   */
  public getCarriedMassKg(): number {
    let kg = 0;
    if (this.heldVillageObj) {
      kg += this.heldVillageObj.kind === 'car' ? 2750 : this.heldVillageObj.kind === 'maibaum' ? 1400 : 750;
    }
    for (const p of this.heldProps) {
      if (p.kind === 'silage_wrapped') kg += 1350;
      else if (p.kind === 'crate') kg += 1100;
      else if (p.kind === 'hay_round' || p.kind === 'hay_square') kg += 950;
      else if (p.kind === 'log') kg += 900;
      else kg += 420;
    }
    return kg;
  }

  public rightTractorInPlace(): void {
    this.releaseAll(false);
    const gx = this.chassisBody.position.x;
    const gz = this.chassisBody.position.z;
    const gy = getDrivableGroundY(gx, gz);
    this.chassisBody.position.set(gx, gy + this.comY + 0.18, gz);
    this.chassisBody.velocity.set(0, 0, 0);
    this.chassisBody.angularVelocity.set(0, 0, 0);
    this.chassisBody.quaternion.setFromEuler(0, this.heading, 0);
    this.isTipped = false;
    this.wasTipped = false;
    this.uprightTimer = 2.0;
    this.boomPitch = Math.min(this.boomPitch, 0.12);
    this.boomExt = 0;
  }

  public teleportTo(x: number, z: number, heading: number): void {
    this.releaseAll(false);
    const gy = getDrivableGroundY(x, z);
    this.chassisBody.position.set(x, gy + this.comY + 0.05, z);
    this.chassisBody.velocity.set(0, 0, 0);
    this.chassisBody.angularVelocity.set(0, 0, 0);
    this.chassisBody.quaternion.setFromEuler(0, heading, 0);
    this.heading = heading;
    this.isTipped = false;
    this.wasTipped = false;
    this.uprightTimer = 2.0;
    this.boomPitch = 0.08;
    this.boomExt = 0;
    this.headTilt = 0;
  }

  public resetPosition(): void {
    this.teleportTo(FARM_CENTER.x - 2, FARM_CENTER.z + 14.5, 0.18);
  }

  public releaseAll(allowMomentum = true): void {
    const tipSpeed = this.smoothedTipVel.length();
    const isGenuineThrow = allowMomentum && tipSpeed > 4.2;

    if (this.heldVillageObj) {
      const vo = this.heldVillageObj;
      vo.heldByTractor = false;
      vo.body.wakeUp();
      if (allowMomentum && tipSpeed > 1.3) {
        const vx = THREE.MathUtils.clamp(this.smoothedTipVel.x, -26, 26);
        const vy = THREE.MathUtils.clamp(this.smoothedTipVel.y, -12, 14);
        const vz = THREE.MathUtils.clamp(this.smoothedTipVel.z, -26, 26);
        vo.body.velocity.set(vx, vy, vz);
        vo.body.angularVelocity.set(
          (Math.random() - 0.5) * Math.min(4, tipSpeed * 0.3),
          this.yawRate * 1.4,
          (Math.random() - 0.5) * Math.min(4, tipSpeed * 0.3)
        );
        if (isGenuineThrow) this.callbacks.onPropFling(vo.label, tipSpeed);
      } else {
        vo.body.velocity.set(0, -0.1, 0);
        vo.body.angularVelocity.set(0, 0, 0);
      }
      this.heldVillageObj = null;
      this.clampClosed = false;
      this.squeezePressure = 0;
      return;
    }

    if (this.heldProps.length === 0) return;
    for (const p of this.heldProps) {
      p.heldByTractor = false;
      p.body.wakeUp();
      this.holdOffsets.delete(p.id);

      if (allowMomentum && tipSpeed > 1.7) {
        const vx = THREE.MathUtils.clamp(this.smoothedTipVel.x, -26, 26);
        const vy = THREE.MathUtils.clamp(this.smoothedTipVel.y, -10, 14);
        const vz = THREE.MathUtils.clamp(this.smoothedTipVel.z, -26, 26);
        p.body.velocity.set(vx, vy, vz);
        p.body.angularVelocity.set(
          (Math.random() - 0.5) * Math.min(3.5, tipSpeed * 0.25),
          this.yawRate * 1.3,
          (Math.random() - 0.5) * Math.min(3.5, tipSpeed * 0.25)
        );
        if (isGenuineThrow) {
          p.wasThrown = true;
          p.throwOrigin.set(p.body.position.x, p.body.position.y, p.body.position.z);
          this.callbacks.onPropFling(p.label, tipSpeed);
        } else {
          p.wasThrown = false;
        }
      } else {
        p.body.velocity.set(0, -0.06, 0);
        p.body.angularVelocity.set(0, 0, 0);
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

  private tryGrabNearest(props: FarmProp[], villageObjs: DynamicVillageObj[]): boolean {
    if (this.activeTool === 'none' && !this.freePlayMode) {
      this.warnOnce('No attachment hitched! Drive to the Tool Shed & press [T]');
      return false;
    }

    const holdPos = this.getHoldWorldPos();

    const vCandidates = villageObjs
      .filter((o) => !o.heldByTractor)
      .map((o) => {
        const dp = new THREE.Vector3(o.body.position.x, o.body.position.y, o.body.position.z);
        return { obj: o, dist: dp.distanceTo(holdPos) };
      })
      .filter((c) => c.dist < 2.2 + c.obj.radius * 0.65)
      .sort((a, b) => a.dist - b.dist);

    if (vCandidates.length > 0 && (this.freePlayMode || vCandidates[0].obj.kind !== 'car')) {
      const vo = vCandidates[0].obj;
      vo.heldByTractor = true;
      vo.cruiseActive = false;
      vo.body.wakeUp();
      this.heldVillageObj = vo;
      this.clampClosed = true;
      this.callbacks.onPropGrabbed(vo.label, this.activeTool, false);
      return true;
    }

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

      if (!this.freePlayMode) {
        if (this.activeTool === 'forks') {
          if (prop.kind !== 'crate') {
            this.warnOnce(`Forks won't grip a ${prop.label} — swap tools at the Shed!`);
            continue;
          }
          if (Math.abs(this.headTilt) > 0.32) {
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
      this.callbacks.onPropGrabbed(
        prop.label,
        this.activeTool,
        prop.isWrappedSilage && !prop.isPopped && this.activeTool === 'grabber'
      );
      grabbedAny = true;
    }

    if (grabbedAny) this.clampClosed = true;
    return grabbedAny;
  }

  /**
   * Applies true 4-wheel spring-damper suspension, steered cornering grip, AND dynamic boom/load overturning forces!
   * Called every physics step so the CLAAS Scorpion 741 genuinely pitches, rolls, lifts rear/inside wheels, and TIPS OVER!
   */
  public applyVehiclePhysicsForces(_dt: number, input: TractorInput): void {
    const body = this.chassisBody;
    const upWorld = new CANNON.Vec3(0, 1, 0);
    body.quaternion.vmult(upWorld, upWorld);

    const fwdWorld = new CANNON.Vec3(0, 0, -1);
    body.quaternion.vmult(fwdWorld, fwdWorld);

    const rightWorld = new CANNON.Vec3(1, 0, 0);
    body.quaternion.vmult(rightWorld, rightWorld);

    const maxSpeed = input.creep ? 3.2 : input.boost ? 18.5 : 12.2;
    const restHubHeight = 0.92;
    const kSpringFront = 132000;
    const kSpringRear = 186000;
    const cDamp = 24000;

    let grounded = 0;

    // 1. Independent 4-Wheel Spring-Damper + Steered Traction + Lateral Grip at Ground Contact!
    if (upWorld.y > 0.25) {
      for (const w of this.wheelPivots) {
        const localHub = new CANNON.Vec3(w.localX, 0.74 - this.comY, w.localZ - this.comZ);
        const hubWorld = body.pointToWorldFrame(localHub);
        const groundY = getDrivableGroundY(hubWorld.x, hubWorld.z);
        const distToGround = hubWorld.y - groundY;
        const comp = Math.max(0, restHubHeight - distToGround);
        w.compression = comp;

        if (comp > 0) {
          grounded++;
          // Apply tire forces right at the ground patch (1.0m BELOW CoM) so sharp cornering creates REAL outward roll torque!
          // NOTE: Cannon-es body.applyForce(worldForce, relativePoint) expects relativePoint = worldPoint - body.position!
          const contactWorld = new CANNON.Vec3(hubWorld.x, groundY + 0.05, hubWorld.z);
          const contactRel = contactWorld.vsub(body.position);
          const vPt = new CANNON.Vec3();
          body.getVelocityAtWorldPoint(contactWorld, vPt);

          const kSpring = w.isFront ? kSpringFront : kSpringRear;
          const fUp = THREE.MathUtils.clamp(kSpring * comp - cDamp * vPt.y, 0, 92000);
          body.applyForce(new CANNON.Vec3(0, fUp, 0), contactRel);

          let wSteer = 0;
          if (this.steeringMode === '4WS') wSteer = w.isFront ? this.steerAngle : -this.steerAngle * 0.85;
          else if (this.steeringMode === '2WS') wSteer = w.isFront ? this.steerAngle : 0;
          else wSteer = this.steerAngle;

          const cosS = Math.cos(wSteer);
          const sinS = Math.sin(wSteer);
          const wFwd = new CANNON.Vec3(
            fwdWorld.x * cosS - rightWorld.x * sinS,
            fwdWorld.y * cosS - rightWorld.y * sinS,
            fwdWorld.z * cosS - rightWorld.z * sinS
          );
          wFwd.normalize();
          const wRight = new CANNON.Vec3(
            rightWorld.x * cosS + fwdWorld.x * sinS,
            rightWorld.y * cosS + fwdWorld.y * sinS,
            rightWorld.z * cosS + fwdWorld.z * sinS
          );
          wRight.normalize();

          const vLong = vPt.dot(wFwd);
          const vLat = vPt.dot(wRight);

          // Varipower hydrostatic drive force (plenty of Bavarian hillside climbing torque + automatic hydrostatic hold!)
          const targetSpeed = input.throttle * maxSpeed;
          const driveGain = Math.abs(input.throttle) > 0.02 ? 12000 : 7600;
          const fDrive = THREE.MathUtils.clamp((targetSpeed - vLong) * driveGain, -46000, 46000);

          // Realistic rubber tire lateral cornering grip at ground contact patch
          const fLat = THREE.MathUtils.clamp(-vLat * 21000, -42000, 42000);

          const totalHoriz = new CANNON.Vec3(
            wFwd.x * fDrive + wRight.x * fLat,
            wFwd.y * fDrive + wRight.y * fLat,
            wFwd.z * fDrive + wRight.z * fLat
          );
          body.applyForce(totalHoriz, contactRel);
        }
      }
    }
    this.wheelsOnGround = grounded;

    // 2. Real Boom Steel + Carried Load Gravitational & Centrifugal Forces AT THE 3D BOOM TIP!
    // Unloaded boom stays calm & level; extending heavy loads or turning fast with boom raised GENUINELY TIPS THE SCORPION!
    const carriedKg = this.getCarriedMassKg();
    const extSteelKg = this.boomExt * 165;
    const tipWorldC = new CANNON.Vec3(this.holdWorldPos.x, this.holdWorldPos.y, this.holdWorldPos.z);
    const tipRel = tipWorldC.vsub(body.position);

    if (carriedKg > 0 || extSteelKg > 10) {
      const fLoadY = -(carriedKg * 1.48 + extSteelKg) * 16.5;
      body.applyForce(new CANNON.Vec3(0, fLoadY, 0), tipRel);
    }

    // Real inertial / centrifugal whip force when turning fast with raised boom or heavy load!
    const effectiveWhipKg = carriedKg * 1.45 + (this.boomPitch > 0.25 ? 480 + this.boomExt * 240 : 0);
    if (effectiveWhipKg > 0 && grounded >= 1) {
      const yawOmega = body.angularVelocity.y;
      const forwardSpd = body.velocity.dot(fwdWorld);
      const latAccel = forwardSpd * yawOmega + yawOmega * Math.abs(yawOmega) * (1.8 + this.boomExt * 0.9);
      const rollPush = THREE.MathUtils.clamp(effectiveWhipKg * latAccel, -56000, 56000);
      body.applyForce(
        new CANNON.Vec3(rightWorld.x * rollPush, 0, rightWorld.z * rollPush),
        tipRel
      );
    }

    // 3. Boom-to-Ground Physical Push (lets you push the boom against the ground — even to try self-righting if tipped!)
    const tipGroundY = getDrivableGroundY(this.holdWorldPos.x, this.holdWorldPos.z);
    if (this.holdWorldPos.y < tipGroundY + 0.28) {
      const pen = tipGroundY + 0.28 - this.holdWorldPos.y;
      const pushUp = Math.min(54000, pen * 82000);
      body.applyForce(new CANNON.Vec3(0, pushUp, 0), tipRel);
    }

    // 4. Soft Water Shore Boundary (prevent driving off pier into deep Starnberger See!)
    const px = body.position.x;
    const pz = body.position.z;
    const onSebaldPier = Math.abs(pz - 125) <= 2.9 && px <= -204 && px >= -245;
    const minShoreX = onSebaldPier ? -244.5 : getShorelineX(pz) - 6;
    if (px < minShoreX) {
      body.position.x = minShoreX;
      if (body.velocity.x < 0) body.velocity.x *= -0.2;
    }
    if (px > WORLD_MAX_X - 8) {
      body.position.x = WORLD_MAX_X - 8;
      if (body.velocity.x > 0) body.velocity.x = 0;
    }
    if (pz < WORLD_MIN_Z + 8) {
      body.position.z = WORLD_MIN_Z + 8;
      if (body.velocity.z < 0) body.velocity.z = 0;
    }
    if (pz > WORLD_MAX_Z - 8) {
      body.position.z = WORLD_MAX_Z - 8;
      if (body.velocity.z > 0) body.velocity.z = 0;
    }

    // Prevent chassis CoM from ever sinking below terrain even during violent rollovers!
    const groundHere = getDrivableGroundY(body.position.x, body.position.z);
    if (body.position.y < groundHere + 0.56) {
      body.position.y = groundHere + 0.56;
      if (body.velocity.y < 0) body.velocity.y = 0;
    }
  }

  public update(
    dt: number,
    elapsed: number,
    input: TractorInput,
    props: FarmProp[],
    villageObjs: DynamicVillageObj[]
  ): void {
    // 1. Steer Angle & Telescopic Boom Hydraulics
    const targetSteer = input.steer * (input.creep ? 0.44 : 0.62);
    this.steerAngle += (targetSteer - this.steerAngle) * Math.min(1, dt * 9);

    const fine = input.creep ? 0.45 : 1.0;
    this.prevHeadTilt = this.headTilt;
    this.boomPitch = THREE.MathUtils.clamp(this.boomPitch + input.boomLift * 0.98 * fine * dt, -0.2, 1.1);
    this.boomExt = THREE.MathUtils.clamp(this.boomExt + input.boomExtend * 2.9 * fine * dt, 0, 3.6);
    this.headTilt = THREE.MathUtils.clamp(this.headTilt + input.headTilt * 1.9 * fine * dt, -0.78, 1.15);

    this.hydroLoad = Math.min(
      1,
      Math.abs(input.boomLift) + Math.abs(input.boomExtend) + Math.abs(input.headTilt) * 0.8
    );

    // 2. Sync 3D Visuals Directly from Dynamic Rigid-Body Orientation (REAL PITCH, ROLL & FLIPS!)
    this.syncVisualsFromBody(dt, input.creep);

    // 3. Detect Tipping / Rollover State & Fire Cab Overload Stability Alarm!
    const upWorld = new THREE.Vector3(0, 1, 0).applyQuaternion(this.root.quaternion);
    const fwdWorld = new THREE.Vector3(0, 0, -1).applyQuaternion(this.root.quaternion);
    const rightWorld = new THREE.Vector3(1, 0, 0).applyQuaternion(this.root.quaternion);

    this.pitchDeg = Math.round(THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(fwdWorld.y, -1, 1))));
    this.rollDeg = Math.round(THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(rightWorld.y, -1, 1))));
    this.heading = Math.atan2(-fwdWorld.x, -fwdWorld.z);

    const vel3 = new THREE.Vector3(
      this.chassisBody.velocity.x,
      this.chassisBody.velocity.y,
      this.chassisBody.velocity.z
    );
    this.speed = vel3.dot(fwdWorld);
    this.yawRate = this.chassisBody.angularVelocity.y;
    this.distanceMeters += Math.hypot(vel3.x, vel3.z) * dt;

    // Real tipping risk telemetry combining actual tilt angle + wheel liftoff + load moment!
    const tiltFactor = Math.max(Math.abs(this.rollDeg) / 38, Math.abs(this.pitchDeg) / 34);
    const wheelLiftFactor = this.wheelsOnGround <= 2 ? 0.95 : this.wheelsOnGround === 3 ? 0.68 : 0;
    const carriedKg = this.getCarriedMassKg();
    const reachFactor =
      carriedKg > 0 ? (carriedKg * (1.8 + this.boomExt * 1.15) * Math.max(0.3, Math.cos(this.boomPitch))) / 4200 : 0;
    this.loadMoment = Math.min(1.25, Math.max(tiltFactor, wheelLiftFactor, reachFactor));

    const litCount = Math.round(this.loadMoment * 6);
    this.aPillarLeds.forEach((mat, idx) => {
      const isLit = idx < litCount;
      const blinkRed = idx === 5 && this.loadMoment > 0.82 ? (Math.sin(elapsed * 18) > 0 ? 1.8 : 0.1) : 1.3;
      mat.emissiveIntensity = isLit ? blinkRed : 0.06;
    });
    if (this.loadMoment > 0.8 && !this.isTipped) {
      this.callbacks.onOverloadAlarm();
    }

    // GENUINE TIPPED-OVER / ROLLOVER CONSEQUENCE (debounced cleanly so it fires once per real rollover!)
    this.rolloverCooldown = Math.max(0, this.rolloverCooldown - dt);
    this.isTipped = upWorld.y < 0.56;
    if (this.isTipped) {
      this.uprightTimer = 0;
      if (!this.wasTipped && this.rolloverCooldown <= 0) {
        this.wasTipped = true;
        this.rolloverCooldown = 3.5;
        this.releaseAll(false);
        this.callbacks.onTippedOver(this.position.clone());
      }
    } else if (upWorld.y > 0.84 && this.wheelsOnGround >= 3) {
      this.uprightTimer += dt;
      if (this.uprightTimer > 1.2) {
        this.wasTipped = false;
      }
    }

    // 4. Wheel Visuals, Driver Animation, Exhaust & 3D Tire Tracks
    const wheelDelta = (this.speed * dt) / 0.74;
    for (const w of this.wheelPivots) {
      w.spin.rotation.x -= wheelDelta;
      if (this.steeringMode === '4WS') w.pivot.rotation.y = w.isFront ? this.steerAngle : -this.steerAngle * 0.85;
      else if (this.steeringMode === '2WS') w.pivot.rotation.y = w.isFront ? this.steerAngle : 0;
      else w.pivot.rotation.y = this.steerAngle;

      // Visually animate independent wheel droop/compression around equilibrium (0.18m)!
      const travel = THREE.MathUtils.clamp((w.compression - 0.18) * 0.85, -0.18, 0.16);
      w.pivot.position.y = w.baseY + travel;
    }
    this.steeringWheelMesh.rotation.z = this.steerAngle * 2.4;
    this.driverHead.rotation.y = this.steerAngle * 0.55;
    this.driverLeftArm.rotation.y = this.steerAngle * 0.4;

    const flash = 0.4 + 0.6 * Math.abs(Math.sin(elapsed * 7.5));
    (this.beaconLight.material as THREE.MeshStandardMaterial).emissiveIntensity = flash * 1.35;

    if (Math.abs(input.throttle) > 0.2 && !this.isTipped) {
      this.exhaustTimer += dt;
      if (this.exhaustTimer > (input.boost ? 0.14 : 0.28)) {
        this.exhaustTimer = 0;
        this.callbacks.onExhaust(this.chassisGroup.localToWorld(this.exhaustTipLocal.clone()));
      }
    }

    if (Math.abs(this.speed) > 0.8 && this.wheelsOnGround >= 2) {
      this.trackTimer += Math.abs(this.speed) * dt;
      if (this.trackTimer > 0.7) {
        this.trackTimer = 0;
        const wWorld = new THREE.Vector3();
        for (const w of this.wheelPivots) {
          if (w.compression > 0) {
            w.pivot.getWorldPosition(wWorld);
            this.callbacks.onWheelTrack(wWorld.x, wWorld.z, this.heading + w.pivot.rotation.y);
          }
        }
      }
    }

    if (Math.abs(this.speed) > 5.0 && this.wheelsOnGround >= 2) {
      this.dustTimer += dt;
      if (this.dustTimer > 0.16) {
        this.dustTimer = 0;
        this.callbacks.onDust(this.chassisGroup.localToWorld(new THREE.Vector3(-1.05, 0.15, 1.45)));
        this.callbacks.onDust(this.chassisGroup.localToWorld(new THREE.Vector3(1.05, 0.15, 1.45)));
      }
    }

    // 5. Grab / Release / Squeeze Action
    const justPressed = input.actionHeld && !this.actionWasHeld;
    const justReleased = !input.actionHeld && this.actionWasHeld;
    const hasLoad = this.heldProps.length > 0 || this.heldVillageObj !== null;

    if (justPressed && !this.isTipped) {
      this.holdTimer = 0;
      this.grabLockedOnPress = false;
      if (!hasLoad) {
        if (this.tryGrabNearest(props, villageObjs)) this.grabLockedOnPress = true;
        else this.clampClosed = !this.clampClosed;
      }
    }

    if (input.actionHeld && hasLoad && !this.grabLockedOnPress) {
      this.holdTimer += dt;
      if (this.activeTool === 'grabber' && this.holdTimer > 0.24 && this.heldProps.length > 0) {
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
      if (hasLoad && !this.grabLockedOnPress && this.holdTimer < 0.32) {
        this.releaseAll(true);
      }
      this.squeezePressure = Math.max(0, this.squeezePressure - 0.5);
      this.holdTimer = 0;
      this.grabLockedOnPress = false;
    }

    if (!input.actionHeld) this.squeezePressure = Math.max(0, this.squeezePressure - dt * 2.2);
    this.actionWasHeld = input.actionHeld;

    if (this.activeTool === 'forks' && this.heldProps.length > 0 && !this.freePlayMode) {
      if (this.headTilt > 0.44) {
        this.releaseAll(false);
        this.warnOnce('Forks tilted too far forward — pallet slid off!');
      }
    }
    if (this.activeTool === 'bucket' && this.heldProps.length > 0 && this.headTilt > 0.52) {
      this.releaseAll(true);
    }

    // 6. Animate Attachment Jaws & Fork Lasers
    if (this.activeAttachmentMesh) {
      if (this.activeTool === 'forks') {
        const lL = this.activeAttachmentMesh.getObjectByName('forkLaserL');
        const lR = this.activeAttachmentMesh.getObjectByName('forkLaserR');
        if (lL && lR) {
          lL.visible = input.creep;
          lR.visible = input.creep;
        }
      } else if (this.activeTool === 'grabber') {
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

    // 7. Passive Bale Spike Puncture & 8-Ton Wheel Run-Over Crush!
    if (this.activeTool === 'spike') {
      const tipPos = this.getHoldWorldPos();
      for (const p of props) {
        if (p.isWrappedSilage && !p.isPopped && !p.heldByTractor) {
          const dist = Math.hypot(
            p.body.position.x - tipPos.x,
            p.body.position.y - tipPos.y,
            p.body.position.z - tipPos.z
          );
          if (dist < 1.02) this.callbacks.onSilagePopped(p, 'POP! Bale Spike poked the wrapped silage!');
        }
      }
    }

    if (Math.abs(this.speed) > 0.55) {
      const wheelWorld = new THREE.Vector3();
      for (const w of this.wheelPivots) {
        if (w.compression <= 0) continue;
        w.pivot.getWorldPosition(wheelWorld);
        for (const p of props) {
          if (p.heldByTractor || p.isDamaged || p.body.position.y > wheelWorld.y + 0.8) continue;
          const distXZ = Math.hypot(p.body.position.x - wheelWorld.x, p.body.position.z - wheelWorld.z);
          if (distXZ < p.radius + 0.42) {
            if (p.isWrappedSilage && !p.isPopped) {
              this.callbacks.onSilagePopped(p, 'SQUISH-POP! Your tires ran over a wrapped silage bale!');
            } else if (p.crushable) {
              this.callbacks.onPropDamaged(p, `CRUNCH! Your 8-ton tires ran over a ${p.label}!`);
            }
          }
        }
      }
    }

    // 8. Sync Held Props & Lifted Vehicles to Attachment Mount
    const attachQuat = new THREE.Quaternion();
    this.attachmentMount.getWorldQuaternion(attachQuat);

    if (this.heldVillageObj) {
      const vo = this.heldVillageObj;
      const targetPos = this.holdWorldPos.clone();
      const floorY = getDrivableGroundY(targetPos.x, targetPos.z);
      targetPos.y = Math.max(floorY + vo.halfHeight + 0.08, targetPos.y + 0.22);
      vo.body.position.set(targetPos.x, targetPos.y, targetPos.z);
      vo.body.velocity.set(0, 0, 0);
      vo.body.angularVelocity.set(0, 0, 0);
      vo.body.quaternion.set(attachQuat.x, attachQuat.y, attachQuat.z, attachQuat.w);
    }

    for (const p of this.heldProps) {
      const localOff = this.holdOffsets.get(p.id) ?? new THREE.Vector3();
      const targetPos = this.holdWorldPos.clone().add(localOff.clone().applyQuaternion(attachQuat));
      const floorY = getDrivableGroundY(targetPos.x, targetPos.z);
      targetPos.y = Math.max(floorY + p.halfHeight + 0.02, targetPos.y);

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

  private syncVisualsFromBody(dt: number, _creep: boolean): void {
    this.root.position.set(
      this.chassisBody.position.x,
      this.chassisBody.position.y,
      this.chassisBody.position.z
    );
    this.root.quaternion.set(
      this.chassisBody.quaternion.x,
      this.chassisBody.quaternion.y,
      this.chassisBody.quaternion.z,
      this.chassisBody.quaternion.w
    );

    this.boomPivot.rotation.x = this.boomPitch;
    this.innerBoom.position.z = -3.55 - this.boomExt;
    this.headPivot.rotation.x = -this.boomPitch - this.headTilt;

    const boomMidLocal = new THREE.Vector3(0, -0.22, -1.75)
      .applyAxisAngle(new THREE.Vector3(1, 0, 0), this.boomPitch)
      .add(this.boomBaseLocal);

    const cylDir = boomMidLocal.clone().sub(this.cylAnchorLocal);
    const cylLen = cylDir.length();
    const cylUnit = cylDir.clone().normalize();
    const cylMid = this.cylAnchorLocal.clone().addScaledVector(cylUnit, Math.min(0.36, cylLen * 0.4));
    const rodMid = this.cylAnchorLocal.clone().addScaledVector(cylDir, 0.55);
    const cylQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), cylUnit);

    this.liftCylOuter.position.copy(cylMid);
    this.liftCylOuter.quaternion.copy(cylQuat);
    this.liftCylRod.position.copy(rodMid);
    this.liftCylRod.quaternion.copy(cylQuat);
    this.liftCylRod.scale.y = Math.max(0.35, cylLen * 0.85);

    this.root.updateMatrixWorld(true);
    // Ground-level chassis origin for camera, minimap, elevation, and interaction checks!
    this.chassisGroup.getWorldPosition(this.position);

    this.holdWorldPos.copy(this.getHoldWorldPos());
    const safeDt = Math.max(0.004, dt);
    this.tipWorldVel.copy(this.holdWorldPos).sub(this.prevHoldWorldPos).divideScalar(safeDt);
    this.smoothedTipVel.lerp(this.tipWorldVel, 0.42);
    this.prevHoldWorldPos.copy(this.holdWorldPos);

    const mountWorldPos = new THREE.Vector3();
    const mountWorldQuat = new THREE.Quaternion();
    this.attachmentMount.getWorldPosition(mountWorldPos);
    this.attachmentMount.getWorldQuaternion(mountWorldQuat);
    this.headBody.position.set(mountWorldPos.x, mountWorldPos.y, mountWorldPos.z);
    this.headBody.quaternion.set(mountWorldQuat.x, mountWorldQuat.y, mountWorldQuat.z, mountWorldQuat.w);
    this.headBody.velocity.set(this.smoothedTipVel.x, this.smoothedTipVel.y, this.smoothedTipVel.z);
  }
}
