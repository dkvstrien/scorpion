import * as THREE from 'three';
import { getTerrainHeight, REAL_SPOTS } from './terrain';

export type ContractId = 'yard_shift' | 'sebald_delivery' | 'altwirt_climb' | 'kirchberg_timber';

export interface BavarianContract {
  id: ContractId;
  title: string;
  subtitle: string;
  payoutEUR: number;
  targetX: number;
  targetZ: number;
  targetRadius: number;
  requiredKind: 'crate' | 'log' | 'any_yard';
  requiredCount: number;
}

export interface CareerStats {
  bankEUR: number;
  completedIds: string[];
  totalKm: number;
  rollovers: number;
}

const SAVE_KEY = 'openworld_scorpion_741_career_v1';

export const BAVARIAN_CONTRACTS: BavarianContract[] = [
  {
    id: 'yard_shift',
    title: '1. Wimpasing Morning Yard Shift',
    subtitle: 'Organize the home farmyard — stack produce pallets on the trailer, dry hay in the barn, sealed silage in the clamp.',
    payoutEUR: 1200,
    targetX: REAL_SPOTS.farm.x,
    targetZ: REAL_SPOTS.farm.z,
    targetRadius: 30,
    requiredKind: 'any_yard',
    requiredCount: 1
  },
  {
    id: 'sebald_delivery',
    title: '2. Fischerei Sebald Lakeside Delivery',
    subtitle: 'Carry 1 intact Produce Pallet west through Wimpasing to Fischerei Sebald on Starnberger See without tipping!',
    payoutEUR: 1800,
    targetX: REAL_SPOTS.sebaldPier.x + 2,
    targetZ: REAL_SPOTS.sebaldPier.z,
    targetRadius: 14,
    requiredKind: 'crate',
    requiredCount: 1
  },
  {
    id: 'altwirt_climb',
    title: '3. Zum Altwirt Mountain Resupply',
    subtitle: 'Haul 1 Produce Pallet up the +68m Münsinger Straße climb to Gasthaus Zum Altwirt in Münsing!',
    payoutEUR: 2400,
    targetX: REAL_SPOTS.muensingAltwirt.x,
    targetZ: REAL_SPOTS.muensingAltwirt.z + 6,
    targetRadius: 15,
    requiredKind: 'crate',
    requiredCount: 1
  },
  {
    id: 'kirchberg_timber',
    title: '4. Am Kirchberg Timber Clear',
    subtitle: 'Bring 1 fallen pine log up to the churchyard yard by St. Mariä Himmelfahrt in Münsing.',
    payoutEUR: 1900,
    targetX: REAL_SPOTS.muensingChurch.x,
    targetZ: REAL_SPOTS.muensingChurch.z + 10,
    targetRadius: 16,
    requiredKind: 'log',
    requiredCount: 1
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
        totalKm: parsed.totalKm ?? 0,
        rollovers: parsed.rollovers ?? 0
      };
    }
  } catch {
    // ignore storage errors
  }
  return { bankEUR: 500, completedIds: [], totalKm: 0, rollovers: 0 };
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
