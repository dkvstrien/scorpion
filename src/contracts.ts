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
  | 'weipert_silage'
  | 'ried_timber_depot'
  | 'edeka_autumn_market';

export type UnlockableTool = Exclude<AttachmentType, 'none'>;
export type UpgradeId = 'hydro_boost' | 'counterweight' | 'all_terrain' | 'regional_depots';

export interface WorkshopToolItem {
  tool: UnlockableTool;
  name: string;
  priceEUR: number;
  desc: string;
}

export interface WorkshopUpgradeItem {
  id: UpgradeId;
  name: string;
  priceEUR: number;
  desc: string;
}

export const STARTER_TOOLS: UnlockableTool[] = ['forks', 'spike'];

export const WORKSHOP_TOOLS: WorkshopToolItem[] = [
  { tool: 'forks', name: 'Pallet Forks', priceEUR: 0, desc: 'Standard forks for produce pallets and timber crates.' },
  { tool: 'spike', name: 'Bale Spike', priceEUR: 0, desc: 'Twin spears for dry round and square hay bales.' },
  { tool: 'grabber', name: 'Bale Grabber', priceEUR: 350, desc: 'Cushioned arms for wrapped silage bales without tearing plastic.' },
  { tool: 'grapple', name: 'Grapple Claw', priceEUR: 500, desc: 'Heavy hydraulic jaws for pine logs, barrels, and storm timber.' },
  { tool: 'bucket', name: 'Scoop Bucket', priceEUR: 600, desc: 'High-capacity scoop for pumpkins, loose produce, and market runs.' }
];

export const WORKSHOP_UPGRADES: WorkshopUpgradeItem[] = [
  {
    id: 'hydro_boost',
    name: 'Varipower Hydraulic Boost',
    priceEUR: 900,
    desc: '+25% faster boom lift, telescope extension, and carriage tilt.'
  },
  {
    id: 'counterweight',
    name: 'Rear Counterweight (+750 kg)',
    priceEUR: 1250,
    desc: 'Adds rear ballast for 22% stronger forward tip-stability margin.'
  },
  {
    id: 'all_terrain',
    name: 'All-Terrain Lug Tires & 160 hp Tune',
    priceEUR: 1550,
    desc: '+18% hill-climb torque, stronger cornering grip, and 45 km/h Hare gear.'
  },
  {
    id: 'regional_depots',
    name: 'Ried & EDEKA Depot Pass',
    priceEUR: 800,
    desc: 'Unlocks Career fast travel to Ried Co-op & EDEKA Market and +25% direct-sale payouts.'
  }
];

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
  requiredKind: 'any_yard' | 'crate' | 'log' | 'silage_wrapped' | 'hay' | 'pumpkin' | 'yard_silage' | 'yard_crates';
  requiredCount: number;
  requireIntact?: boolean;
  /** Optional fresh cargo spawn point near the job pickup so every job is cleanly repeatable! */
  pickupSpawn?: { x: number; z: number; kind: PropKind; count: number };
}

export interface EarningsEntry {
  label: string;
  amountEUR: number;
}

export interface VillageDailyOrder {
  depot: 'ried' | 'edeka';
  depotName: string;
  title: string;
  itemLabel: string;
  kinds: PropKind[];
  needed: number;
  bonusEUR: number;
}

export const RIED_DAILY_ORDERS: VillageDailyOrder[] = [
  {
    depot: 'ried',
    depotName: 'Ried Co-op',
    title: 'Dry Meadow Hay Delivery',
    itemLabel: 'Dry Hay Bales',
    kinds: ['hay_round', 'hay_square'],
    needed: 2,
    bonusEUR: 680
  },
  {
    depot: 'ried',
    depotName: 'Ried Co-op',
    title: 'Sealed Silage Co-op Order',
    itemLabel: 'Sealed Silage Bales',
    kinds: ['silage_wrapped'],
    needed: 2,
    bonusEUR: 820
  },
  {
    depot: 'ried',
    depotName: 'Ried Co-op',
    title: 'Timber Yard Sawlogs',
    itemLabel: 'Pine Logs',
    kinds: ['log'],
    needed: 2,
    bonusEUR: 760
  }
];

export const EDEKA_DAILY_ORDERS: VillageDailyOrder[] = [
  {
    depot: 'edeka',
    depotName: 'EDEKA Market',
    title: 'Fresh Produce Pallet Restock',
    itemLabel: 'Produce Pallets',
    kinds: ['crate'],
    needed: 2,
    bonusEUR: 840
  },
  {
    depot: 'edeka',
    depotName: 'EDEKA Market',
    title: 'Bavarian Harvest Pumpkins',
    itemLabel: 'Intact Pumpkins',
    kinds: ['pumpkin'],
    needed: 3,
    bonusEUR: 640
  },
  {
    depot: 'edeka',
    depotName: 'EDEKA Market',
    title: 'Express Market Pallet Run',
    itemLabel: 'Produce Pallet',
    kinds: ['crate'],
    needed: 1,
    bonusEUR: 490
  }
];

export interface CareerGoal {
  id: string;
  title: string;
  done: (c: CareerStats) => boolean;
  progressText: (c: CareerStats) => string;
}

