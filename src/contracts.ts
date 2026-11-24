import * as THREE from 'three';
import { FARM_YARD_CENTER, getTerrainHeight, REAL_SPOTS } from './terrain';
import { PropKind } from './props';
import { AttachmentType } from './scorpionModel';

export type ContractId =
  | 'yard_shift'
  | 'silage_clamp_6'
  | 'flatbed_stack_4'
  | 'sebald_delivery'
  | 'schloss_firewood'
  | 'ried_bale_harvest'
  | 'altwirt_climb'
  | 'kirchberg_timber'
  | 'edeka_dock'
  | 'weipert_silage';

export interface BavarianContract {
  id: ContractId;
  title: string;
  shortTitle: string;
  village: string;
  subtitle: string;
  recommendedTool: Exclude<AttachmentType, 'none'>;
  payoutEUR: number;
  parSeconds: number;
  targetX: number;
  targetZ: number;
  targetRadius: number;
  startSpot: { x: number; z: number; heading: number };
  requiredKind: 'any_yard' | 'crate' | 'log' | 'silage_wrapped' | 'hay' | 'yard_silage' | 'yard_crates';
  requiredCount: number;
  requireIntact?: boolean;
  /** Optional fresh cargo spawn point near the job pickup so every job is cleanly repeatable! */
  pickupSpawn?: { x: number; z: number; kind: PropKind; count: number };
}

export interface CareerStats {
  bankEUR: number;
  completedIds: string[];
  bestStars: Record<string, number>;
  totalKm: number;
  rollovers: number;
}

const SAVE_KEY = 'openworld_scorpion_741_career_v1';

