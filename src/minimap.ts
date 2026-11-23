import * as THREE from 'three';
import { FARM_CENTER, getShorelineX, OSM_DATA, REAL_SPOTS, WORLD_MAX_X, WORLD_MAX_Z, WORLD_MIN_X, WORLD_MIN_Z } from './terrain';

export interface MiniMapMarker {
  x: number;
  z: number;
  color: string;
  pulse?: boolean;
}

export class MuensingMiniMap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private baseCanvas: HTMLCanvasElement;

  private minX = WORLD_MIN_X;
  private maxX = WORLD_MAX_X;
  private minZ = WORLD_MIN_Z;
  private maxZ = WORLD_MAX_Z;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.baseCanvas = document.createElement('canvas');
    this.baseCanvas.width = canvas.width;
    this.baseCanvas.height = canvas.height;
    this.bakeStaticOSMMap();
  }

  private toPX(x: number): number {
    return ((x - this.minX) / (this.maxX - this.minX)) * this.canvas.width;
  }

  private toPZ(z: number): number {
    return ((z - this.minZ) / (this.maxZ - this.minZ)) * this.canvas.height;
  }

  /**
   * Pre-bakes all 202 real OpenStreetMap roads, Lake Starnberg shoreline, forests & Lübbach stream once!
   */
  private bakeStaticOSMMap(): void {
    const ctx = this.baseCanvas.getContext('2d')!;
    const w = this.baseCanvas.width;
    const h = this.baseCanvas.height;

    // Bavarian pasture base
    ctx.fillStyle = '#3c5c30';
    ctx.fillRect(0, 0, w, h);

    // Real OSM forest patches
    ctx.fillStyle = '#2c4724';
    for (const f of OSM_DATA.forests) {
      const rx = this.toPX(f.x - f.w * 0.5);
      const rz = this.toPZ(f.z - f.d * 0.5);
      const rw = Math.max(3, (f.w / (this.maxX - this.minX)) * w);
      const rh = Math.max(3, (f.d / (this.maxZ - this.minZ)) * h);
      ctx.fillRect(rx, rz, rw, rh);
    }

    // Real Starnberger See shoreline polygon on the west!
    ctx.fillStyle = '#1e5b7d';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let z = this.minZ; z <= this.maxZ; z += 20) {
      ctx.lineTo(this.toPX(getShorelineX(z) - 8), this.toPZ(z));
    }
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    // Lübbach stream
    ctx.strokeStyle = '#3891bd';
    ctx.lineWidth = 1.4;
    for (const s of OSM_DATA.streams) {
      ctx.beginPath();
      s.pts.forEach(([x, z], idx) => {
        if (idx === 0) ctx.moveTo(this.toPX(x), this.toPZ(z));
        else ctx.lineTo(this.toPX(x), this.toPZ(z));
      });
      ctx.stroke();
    }

    // All 202 real OpenStreetMap roads!
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const r of OSM_DATA.roads) {
      const isMain = r.hw === 'secondary' || r.hw === 'tertiary';
      const isTrack = r.hw === 'track' || r.hw === 'service';
      ctx.strokeStyle = isMain ? '#e2ded2' : isTrack ? 'rgba(176,164,142,0.55)' : 'rgba(210,208,200,0.8)';
      ctx.lineWidth = isMain ? 2.2 : isTrack ? 0.9 : 1.3;
      ctx.beginPath();
      r.pts.forEach(([x, z], idx) => {
        if (idx === 0) ctx.moveTo(this.toPX(x), this.toPZ(z));
        else ctx.lineTo(this.toPX(x), this.toPZ(z));
      });
      ctx.stroke();
    }

    // Home Farmyard square in Wimpasing
    ctx.fillStyle = 'rgba(159, 211, 46, 0.35)';
    ctx.fillRect(this.toPX(FARM_CENTER.x - 32), this.toPZ(FARM_CENTER.z - 30), 11, 11);

    // Crisp real hamlet labels matching the user's screenshot!
    ctx.font = 'bold 8px Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(244, 249, 240, 0.92)';
    ctx.fillText('Weipertshausen', this.toPX(REAL_SPOTS.weipertshausen.x), this.toPZ(REAL_SPOTS.weipertshausen.z) - 4);
    ctx.fillText('Ried', this.toPX(REAL_SPOTS.ried.x), this.toPZ(REAL_SPOTS.ried.z) - 4);
    ctx.fillText('Wimpasing', this.toPX(REAL_SPOTS.wimpasing.x), this.toPZ(REAL_SPOTS.wimpasing.z) + 10);
    ctx.fillText('Münsing', this.toPX(REAL_SPOTS.muensingAltwirt.x), this.toPZ(REAL_SPOTS.muensingAltwirt.z) - 6);
    ctx.fillStyle = '#9ee2ff';
    ctx.fillText('Ammerland', this.toPX(REAL_SPOTS.schlossAmmerland.x) + 18, this.toPZ(REAL_SPOTS.schlossAmmerland.z) + 14);
    ctx.fillText('SEE', this.toPX(-330), this.toPZ(-40));
  }

  public render(
    tractorPos: THREE.Vector3,
    tractorHeading: number,
    cars: { x: number; z: number }[],
    markers: MiniMapMarker[],
    elapsed: number
  ): void {
    const ctx = this.ctx;
    ctx.drawImage(this.baseCanvas, 0, 0);

    // Village cars
    ctx.fillStyle = '#ffffff';
    for (const c of cars) {
      ctx.fillRect(this.toPX(c.x) - 1.5, this.toPZ(c.z) - 1.5, 3, 3);
    }

    // Active GPS Contract / Waypoint Markers
    for (const m of markers) {
      const mx = this.toPX(m.x);
      const mz = this.toPZ(m.z);
      if (m.pulse) {
        const r = 4.5 + Math.sin(elapsed * 5) * 2.4;
        ctx.strokeStyle = m.color;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(mx, mz, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.arc(mx, mz, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // CLAAS Scorpion 741 live GPS arrow!
    const tx = this.toPX(tractorPos.x);
    const tz = this.toPZ(tractorPos.z);
    ctx.save();
    ctx.translate(tx, tz);
    ctx.rotate(-tractorHeading);
    ctx.fillStyle = '#a2d730';
    ctx.strokeStyle = '#121811';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -6.5);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
