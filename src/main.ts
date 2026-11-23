import './style.css';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { FarmAudio } from './audio';
import { ParticleSystem } from './particles';
import { FarmEnvironment } from './farm';
import { FarmProp, PropManager, ZoneKey } from './props';
import { AttachmentType, buildAttachmentMesh, ClaasScorpion, TOOL_META, TractorInput } from './tractor';
import { VillageWorld } from './village';
import { TireTrackSystem } from './tracks';
import { MiniMapMarker, MuensingMiniMap } from './minimap';
import { createSkyEnvTexture } from './textures';
import { getTerrainHeight, WATER_LEVEL } from './terrain';

type CameraMode = 'chase' | 'cab' | 'boom';
type GameMode = 'farm' | 'freeplay';
type TimeOfDay = 'afternoon' | 'sunset' | 'dusk' | 'morning';

class ScorpionGame {
  private renderer: THREE.WebGLRenderer;
  private pmrem: THREE.PMREMGenerator;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private hemiLight!: THREE.HemisphereLight;
  private sunLight!: THREE.DirectionalLight;
  private rimLight!: THREE.DirectionalLight;
  private currentEnvRT: THREE.WebGLRenderTarget | null = null;

  private world: CANNON.World;
  private audio = new FarmAudio();
  private particles: ParticleSystem;
  private tracks: TireTrackSystem;
  private farm: FarmEnvironment;
  private village: VillageWorld;
  private propMgr: PropManager;
  private tractor: ClaasScorpion;
  private minimap: MuensingMiniMap;

  private rackPreviews = new Map<Exclude<AttachmentType, 'none'>, THREE.Group>();
  private clouds: THREE.Group[] = [];

  private keys = new Set<string>();
  private prevGamepadButtons: boolean[] = [];
  private started = false;
  private mode: GameMode = 'farm';
  private timeOfDay: TimeOfDay = 'afternoon';
  private score = 0;
  private damagedCount = 0;
  private hintsOn = false;
  private victoryShown = false;
  private churchBellTimer = 14;

  // Camera state (framed slightly wider/lower so Münsing's onion-dome church spire & Alps shine cinematically!)
  private cameraMode: CameraMode = 'chase';
  private camYawOffset = 0.22;
  private camPitch = 0.31;
  private camDist = 15.8;
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private smoothCamPos = new THREE.Vector3(0, 8, 26);
  private smoothLookAt = new THREE.Vector3(0, 1.5, 10);

  // DOM Elements
  private startOverlay = document.getElementById('start-overlay')!;
  private hud = document.getElementById('hud')!;
  private farmPanel = document.getElementById('farm-panel')!;
  private freeplayPanel = document.getElementById('freeplay-panel')!;
  private locationReadout = document.getElementById('location-readout')!;
  private pickFarmBtn = document.getElementById('pick-farm')!;
  private pickFreeplayBtn = document.getElementById('pick-freeplay')!;
  private btnMode = document.getElementById('btn-mode')!;
  private btnTime = document.getElementById('btn-time')!;
  private btnLights = document.getElementById('btn-lights')!;

  private scoreEl = document.getElementById('score-val')!;
  private starsEl = document.getElementById('stars-val')!;
  private damagedEl = document.getElementById('damaged-val')!;
  private tidyPctEl = document.getElementById('tidy-pct')!;
  private tidyBarEl = document.getElementById('tidy-bar-fill')!;