export const BAVARIAN_CONTRACTS: BavarianContract[] = [
  {
    id: 'yard_shift',
    title: '1. Home Farm Morning Yard Shift',
    shortTitle: '1. Yard Shift',
    village: 'Home Farm',
    subtitle: 'Organize the home farmyard — stack produce pallets on the trailer, dry hay in the barn, sealed silage in the clamp.',
    recommendedTool: 'forks',
    payoutEUR: 1200,
    parSeconds: 260,
    targetX: FARM_YARD_CENTER.x,
    targetZ: FARM_YARD_CENTER.z,
    targetRadius: 28,
    startSpot: { x: FARM_YARD_CENTER.x + 4, z: FARM_YARD_CENTER.z - 4, heading: -Math.PI / 2 },
    requiredKind: 'any_yard',
    requiredCount: 1
  },
  {
    id: 'silage_clamp_6',
    title: '2. Silage Precision: 6 Sealed Bales',
    shortTitle: '2. Silage Clamp',
    village: 'Home Farm Clamp',
    subtitle: 'Place 6 intact wrapped silage bales inside the concrete silage clamp using the Bale Grabber — zero torn plastic!',
    recommendedTool: 'grabber',
    payoutEUR: 1600,
    parSeconds: 210,
    targetX: FARM_YARD_CENTER.x - 6.5,
    targetZ: FARM_YARD_CENTER.z + 16.5,
    targetRadius: 11,
    startSpot: { x: FARM_YARD_CENTER.x - 2, z: FARM_YARD_CENTER.z - 4, heading: Math.PI },
    requiredKind: 'yard_silage',
    requiredCount: 6,
    requireIntact: true,
    pickupSpawn: { x: FARM_YARD_CENTER.x - 6, z: FARM_YARD_CENTER.z + 4, kind: 'silage_wrapped', count: 2 }
  },
  {
    id: 'flatbed_stack_4',
    title: '3. Flatbed Weight-Limit Load',
    shortTitle: '3. Flatbed Load',
    village: 'Home Farm Trailer',
    subtitle: 'Stack 4 intact produce pallets neatly onto the flatbed trailer deck without tipping or damaging cargo.',
    recommendedTool: 'forks',
    payoutEUR: 1500,
    parSeconds: 180,
    targetX: FARM_YARD_CENTER.x + 17.5,
    targetZ: FARM_YARD_CENTER.z + 6.5,
    targetRadius: 10,
    startSpot: { x: FARM_YARD_CENTER.x + 2, z: FARM_YARD_CENTER.z - 3, heading: -1.1 },
    requiredKind: 'yard_crates',
    requiredCount: 4,
    requireIntact: true
  },
  {
    id: 'sebald_delivery',
    title: '4. Fischerei Sebald Lakeside Delivery',
    shortTitle: '4. Sebald Delivery',
    village: 'Ammerland / Lake',
    subtitle: 'Haul 1 intact Produce Pallet west through Wimpasing to Fischerei Sebald pier on Starnberger See.',
    recommendedTool: 'forks',
    payoutEUR: 1800,
    parSeconds: 220,
    targetX: REAL_SPOTS.sebaldPier.x + 4,
    targetZ: REAL_SPOTS.sebaldPier.z,
    targetRadius: 15,
    startSpot: { x: FARM_YARD_CENTER.x + 4, z: FARM_YARD_CENTER.z - 4, heading: -Math.PI / 2 },
    requiredKind: 'crate',
    requiredCount: 1,
    requireIntact: true
  },
  {
    id: 'schloss_firewood',
    title: '5. Schloss Ammerland Park Firewood',
    shortTitle: '5. Schloss Logs',
    village: 'Schloss Ammerland',
    subtitle: 'Carry 2 pine logs down to the lakeside grounds beside Schloss Ammerland using the Grapple Claw.',
    recommendedTool: 'grapple',
    payoutEUR: 1750,
    parSeconds: 240,
    targetX: REAL_SPOTS.schlossAmmerland.x + 18,
    targetZ: REAL_SPOTS.schlossAmmerland.z + 6,
    targetRadius: 16,
    startSpot: { x: -996.0, z: 874.0, heading: 0.42 },
    requiredKind: 'log',
    requiredCount: 2,
    pickupSpawn: { x: REAL_SPOTS.schlossAmmerland.x + 45, z: REAL_SPOTS.schlossAmmerland.z + 45, kind: 'log', count: 2 }
  },
  {
    id: 'ried_bale_harvest',
    title: '6. Ried Meadow Hay Harvest',
    shortTitle: '6. Ried Hay',
    village: 'Ried',
    subtitle: 'Collect 2 dry golden hay bales from the roadside pasture and deliver them to the Ried hamlet barn.',
    recommendedTool: 'spike',
    payoutEUR: 1900,
    parSeconds: 210,
    targetX: REAL_SPOTS.ried.x,
    targetZ: REAL_SPOTS.ried.z,
    targetRadius: 16,
    startSpot: { x: REAL_SPOTS.ried.x + 28, z: REAL_SPOTS.ried.z + 68, heading: 0.15 },
    requiredKind: 'hay',
    requiredCount: 2,
    pickupSpawn: { x: REAL_SPOTS.ried.x + 34, z: REAL_SPOTS.ried.z + 52, kind: 'hay_round', count: 2 }
  },
  {
    id: 'altwirt_climb',
    title: '7. Zum Altwirt Mountain Resupply',
    shortTitle: '7. Altwirt Climb',
    village: 'Münsing Center',
    subtitle: 'Haul 1 intact Produce Pallet up the +68 m Münsinger Straße climb to Gasthaus Zum Altwirt.',
    recommendedTool: 'forks',
    payoutEUR: 2400,
    parSeconds: 260,
    targetX: REAL_SPOTS.muensingAltwirt.x,
    targetZ: REAL_SPOTS.muensingAltwirt.z + 6,
    targetRadius: 15,
    startSpot: { x: FARM_YARD_CENTER.x + 4, z: FARM_YARD_CENTER.z - 4, heading: -Math.PI / 2 },
    requiredKind: 'crate',
    requiredCount: 1,
    requireIntact: true
  },
  {
    id: 'kirchberg_timber',
    title: '8. Am Kirchberg Storm Timber Clear',
    shortTitle: '8. Church Timber',
    village: 'Münsing Church',
    subtitle: 'Clear 2 storm-fallen pine logs and deliver them to the churchyard square at St. Mariä Himmelfahrt.',
    recommendedTool: 'grapple',
    payoutEUR: 1950,
    parSeconds: 220,
    targetX: REAL_SPOTS.muensingChurch.x,
    targetZ: REAL_SPOTS.muensingChurch.z + 10,
    targetRadius: 16,
    startSpot: { x: 1280, z: 998, heading: -1.6 },
    requiredKind: 'log',
    requiredCount: 2,
    pickupSpawn: { x: 1295, z: 992, kind: 'log', count: 2 }
  },
  {
    id: 'edeka_dock',
    title: '9. EDEKA Graf Loading Dock',
    shortTitle: '9. EDEKA Dock',
    village: 'East Münsing',
    subtitle: 'Deliver 2 intact Produce Pallets cleanly to the EDEKA Graf grocery loading yard in east Münsing.',
    recommendedTool: 'forks',
    payoutEUR: 2200,
    parSeconds: 250,
    targetX: REAL_SPOTS.edeka.x,
    targetZ: REAL_SPOTS.edeka.z + 6,
    targetRadius: 16,
    startSpot: { x: REAL_SPOTS.edeka.x - 54, z: REAL_SPOTS.edeka.z + 28, heading: -1.35 },
    requiredKind: 'crate',
    requiredCount: 2,
    requireIntact: true,
    pickupSpawn: { x: REAL_SPOTS.edeka.x - 42, z: REAL_SPOTS.edeka.z + 24, kind: 'crate', count: 2 }
  },
  {
    id: 'weipert_silage',
    title: '10. Weipertshausen Northern Farm Run',
    shortTitle: '10. Weipertshausen',
    village: 'Weipertshausen',
    subtitle: 'Deliver 2 sealed wrapped silage bales north along Weipertshausener Straße to the Weipertshausen farmyard.',
    recommendedTool: 'grabber',
    payoutEUR: 2600,
    parSeconds: 270,
    targetX: 492,
    targetZ: -1198,
    targetRadius: 17,
    startSpot: { x: 494, z: -1112, heading: 0.08 },
    requiredKind: 'silage_wrapped',
    requiredCount: 2,
    requireIntact: true,
    pickupSpawn: { x: 492, z: -1128, kind: 'silage_wrapped', count: 2 }
  }
];

