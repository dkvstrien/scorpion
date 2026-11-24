import './style.css';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { FarmAudio } from './audio';
import { ParticleSystem } from './particles';
import { FarmEnvironment } from './farm';
import { FarmProp, PropManager, ZoneKey } from './props';
import {
  AttachmentType,
  buildAttachmentMesh,
  ClaasScorpion,
  TOOL_META,
  TractorInput,
  VARIPOWER_GEARS,
  VaripowerGear
} from './tractor';
import { RealMuensingWorld } from './realWorld';
import { DEMO_SITE_CENTER, DestructionManager } from './destruction';
import { TireTrackSystem } from './tracks';
import { MiniMapMarker, MuensingMiniMap } from './minimap';
import { createSkyEnvTexture } from './textures';
import {
  FARM_CENTER,
  FARM_SPAWN,
  FARM_YARD_CENTER,
  getDrivableGroundY,
  getRealElevationMeters,
  getShorelineX,
  initDgm1Heightmap,
  REAL_SPOTS,
  WATER_LEVEL
} from './terrain';
import {
  BAVARIAN_CONTRACTS,
  CareerStats,
  ContractId,
  createWaypointBeacon,
  loadCareer,
  positionWaypointBeacon,
  saveCareer
} from './contracts';

type CameraMode = 'chase' | 'cab' | 'boom';
type GameMode = 'farm' | 'freeplay';
type TimeOfDay = 'afternoon' | 'sunset' | 'dusk' | 'morning';
type GraphicsQuality = 'high' | 'medium' | 'low';

interface GameSettings {
  quality: GraphicsQuality;
  volume: number; // 0..100
  ambience: boolean;
}

const SETTINGS_KEY = 'openworld_scorpion_settings_v1';

function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<GameSettings>;
      return {
        quality: p.quality === 'low' || p.quality === 'medium' || p.quality === 'high' ? p.quality : 'high',
        volume: typeof p.volume === 'number' ? Math.max(0, Math.min(100, p.volume)) : 85,
        ambience: typeof p.ambience === 'boolean' ? p.ambience : true
      };
    }
  } catch {
    // ignore storage errors
  }
  return { quality: 'high', volume: 85, ambience: true };
}

function saveSettings(s: GameSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // ignore storage errors
  }
}

class ScorpionGame {
  private renderer: THREE.WebGLRenderer;
  private pmrem: THREE.PMREMGenerator;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private hemiLight!: THREE.HemisphereLight;
  private sunLight!: THREE.DirectionalLight;
  private rimLight!: THREE.DirectionalLight;
  private skyDomeMat!: THREE.ShaderMaterial;
  private cloudMat!: THREE.MeshStandardMaterial;
  private currentEnvRT: THREE.WebGLRenderTarget | null = null;

  private world: CANNON.World;
  private audio = new FarmAudio();
  private particles: ParticleSystem;
  private tracks: TireTrackSystem;
  private farm: FarmEnvironment;
  private realWorld: RealMuensingWorld;
  private destruction: DestructionManager;
  private propMgr: PropManager;
  private tractor: ClaasScorpion;
  private minimap: MuensingMiniMap;
  private waypointBeacon: THREE.Group;

  private rackPreviews = new Map<Exclude<AttachmentType, 'none'>, THREE.Group>();
  private clouds: THREE.Group[] = [];

  private keys = new Set<string>();
  private prevGamepadButtons: boolean[] = [];
  private started = false;
  private paused = false;
  private settings: GameSettings = loadSettings();
  private mode: GameMode = 'farm';
  private timeOfDay: TimeOfDay = 'afternoon';
  private activeContractId: ContractId = 'yard_shift';
  private career: CareerStats = loadCareer();
  private damagedCount = 0;
  private jobElapsedSec = 0;
  private jobDamagedCount = 0;
  private jobRollovers = 0;
  private hintsOn = false;
  private contractCompletedThisRun = new Set<string>();
  private churchBellTimer = 16;
  private saveTimer = 0;

  // Camera state
  private cameraMode: CameraMode = 'chase';
  private camYawOffset = 0.22;
  private camPitch = 0.31;
  private camDist = 15.6;
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private smoothCamPos = new THREE.Vector3(FARM_SPAWN.x - 16, 60, FARM_SPAWN.z + 4);
  private smoothLookAt = new THREE.Vector3(FARM_SPAWN.x + 6, 52, FARM_SPAWN.z);
  private camShake = 0;

  // DOM Elements
  private startOverlay = document.getElementById('start-overlay')!;
  private pauseOverlay = document.getElementById('pause-overlay')!;
  private hud = document.getElementById('hud')!;
  private farmPanel = document.getElementById('farm-panel')!;
  private freeplayPanel = document.getElementById('freeplay-panel')!;
  private locationReadout = document.getElementById('location-readout')!;
  private pickFarmBtn = document.getElementById('pick-farm')!;
  private pickFreeplayBtn = document.getElementById('pick-freeplay')!;
  private btnMode = document.getElementById('btn-mode')!;
  private btnTime = document.getElementById('btn-time')!;
  private btnLights = document.getElementById('btn-lights')!;

  private contractSelect = document.getElementById('contract-select') as HTMLSelectElement;
  private contractDesc = document.getElementById('contract-desc')!;
  private contractToolHint = document.getElementById('contract-tool-hint')!;
  private contractTimerEl = document.getElementById('contract-timer')!;
  private yardProgressBlock = document.getElementById('yard-progress-block')!;
  private deliveryStatusBlock = document.getElementById('delivery-status-block')!;
  private deliveryProgressEl = document.getElementById('delivery-progress')!;
  private deliveryDistEl = document.getElementById('delivery-dist')!;

  private careerBankEl = document.getElementById('career-bank')!;
  private starsEl = document.getElementById('stars-val')!;
  private damagedEl = document.getElementById('damaged-val')!;
  private rolloverEl = document.getElementById('rollover-val')!;
  private odoEl = document.getElementById('odo-val')!;
  private freeplayOdoEl = document.getElementById('freeplay-odo')!;
  private tidyPctEl = document.getElementById('tidy-pct')!;
  private tidyBarEl = document.getElementById('tidy-bar-fill')!;

  private tippedBanner = document.getElementById('tipped-banner')!;
  private toastContainer = document.getElementById('toast-container')!;
  private interactPrompt = document.getElementById('interact-prompt')!;
  private squeezeMeter = document.getElementById('squeeze-meter')!;
  private squeezeFill = document.getElementById('squeeze-fill')!;
  private squeezeWarn = document.getElementById('squeeze-warn')!;

