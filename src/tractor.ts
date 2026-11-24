import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
  FARM_CENTER,
  FARM_GROUND_Y,
  getDrivableGroundY,
  getShorelineX,
  SEBALD_PIER,
  WORLD_MAX_X,
  WORLD_MAX_Z,
  WORLD_MIN_X,
  WORLD_MIN_Z
} from './terrain';
import { FarmProp } from './props';
import { DynamicVillageObj } from './realWorld';
import { AttachmentType, buildAttachmentMesh, buildScorpion741Model, WheelPivotRef } from './scorpionModel';

export { buildAttachmentMesh };
export type { AttachmentType };
export type SteeringMode = '4WS' | '2WS' | 'CRAB';
export type VaripowerGear = 'snail' | 'turtle' | 'hare';

export const VARIPOWER_GEARS: Record<VaripowerGear, { label: string; kmh: number; ms: number }> = {
  snail: { label: 'Snail 15', kmh: 15, ms: 15 / 3.6 },
  turtle: { label: 'Turtle 30', kmh: 30, ms: 30 / 3.6 },
  hare: { label: 'Hare 40', kmh: 40, ms: 40 / 3.6 }
};

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
  public gear: VaripowerGear = 'turtle';

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

  private wheelPivots: WheelPivotRef[] = [];
  private steeringWheelMesh!: THREE.Group;
  private driverHead!: THREE.Mesh;
  private driverLeftArm!: THREE.Mesh;
  private aPillarLeds: THREE.MeshStandardMaterial[] = [];
  private workSpotLights: THREE.SpotLight[] = [];
  private ledLensMat!: THREE.MeshStandardMaterial;
  private beaconLight!: THREE.Mesh;
  private exhaustTipLocal = new THREE.Vector3(0.99, 2.88, 1.56);

  private boomPivot = new THREE.Group();
  private innerBoom = new THREE.Group();
  private headPivot = new THREE.Group();
  private attachmentMount = new THREE.Group();
  private activeAttachmentMesh: THREE.Group | null = null;
  private liftCylOuter!: THREE.Mesh;
  private liftCylRod!: THREE.Mesh;
  private boomBaseLocal = new THREE.Vector3(0.14, 1.72, 1.42);
  private cylAnchorLocal = new THREE.Vector3(0.14, 0.96, 0.12);

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
  private readonly comY = 0.78;
  private readonly comZ = 0.28;
  private scene: THREE.Scene;
  private callbacks: TractorCallbacks;

  constructor(scene: THREE.Scene, world: CANNON.World, tractorMat: CANNON.Material, callbacks: TractorCallbacks) {
    this.scene = scene;
    this.callbacks = callbacks;

    this.buildTractorVisuals();
    // Shift visual chassis so root (0,0,0) aligns with the true physical Center of Mass (low-slung 0.78m, rear-biased counterweight)!
    this.chassisGroup.position.set(0, -this.comY, -this.comZ);
    this.root.add(this.chassisGroup);
    scene.add(this.root);

    // === TRUE DYNAMIC 7,640 KG CLAAS SCORPION 741 VARIPOWER CHASSIS ===
    this.chassisBody = new CANNON.Body({
      mass: 7640,
      type: CANNON.Body.DYNAMIC,
      material: tractorMat,
      linearDamping: 0.035,
      angularDamping: 0.54,
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
    // Calm low-speed wall-bump absorption: walking-pace static contact stays planted on all 4 tires!
    this.chassisBody.addEventListener('collide', (e: { body: CANNON.Body }) => {
      if (e.body && e.body.mass === 0) {
        const horizSpd = Math.hypot(this.chassisBody.velocity.x, this.chassisBody.velocity.z);
        if (horizSpd < 4.5 && !this.isTipped) {
          this.chassisBody.angularVelocity.x *= 0.18;
          this.chassisBody.angularVelocity.z *= 0.18;
          this.chassisBody.velocity.y = Math.min(this.chassisBody.velocity.y, 0.15);
        }
      }
    });
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
    const model = buildScorpion741Model();
    this.chassisGroup = model.chassisGroup;
    this.wheelPivots = model.wheelPivots;
    this.steeringWheelMesh = model.steeringWheelMesh;
    this.driverHead = model.driverHead;
    this.driverLeftArm = model.driverLeftArm;
    this.aPillarLeds = model.aPillarLeds;
    this.workSpotLights = model.workSpotLights;
    this.ledLensMat = model.ledLensMat;
    this.beaconLight = model.beaconLight;
    this.boomPivot = model.boomPivot;
    this.innerBoom = model.innerBoom;
    this.headPivot = model.headPivot;
    this.attachmentMount = model.attachmentMount;
    this.liftCylOuter = model.liftCylOuter;
    this.liftCylRod = model.liftCylRod;
    this.boomBaseLocal = model.boomBaseLocal;
    this.cylAnchorLocal = model.cylAnchorLocal;
    this.exhaustTipLocal = model.exhaustTipLocal;
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

  public cycleGear(): VaripowerGear {
    const order: VaripowerGear[] = ['snail', 'turtle', 'hare'];
    this.gear = order[(order.indexOf(this.gear) + 1) % order.length];
    return this.gear;
  }

  public getActiveGear(input?: TractorInput): VaripowerGear {
    if (input?.boost) return 'hare';
    return this.gear;
  }

  /**
   * Applies true 4-wheel spring-damper suspension, steered cornering grip, AND dynamic boom/load overturning forces!
   * Tuned to real 2022 CLAAS Scorpion 741 Varipower (7,640 kg, 136 hp, 15 / 30 / 40 km/h):
   * calm and planted in normal driving, genuinely tipping when boom height, load reach, or slope pushes past limits!
   */
  public applyVehiclePhysicsForces(_dt: number, input: TractorInput): void {
    const body = this.chassisBody;
    const upWorld = new CANNON.Vec3(0, 1, 0);
    body.quaternion.vmult(upWorld, upWorld);

    const fwdWorld = new CANNON.Vec3(0, 0, -1);
    body.quaternion.vmult(fwdWorld, fwdWorld);

    const rightWorld = new CANNON.Vec3(1, 0, 0);
    body.quaternion.vmult(rightWorld, rightWorld);

    const activeGear = this.getActiveGear(input);
    const maxSpeed = input.creep ? 2.6 : VARIPOWER_GEARS[activeGear].ms;
    const restHubHeight = 0.92;
    const kSpringFront = 148000;
    const kSpringRear = 209000;
    const cDamp = 32500;
    const kAntiRoll = 58000;

    let grounded = 0;
    const absForwardSpd = Math.abs(body.velocity.dot(fwdWorld));

    // 1. Independent 4-Wheel Spring-Damper + Anti-Roll Bar + Realistic 136 hp Varipower Hydrostatic Drive
    if (upWorld.y > 0.25) {
      // Pre-sample wheel compressions so front & rear anti-roll bars work like real agricultural axles
      const comps: number[] = [];
      const hubWorlds: CANNON.Vec3[] = [];
      const groundYs: number[] = [];
      for (const w of this.wheelPivots) {
        const localHub = new CANNON.Vec3(w.localX, 0.74 - this.comY, w.localZ - this.comZ);
        const hubWorld = body.pointToWorldFrame(localHub);
        const groundY = getDrivableGroundY(hubWorld.x, hubWorld.z);
        const comp = Math.max(0, restHubHeight - (hubWorld.y - groundY));
        w.compression = comp;
        comps.push(comp);
        hubWorlds.push(hubWorld);
        groundYs.push(groundY);
      }

      // Axle left-right roll differentials (wheel order: FL=0, FR=1, RL=2, RR=3)
      const frontRollDiff = comps[0] - comps[1];
      const rearRollDiff = comps[2] - comps[3];
      // Progressive rear-axle steering taper at road speed (real CLAAS Varipower road stability!)
      const rear4WSRatio = THREE.MathUtils.clamp(0.85 - Math.max(0, absForwardSpd - 3.5) * 0.13, 0.14, 0.85);

      for (let i = 0; i < this.wheelPivots.length; i++) {
        const w = this.wheelPivots[i];
        const comp = comps[i];
        if (comp > 0) {
          grounded++;
          const hubWorld = hubWorlds[i];
          const groundY = groundYs[i];
          // Apply tire forces at ground patch below CoM; Cannon-es applyForce takes relativePoint = worldPoint - body.position
          const contactWorld = new CANNON.Vec3(hubWorld.x, groundY + 0.05, hubWorld.z);
          const contactRel = contactWorld.vsub(body.position);
          const vPt = new CANNON.Vec3();
          body.getVelocityAtWorldPoint(contactWorld, vPt);

          const kSpring = w.isFront ? kSpringFront : kSpringRear;
          const isLeft = w.localX < 0;
          const axleDiff = w.isFront ? frontRollDiff : rearRollDiff;
          const antiRollForce = (isLeft ? 1 : -1) * axleDiff * kAntiRoll;

          const fUp = THREE.MathUtils.clamp(kSpring * comp - cDamp * vPt.y + antiRollForce, 0, 122000);
          body.applyForce(new CANNON.Vec3(0, fUp, 0), contactRel);

          let wSteer = 0;
          if (this.steeringMode === '4WS') wSteer = w.isFront ? this.steerAngle : -this.steerAngle * rear4WSRatio;
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

          // Progressive 136 hp Varipower hydrostatic drive (weighty 0->30 km/h in ~5.4 s, exact 15/30/40 km/h gears!)
          const targetSpeed = input.throttle * maxSpeed * 1.015;
          const speedErr = targetSpeed - vLong;
          const isBraking = Math.abs(input.throttle) < 0.02 || input.throttle * vLong < -0.2;
          // Engine power taper at road speed (realistic 136 hp diesel tractive effort curve)
          const tractiveLimit = isBraking
            ? 11000
            : THREE.MathUtils.lerp(4700, 3400, THREE.MathUtils.clamp(absForwardSpd / 11.1, 0, 1));
          const driveGain = isBraking ? 8800 : 6200;
          const fDrive = THREE.MathUtils.clamp(speedErr * driveGain, -tractiveLimit, tractiveLimit);

          // Realistic agricultural tire lateral grip capped by normal load (calm 4/4 tires on 25 km/h full-lock turns!)
          const maxLatGrip = Math.min(18500, Math.max(4200, fUp * 0.5));
          const fLat = THREE.MathUtils.clamp(-vLat * 10500, -maxLatGrip, maxLatGrip);

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
    // - Driving empty with boom stowed/low: rock-solid & planted (4/4 tires even in full-lock 25 km/h turns!)
    // - Extending a heavy load far (R) shifts the real load moment past the front axle -> lifts rear tires & tips forward!
    // - Raising boom high (Q > 0.5) & whipping top-speed turns -> shifts CoM upward & rolls the Scorpion!
    const carriedKg = this.getCarriedMassKg();
    const extSteelKg = this.boomExt * 145;
    const tipWorldC = new CANNON.Vec3(this.holdWorldPos.x, this.holdWorldPos.y, this.holdWorldPos.z);
    const tipRel = tipWorldC.vsub(body.position);

    if (carriedKg > 0 || extSteelKg > 15) {
      // Smoothly ramp load moment with reach so retracted loads stay controllable while full extension genuinely tips!
      const reachLeverage = 1.1 + (this.boomExt / 3.6) * 0.65;
      const fLoadY = -(carriedKg * reachLeverage + extSteelKg) * 16.5;
      body.applyForce(new CANNON.Vec3(0, fLoadY, 0), tipRel);
    }

    // High-CoG centrifugal roll torque ONLY when boom is genuinely raised high (> 0.48 rad) OR carrying a heavy load!
    // Applied purely around the longitudinal roll axis (elevated CoG) so it NEVER fights steering yaw!
    const highBoomFactor = THREE.MathUtils.clamp((this.boomPitch - 0.48) / 0.52, 0, 1);
    const highBoomKg = highBoomFactor * (4200 + this.boomExt * 1800);
    const effectiveWhipKg = carriedKg * (0.85 + highBoomFactor * 1.25) + highBoomKg;
    if (effectiveWhipKg > 50 && grounded >= 1) {
      const yawOmega = body.angularVelocity.y;
      const forwardSpd = body.velocity.dot(fwdWorld);
      const latAccel = forwardSpd * yawOmega;
      // Centrifugal roll moment = m_elevated * a_lat * h_elevated (applied purely as roll torque around fwdWorld!)
      const elevatedH = Math.max(1.2, tipRel.y);
      const rollMoment = THREE.MathUtils.clamp(
        effectiveWhipKg * latAccel * elevatedH * 3.8,
        -380000,
        380000
      );
      body.torque.vadd(
        new CANNON.Vec3(fwdWorld.x * rollMoment, fwdWorld.y * rollMoment, fwdWorld.z * rollMoment),
        body.torque
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
    const onSebaldPier =
      Math.abs(pz - SEBALD_PIER.z) <= SEBALD_PIER.halfWidth &&
      px <= SEBALD_PIER.eastX + 4 &&
      px >= SEBALD_PIER.westX;
    const minShoreX = onSebaldPier ? SEBALD_PIER.westX + 1.5 : getShorelineX(pz) - 8;
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
    if (body.position.y < groundHere + 0.48) {
      body.position.y = groundHere + 0.48;
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
    // 1. Speed-Sensitive Steer Angle (nimble in yard, calm & planted at road speed!) & Telescopic Boom Hydraulics
    const absSpd = Math.abs(this.speed);
    const speedSteerScale = THREE.MathUtils.clamp(1.0 - Math.max(0, absSpd - 2.8) / 11.5, 0.25, 1.0);
    const targetSteer = input.steer * (input.creep ? 0.44 : 0.56) * speedSteerScale;
    this.steerAngle += (targetSteer - this.steerAngle) * Math.min(1, dt * 7.2);

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