export function loadCareer(): CareerStats {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CareerStats>;
      return {
        bankEUR: parsed.bankEUR ?? 500,
        completedIds: Array.isArray(parsed.completedIds) ? parsed.completedIds : [],
        bestStars: parsed.bestStars && typeof parsed.bestStars === 'object' ? parsed.bestStars : {},
        totalKm: parsed.totalKm ?? 0,
        rollovers: parsed.rollovers ?? 0
      };
    }
  } catch {
    // ignore storage errors
  }
  return { bankEUR: 500, completedIds: [], bestStars: {}, totalKm: 0, rollovers: 0 };
}

export function saveCareer(stats: CareerStats): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(stats));
  } catch {
    // ignore storage errors
  }
}

export function createWaypointBeacon(scene: THREE.Scene): THREE.Group {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(4.2, 5.0, 32),
    new THREE.MeshBasicMaterial({ color: 0x9fd32e, side: THREE.DoubleSide, transparent: true, opacity: 0.72 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.2;
  g.add(ring);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.9, 34, 14, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x9fd32e,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  beam.position.y = 17;
  g.add(beam);

  g.visible = false;
  scene.add(g);
  return g;
}

export function positionWaypointBeacon(beacon: THREE.Group, x: number, z: number, visible: boolean): void {
  beacon.visible = visible;
  if (visible) {
    beacon.position.set(x, getTerrainHeight(x, z), z);
  }
}

export function createGuideArrow(scene: THREE.Scene): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x9fd32e,
    emissive: 0x6ba612,
    emissiveIntensity: 0.7,
    roughness: 0.3
  });
  // Arrow shaft + pointed arrowhead oriented along -Z (forward)
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.95), mat);
  shaft.position.set(0, 0, 0.35);
  g.add(shaft);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.85, 4), mat);
  head.rotation.x = -Math.PI / 2;
  head.rotation.y = Math.PI / 4;
  head.position.set(0, 0, -0.45);
  g.add(head);
  g.userData.arrowMat = mat;
  g.visible = false;
  scene.add(g);
  return g;
}