  private speedEl = document.getElementById('speed-val')!;
  private elevEl = document.getElementById('elev-val')!;
  private tipHorizonEl = document.getElementById('tip-horizon')!;
  private tipDotEl = document.getElementById('tip-dot')!;
  private tiltReadoutEl = document.getElementById('tilt-readout')!;
  private gearBadge = document.getElementById('gear-badge')!;
  private wheelsBadge = document.getElementById('wheels-badge')!;

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
  private syntheticInput: Partial<TractorInput> | null = null;
  private latestInput: TractorInput = {
    throttle: 0,
    steer: 0,
    boost: false,
    creep: false,
    boomLift: 0,
    boomExtend: 0,
    headTilt: 0,
    actionHeld: false
  };

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
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.15, 4800);
    this.camera.position.set(FARM_SPAWN.x - 14, 58, FARM_SPAWN.z + 8);

    this.setupLightingAndSky();

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
      new CANNON.ContactMaterial(groundMat, tractorMat, {
        friction: 0.22,
        restitution: 0.0
      })
    );
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(tractorMat, propMat, {
        friction: 0.65,
        restitution: 0.04
      })
    );

    this.particles = new ParticleSystem(this.scene);
    this.tracks = new TireTrackSystem(this.scene);
    this.farm = new FarmEnvironment(this.scene, this.world, groundMat);
    this.realWorld = new RealMuensingWorld(this.scene, this.world, groundMat, propMat, {
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
        this.showToast(`SPLASH! ${label} fell into Starnberger See!`);
      }
    });

    let lastBreakToastAt = 0;
    this.destruction = new DestructionManager(this.scene, this.world, propMat, {
      onBreak: (label, pos, soundMat, colors, shake) => {
        this.audio.playImpact(9.5, soundMat);
        if (soundMat === 'metal') this.audio.playCrush(true);
        this.particles.spawnCrush(pos, colors);
        this.particles.spawnDust(pos);
        this.camShake = Math.min(0.65, this.camShake + shake);
        const now = performance.now();
        if (this.mode === 'freeplay' && now - lastBreakToastAt > 1200) {
          lastBreakToastAt = now;
          this.showToast(`SMASHED: ${label}!`);
        }
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
        } else {
          this.showToast(`Loaded: ${label} — Watch Tip-O-Meter!`);
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
      onOverloadAlarm: () => this.audio.playOverloadBeep(),
      onTippedOver: (pos) => {
        this.audio.playCrush(true);
        this.particles.spawnCrush(pos, [0x9fd32e, 0xd6c7a8, 0x525a60]);
        this.career.rollovers++;
        this.jobRollovers++;
        saveCareer(this.career);
        this.refreshCareerUI();
        this.showToast('ROLLOVER! The Scorpion tipped over!', 'danger');
      }
    });

    this.waypointBeacon = createWaypointBeacon(this.scene);
    this.minimap = new MuensingMiniMap(document.getElementById('minimap-canvas') as HTMLCanvasElement);

    // Apply 4-wheel suspension, traction & dynamic boom tipping forces on EVERY fixed Cannon substep!
    this.world.addEventListener('preStep', () => {
      this.tractor.applyVehiclePhysicsForces(1 / 60, this.latestInput);
    });

    this.populateContractsUI();
    this.refreshCareerUI();
    this.applySettings();
    this.applyTimeOfDay('afternoon');
    this.updateToolReadout();
    this.bindEvents();
    this.animate();
  }

  private setupLightingAndSky(): void {
    this.hemiLight = new THREE.HemisphereLight(0xd4e8f5, 0x5c7044, 0.85);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff0cf, 1.85);
    this.sunLight.position.set(FARM_CENTER.x + 65, 95, FARM_CENTER.z + 45);
    this.sunLight.target.position.set(FARM_CENTER.x, 0, FARM_CENTER.z);
    this.scene.add(this.sunLight.target);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 280;
    const d = 110;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0006;
    this.scene.add(this.sunLight);

    this.rimLight = new THREE.DirectionalLight(0xaacbe6, 0.35);
    this.rimLight.position.set(-140, 48, -120);
    this.scene.add(this.rimLight);

    // Atmospheric horizon-to-zenith gradient sky dome with soft sun glow matching distance fog!
    this.skyDomeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTopColor: { value: new THREE.Color(0x528cc8) },
        uHorizonColor: { value: new THREE.Color(0xc8dff0) },
        uSunColor: { value: new THREE.Color(0xfff4d6) },
        uSunDir: { value: new THREE.Vector3(0.5, 0.65, 0.35).normalize() }
      },
      vertexShader: `
        varying vec3 vWorldDir;
        void main() {
          vWorldDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uTopColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uSunColor;
        uniform vec3 uSunDir;
        varying vec3 vWorldDir;
        void main() {
          vec3 dir = normalize(vWorldDir);
          float h = clamp(dir.y, 0.0, 1.0);
          vec3 col = mix(uHorizonColor, uTopColor, pow(h, 0.52));
          float sunAmt = max(dot(dir, normalize(uSunDir)), 0.0);
          col += uSunColor * pow(sunAmt, 14.0) * 0.28;
          col += uSunColor * smoothstep(0.9965, 0.9994, sunAmt) * 0.85;
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    const skyDome = new THREE.Mesh(new THREE.SphereGeometry(2900, 24, 16), this.skyDomeMat);
    this.scene.add(skyDome);

    this.cloudMat = new THREE.MeshStandardMaterial({ color: 0xf4f6f7, roughness: 0.96 });
    for (let i = 0; i < 28; i++) {
      const cloud = new THREE.Group();
      for (let p = 0; p < 4; p++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(9 + (p % 2) * 4, 10, 8), this.cloudMat);
        puff.position.set((p - 1.5) * 7.5, (p % 2) * 1.8, ((p % 3) - 1) * 2.8);
        puff.scale.y = 0.48;
        cloud.add(puff);
      }
      cloud.position.set(-1650 + i * 124, 185 + (i % 3) * 26, -1250 + (i % 5) * 580);
      this.scene.add(cloud);
      this.clouds.push(cloud);
    }
  }

  private populateContractsUI(): void {
    this.contractSelect.innerHTML = '';
    for (const c of BAVARIAN_CONTRACTS) {
      const opt = document.createElement('option');
      opt.value = c.id;
      const best = this.career.bestStars[c.id] ?? 0;
      const starBadge = best > 0 ? ` ${'★'.repeat(best)}` : '';
      opt.textContent = `${c.title} (€${c.payoutEUR})${starBadge}`;
      this.contractSelect.appendChild(opt);
    }
    this.selectContract(this.activeContractId, false);
  }

  private ensureContractPickupCargo(id: ContractId, forceRespawn = false): void {
    const c = BAVARIAN_CONTRACTS.find((x) => x.id === id);
    if (!c?.pickupSpawn) return;
    const { x, z, kind, count } = c.pickupSpawn;
    const nearby = this.propMgr.props.filter(
      (p) =>
        p.kind === kind &&
        !p.isDamaged &&
        !p.isPopped &&
        Math.hypot(p.body.position.x - x, p.body.position.z - z) < 28
    ).length;
    const needed = forceRespawn ? count : Math.max(0, count - nearby);
    for (let i = 0; i < needed; i++) {
      const ox = x + (i - (needed - 1) * 0.5) * 2.5;
      const oz = z + (i % 2) * 1.4;
      const oy = getDrivableGroundY(ox, oz) + 1.05;
      this.propMgr.spawnProp(kind, new THREE.Vector3(ox, oy, oz), i * 0.4);
    }
  }

  private selectContract(id: ContractId, resetTimer = true): void {
    this.activeContractId = id;
    this.contractSelect.value = id;
    const c = BAVARIAN_CONTRACTS.find((x) => x.id === id)!;
    this.contractDesc.textContent = c.subtitle;
    this.contractToolHint.textContent = `Tool: ${TOOL_META[c.recommendedTool].name}`;
    if (resetTimer) {
      this.jobElapsedSec = 0;
      this.jobDamagedCount = 0;
      this.jobRollovers = 0;
      this.contractCompletedThisRun.delete(id);
      this.victoryBanner.classList.add('hidden');
      this.ensureContractPickupCargo(id, false);
    }

    const isYard = id === 'yard_shift';
    this.yardProgressBlock.classList.toggle('hidden', !isYard);
    this.deliveryStatusBlock.classList.toggle('hidden', isYard);
    positionWaypointBeacon(this.waypointBeacon, c.targetX, c.targetZ, !isYard && this.mode === 'farm');
  }

  private applySettings(): void {
    const q = this.settings.quality;
    const maxDpr = q === 'high' ? 2 : q === 'medium' ? 1.5 : 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    const shadowSize = q === 'high' ? 2048 : q === 'medium' ? 1024 : 512;
    if (this.sunLight.shadow.mapSize.width !== shadowSize) {
      this.sunLight.shadow.mapSize.set(shadowSize, shadowSize);
      if (this.sunLight.shadow.map) {
        this.sunLight.shadow.map.dispose();
        this.sunLight.shadow.map = null;
      }
    }
    for (const c of this.clouds) c.visible = q !== 'low';

    this.audio.setMasterVolume(this.settings.volume / 100);
    this.audio.setAmbienceEnabled(this.settings.ambience);

    const qSel = document.getElementById('set-quality') as HTMLSelectElement | null;
    const vRange = document.getElementById('set-volume') as HTMLInputElement | null;
    const vVal = document.getElementById('set-volume-val');
    const ambChk = document.getElementById('set-ambience') as HTMLInputElement | null;
    if (qSel) qSel.value = q;
    if (vRange) vRange.value = String(this.settings.volume);
    if (vVal) vVal.textContent = `${this.settings.volume}%`;
    if (ambChk) ambChk.checked = this.settings.ambience;
  }

  private setPaused(next: boolean, tab?: 'settings' | 'controls' | 'credits'): void {
    if (!this.started) return;
    this.paused = next;
    this.pauseOverlay.classList.toggle('hidden', !next);
    if (next && tab) this.showPauseTab(tab);
  }

  private showPauseTab(tab: 'settings' | 'controls' | 'credits'): void {
    const tabs = document.querySelectorAll<HTMLButtonElement>('.pause-tab');
    tabs.forEach((b) => b.classList.toggle('active-toggle', b.dataset.tab === tab));
    document.getElementById('pause-pane-settings')!.classList.toggle('hidden', tab !== 'settings');
    document.getElementById('pause-pane-controls')!.classList.toggle('hidden', tab !== 'controls');
    document.getElementById('pause-pane-credits')!.classList.toggle('hidden', tab !== 'credits');
  }

  private refreshCareerUI(): void {
    this.careerBankEl.textContent = `€${this.career.bankEUR.toLocaleString()}`;
    this.rolloverEl.textContent = String(this.career.rollovers);
    const kmStr = `${this.career.totalKm.toFixed(1)} km`;
    this.odoEl.textContent = kmStr;
    this.freeplayOdoEl.textContent = kmStr;
  }

  private applyTimeOfDay(tod: TimeOfDay): void {
    this.timeOfDay = tod;
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
        sunOff: [number, number, number];
        hemiSky: number;
        hemiInt: number;
        nightAmt: number;
        autoLights: boolean;
      }
    > = {
      afternoon: {
        label: '☀ Afternoon',
        sky: 0x8ebde0,
        fog: 0xb6d3e8,
        fogNear: 420,
        fogFar: 2150,
        sunCol: 0xfff3d4,
        sunInt: 1.85,
        sunOff: [65, 95, 45],
        hemiSky: 0xd6ecff,
        hemiInt: 0.85,
        nightAmt: 0.0,
        autoLights: false
      },
      sunset: {
        label: '🌅 Golden Sunset',
        sky: 0xd98a5b,
        fog: 0xd99b72,
        fogNear: 320,
        fogFar: 1850,
        sunCol: 0xffa857,
        sunInt: 1.65,
        sunOff: [-110, 32, -25],
        hemiSky: 0xffc494,
        hemiInt: 0.65,
        nightAmt: 0.6,
        autoLights: true
      },
      dusk: {
        label: '🌙 Blue Hour',
        sky: 0x1c2e4a,
        fog: 0x243652,
        fogNear: 240,
        fogFar: 1450,
        sunCol: 0x8bb6e8,
        sunInt: 0.45,
        sunOff: [-65, 45, -45],
        hemiSky: 0x456594,
        hemiInt: 0.42,
        nightAmt: 1.0,
        autoLights: true
      },
      morning: {
        label: '🌫 Morning Mist',
        sky: 0xb8d4e3,
        fog: 0xd6e3e8,
        fogNear: 220,
        fogFar: 1350,
        sunCol: 0xfff4e0,
        sunInt: 1.45,
        sunOff: [95, 45, 25],
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
    this.hemiLight.color.setHex(cfg.hemiSky);
    this.hemiLight.intensity = cfg.hemiInt;
    if (this.skyDomeMat) {
      this.skyDomeMat.uniforms.uTopColor.value.setHex(
        tod === 'afternoon' ? 0x4c89c8 : tod === 'sunset' ? 0x5c4a76 : tod === 'dusk' ? 0x101c33 : 0x8bb2cc
      );
      this.skyDomeMat.uniforms.uHorizonColor.value.setHex(cfg.fog);
      this.skyDomeMat.uniforms.uSunColor.value.setHex(cfg.sunCol);
      this.skyDomeMat.uniforms.uSunDir.value.set(cfg.sunOff[0], cfg.sunOff[1], cfg.sunOff[2]).normalize();
    }
    if (this.cloudMat) {
      this.cloudMat.color.setHex(
        tod === 'sunset' ? 0xffd2b0 : tod === 'dusk' ? 0x3b4d6b : tod === 'morning' ? 0xf5f8fa : 0xf7f9fb
      );
    }
    this.realWorld.setNightMode(cfg.nightAmt);
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
    this.btnMode.textContent = next === 'freeplay' ? 'Mode: Free Play 🏔️' : 'Mode: Career';
    this.btnMode.classList.toggle('free-active', next === 'freeplay');

    const c = BAVARIAN_CONTRACTS.find((x) => x.id === this.activeContractId)!;
    positionWaypointBeacon(this.waypointBeacon, c.targetX, c.targetZ, next === 'farm' && c.id !== 'yard_shift');

    if (this.started) {
      this.showToast(
        next === 'freeplay'
          ? 'Open-World Free Play — Explore Starnberger See, Wimpasing & Münsing!'
          : 'Bavarian Contracting Career Active!'
      );
    }
  }

  private recordDamage(): void {
    this.damagedCount++;
    this.jobDamagedCount++;
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
      this.showToast(reason, 'trick');
    }
  }

  private completeContract(contractId: ContractId): void {
    if (this.contractCompletedThisRun.has(contractId)) return;
    this.contractCompletedThisRun.add(contractId);
    const c = BAVARIAN_CONTRACTS.find((x) => x.id === contractId)!;
    const stars =
      this.jobDamagedCount === 0 && this.jobRollovers === 0 && this.jobElapsedSec <= c.parSeconds
        ? 3
        : this.jobDamagedCount <= 1 && this.jobRollovers <= 1
          ? 2
          : 1;
    const bonus = stars === 3 ? 300 : stars === 2 ? 100 : 0;
    this.career.bankEUR += c.payoutEUR + bonus;
    if (!this.career.completedIds.includes(contractId)) {
      this.career.completedIds.push(contractId);
    }
    this.career.bestStars[contractId] = Math.max(this.career.bestStars[contractId] ?? 0, stars);
    saveCareer(this.career);
    this.populateContractsUI();
    this.refreshCareerUI();

    const mins = Math.floor(this.jobElapsedSec / 60);
    const secs = String(Math.floor(this.jobElapsedSec % 60)).padStart(2, '0');
    this.audio.playScoreChime(true);
    this.particles.spawnConfetti(this.tractor.position.clone().add(new THREE.Vector3(0, 3.5, 0)));
    this.victoryTitle.textContent = `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} ${c.title} Complete!`;
    this.victorySub.textContent = `Time ${mins}:${secs} · Earned +€${(c.payoutEUR + bonus).toLocaleString()} · Completed ${this.career.completedIds.length}/${BAVARIAN_CONTRACTS.length} Jobs`;
    this.victoryBanner.classList.remove('hidden');
  }

  private showToast(msg: string, style: 'normal' | 'trick' | 'danger' = 'normal'): void {
    const el = document.createElement('div');
    el.className = style === 'normal' ? 'toast' : `toast ${style}`;
    el.textContent = msg;
    this.toastContainer.appendChild(el);
    setTimeout(() => el.remove(), 2500);
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
    this.contractSelect.addEventListener('change', () => {
      this.selectContract(this.contractSelect.value as ContractId, true);
      const c = BAVARIAN_CONTRACTS.find((x) => x.id === this.activeContractId)!;
      this.showToast(`Contract: ${c.title} (${c.village})`);
    });
    document.getElementById('btn-replay-job')!.addEventListener('click', () => {
      this.contractCompletedThisRun.delete(this.activeContractId);
      this.jobElapsedSec = 0;
      this.jobDamagedCount = 0;
      this.jobRollovers = 0;
      this.victoryBanner.classList.add('hidden');
      this.ensureContractPickupCargo(this.activeContractId, true);
      this.showToast('Job timer reset & fresh cargo ready!');
    });

    const doWinch = () => {
      this.tractor.rightTractorInPlace();
      this.audio.playHitch(true);
      this.showToast('Recovery Winch — Back on all 4 tires!');
    };
    document.getElementById('btn-winch')!.addEventListener('click', doWinch);
    document.getElementById('btn-banner-winch')!.addEventListener('click', doWinch);
    this.gearBadge.addEventListener('click', () => {
      const g = this.tractor.cycleGear();
      this.showToast(`Varipower Gear: ${VARIPOWER_GEARS[g].label} km/h`);
    });

    // Real-World OSM GPS Fast Travel buttons (all placed cleanly on wide paved OSM roads with scenic framing!)
    const fastTravel = (x: number, z: number, heading: number, toast: string) => {
      this.tractor.teleportTo(x, z, heading);
      this.camYawOffset = 0.18;
      this.snapCameraToTractor();
      this.showToast(toast);
    };
    document.getElementById('btn-tp-farm')!.addEventListener('click', () => {
      fastTravel(FARM_SPAWN.x, FARM_SPAWN.z, FARM_SPAWN.heading, 'Wimpasing Home Farm');
    });
    document.getElementById('btn-tp-lake')!.addEventListener('click', () => {
      // Right on Nördliche Seestraße facing west straight down Fischerei Sebald Pier over Starnberger See!
      fastTravel(-978.4, REAL_SPOTS.sebaldPier.z, Math.PI / 2, 'Fischerei Sebald & Schloss Ammerland (Starnberger See)');
    });
    document.getElementById('btn-tp-village')!.addEventListener('click', () => {
      // Right on Am Kirchberg / Weipertshausener Straße facing St. Mariä Himmelfahrt, Maibaum & Zum Altwirt!
      fastTravel(1352.0, 992.5, -Math.PI / 2 + 0.12, 'Münsing — St. Mariä Himmelfahrt & Gasthaus Zum Altwirt');
    });
    document.getElementById('btn-tp-weipert')!.addEventListener('click', () => {
      // Right on Weipertshausen main street heading north into the hamlet!
      fastTravel(496.0, -1189.0, 0.12, 'Weipertshausen — Weipertshausener Straße');
    });
    document.getElementById('btn-tp-demo')!.addEventListener('click', () => {
      fastTravel(
        DEMO_SITE_CENTER.x,
        DEMO_SITE_CENTER.z + 25,
        0,
        'Old Gravel Pit Farmstead — Breakable Demolition Site!'
      );
    });
    document.getElementById('btn-reset-demo')!.addEventListener('click', () => {
      this.destruction.resetDemolitionSite();
      this.showToast('Demolition Site rebuilt — ready for another run!');
    });

    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      this.keys.add(e.code);

      if (!this.started) return;

      if (e.code === 'Escape') {
        e.preventDefault();
        this.setPaused(!this.paused);
        return;
      }
      if (this.paused) return;

      if (e.code === 'Backspace') {
        e.preventDefault();
        doWinch();
      } else if (e.code === 'KeyT') {
        const acted = this.tractor.tryHitchNearby(this.farm.rackSpots);
        if (!acted) this.showToast('Drive over to the Tool Shed bays to couple an attachment!');
      } else if (e.code === 'KeyM') {
        this.toggleHints();
      } else if (e.code === 'KeyN') {
        this.cycleTimeOfDay();
      } else if (e.code === 'KeyL') {
        this.setWorkLights(!this.tractor.workLightsOn);
      } else if (e.code === 'KeyH') {
        this.audio.playHorn();
        const scared = this.realWorld.scarePedestriansNear(this.tractor.position, 24);
        this.showToast(scared > 0 ? `HONK! Startled ${scared} villager(s)!` : 'HONK HONK!');
      } else if (e.code === 'KeyG') {
        const g = this.tractor.cycleGear();
        this.showToast(`Varipower Gear: ${VARIPOWER_GEARS[g].label} km/h`);
      } else if (e.code === 'KeyX') {
        this.cycleSteerUI();
      } else if (e.code === 'KeyV') {
        this.cycleCamera();
      }
    });

    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

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
        this.camDist = THREE.MathUtils.clamp(this.camDist + e.deltaY * 0.01, 6.0, 38);
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
        this.tractor.equipTool('grapple', false);
        this.updateToolReadout();
      }
      this.snapCameraToTractor();
    });

    document.getElementById('btn-help')!.addEventListener('click', () => {
      this.setPaused(!this.paused, 'settings');
    });
    document.getElementById('btn-pause-resume')!.addEventListener('click', () => this.setPaused(false));
    document.querySelectorAll<HTMLButtonElement>('.pause-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.showPauseTab((btn.dataset.tab as 'settings' | 'controls' | 'credits') ?? 'settings');
      });
    });
    (document.getElementById('set-quality') as HTMLSelectElement).addEventListener('change', (e) => {
      this.settings.quality = (e.target as HTMLSelectElement).value as GraphicsQuality;
      saveSettings(this.settings);
      this.applySettings();
    });
    (document.getElementById('set-volume') as HTMLInputElement).addEventListener('input', (e) => {
      this.settings.volume = Number((e.target as HTMLInputElement).value);
      saveSettings(this.settings);
      this.applySettings();
    });
    (document.getElementById('set-ambience') as HTMLInputElement).addEventListener('change', (e) => {
      this.settings.ambience = (e.target as HTMLInputElement).checked;
      saveSettings(this.settings);
      this.applySettings();
    });
    document.getElementById('btn-pause-replay')!.addEventListener('click', () => {
      this.setPaused(false);
      document.getElementById('btn-replay-job')!.click();
    });
    document.getElementById('btn-pause-winch')!.addEventListener('click', () => {
      this.setPaused(false);
      doWinch();
    });
    document.getElementById('btn-pause-reset-save')!.addEventListener('click', () => {
      this.career = { bankEUR: 500, completedIds: [], bestStars: {}, totalKm: 0, rollovers: 0 };
      saveCareer(this.career);
      this.contractCompletedThisRun.clear();
      this.populateContractsUI();
      this.refreshCareerUI();
      this.showToast('Career save reset to €500');
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
      this.propMgr.spawnExtraChaosWave(this.tractor.position.x, this.tractor.position.z);
      this.audio.playScoreChime(false);
      this.showToast('Dropped Fresh Props Nearby!', 'trick');
    });

    document.getElementById('btn-victory-freeplay')!.addEventListener('click', () => {
      this.victoryBanner.classList.add('hidden');
      this.setMode('freeplay');
    });

    document.getElementById('btn-victory-close')!.addEventListener('click', () => {
      this.victoryBanner.classList.add('hidden');
      const idx = BAVARIAN_CONTRACTS.findIndex((c) => c.id === this.activeContractId);
      const next = BAVARIAN_CONTRACTS[(idx + 1) % BAVARIAN_CONTRACTS.length];
      this.selectContract(next.id, true);
      this.showToast(`Next Job: ${next.title}`);
    });
  }

  private cycleSteerUI(): void {
    const mode = this.tractor.cycleSteeringMode();
    const label = mode === '4WS' ? '4WS [X]' : mode === '2WS' ? '2WS [X]' : 'Crab [X]';
    this.steerBadge.textContent = label;
    this.showToast(`Steering: ${mode}`);
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
      if (gp.buttons[5]?.pressed) boomExtend = 1;
      if (gp.buttons[4]?.pressed) boomExtend = -1;
      if (gp.buttons[0]?.pressed) actionHeld = true;
      if (gp.buttons[10]?.pressed) boost = true;
      if (gp.buttons[11]?.pressed) creep = true;

      const pressedEdge = (idx: number) => Boolean(gp.buttons[idx]?.pressed) && !this.prevGamepadButtons[idx];
      if (pressedEdge(3)) this.tractor.tryHitchNearby(this.farm.rackSpots);
      if (pressedEdge(2)) this.cycleSteerUI();
      if (pressedEdge(8)) this.tractor.rightTractorInPlace();
      if (pressedEdge(1)) {
        this.audio.playHorn();
        this.realWorld.scarePedestriansNear(this.tractor.position, 24);
      }
      this.prevGamepadButtons = gp.buttons.map((b) => b.pressed);
    }

    this.creepBadge.classList.toggle('hidden', !creep);

    if (this.syntheticInput) {
      return {
        throttle: this.syntheticInput.throttle ?? 0,
        steer: this.syntheticInput.steer ?? 0,
        boost: this.syntheticInput.boost ?? false,
        creep: this.syntheticInput.creep ?? false,
        boomLift: this.syntheticInput.boomLift ?? 0,
        boomExtend: this.syntheticInput.boomExtend ?? 0,
        headTilt: this.syntheticInput.headTilt ?? 0,
        actionHeld: this.syntheticInput.actionHeld ?? false
      };
    }

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
    if (Math.hypot(x - REAL_SPOTS.sebaldPier.x, z - REAL_SPOTS.sebaldPier.z) < 90)
      return '⛵ Fischerei Sebald · Starnberger See';
    if (Math.hypot(x - REAL_SPOTS.schlossAmmerland.x, z - REAL_SPOTS.schlossAmmerland.z) < 105)
      return '🏰 Schloss Ammerland · Starnberger See';
    if (Math.hypot(x - REAL_SPOTS.muensingChurch.x, z - REAL_SPOTS.muensingChurch.z) < 88)
      return '⛪ Münsing — St. Mariä Himmelfahrt';
    if (Math.hypot(x - REAL_SPOTS.muensingAltwirt.x, z - REAL_SPOTS.muensingAltwirt.z) < 115)
      return '🍺 Münsing — Gasthaus Zum Altwirt';
    if (Math.hypot(x - REAL_SPOTS.edeka.x, z - REAL_SPOTS.edeka.z) < 85) return '🛒 Münsing — EDEKA Graf';
    if (Math.hypot(x - REAL_SPOTS.weipertshausen.x, z - REAL_SPOTS.weipertshausen.z) < 220)
      return '🌲 Weipertshausen';
    if (Math.hypot(x - REAL_SPOTS.ried.x, z - REAL_SPOTS.ried.z) < 130) return '🌾 Ried';
    if (Math.hypot(x - FARM_YARD_CENTER.x, z - FARM_YARD_CENTER.z) < 55 || Math.hypot(x - FARM_CENTER.x, z - FARM_CENTER.z) < 42)
      return '🚜 Home Farm';
    if (Math.hypot(x - REAL_SPOTS.wimpasing.x, z - REAL_SPOTS.wimpasing.z) < 165) return '🏘️ Wimpasing';
    if (x > 160 && x < 1200) return '⛰️ Münsinger Straße (Open Country)';
    return '🏔️ Starnberger See Valley';
  }

  private evaluateZonesAndContracts(): void {
    const totals: Record<ZoneKey, number> = { logs: 0, crates: 0, hay: 0, silage: 0, harvest: 0, scrap: 0 };
    const counts: Record<ZoneKey, number> = { logs: 0, crates: 0, hay: 0, silage: 0, harvest: 0, scrap: 0 };

    const activeContract = BAVARIAN_CONTRACTS.find((c) => c.id === this.activeContractId)!;
    let contractDelivered = 0;

    for (const p of this.propMgr.props) {
      totals[p.targetZone]++;

      const dPond = Math.hypot(
        p.body.position.x - this.farm.pondCenter.x,
        p.body.position.z - this.farm.pondCenter.z
      );
      const inDuckPond = dPond < this.farm.pondRadius - 0.3 && p.body.position.y < this.farm.pondCenter.y + 1.1;
      const inLake = p.body.position.x < -215 && p.body.position.y < WATER_LEVEL + 0.35;
      const isNowInWater = inDuckPond || inLake;

      if (isNowInWater && !p.inWater) {
        p.inWater = true;
        this.audio.playImpact(7, 'water');
        this.particles.spawnSplash(
          new THREE.Vector3(p.body.position.x, inLake ? WATER_LEVEL + 0.2 : this.farm.pondCenter.y + 0.2, p.body.position.z)
        );
        this.showToast(`SPLASH! ${p.label} fell into the water!`);
      } else if (!isNowInWater) {
        p.inWater = false;
      }

      // Check all 10 Bavarian delivery & yard-precision contracts!
      if (
        this.mode === 'farm' &&
        activeContract.requiredKind !== 'any_yard' &&
        activeContract.requiredKind !== 'yard_silage' &&
        activeContract.requiredKind !== 'yard_crates'
      ) {
        const distTarget = Math.hypot(
          p.body.position.x - activeContract.targetX,
          p.body.position.z - activeContract.targetZ
        );
        const matchesKind =
          activeContract.requiredKind === 'hay'
            ? p.kind === 'hay_round' || p.kind === 'hay_square'
            : p.kind === activeContract.requiredKind;
        const intactOk = !activeContract.requireIntact || (!p.isDamaged && !p.isPopped);
        if (!p.heldByTractor && intactOk && matchesKind && distTarget <= activeContract.targetRadius) {
          contractDelivered++;
        }
      }

      const zone = this.farm.zones.find((z) => z.key === p.targetZone);
      if (!zone) continue;

      const inBounds =
        !p.heldByTractor &&
        Math.abs(p.body.position.x - zone.center.x) <= zone.halfSize.x &&
        Math.abs(p.body.position.z - zone.center.z) <= zone.halfSize.y &&
        p.body.position.y >= zone.minY - 0.15 &&
        p.body.position.y < zone.minY + 6.5;

      if (inBounds) {
        counts[p.targetZone]++;
        const settled = p.body.velocity.length() < 1.5;

        if (!p.scored && settled) {
          p.scored = true;
          const pos = new THREE.Vector3(p.body.position.x, p.body.position.y + 0.7, p.body.position.z);
          this.particles.spawnConfetti(pos);
          this.audio.playScoreChime(p.isWrappedSilage && !p.isPopped);
          this.career.bankEUR += p.isWrappedSilage && !p.isPopped ? 120 : 60;
          this.refreshCareerUI();
          this.showToast(
            p.isWrappedSilage && !p.isPopped
              ? `SEALED SILAGE STORED! +€120`
              : `TIDY! ${p.label} +€60`
          );
        }

        const stackThreshold = p.targetZone === 'crates' ? this.farm.trailerDeckY + 1.25 : zone.minY + 1.45;
        if (!p.stackAwarded && settled && p.body.position.y > stackThreshold) {
          p.stackAwarded = true;
          this.career.bankEUR += 150;
          this.refreshCareerUI();
          this.audio.playScoreChime(true);
          this.particles.spawnConfetti(new THREE.Vector3(p.body.position.x, p.body.position.y + 0.6, p.body.position.z));
          this.showToast(`CLEAN STACK BONUS! +€150`, 'trick');
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

    const deliveredSilageIntact = this.propMgr.props.filter(
      (p) => p.kind === 'silage_wrapped' && p.inZone && !p.isPopped && !p.isDamaged
    ).length;
    const deliveredCratesIntact = this.propMgr.props.filter(
      (p) => p.kind === 'crate' && p.inZone && !p.isDamaged
    ).length;

    if (this.mode === 'farm') {
      if (activeContract.id === 'yard_shift' && pct === 100 && totalItems > 0) {
        this.completeContract('yard_shift');
      } else if (activeContract.requiredKind !== 'any_yard') {
        const deliveredNow =
          activeContract.requiredKind === 'yard_silage'
            ? deliveredSilageIntact
            : activeContract.requiredKind === 'yard_crates'
              ? deliveredCratesIntact
              : contractDelivered;
        const distNow = Math.round(
          Math.hypot(this.tractor.position.x - activeContract.targetX, this.tractor.position.z - activeContract.targetZ)
        );
        this.deliveryProgressEl.textContent = `Delivered (${activeContract.village}): ${deliveredNow} / ${activeContract.requiredCount}`;
        this.deliveryDistEl.textContent = `GPS Distance to Drop Zone: ${distNow} m`;
        if (deliveredNow >= activeContract.requiredCount) {
          this.completeContract(activeContract.id);
        }
      }
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

  private updateHUD(dt: number): void {
    // Speedometer (exact metric m/s -> km/h), Real Altitude (m ü. NN), Varipower Gear & Live Traffic-Light Tip-O-Meter!
    const kmh = Math.round(Math.abs(this.tractor.speed) * 3.6);
    const elevM = Math.round(getRealElevationMeters(this.tractor.position.x, this.tractor.position.z));
    this.speedEl.textContent = String(kmh);
    this.elevEl.textContent = String(elevM);

    const activeGear = this.tractor.getActiveGear(this.latestInput);
    this.gearBadge.textContent = `${VARIPOWER_GEARS[activeGear].label} [G]`;
    this.gearBadge.classList.toggle('pill-hot', activeGear === 'hare');
    this.gearBadge.classList.toggle('pill-green', activeGear !== 'hare');

    const dotX = THREE.MathUtils.clamp((this.tractor.rollDeg / 38) * 16, -16, 16);
    const dotY = THREE.MathUtils.clamp((-this.tractor.pitchDeg / 38) * 16, -16, 16);
    this.tipDotEl.style.transform = `translate(${dotX.toFixed(1)}px, ${dotY.toFixed(1)}px)`;
    const maxTilt = Math.max(Math.abs(this.tractor.rollDeg), Math.abs(this.tractor.pitchDeg));
    this.tiltReadoutEl.textContent = `${maxTilt}°`;

    // Tip-O-Meter traffic light: Green = safe (<0.50), Yellow = limit (0.50-0.80), Red = over (>0.80)
    const lm = this.tractor.loadMoment;
    this.tipHorizonEl.classList.toggle('tip-safe', lm < 0.5);
    this.tipHorizonEl.classList.toggle('tip-warn', lm >= 0.5 && lm <= 0.8);
    this.tipHorizonEl.classList.toggle('tip-danger', lm > 0.8);

    this.wheelsBadge.textContent = `${this.tractor.wheelsOnGround}/4 Tires`;
    this.wheelsBadge.classList.toggle('pill-hot', this.tractor.wheelsOnGround <= 2);
    this.tippedBanner.classList.toggle('hidden', !this.tractor.isTipped);

    const liftPct = ((this.tractor.boomPitch + 0.2) / (1.1 + 0.2)) * 100;
    const extPct = (this.tractor.boomExt / 3.6) * 100;
    const tiltPct = ((this.tractor.headTilt + 0.78) / (1.15 + 0.78)) * 100;
    const stabPct = Math.min(100, Math.round(this.tractor.loadMoment * 100));

    this.gaugeLift.style.width = `${Math.round(liftPct)}%`;
    this.gaugeExt.style.width = `${Math.round(extPct)}%`;
    this.gaugeTilt.style.width = `${Math.round(tiltPct)}%`;
    this.gaugeStab.style.width = `${stabPct}%`;

    // Job Timer Display
    if (this.mode === 'farm' && !this.contractCompletedThisRun.has(this.activeContractId)) {
      this.jobElapsedSec += dt;
    }
    const curC = BAVARIAN_CONTRACTS.find((x) => x.id === this.activeContractId)!;
    const jMin = Math.floor(this.jobElapsedSec / 60);
    const jSec = String(Math.floor(this.jobElapsedSec % 60)).padStart(2, '0');
    const pMin = Math.floor(curC.parSeconds / 60);
    const pSec = String(curC.parSeconds % 60).padStart(2, '0');
    this.contractTimerEl.textContent = `${jMin}:${jSec} / ${pMin}:${pSec}`;

    // Persistent Odometer
    this.saveTimer += dt;
    if (this.saveTimer > 2.0) {
      this.saveTimer = 0;
      this.career.totalKm += this.tractor.distanceMeters / 1000;
      this.tractor.distanceMeters = 0;
      saveCareer(this.career);
      this.refreshCareerUI();
    }

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

    // Update Real OpenStreetMap GPS Mini-Map!
    const carDots = this.realWorld.objects
      .filter((o) => o.kind === 'car')
      .map((o) => ({ x: o.body.position.x, z: o.body.position.z }));
    const activeC = BAVARIAN_CONTRACTS.find((c) => c.id === this.activeContractId)!;
    const markers: MiniMapMarker[] =
      this.mode === 'farm'
        ? [{ x: activeC.targetX, z: activeC.targetZ, color: '#9fd32e', pulse: true }]
        : [
            { x: REAL_SPOTS.sebaldPier.x, z: REAL_SPOTS.sebaldPier.z, color: '#5bc4f5', pulse: true },
            { x: REAL_SPOTS.muensingChurch.x, z: REAL_SPOTS.muensingChurch.z, color: '#ffe370', pulse: false }
          ];
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

    // Keep shadow frustum smoothly centered on the CLAAS Scorpion as you drive across the 1.2 km real Bavarian map!
    this.sunLight.target.position.copy(this.tractor.position);
    const sunOff =
      this.timeOfDay === 'sunset'
        ? [-110, 32, -25]
        : this.timeOfDay === 'dusk'
          ? [-65, 45, -45]
          : this.timeOfDay === 'morning'
            ? [95, 45, 25]
            : [65, 95, 45];
    this.sunLight.position.set(
      this.tractor.position.x + sunOff[0],
      this.tractor.position.y + sunOff[1],
      this.tractor.position.z + sunOff[2]
    );

    if (this.cameraMode === 'cab') {
      const eye = this.tractor.getCabEyeWorldPos();
      const forward = new THREE.Vector3(0, 0.04 + this.tractor.boomPitch * 0.22, -1).applyQuaternion(
        this.tractor.root.quaternion
      );
      this.camera.position.copy(eye);
      this.camera.lookAt(eye.clone().addScaledVector(forward, 12));
      return;
    }

    if (this.cameraMode === 'boom') {
      const tip = this.tractor.getBoomTipWorldPos();
      const back = new THREE.Vector3(Math.sin(this.tractor.heading), 0.72, Math.cos(this.tractor.heading));
      const targetPos = tip.clone().addScaledVector(back, 5.2);
      targetPos.y = Math.max(getDrivableGroundY(targetPos.x, targetPos.z) + 1.6, targetPos.y);
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
    const groundAtCam = getDrivableGroundY(desiredX, desiredZ);
    const desiredPos = new THREE.Vector3(
      desiredX,
      Math.max(groundAtCam + 1.8, this.tractor.position.y + 1.9 + Math.sin(this.camPitch) * this.camDist),
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
    if (this.camShake > 0.005) {
      this.camera.position.x += (Math.random() - 0.5) * this.camShake;
      this.camera.position.y += (Math.random() - 0.5) * this.camShake * 0.7;
      this.camera.position.z += (Math.random() - 0.5) * this.camShake;
      this.camShake = Math.max(0, this.camShake - dt * 1.85);
    }
    this.camera.lookAt(this.smoothLookAt);
  }

  private snapCameraToTractor(): void {
    const angle = this.tractor.heading + this.camYawOffset;
    const horiz = Math.cos(this.camPitch) * this.camDist;
    const tx = this.tractor.chassisBody.position.x;
    const tz = this.tractor.chassisBody.position.z;
    const ty = getDrivableGroundY(tx, tz);
    const desiredX = tx + Math.sin(angle) * horiz;
    const desiredZ = tz + Math.cos(angle) * horiz;
    const groundAtCam = getDrivableGroundY(desiredX, desiredZ);
    this.smoothCamPos.set(
      desiredX,
      Math.max(groundAtCam + 2.2, ty + 2.1 + Math.sin(this.camPitch) * this.camDist),
      desiredZ
    );
    this.smoothLookAt.set(
      tx - Math.sin(this.tractor.heading) * 2.2,
      ty + 2.25 + this.tractor.boomPitch * 1.1,
      tz - Math.cos(this.tractor.heading) * 2.2
    );
    this.camera.position.copy(this.smoothCamPos);
    this.camera.lookAt(this.smoothLookAt);
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    const now = performance.now();
    const dt = Math.min(0.04, (now - this.lastTime) / 1000);
    this.lastTime = now;
    if (this.paused) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.elapsed += dt;

    const input = this.readInput();
    this.latestInput = input;

    // Fixed 60Hz Cannon-es physics steps (with preStep applying suspension, tire grip & load-moment forces every substep!)
    this.world.step(1 / 60, dt, 3);

    this.tractor.update(dt, this.elapsed, input, this.propMgr.props, this.realWorld.objects);
    this.propMgr.syncMeshes(dt);

    this.farm.update(dt, this.elapsed);
    this.realWorld.update(
      dt,
      this.elapsed,
      this.tractor.position,
      this.tractor.speed,
      this.tractor.getHoldWorldPos(),
      this.tractor.getTipSpeed()
    );
    this.destruction.update(
      dt,
      this.tractor.position,
      this.tractor.speed,
      this.tractor.getHoldWorldPos(),
      this.tractor.getTipSpeed()
    );
    this.particles.update(dt);

    if (this.farm.lakeWaterMesh) {
      this.farm.lakeWaterMesh.position.y = WATER_LEVEL + Math.sin(this.elapsed * 1.2) * 0.05;
    }

    if (this.started) {
      this.churchBellTimer -= dt;
      if (this.churchBellTimer <= 0) {
        this.churchBellTimer = 40 + Math.random() * 18;
        const dChurch = this.tractor.position.distanceTo(this.realWorld.churchPos);
        const atten = THREE.MathUtils.clamp(1 - dChurch / 360, 0.14, 1.0);
        this.audio.playChurchBell(atten);
      }
    }

    for (const c of this.clouds) {
      c.position.x += dt * 0.65;
      if (c.position.x > 1850) c.position.x = -1850;
    }

    if (this.started) {
      this.evaluateZonesAndContracts();
      this.updateRackAndPrompts();
      this.updateHUD(dt);
      this.audio.updateContinuous(
        this.tractor.speed / 12,
        input.throttle,
        this.tractor.hydroLoad,
        this.tractor.squeezePressure
      );
      // Determine current Bavarian area for ambient audio (lake waves, woodland birds, farm cowbells, village)
      const px = this.tractor.position.x;
      const pz = this.tractor.position.z;
      const shoreDist = px - getShorelineX(pz);
      const dFarm = Math.hypot(px - FARM_CENTER.x, pz - FARM_CENTER.z);
      const dVillage = Math.hypot(px - REAL_SPOTS.muensingChurch.x, pz - REAL_SPOTS.muensingChurch.z);
      const area: 'forest' | 'farm' | 'lake' | 'village' =
        shoreDist < 170
          ? 'lake'
          : dFarm < 220 || Math.hypot(px - 496, pz + 1189) < 160
            ? 'farm'
            : dVillage < 240
              ? 'village'
              : 'forest';
      this.audio.updateAmbience(dt, area);
    }

    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  };

  /**
   * Invisible test harness for fixed-viewpoint screenshots & repeatable physics telemetry checks.
   */
  public installTestHarness(): void {
    const viewpoints: Record<string, { x: number; z: number; heading: number; yawOff?: number }> = {
      '01_muensing_church': { x: 1336.0, z: 993.5, heading: -Math.PI / 2 + 0.14, yawOff: 0.12 },
      '02_zum_altwirt': { x: 1435.8, z: 1055.9, heading: -0.45, yawOff: 0.15 },
      '03_wimpasing_farm': { x: FARM_SPAWN.x, z: FARM_SPAWN.z, heading: FARM_SPAWN.heading, yawOff: 0.16 },
      '04_ammerland_schloss': { x: -999.3, z: 832.1, heading: Math.PI / 2 + 0.18, yawOff: 0.16 },
      '05_open_country': { x: 462.9, z: 965.0, heading: -1.12, yawOff: 0.14 },
      '06_weipertshausen': { x: 496.0, z: -1189.0, heading: 0.14, yawOff: 0.16 }
    };
    (window as unknown as Record<string, unknown>).__scorpionHarness = {
      goToViewpoint: (id: string) => {
        const vp = viewpoints[id];
        if (!vp) return false;
        this.tractor.teleportTo(vp.x, vp.z, vp.heading);
        this.camYawOffset = vp.yawOff ?? 0.18;
        this.snapCameraToTractor();
        return true;
      },
      setTime: (tod: TimeOfDay) => this.applyTimeOfDay(tod),
      selectContract: (id: ContractId) => this.selectContract(id, true),
      listContracts: () => BAVARIAN_CONTRACTS.map((c) => ({ id: c.id, title: c.title, village: c.village, payout: c.payoutEUR })),
      goToDemoSite: () => {
        this.setMode('freeplay');
        this.tractor.teleportTo(DEMO_SITE_CENTER.x, DEMO_SITE_CENTER.z + 25, 0);
        this.camYawOffset = 0.14;
        this.snapCameraToTractor();
      },
      resetDemoSite: () => this.destruction.resetDemolitionSite(),
      getDestructionStats: () => this.destruction.getBrokenCount(),
      openPause: (tab?: 'settings' | 'controls' | 'credits') => this.setPaused(true, tab),
      closePause: () => this.setPaused(false),
      setGear: (g: VaripowerGear) => {
        this.tractor.gear = g;
      },
      setBoom: (pitch: number, ext: number) => {
        this.tractor.boomPitch = pitch;
        this.tractor.boomExt = ext;
      },
      setInput: (inp: Partial<TractorInput> | null) => {
        this.syntheticInput = inp;
      },
      teleport: (x: number, z: number, heading: number) => {
        this.tractor.teleportTo(x, z, heading);
        this.snapCameraToTractor();
      },
      setCameraOrbit: (yawOff: number, pitch: number, dist: number) => {
        this.camYawOffset = yawOff;
        this.camPitch = pitch;
        this.camDist = dist;
        this.snapCameraToTractor();
      },
      loadHeavySilage: () => {
        // Pick up a wrapped silage bale + a second heavy bale/crate onto the forks/grabber for real load-moment testing
        this.tractor.freePlayMode = true;
        this.tractor.equipTool('grabber', false);
        const heavy = this.propMgr.props.filter((p) => p.kind === 'silage_wrapped' || p.kind === 'crate').slice(0, 2);
        this.tractor.heldProps = [];
        for (const p of heavy) {
          p.heldByTractor = true;
          this.tractor.heldProps.push(p);
        }
        return this.tractor.getCarriedMassKg();
      },
      releaseLoad: () => this.tractor.releaseAll(false),
      getTelemetry: () => ({
        speedKmh: +(Math.abs(this.tractor.speed) * 3.6).toFixed(1),
        speedMs: +this.tractor.speed.toFixed(2),
        gear: this.tractor.gear,
        massKg: this.tractor.chassisBody.mass,
        carriedKg: this.tractor.getCarriedMassKg(),
        loadMoment: +this.tractor.loadMoment.toFixed(2),
        wheels: this.tractor.wheelsOnGround,
        rollDeg: this.tractor.rollDeg,
        pitchDeg: this.tractor.pitchDeg,
        isTipped: this.tractor.isTipped,
        elevM: Math.round(getRealElevationMeters(this.tractor.position.x, this.tractor.position.z)),
        x: Math.round(this.tractor.position.x),
        z: Math.round(this.tractor.position.z)
      })
    };
  }
}

initDgm1Heightmap().then(() => {
  const game = new ScorpionGame();
  game.installTestHarness();
});
