import './style.css';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { FarmAudio } from './audio';
import { ParticleSystem } from './particles';
import { FarmEnvironment } from './farm';
import { FarmProp, PropManager, ZoneKey } from './props';
import { AttachmentType, buildAttachmentMesh, ClaasScorpion, TOOL_META, TractorInput } from './tractor';
import { VillageWorld } from './village';

type CameraMode = 'chase' | 'cab' | 'boom';
type GameMode = 'farm' | 'chaos';

class ScorpionGame {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private world: CANNON.World;
  private audio = new FarmAudio();
  private particles: ParticleSystem;
  private farm: FarmEnvironment;
  private village: VillageWorld;
  private propMgr: PropManager;
  private tractor: ClaasScorpion;

  private rackPreviews = new Map<Exclude<AttachmentType, 'none'>, THREE.Group>();
  private clouds: THREE.Group[] = [];

  private keys = new Set<string>();
  private started = false;
  private mode: GameMode = 'farm';
  private score = 0;
  private damagedCount = 0;
  private hintsOn = false;
  private victoryShown = false;

  // Village Chaos (GTA Destruct Mode) stats
  private chaosBillGBP = 0;
  private chaosCars = 0;
  private chaosTrees = 0;
  private chaosProps = 0;
  private chaosPeds = 0;

  // Camera state
  private cameraMode: CameraMode = 'chase';
  private camYawOffset = 0.25;
  private camPitch = 0.42;
  private camDist = 14.5;
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private smoothCamPos = new THREE.Vector3(0, 8, 26);
  private smoothLookAt = new THREE.Vector3(0, 1.5, 10);

  // DOM Elements
  private startOverlay = document.getElementById('start-overlay')!;
  private hud = document.getElementById('hud')!;
  private farmPanel = document.getElementById('farm-panel')!;
  private chaosPanel = document.getElementById('chaos-panel')!;
  private pickFarmBtn = document.getElementById('pick-farm')!;
  private pickChaosBtn = document.getElementById('pick-chaos')!;
  private btnMode = document.getElementById('btn-mode')!;

  private scoreEl = document.getElementById('score-val')!;
  private starsEl = document.getElementById('stars-val')!;
  private damagedEl = document.getElementById('damaged-val')!;
  private tidyPctEl = document.getElementById('tidy-pct')!;
  private tidyBarEl = document.getElementById('tidy-bar-fill')!;

  private wantedStarsEl = document.getElementById('wanted-stars')!;
  private chaosBillEl = document.getElementById('chaos-bill')!;
  private statCarsEl = document.getElementById('stat-cars')!;
  private statTreesEl = document.getElementById('stat-trees')!;
  private statPropsEl = document.getElementById('stat-props')!;
  private statPedsEl = document.getElementById('stat-peds')!;

  private toastContainer = document.getElementById('toast-container')!;
  private interactPrompt = document.getElementById('interact-prompt')!;
  private squeezeMeter = document.getElementById('squeeze-meter')!;
  private squeezeFill = document.getElementById('squeeze-fill')!;
  private squeezeWarn = document.getElementById('squeeze-warn')!;
  private gaugeLift = document.getElementById('gauge-lift')!;
  private gaugeExt = document.getElementById('gauge-ext')!;
  private gaugeTilt = document.getElementById('gauge-tilt')!;
  private steerBadge = document.getElementById('steer-badge')!;
  private creepBadge = document.getElementById('creep-badge')!;
  private holdBadge = document.getElementById('hold-badge')!;
  private activeToolName = document.getElementById('active-tool-name')!;
  private activeToolTip = document.getElementById('active-tool-tip')!;
  private victoryBanner = document.getElementById('victory-banner')!;
  private victoryTitle = document.getElementById('victory-title')!;
  private victorySub = document.getElementById('victory-sub')!;
  private btnCamera = document.getElementById('btn-camera')!;
  private btnHints = document.getElementById('btn-hints')!;
  private btnSound = document.getElementById('btn-sound')!;

  private lastTime = performance.now();
  private elapsed = 0;