  private toastContainer = document.getElementById('toast-container')!;
  private interactPrompt = document.getElementById('interact-prompt')!;
  private squeezeMeter = document.getElementById('squeeze-meter')!;
  private squeezeFill = document.getElementById('squeeze-fill')!;
  private squeezeWarn = document.getElementById('squeeze-warn')!;
  private gaugeLift = document.getElementById('gauge-lift')!;
  private gaugeExt = document.getElementById('gauge-ext')!;
  private gaugeTilt = document.getElementById('gauge-tilt')!;
  private gaugeStab = document.getElementById('gauge-stab')!;
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
    this.renderer.toneMappingExposure = 1.04;

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.pmrem.compileEquirectangularShader();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.15, 520);
    this.camera.position.set(8, 7.5, 25);

    this.setupLightingAndSky();

    // High-precision Cannon-es solver for zero-bounce realistic wood-on-wood pallet stacking!
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -16.5, 0)
    });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;
    (this.world.solver as CANNON.GSSolver).iterations = 22;

    const groundMat = new CANNON.Material('ground');
    const propMat = new CANNON.Material('prop');
    const tractorMat = new CANNON.Material('tractor');

    this.world.addContactMaterial(
      new CANNON.ContactMaterial(groundMat, propMat, {
        friction: 0.84,
        restitution: 0.015,
        contactEquationStiffness: 1e7,
        contactEquationRelaxation: 4
      })
    );
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(propMat, propMat, {
        friction: 0.88,
        restitution: 0.015,
        contactEquationStiffness: 1e7,
        contactEquationRelaxation: 4
      })
    );
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(tractorMat, propMat, {
        friction: 0.68,
        restitution: 0.04
      })
    );

    this.particles = new ParticleSystem(this.scene);
    this.tracks = new TireTrackSystem(this.scene);
    this.farm = new FarmEnvironment(this.scene, this.world, groundMat);

    this.village = new VillageWorld(this.scene, this.world, groundMat, propMat, {
      onTreeOrLampToppled: (label, kind, pos) => {
        this.audio.playCrush(kind === 'lamp');
        this.particles.spawnCrush(
          pos,
          kind === 'lamp' ? [0x3b4045, 0xffe288] : [0x4b7e39, 0x624228, 0x35622e]
        );
        this.showToast(kind === 'maibaum' ? 'TIMBER! You toppled the Münsing Maibaum!' : `Toppled ${label}!`, 'trick');
      },
      onCarHonk: (alarm) => this.audio.playCarHorn(alarm),
      onLakeSplash: (label, pos) => {
        this.audio.playImpact(8, 'water');
        this.particles.spawnSplash(pos);
        this.showToast(`SPLASH! ${label} went into Starnberger See!`);
      }
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
        this.showToast(`LAUNCHED ${label}! (${Math.round(speed * 2.2)} mph)`, 'trick');
      },
      onPropGrabbed: (label, _tool, isSilageIntact) => {
        this.audio.playHitch(true);
        if (isSilageIntact) {
          this.showToast('Gentle Silage Grip — Plastic Sealed!');
        } else if (this.mode === 'freeplay') {
          this.showToast(`Lifted ${label}`);
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
      onDust: (pos) => this.particles.spawnDust(pos),
      onExhaust: (pos) =>
        this.particles.burst(pos, 1, {
          colors: [0x505559, 0x6c7276],
          speed: 0.75,
          upBias: 1.9,
          size: 0.16,
          life: 0.65,
          gravity: -1.1,
          shape: 'puff',
          grow: true
        }),
      onWheelTrack: (x, z, heading) => this.tracks.stampWheel(x, z, heading),
      onOverloadAlarm: () => this.audio.playOverloadBeep()
    });

    this.minimap = new MuensingMiniMap(document.getElementById('minimap-canvas') as HTMLCanvasElement);

    this.applyTimeOfDay('afternoon');
    this.updateToolReadout();
    this.bindEvents();
    this.animate();
  }

  private setupLightingAndSky(): void {
    this.hemiLight = new THREE.HemisphereLight(0xd4e8f5, 0x5c7044, 0.85);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff0cf, 1.8);
    this.sunLight.position.set(42, 68, 22);
    this.sunLight.target.position.set(-15, 0, -35);
    this.scene.add(this.sunLight.target);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 260;
    const d = 105;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0006;
    this.scene.add(this.sunLight);

    this.rimLight = new THREE.DirectionalLight(0xaacbe6, 0.35);
    this.rimLight.position.set(-40, 24, -50);
    this.scene.add(this.rimLight);

    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xf4f6f7, roughness: 0.96 });
    for (let i = 0; i < 14; i++) {
      const cloud = new THREE.Group();
      for (let p = 0; p < 4; p++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(3.2 + (p % 2) * 1.4, 10, 8), cloudMat);
        puff.position.set((p - 1.5) * 2.4, (p % 2) * 0.7, ((p % 3) - 1) * 0.9);
        puff.scale.y = 0.58;
        cloud.add(puff);
      }
      cloud.position.set(-130 + i * 20, 34 + (i % 3) * 5, -90 + (i % 4) * 38);
      this.scene.add(cloud);
      this.clouds.push(cloud);
    }
  }

  private applyTimeOfDay(tod: TimeOfDay): void {
    this.timeOfDay = tod;

    // Generate authentic PMREM sky environment reflections for glass, chrome, silage plastic & Lake Starnberg!
    const envTex = createSkyEnvTexture(tod);
    if (this.currentEnvRT) this.currentEnvRT.dispose();
    this.currentEnvRT = this.pmrem.fromEquirectangular(envTex);
    this.scene.environment = this.currentEnvRT.texture;
    envTex.dispose();

    const configs: Record<
      TimeOfDay,
      {
        label: string;
        sky: number;
        fog: number;
        fogNear: number;
        fogFar: number;
        sunCol: number;
        sunInt: number;
        sunPos: [number, number, number];
        hemiSky: number;
        hemiInt: number;
        nightAmt: number;
        autoLights: boolean;
      }
    > = {
      afternoon: {
        label: '☀ Afternoon',
        sky: 0x90bede,
        fog: 0xb6d3e6,
        fogNear: 120,
        fogFar: 360,
        sunCol: 0xfff3d4,
        sunInt: 1.8,
        sunPos: [42, 68, 22],
        hemiSky: 0xd6ecff,
        hemiInt: 0.85,
        nightAmt: 0.0,
        autoLights: false
      },
      sunset: {
        label: '🌅 Golden Sunset',
        sky: 0xd98a5b,
        fog: 0xd99b72,
        fogNear: 95,
        fogFar: 320,
        sunCol: 0xffa857,
        sunInt: 1.65,
        sunPos: [-95, 22, -32],
        hemiSky: 0xffc494,
        hemiInt: 0.65,
        nightAmt: 0.6,
        autoLights: true
      },
      dusk: {
        label: '🌙 Blue Hour',
        sky: 0x1c2e4a,
        fog: 0x243652,
        fogNear: 75,
        fogFar: 280,
        sunCol: 0x8bb6e8,
        sunInt: 0.45,
        sunPos: [-50, 35, -40],
        hemiSky: 0x456594,
        hemiInt: 0.42,
        nightAmt: 1.0,
        autoLights: true
      },
      morning: {
        label: '🌫 Morning Mist',
        sky: 0xb8d4e3,
        fog: 0xd6e3e8,
        fogNear: 68,
        fogFar: 255,
        sunCol: 0xfff4e0,
        sunInt: 1.45,
        sunPos: [82, 34, 15],
        hemiSky: 0xe6f2fa,
        hemiInt: 0.92,
        nightAmt: 0.12,
        autoLights: false
      }
    };

    const cfg = configs[tod];
    this.scene.background = new THREE.Color(cfg.sky);
    this.scene.fog = new THREE.Fog(cfg.fog, cfg.fogNear, cfg.fogFar);
    this.sunLight.color.setHex(cfg.sunCol);
    this.sunLight.intensity = cfg.sunInt;
    this.sunLight.position.set(...cfg.sunPos);
    this.hemiLight.color.setHex(cfg.hemiSky);
    this.hemiLight.intensity = cfg.hemiInt;
    this.village.setNightMode(cfg.nightAmt);
    this.setWorkLights(cfg.autoLights);
    this.btnTime.textContent = cfg.label;
  }

  private cycleTimeOfDay(): void {
    const order: TimeOfDay[] = ['afternoon', 'sunset', 'dusk', 'morning'];
    const next = order[(order.indexOf(this.timeOfDay) + 1) % order.length];
    this.applyTimeOfDay(next);
    this.showToast(`Sky: ${this.btnTime.textContent}`);
  }

  private setWorkLights(on: boolean): void {
    this.tractor.setWorkLights(on);
    this.btnLights.textContent = on ? 'Lights: On' : 'Lights: Off';
    this.btnLights.classList.toggle('active-toggle', on);
  }

  private setMode(next: GameMode): void {
    this.mode = next;
    this.tractor.freePlayMode = next === 'freeplay';

    this.pickFarmBtn.classList.toggle('selected', next === 'farm');
    this.pickFreeplayBtn.classList.toggle('selected', next === 'freeplay');

    this.farmPanel.classList.toggle('hidden', next !== 'farm');
    this.freeplayPanel.classList.toggle('hidden', next !== 'freeplay');

    this.btnMode.textContent = next === 'freeplay' ? 'Mode: Free Play 🏔️' : 'Mode: Farm Shift';
    this.btnMode.classList.toggle('free-active', next === 'freeplay');

    if (this.started) {
      if (next === 'freeplay') {
        this.showToast('Open-World Free Play — Explore Münsing & Starnberger See!');
      } else {
        this.showToast('Farm Shift Mode — Careful handling & tool rules active!');
      }
    }
  }

  private teleportTractor(x: number, z: number, heading: number, label: string): void {
    this.tractor.releaseAll(false);
    this.tractor.position.set(x, getTerrainHeight(x, z), z);
    this.tractor.heading = heading;
    this.tractor.speed = 0;
    this.showToast(`Driven to ${label}`);
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
        this.mode === 'freeplay' ? reason : `${reason} (Toss wreckage in Skip!)`,
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
    this.pickFreeplayBtn.addEventListener('click', () => this.setMode('freeplay'));
    this.btnMode.addEventListener('click', () => this.setMode(this.mode === 'farm' ? 'freeplay' : 'farm'));
    this.btnTime.addEventListener('click', () => this.cycleTimeOfDay());
    this.btnLights.addEventListener('click', () => this.setWorkLights(!this.tractor.workLightsOn));

    document.getElementById('btn-tp-farm')!.addEventListener('click', () => this.teleportTractor(-2, 14.5, 0.18, 'Farmyard'));
    document.getElementById('btn-tp-village')!.addEventListener('click', () => this.teleportTractor(-1.5, -36, 0, 'Münsing Dorfplatz'));
    document.getElementById('btn-tp-lake')!.addEventListener('click', () => this.teleportTractor(-92, -40, Math.PI / 2, 'Starnberger See Pier'));

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
      } else if (e.code === 'KeyN') {
        this.cycleTimeOfDay();
      } else if (e.code === 'KeyL') {
        this.setWorkLights(!this.tractor.workLightsOn);
      } else if (e.code === 'KeyH') {
        this.audio.playHorn();
        const scared = this.village.scarePedestriansNear(this.tractor.position, 22);
        this.showToast(scared > 0 ? `HONK! Startled ${scared} villager(s)!` : 'HONK HONK!');
      } else if (e.code === 'KeyX') {
        this.cycleSteerUI();
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
        this.camDist = THREE.MathUtils.clamp(this.camDist + e.deltaY * 0.01, 6.0, 34);
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
      if (this.mode === 'freeplay') {
        this.tractor.position.set(-1.5, getTerrainHeight(-1.5, -28.0), -28.0);
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
      this.showToast('More Farm Clutter Dropped!', 'trick');
    });

    document.getElementById('btn-reset')!.addEventListener('click', () => {
      this.tractor.resetPosition();
      this.showToast('Scorpion Reset to Farmyard');
    });

    document.getElementById('btn-victory-freeplay')!.addEventListener('click', () => {
      this.victoryBanner.classList.add('hidden');
      this.setMode('freeplay');
    });

    document.getElementById('btn-victory-close')!.addEventListener('click', () => {
      this.victoryBanner.classList.add('hidden');
    });
  }

  private cycleSteerUI(): void {
    const mode = this.tractor.cycleSteeringMode();
    const label =
      mode === '4WS' ? '4-Wheel Steer [X]' : mode === '2WS' ? 'Front Steer [X]' : 'Crab Steer [X]';
    this.steerBadge.textContent = label;
    this.showToast(`Steering: ${label.replace(' [X]', '')}`);
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

    let throttle = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    let steer = (this.keys.has('KeyA') ? 1 : 0) - (this.keys.has('KeyD') ? 1 : 0);
    let boost = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    let creep = this.keys.has('AltLeft') || this.keys.has('AltRight');
    let boomLift =
      (this.keys.has('KeyQ') || this.keys.has('ArrowUp') ? 1 : 0) -
      (this.keys.has('KeyE') || this.keys.has('ArrowDown') ? 1 : 0);
    let boomExtend =
      (this.keys.has('KeyR') || this.keys.has('PageUp') ? 1 : 0) -
      (this.keys.has('KeyF') || this.keys.has('PageDown') ? 1 : 0);
    let headTilt =
      (this.keys.has('KeyC') || this.keys.has('ArrowRight') ? 1 : 0) -
      (this.keys.has('KeyZ') || this.keys.has('ArrowLeft') ? 1 : 0);
    let actionHeld = this.keys.has('Space');

    // === GAMEPAD / CONTROLLER SUPPORT (Xbox / PS / Standard Web Gamepad!) ===
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads[0];
    if (gp) {
      const dead = (v: number) => (Math.abs(v) < 0.14 ? 0 : v);
      const rt = gp.buttons[7]?.value ?? 0;
      const lt = gp.buttons[6]?.value ?? 0;
      if (rt > 0.08 || lt > 0.08) throttle = rt - lt;
      const lx = dead(gp.axes[0] ?? 0);
      if (lx !== 0) steer = -lx;
      const rx = dead(gp.axes[2] ?? 0);
      const ry = dead(gp.axes[3] ?? 0);
      if (ry !== 0) boomLift = -ry;
      if (rx !== 0) headTilt = rx;
      if (gp.buttons[5]?.pressed) boomExtend = 1; // RB = Extend
      if (gp.buttons[4]?.pressed) boomExtend = -1; // LB = Retract
      if (gp.buttons[0]?.pressed) actionHeld = true; // A = Grab / Release
      if (gp.buttons[10]?.pressed) boost = true; // L3 = Boost
      if (gp.buttons[11]?.pressed) creep = true; // R3 = Creep

      const pressedEdge = (idx: number) => Boolean(gp.buttons[idx]?.pressed) && !this.prevGamepadButtons[idx];
      if (pressedEdge(3)) this.tractor.tryHitchNearby(this.farm.rackSpots); // Y = Couple
      if (pressedEdge(2)) this.cycleSteerUI(); // X = Steer Mode
      if (pressedEdge(1)) {
        this.audio.playHorn();
        this.village.scarePedestriansNear(this.tractor.position, 22);
      }
      this.prevGamepadButtons = gp.buttons.map((b) => b.pressed);
    }

    this.creepBadge.classList.toggle('hidden', !creep);

    return {
      throttle: THREE.MathUtils.clamp(throttle, -1, 1),
      steer: THREE.MathUtils.clamp(steer, -1, 1),
      boost,
      creep,
      boomLift: THREE.MathUtils.clamp(boomLift, -1, 1),
      boomExtend: THREE.MathUtils.clamp(boomExtend, -1, 1),
      headTilt: THREE.MathUtils.clamp(headTilt, -1, 1),
      actionHeld
    };
  }

  private getCurrentLocationName(): string {
    const { x, z } = this.tractor.position;
    if (x < -97 && Math.abs(z - -40) < 6) return '⛵ Starnberger See Pier (Steg)';
    if (x < -72) return '🌊 Ammerlander Straße (Lake Descent)';
    if (Math.hypot(x - -21, z - -67.5) < 22) return '⛪ Am Kirchberg — St. Mariä Himmelfahrt';
    if (x > 42 && z < -44) return '🛒 Bachstraße — EDEKA Aktivmarkt';
    if (x > 10 && x < 35 && z < -45 && z > -64) return '🍺 Gasthof Alter Wirt · Biergarten';
    if (x > 10 && x < 35 && z <= -64) return '🏛️ Rathaus — Gemeinde Münsing';
    if (x < -40 && z < -44) return '🥨 Bäckerei Krümel & Korn';
    if (z < -33) return '🏘️ Münsing Dorfplatz & Hauptstraße';
    return '🚜 Farmyard Plateau';
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
      const inDuckPond = dPond < this.farm.pondRadius - 0.3 && p.body.position.y < 1.1;
      const inStarnbergerSee = p.body.position.x < -99 && p.body.position.y < WATER_LEVEL + 0.35;
      const isNowInWater = inDuckPond || inStarnbergerSee;

      if (isNowInWater && !p.inWater) {
        p.inWater = true;
        this.audio.playImpact(7, 'water');
        this.particles.spawnSplash(
          new THREE.Vector3(p.body.position.x, inStarnbergerSee ? WATER_LEVEL + 0.2 : 0.2, p.body.position.z)
        );
        this.showToast(`SPLASH! ${p.label} fell in the water!`);
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
        const settled = p.body.velocity.length() < 1.5;

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
          ? `Zero items damaged — Score ${this.score}! Take the Scorpion down to Starnberger See!`
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
    const liftPct = ((this.tractor.boomPitch + 0.16) / (1.08 + 0.16)) * 100;
    const extPct = (this.tractor.boomExt / 3.6) * 100;
    const tiltPct = ((this.tractor.headTilt + 0.78) / (1.15 + 0.78)) * 100;
    const stabPct = Math.min(100, Math.round(this.tractor.loadMoment * 100));

    this.gaugeLift.style.width = `${Math.round(liftPct)}%`;
    this.gaugeExt.style.width = `${Math.round(extPct)}%`;
    this.gaugeTilt.style.width = `${Math.round(tiltPct)}%`;
    this.gaugeStab.style.width = `${stabPct}%`;

    if (this.mode === 'freeplay') {
      this.locationReadout.textContent = this.getCurrentLocationName();
    }

    if (this.tractor.heldVillageObj) {
      this.holdBadge.textContent = `Load: ${this.tractor.heldVillageObj.label}`;
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

    // Update live Münsing & Starnberger See GPS Mini-Map!
    const carDots = this.village.objects
      .filter((o) => o.kind === 'car')
      .map((o) => ({ x: o.body.position.x, z: o.body.position.z }));
    const markers: MiniMapMarker[] =
      this.mode === 'farm'
        ? this.farm.zones.map((z) => ({ x: z.center.x, z: z.center.z, color: '#9fd32e', pulse: this.hintsOn }))
        : [{ x: -112, z: -40, color: '#5bc4f5', pulse: true }];
    this.minimap.render(this.tractor.position, this.tractor.heading, carDots, markers, this.elapsed);
  }

  private updateCamera(dt: number): void {
    if (!this.started) {
      const a = this.elapsed * 0.25 + 0.7;
      this.camera.position.set(
        this.tractor.position.x + Math.sin(a) * 11.5,
        this.tractor.position.y + 4.6,
        this.tractor.position.z + Math.cos(a) * 11.5
      );
      this.camera.lookAt(this.tractor.position.x, this.tractor.position.y + 1.8, this.tractor.position.z - 1.2);
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
      targetPos.y = Math.max(getTerrainHeight(targetPos.x, targetPos.z) + 1.6, targetPos.y);
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
    const desiredX = this.tractor.position.x + Math.sin(angle) * horiz;
    const desiredZ = this.tractor.position.z + Math.cos(angle) * horiz;
    const groundAtCam = getTerrainHeight(desiredX, desiredZ);
    const desiredPos = new THREE.Vector3(
      desiredX,
      Math.max(groundAtCam + 1.6, this.tractor.position.y + 1.8 + Math.sin(this.camPitch) * this.camDist),
      desiredZ
    );
    const desiredLook = new THREE.Vector3(
      this.tractor.position.x - Math.sin(this.tractor.heading) * 2.2,
      this.tractor.position.y + 2.25 + this.tractor.boomPitch * 1.1,
      this.tractor.position.z - Math.cos(this.tractor.heading) * 2.2
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
    this.propMgr.syncMeshes(dt);

    this.farm.update(dt, this.elapsed);
    this.village.update(
      dt,
      this.elapsed,
      this.tractor.position,
      this.tractor.speed,
      this.tractor.getHoldWorldPos(),
      this.tractor.getTipSpeed(),
      this.mode === 'freeplay'
    );
    this.particles.update(dt);

    // Subtle shimmering Lake Starnberg water wave
    if (this.farm.lakeWaterMesh) {
      this.farm.lakeWaterMesh.position.y = WATER_LEVEL + Math.sin(this.elapsed * 1.2) * 0.04;
    }

    // Ambient bronze church bell chiming gently from St. Mariä Himmelfahrt!
    if (this.started) {
      this.churchBellTimer -= dt;
      if (this.churchBellTimer <= 0) {
        this.churchBellTimer = 38 + Math.random() * 18;
        const dChurch = this.tractor.position.distanceTo(this.village.churchPos);
        const atten = THREE.MathUtils.clamp(1 - dChurch / 140, 0.15, 1.0);
        this.audio.playChurchBell(atten);
      }
    }

    for (const c of this.clouds) {
      c.position.x += dt * 0.4;
      if (c.position.x > 135) c.position.x = -155;
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