export const CAREER_GOALS: CareerGoal[] = [
  {
    id: 'first_job',
    title: 'Complete your first Bavarian contract',
    done: (c) => c.completedIds.length >= 1,
    progressText: (c) => `${Math.min(1, c.completedIds.length)}/1`
  },
  {
    id: 'daily_supplier',
    title: 'Fill 2 rotating village daily orders (Ried or EDEKA)',
    done: (c) => c.dailyOrdersCompleted >= 2,
    progressText: (c) => `${Math.min(2, c.dailyOrdersCompleted)}/2`
  },
  {
    id: 'full_rack',
    title: 'Unlock all 5 Quick-Hitch attachments',
    done: (c) => c.unlockedTools.length >= 5,
    progressText: (c) => `${c.unlockedTools.length}/5`
  },
  {
    id: 'machine_upgrades',
    title: 'Install 2 Scorpion 741 Workshop upgrades',
    done: (c) => c.unlockedUpgrades.length >= 2,
    progressText: (c) => `${Math.min(2, c.unlockedUpgrades.length)}/2`
  },
  {
    id: 'master_contractor',
    title: 'Earn €8,000 lifetime contracting revenue',
    done: (c) => c.totalEarnedEUR >= 8000,
    progressText: (c) => `€${Math.min(8000, c.totalEarnedEUR).toLocaleString()}/€8,000`
  }
];

export interface CareerStats {
  bankEUR: number;
  totalEarnedEUR: number;
  completedIds: string[];
  bestStars: Record<string, number>;
  totalKm: number;
  rollovers: number;
  unlockedTools: UnlockableTool[];
  unlockedUpgrades: UpgradeId[];
  directSalesCount: number;
  dailyOrdersCompleted: number;
  riedOrderIdx: number;
  riedOrderProgress: number;
  edekaOrderIdx: number;
  edekaOrderProgress: number;
  earningsLog: EarningsEntry[];
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
  },
  {
    id: 'ried_timber_depot',
    title: '11. Ried Co-op Timber & Feed Depot',
    shortTitle: '11. Ried Co-op Logs',
    village: 'Lagerhaus Ried',
    subtitle: 'Haul 2 pine logs from Graf-Pocci-Weg into the Lagerhaus Ried Co-op timber yard.',
    recommendedTool: 'grapple',
    payoutEUR: 2100,
    parSeconds: 210,
    targetX: -262,
    targetZ: 403,
    targetRadius: 15,
    startSpot: { x: -245.5, z: 380.0, heading: 0.45 },
    requiredKind: 'log',
    requiredCount: 2,
    pickupSpawn: { x: -236, z: 365, kind: 'log', count: 2 }
  },
  {
    id: 'edeka_autumn_market',
    title: '12. EDEKA Autumn Pumpkin Market',
    shortTitle: '12. EDEKA Market',
    village: 'EDEKA Bauernmarkt',
    subtitle: 'Scoop 3 fresh harvest pumpkins from the east Münsing garden and deliver them to the EDEKA Farmers Market stall.',
    recommendedTool: 'bucket',
    payoutEUR: 2050,
    parSeconds: 200,
    targetX: 1582.5,
    targetZ: 906.5,
    targetRadius: 14,
    startSpot: { x: 1574.0, z: 919.5, heading: -0.78 },
    requiredKind: 'pumpkin',
    requiredCount: 3,
    requireIntact: true,
    pickupSpawn: { x: 1570.2, z: 906.2, kind: 'pumpkin', count: 4 }
  }
];

export function defaultCareerStats(): CareerStats {
  return {
    bankEUR: 500,
    totalEarnedEUR: 0,
    completedIds: [],
    bestStars: {},
    totalKm: 0,
    rollovers: 0,
    unlockedTools: [...STARTER_TOOLS],
    unlockedUpgrades: [],
    directSalesCount: 0,
    dailyOrdersCompleted: 0,
    riedOrderIdx: 0,
    riedOrderProgress: 0,
    edekaOrderIdx: 0,
    edekaOrderProgress: 0,
    earningsLog: []
  };
}

export function loadCareer(): CareerStats {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CareerStats>;
      const tools = Array.isArray(parsed.unlockedTools) ? parsed.unlockedTools : [...STARTER_TOOLS];
      for (const t of STARTER_TOOLS) {
        if (!tools.includes(t)) tools.push(t);
      }
      return {
        bankEUR: parsed.bankEUR ?? 500,
        totalEarnedEUR: parsed.totalEarnedEUR ?? Math.max(0, (parsed.bankEUR ?? 500) - 500),
        completedIds: Array.isArray(parsed.completedIds) ? parsed.completedIds : [],
        bestStars: parsed.bestStars && typeof parsed.bestStars === 'object' ? parsed.bestStars : {},
        totalKm: parsed.totalKm ?? 0,
        rollovers: parsed.rollovers ?? 0,
        unlockedTools: tools,
        unlockedUpgrades: Array.isArray(parsed.unlockedUpgrades) ? parsed.unlockedUpgrades : [],
        directSalesCount: parsed.directSalesCount ?? 0,
        dailyOrdersCompleted: parsed.dailyOrdersCompleted ?? 0,
        riedOrderIdx: parsed.riedOrderIdx ?? 0,
        riedOrderProgress: parsed.riedOrderProgress ?? 0,
        edekaOrderIdx: parsed.edekaOrderIdx ?? 0,
        edekaOrderProgress: parsed.edekaOrderProgress ?? 0,
        earningsLog: Array.isArray(parsed.earningsLog) ? parsed.earningsLog.slice(0, 12) : []
      };
    }
  } catch {
    // ignore storage errors
  }
  return defaultCareerStats();
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