  constructor() {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x98bdd6);
    this.scene.fog = new THREE.Fog(0xb5cddc, 75, 195);

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.15, 290);
    this.camera.position.set(8, 7.5, 25);

    this.setupLightingAndSky();

    // Dialed-in Cannon-es solver for realistic, zero-bounce wood-on-wood pallet stacking!
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -16.5, 0)
    });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;
    (this.world.solver as CANNON.GSSolver).iterations = 20;

    const groundMat = new CANNON.Material('ground');
    const propMat = new CANNON.Material('prop');
    const tractorMat = new CANNON.Material('tractor');

    this.world.addContactMaterial(
      new CANNON.ContactMaterial(groundMat, propMat, {
        friction: 0.82,
        restitution: 0.02,
        contactEquationStiffness: 1e7,
        contactEquationRelaxation: 4
      })
    );
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(propMat, propMat, {
        friction: 0.86,
        restitution: 0.02,
        contactEquationStiffness: 1e7,
        contactEquationRelaxation: 4
      })
    );
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(tractorMat, propMat, {
        friction: 0.62,
        restitution: 0.05
      })
    );

    this.particles = new ParticleSystem(this.scene);
    this.farm = new FarmEnvironment(this.scene, this.world, groundMat);

    // Whole countryside village of Scorpion Green right outside the north stone gate!
    this.village = new VillageWorld(this.scene, this.world, groundMat, propMat, {
      onChaosEvent: (category, label, costGBP, pos) => this.handleChaosEvent(category, label, costGBP, pos)
    });

    for (const spot of this.farm.rackSpots) {
      const preview = buildAttachmentMesh(spot.tool);
      preview.position.set(0, 0.56, 0);
      preview.rotation.y = -Math.PI / 2;
      spot.standMesh.add(preview);
      this.rackPreviews.set(spot.tool, preview);
    }

    this.propMgr = new PropManager(this.scene, this.world, propMat);
    this.propMgr.onImpact = (prop, speed) => {
      this.audio.playImpact(speed, prop.materialType);
      if (prop.isWrappedSilage && !prop.isPopped && speed > 12.5) {
        this.handleSilagePop(prop, 'POP! Hard impact tore the silage plastic!');
      } else if (prop.kind === 'pumpkin' && !prop.isDamaged && speed > 13.5) {
        this.handlePropDamage(prop, 'SPLAT! Dropped the pumpkin too hard!');
      }
    };
    this.propMgr.spawnInitialMess();

    this.tractor = new ClaasScorpion(this.scene, this.world, tractorMat, {
      onSilagePopped: (prop, reason) => this.handleSilagePop(prop, reason),
      onPropDamaged: (prop, reason) => this.handlePropDamage(prop, reason),
      onPropFling: (label, speed) => {
        this.audio.playFling();
        this.showToast(`FLUNG ${label}! (${Math.round(speed * 2.2)} mph)`, 'trick');
      },
      onPropGrabbed: (label, _tool, isSilageIntact) => {
        this.audio.playHitch(true);
        if (isSilageIntact) {
          this.showToast('Gentle Silage Grip — Plastic Sealed!');
        } else if (this.mode === 'chaos') {
          this.showToast(`HOISTED ${label.toUpperCase()}!`, 'trick');
        }
      },
      onWrongTool: (message) => {
        this.audio.playImpact(4, 'metal');
        this.showToast(message, 'danger');
      },
      onToolChanged: (tool, attached) => {
        this.audio.playHitch(attached);
        this.updateToolReadout();
        this.showToast(attached ? `Coupled: ${TOOL_META[tool].name}` : 'Attachment Uncoupled');
      },
      onDust: (pos) => this.particles.spawnDust(pos)
    });

    this.updateToolReadout();
    this.bindEvents();
    this.animate();
  }

  private setupLightingAndSky(): void {
    const hemi = new THREE.HemisphereLight(0xd4e8f5, 0x5c7044, 0.8);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff0cf, 1.75);
    sun.position.set(36, 52, 26);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 5;
    sun.shadow.camera.far = 175;
    const d = 68;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    const rim = new THREE.DirectionalLight(0xaacbe6, 0.35);
    rim.position.set(-28, 22, -40);
    this.scene.add(rim);

    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xf4f6f7, roughness: 0.96 });
    for (let i = 0; i < 12; i++) {
      const cloud = new THREE.Group();
      for (let p = 0; p < 4; p++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(2.8 + (p % 2) * 1.2, 10, 8), cloudMat);
        puff.position.set((p - 1.5) * 2.2, (p % 2) * 0.65, ((p % 3) - 1) * 0.85);
        puff.scale.y = 0.6;
        cloud.add(puff);
      }
      cloud.position.set(-80 + i * 16, 28 + (i % 3) * 4, -75 + (i % 4) * 32);
      this.scene.add(cloud);
      this.clouds.push(cloud);
    }
  }

  private setMode(next: GameMode): void {
    this.mode = next;
    this.tractor.chaosMode = next === 'chaos';

    this.pickFarmBtn.classList.toggle('selected', next === 'farm');
    this.pickChaosBtn.classList.toggle('selected', next === 'chaos');

    this.farmPanel.classList.toggle('hidden', next !== 'farm');
    this.chaosPanel.classList.toggle('hidden', next !== 'chaos');

    this.btnMode.textContent = next === 'chaos' ? 'Mode: Village Chaos 🔥' : 'Mode: Farm Shift';
    this.btnMode.classList.toggle('chaos-active', next === 'chaos');

    if (this.started) {
      if (next === 'chaos') {
        this.audio.playHorn();
        this.showToast('VILLAGE CHAOS ACTIVE! Drive north through the gate!', 'trick');
      } else {
        this.showToast('Farm Shift Mode — Careful handling & tool rules active!');
      }
    }
  }

  private handleChaosEvent(
    category: 'car' | 'tree' | 'prop' | 'ped',
    label: string,
    costGBP: number,
    pos: THREE.Vector3
  ): void {
    this.chaosBillGBP += costGBP;
    if (category === 'car') {
      this.chaosCars++;
      this.audio.playCrush(true);
      this.particles.spawnCrush(pos, [0xd94420, 0x747c82, 0xffe370]);
    } else if (category === 'tree') {
      this.chaosTrees++;
      this.audio.playCrush(false);
      this.particles.spawnCrush(pos, [0x4b7e39, 0x624228, 0x35622e]);
    } else if (category === 'prop') {
      this.chaosProps++;
      this.audio.playCrush(false);
      this.particles.spawnCrush(pos, [0xc9251e, 0x8f5d2b, 0xf2f0e6]);
    } else {
      this.chaosPeds++;
      this.audio.playScoreChime(false);
      this.particles.burst(pos, 8, { colors: [0xffe370, 0xffffff], speed: 3.5, upBias: 3, size: 0.14, life: 0.7 });
    }

    // Update Chaos HUD & GTA Wanted Stars!
    this.chaosBillEl.textContent = `£${this.chaosBillGBP.toLocaleString()}`;
    this.statCarsEl.textContent = String(this.chaosCars);
    this.statTreesEl.textContent = String(this.chaosTrees);
    this.statPropsEl.textContent = String(this.chaosProps);
    this.statPedsEl.textContent = String(this.chaosPeds);

    const stars = Math.min(5, Math.floor(this.chaosBillGBP / 2500) + (this.chaosBillGBP > 400 ? 1 : 0));
    this.wantedStarsEl.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);

    if (this.mode === 'chaos') {
      this.showToast(`${label}! +£${costGBP.toLocaleString()}`, category === 'car' ? 'trick' : 'danger');
    } else if (category === 'car' || category === 'tree') {
      this.showToast(`Careful! You hit a ${label} in the village!`, 'danger');
    }
  }

  private recordDamage(): void {
    this.damagedCount++;
    this.damagedEl.textContent = String(this.damagedCount);
    this.damagedEl.className = this.damagedCount > 0 ? 'warn' : 'ok';
    this.starsEl.textContent =
      this.damagedCount === 0 ? '★★★' : this.damagedCount <= 2 ? '★★☆' : '★☆☆';
  }

  private handleSilagePop(prop: FarmProp, reason: string): void {
    if (!this.propMgr.popSilage(prop)) return;
    this.audio.playPlasticPop();
    const pos = new THREE.Vector3(prop.body.position.x, prop.body.position.y + 0.4, prop.body.position.z);
    this.particles.spawnPlasticPop(pos);
    this.recordDamage();
    this.showToast(`${reason} 💨`, 'danger');
  }

  private handlePropDamage(prop: FarmProp, reason: string): void {
    if (!this.propMgr.damageOrCrushProp(prop)) return;
    const isMetal = prop.kind === 'barrel';
    this.audio.playCrush(isMetal);
    const pos = new THREE.Vector3(prop.body.position.x, prop.body.position.y + 0.35, prop.body.position.z);
    const colors =
      prop.kind === 'pumpkin'
        ? [0xd96518, 0xf2932c, 0x4b7328]
        : prop.kind === 'barrel'
          ? [0xb34329, 0x747c82, 0xe3d6b8]
          : [0xbc864c, 0x8f5d2b, 0xd43828];
    this.particles.spawnCrush(pos, colors);

    if (prop.kind !== 'barrel') {
      this.recordDamage();
      this.showToast(
        this.mode === 'chaos' ? `${reason}` : `${reason} (Toss wreckage in Skip!)`,
        'danger'
      );
    } else {
      this.addScore(50);
      this.showToast(`${reason} +50`, 'trick');
    }
  }

  private addScore(pts: number): void {
    this.score += pts;
    this.scoreEl.textContent = String(this.score);
  }

  private showToast(msg: string, style: 'normal' | 'trick' | 'danger' = 'normal'): void {
    const el = document.createElement('div');
    el.className = style === 'normal' ? 'toast' : `toast ${style}`;
    el.textContent = msg;
    this.toastContainer.appendChild(el);
    setTimeout(() => el.remove(), 2450);
  }

  private updateToolReadout(): void {
    const info = TOOL_META[this.tractor.activeTool];
    this.activeToolName.textContent = info.name;
    this.activeToolTip.textContent = info.tip;
  }

  private toggleHints(): void {
    this.hintsOn = !this.hintsOn;
    this.farm.setHintsVisible(this.hintsOn);
    this.btnHints.textContent = this.hintsOn ? 'Hints: On' : 'Hints: Off';
    this.btnHints.classList.toggle('active-toggle', this.hintsOn);
  }

  private bindEvents(): void {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    this.pickFarmBtn.addEventListener('click', () => this.setMode('farm'));
    this.pickChaosBtn.addEventListener('click', () => this.setMode('chaos'));
    this.btnMode.addEventListener('click', () => this.setMode(this.mode === 'farm' ? 'chaos' : 'farm'));

    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      this.keys.add(e.code);

      if (!this.started) return;

      if (e.code === 'KeyT') {
        const acted = this.tractor.tryHitchNearby(this.farm.rackSpots);
        if (!acted) {
          this.showToast('Drive over to the Tool Shed bays to couple an attachment!');
        }
      } else if (e.code === 'KeyM') {
        this.toggleHints();
      } else if (e.code === 'KeyH') {
        this.audio.playHorn();
        const scared = this.village.scarePedestriansNear(this.tractor.position, 22);
        this.showToast(scared > 0 ? `HONK! Scattered ${scared} villager(s)!` : 'HONK HONK!');
      } else if (e.code === 'KeyX') {
        const mode = this.tractor.cycleSteeringMode();
        const label =
          mode === '4WS'
            ? '4-Wheel Steer [X]'
            : mode === '2WS'
              ? 'Front Steer [X]'
              : 'Crab Steer [X]';
        this.steerBadge.textContent = label;
        this.showToast(`Steering: ${label.replace(' [X]', '')}`);
      } else if (e.code === 'KeyV') {
        this.cycleCamera();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    const canvas = this.renderer.domElement;
    canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });
    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.camYawOffset -= dx * 0.0065;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch + dy * 0.005, 0.14, 1.18);
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.camDist = THREE.MathUtils.clamp(this.camDist + e.deltaY * 0.01, 6.0, 32);
      },
      { passive: false }
    );

    document.getElementById('start-btn')!.addEventListener('click', () => {
      this.started = true;
      this.audio.init();
      this.audio.playHorn();
      this.startOverlay.classList.add('hidden');
      this.hud.classList.remove('hidden');
      this.setMode(this.mode);
      if (this.mode === 'chaos') {
        // Spawn right near the open north farm gate facing Scorpion Green Village for instant action!
        this.tractor.position.set(0, 0, -25);
        this.tractor.heading = 0;
        this.tractor.equipTool('grapple', false);
        this.updateToolReadout();
      }
    });

    document.getElementById('btn-help')!.addEventListener('click', () => {
      this.startOverlay.classList.remove('hidden');
    });

    this.btnCamera.addEventListener('click', () => this.cycleCamera());
    this.btnHints.addEventListener('click', () => this.toggleHints());

    this.btnSound.addEventListener('click', () => {
      this.audio.setEnabled(!this.audio.enabled);
      this.btnSound.textContent = this.audio.enabled ? 'SFX: On' : 'SFX: Off';
    });

    document.getElementById('btn-hitch-action')!.addEventListener('click', () => {
      if (!this.tractor.tryHitchNearby(this.farm.rackSpots)) {
        this.showToast('Drive near a Tool Shed bay to couple a tool!');
      }
    });

    document.getElementById('btn-mess')!.addEventListener('click', () => {
      this.propMgr.spawnExtraChaosWave();
      this.victoryShown = false;
      this.victoryBanner.classList.add('hidden');
      this.audio.playScoreChime(false);
      this.showToast('More Storm Clutter Arrived!', 'trick');
    });

    document.getElementById('btn-reset')!.addEventListener('click', () => {
      this.tractor.resetPosition();
      this.showToast('Scorpion Reset to Farmyard');
    });

    document.getElementById('btn-victory-chaos')!.addEventListener('click', () => {
      this.victoryBanner.classList.add('hidden');
      this.setMode('chaos');
    });

    document.getElementById('btn-victory-close')!.addEventListener('click', () => {
      this.victoryBanner.classList.add('hidden');
    });
  }

  private cycleCamera(): void {
    const order: CameraMode[] = ['chase', 'cab', 'boom'];
    this.cameraMode = order[(order.indexOf(this.cameraMode) + 1) % order.length];
    const labels: Record<CameraMode, string> = {
      chase: 'Cam: Chase',
      cab: 'Cam: In-Cab',
      boom: 'Cam: Boom Tip'
    };
    this.btnCamera.textContent = labels[this.cameraMode];
  }

  private readInput(): TractorInput {
    if (!this.started) {
      return {
        throttle: 0,
        steer: 0,
        boost: false,
        creep: false,
        boomLift: 0,
        boomExtend: 0,
        headTilt: 0,
        actionHeld: false
      };
    }

    const f = this.keys.has('KeyW') ? 1 : 0;
    const b = this.keys.has('KeyS') ? 1 : 0;
    const l = this.keys.has('KeyA') ? 1 : 0;
    const r = this.keys.has('KeyD') ? 1 : 0;

    const liftUp = this.keys.has('KeyQ') || this.keys.has('ArrowUp') ? 1 : 0;
    const liftDn = this.keys.has('KeyE') || this.keys.has('ArrowDown') ? 1 : 0;

    const extOut = this.keys.has('KeyR') || this.keys.has('PageUp') ? 1 : 0;
    const extIn = this.keys.has('KeyF') || this.keys.has('PageDown') ? 1 : 0;

    const tiltUp = this.keys.has('KeyZ') || this.keys.has('ArrowLeft') ? -1 : 0;
    const tiltDn = this.keys.has('KeyC') || this.keys.has('ArrowRight') ? 1 : 0;

    const creep = this.keys.has('AltLeft') || this.keys.has('AltRight');
    this.creepBadge.classList.toggle('hidden', !creep);

    return {
      throttle: f - b,
      steer: l - r,
      boost: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
      creep,
      boomLift: liftUp - liftDn,
      boomExtend: extOut - extIn,
      headTilt: tiltUp + tiltDn,
      actionHeld: this.keys.has('Space')
    };
  }

  private evaluateZonesAndPond(): void {
    const totals: Record<ZoneKey, number> = { logs: 0, crates: 0, hay: 0, silage: 0, harvest: 0, scrap: 0 };
    const counts: Record<ZoneKey, number> = { logs: 0, crates: 0, hay: 0, silage: 0, harvest: 0, scrap: 0 };

    for (const p of this.propMgr.props) {
      totals[p.targetZone]++;

      const dPond = Math.hypot(
        p.body.position.x - this.farm.pondCenter.x,
        p.body.position.z - this.farm.pondCenter.z
      );
      const isNowInWater = dPond < this.farm.pondRadius - 0.3 && p.body.position.y < 1.1;
      if (isNowInWater && !p.inWater) {
        p.inWater = true;
        this.audio.playImpact(7, 'water');
        this.particles.spawnSplash(new THREE.Vector3(p.body.position.x, 0.2, p.body.position.z));
        this.showToast(`SPLASH! ${p.label} fell in the duck pond!`);
      } else if (!isNowInWater) {
        p.inWater = false;
      }

      const zone = this.farm.zones.find((z) => z.key === p.targetZone);
      if (!zone) continue;

      const inBounds =
        !p.heldByTractor &&
        Math.abs(p.body.position.x - zone.center.x) <= zone.halfSize.x &&
        Math.abs(p.body.position.z - zone.center.z) <= zone.halfSize.y &&
        p.body.position.y >= zone.minY - 0.15 &&
        p.body.position.y < 6.5;

      if (inBounds) {
        counts[p.targetZone]++;
        const settled = p.body.velocity.length() < 1.6;

        if (!p.scored && settled) {
          p.scored = true;
          const pos = new THREE.Vector3(p.body.position.x, p.body.position.y + 0.7, p.body.position.z);
          this.particles.spawnConfetti(pos);

          const throwDist = p.wasThrown ? pos.distanceTo(p.throwOrigin) : 0;
          if (p.wasThrown && throwDist > 5.5 && p.targetZone === 'scrap') {
            this.addScore(350);
            this.audio.playScoreChime(true);
            this.showToast(`SPIN-THROW SKIP DUNK! +350`, 'trick');
          } else if (p.isWrappedSilage && !p.isPopped) {
            this.addScore(300);
            this.audio.playScoreChime(true);
            this.showToast(`SEALED SILAGE STORED! +300`);
          } else if (p.isWrappedSilage && p.isPopped) {
            this.addScore(100);
            this.audio.playScoreChime(false);
            this.showToast(`Popped Silage Stored (+100)`);
          } else if (p.kind === 'crate' && !p.isDamaged) {
            this.addScore(250);
            this.audio.playScoreChime(true);
            this.showToast(`PALLET LOADED ON TRAILER! +250`);
          } else {
            this.addScore(175);
            this.audio.playScoreChime(false);
            this.showToast(`TIDY! ${p.label} +175`);
          }
          p.wasThrown = false;
        }

        const stackThreshold = p.targetZone === 'crates' ? this.farm.trailerDeckY + 1.25 : 1.45;
        if (!p.stackAwarded && settled && p.body.position.y > stackThreshold) {
          p.stackAwarded = true;
          this.addScore(300);
          this.audio.playScoreChime(true);
          this.particles.spawnConfetti(
            new THREE.Vector3(p.body.position.x, p.body.position.y + 0.6, p.body.position.z)
          );
          this.showToast(`CLEAN STACK BONUS! +300`, 'trick');
        }
      }
      p.inZone = inBounds;
    }

    let totalItems = 0;
    let totalTidy = 0;
    (Object.keys(totals) as ZoneKey[]).forEach((k) => {
      totalItems += totals[k];
      totalTidy += counts[k];
      const countEl = document.getElementById(`count-${k}`);
      if (countEl) countEl.textContent = `${counts[k]}/${totals[k]}`;
      const row = document.querySelector(`.chore-item[data-zone="${k}"]`);
      if (row) {
        const done = totals[k] > 0 && counts[k] >= totals[k];
        row.classList.toggle('complete', done);
        const check = row.querySelector('.chore-check');
        if (check) check.textContent = done ? '✓' : '○';
      }
    });

    const pct = totalItems > 0 ? Math.round((totalTidy / totalItems) * 100) : 0;
    this.tidyPctEl.textContent = `${pct}%`;
    this.tidyBarEl.style.width = `${pct}%`;

    if (this.mode === 'farm' && pct === 100 && totalItems > 0 && !this.victoryShown) {
      this.victoryShown = true;
      this.audio.playScoreChime(true);
      this.victoryTitle.textContent =
        this.damagedCount === 0 ? '★★★ Spotless Master Operator!' : 'Morning Shift Complete!';
      this.victorySub.textContent =
        this.damagedCount === 0
          ? `Zero items damaged — Score ${this.score}! Ready for Village Chaos?`
          : `Yard organized with ${this.damagedCount} damaged item(s) — Score ${this.score}!`;
      this.victoryBanner.classList.remove('hidden');
      this.particles.spawnConfetti(this.tractor.position.clone().add(new THREE.Vector3(0, 3.5, 0)));
    }
  }

  private updateRackAndPrompts(): void {
    const droppedSet = new Set(this.tractor.droppedAttachments.map((d) => d.type));
    for (const [tool, preview] of this.rackPreviews.entries()) {
      preview.visible = this.tractor.activeTool !== tool && !droppedSet.has(tool);
    }

    const tipPos = this.tractor.getHoldWorldPos();
    let promptMsg = '';

    for (const d of this.tractor.droppedAttachments) {
      if (d.pos.distanceTo(tipPos) < 3.4 || d.pos.distanceTo(this.tractor.position) < 4.4) {
        promptMsg = `Press [T] to re-couple ${TOOL_META[d.type].name}`;
        break;
      }
    }
    if (!promptMsg) {
      for (const spot of this.farm.rackSpots) {
        const near =
          spot.pos.distanceTo(tipPos) < 3.6 || spot.pos.distanceTo(this.tractor.position) < 4.8;
        (spot.ringMesh.material as THREE.MeshBasicMaterial).opacity = near ? 0.9 : 0.32;
        if (spot.tool !== this.tractor.activeTool && near) {
          promptMsg = `Press [T] to swap to ${spot.label}`;
          break;
        }
      }
    }

    if (promptMsg) {
      this.interactPrompt.textContent = promptMsg;
      this.interactPrompt.classList.remove('hidden');
    } else {
      this.interactPrompt.classList.add('hidden');
    }
  }

  private updateHUD(): void {
    const liftPct = ((this.tractor.boomPitch + 0.15) / (1.06 + 0.15)) * 100;
    const extPct = (this.tractor.boomExt / 3.6) * 100;
    const tiltPct = ((this.tractor.headTilt + 0.78) / (1.15 + 0.78)) * 100;

    this.gaugeLift.style.width = `${Math.round(liftPct)}%`;
    this.gaugeExt.style.width = `${Math.round(extPct)}%`;
    this.gaugeTilt.style.width = `${Math.round(tiltPct)}%`;

    if (this.tractor.heldVillageObj) {
      this.holdBadge.textContent = `Hoisting: ${this.tractor.heldVillageObj.label}`;
      this.holdBadge.classList.add('pill-hot');
    } else if (this.tractor.heldProps.length > 0) {
      const names = this.tractor.heldProps.map((p) => p.label).join(', ');
      this.holdBadge.textContent = `Load: ${names}`;
      this.holdBadge.classList.add('pill-hot');
    } else {
      this.holdBadge.textContent = 'No Load';
      this.holdBadge.classList.remove('pill-hot');
    }

    const showSqueeze =
      this.tractor.activeTool === 'grabber' && this.tractor.heldProps.length > 0;
    if (showSqueeze) {
      this.squeezeMeter.classList.remove('hidden');
      const pct = Math.round(this.tractor.squeezePressure * 100);
      this.squeezeFill.style.width = `${pct}%`;
      const held = this.tractor.heldProps[0];
      if (pct > 62) {
        this.squeezeWarn.textContent = held?.isWrappedSilage ? 'WATCH PLASTIC!' : 'CRUSHING!';
        this.squeezeWarn.classList.add('danger');
      } else if (pct > 10) {
        this.squeezeWarn.textContent = 'Squeezing...';
        this.squeezeWarn.classList.remove('danger');
      } else {
        this.squeezeWarn.textContent = 'Gentle Grip (Hold Space = Squeeze)';
        this.squeezeWarn.classList.remove('danger');
      }
    } else {
      this.squeezeMeter.classList.add('hidden');
    }
  }

  private updateCamera(dt: number): void {
    if (!this.started) {
      const a = this.elapsed * 0.25 + 0.7;
      this.camera.position.set(
        this.tractor.position.x + Math.sin(a) * 11.5,
        4.6,
        this.tractor.position.z + Math.cos(a) * 11.5
      );
      this.camera.lookAt(this.tractor.position.x, 1.8, this.tractor.position.z - 1.2);
      return;
    }

    if (this.cameraMode === 'cab') {
      const eye = this.tractor.getCabEyeWorldPos();
      const forward = new THREE.Vector3(
        -Math.sin(this.tractor.heading),
        0.04 + this.tractor.boomPitch * 0.25,
        -Math.cos(this.tractor.heading)
      );
      this.camera.position.copy(eye);
      this.camera.lookAt(eye.clone().addScaledVector(forward, 10));
      return;
    }

    if (this.cameraMode === 'boom') {
      const tip = this.tractor.getBoomTipWorldPos();
      const back = new THREE.Vector3(Math.sin(this.tractor.heading), 0.72, Math.cos(this.tractor.heading));
      const targetPos = tip.clone().addScaledVector(back, 5.0);
      targetPos.y = Math.max(1.7, targetPos.y);
      this.smoothCamPos.lerp(targetPos, Math.min(1, dt * 8));
      this.smoothLookAt.lerp(
        tip.clone().add(new THREE.Vector3(-Math.sin(this.tractor.heading) * 3, -0.45, -Math.cos(this.tractor.heading) * 3)),
        Math.min(1, dt * 9)
      );
      this.camera.position.copy(this.smoothCamPos);
      this.camera.lookAt(this.smoothLookAt);
      return;
    }

    const angle = this.tractor.heading + this.camYawOffset;
    const horiz = Math.cos(this.camPitch) * this.camDist;
    const desiredPos = new THREE.Vector3(
      this.tractor.position.x + Math.sin(angle) * horiz,
      Math.max(1.6, this.tractor.position.y + 1.8 + Math.sin(this.camPitch) * this.camDist),
      this.tractor.position.z + Math.cos(angle) * horiz
    );
    const desiredLook = new THREE.Vector3(
      this.tractor.position.x - Math.sin(this.tractor.heading) * 1.6,
      1.7 + this.tractor.boomPitch * 1.1,
      this.tractor.position.z - Math.cos(this.tractor.heading) * 1.6
    );

    this.smoothCamPos.lerp(desiredPos, Math.min(1, dt * 6.5));
    this.smoothLookAt.lerp(desiredLook, Math.min(1, dt * 8));
    this.camera.position.copy(this.smoothCamPos);
    this.camera.lookAt(this.smoothLookAt);
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.elapsed += dt;

    const input = this.readInput();
    this.tractor.update(dt, this.elapsed, input, this.propMgr.props, this.village.objects);

    this.world.step(1 / 60, dt, 4);
    this.propMgr.syncMeshes();

    this.farm.update(dt, this.elapsed);
    this.village.update(
      dt,
      this.elapsed,
      this.tractor.position,
      this.tractor.speed,
      this.tractor.getHoldWorldPos(),
      this.tractor.getTipSpeed(),
      this.mode === 'chaos'
    );
    this.particles.update(dt);

    for (const c of this.clouds) {
      c.position.x += dt * 0.4;
      if (c.position.x > 95) c.position.x = -95;
    }

    if (this.started) {
      this.evaluateZonesAndPond();
      this.updateRackAndPrompts();
      this.updateHUD();
      this.audio.updateContinuous(
        this.tractor.speed / 12,
        input.throttle,
        this.tractor.hydroLoad,
        this.tractor.squeezePressure
      );
    }

    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  };
}

new ScorpionGame();
