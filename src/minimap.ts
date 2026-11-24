import * as THREE from 'three';
import {
  FARM_CENTER,
  getShorelineX,
  OSM_DATA,
  REAL_SPOTS,
  WORLD_MAX_X,
  WORLD_MAX_Z,
  WORLD_MIN_X,
  WORLD_MIN_Z
} from './terrain';

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
    this.bakeStaticOSMMap(null);

    // Load official Bavaria DOP20 aerial orthophoto right into the live satellite GPS mini-map!
    const img = new Image();
    img.onload = () => this.bakeStaticOSMMap(img);
    img.src = './map/minimap_dop.jpg';
  }

  private toPX(x: number): number {
    return ((x - this.minX) / (this.maxX - this.minX)) * this.canvas.width;
  }

  private toPZ(z: number): number {
    return ((z - this.minZ) / (this.maxZ - this.minZ)) * this.canvas.height;
  }

  private bakeStaticOSMMap(aerialImg: HTMLImageElement | null): void {
    const ctx = this.baseCanvas.getContext('2d')!;
    const w = this.baseCanvas.width;
    const h = this.baseCanvas.height;

    if (aerialImg) {
      ctx.drawImage(aerialImg, 0, 0, w, h);
      // Slight contrast vignette so road lines and GPS cursor pop crisply
      ctx.fillStyle = 'rgba(10, 18, 14, 0.16)';
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.fillStyle = '#3c5c30';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#1e5b7d';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let z = this.minZ; z <= this.maxZ; z += 40) {
        ctx.lineTo(this.toPX(getShorelineX(z) - 8), this.toPZ(z));
      }
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();
    }

    // Crisp translucent OSM road overlay aligned pixel-for-pixel over the Bavaria aerial photo!
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const r of OSM_DATA.roads) {
      const isMain = r.hw === 'secondary' || r.hw === 'tertiary';
      if (r.hw === 'track' || r.hw === 'service') continue;
      ctx.strokeStyle = isMain ? 'rgba(255, 250, 232, 0.85)' : 'rgba(232, 234, 228, 0.45)';
      ctx.lineWidth = isMain ? 1.8 : 0.9;
      ctx.beginPath();
      r.pts.forEach(([x, z], idx) => {
        if (idx === 0) ctx.moveTo(this.toPX(x), this.toPZ(z));
        else ctx.lineTo(this.toPX(x), this.toPZ(z));
      });
      ctx.stroke();
    }

    // Home Farmyard marker
    ctx.fillStyle = 'rgba(159, 211, 46, 0.55)';
    ctx.strokeStyle = '#131b0e';
    ctx.lineWidth = 1;
    const fx = this.toPX(FARM_CENTER.x);
    const fz = this.toPZ(FARM_CENTER.z);
    ctx.fillRect(fx - 4, fz - 4, 8, 8);
    ctx.strokeRect(fx - 4, fz - 4, 8, 8);

    // Crisp dark-haloed real Bavarian place labels (carefully spaced so zero labels overlap at 156x104!)
    const drawLabel = (
      text: string,
      x: number,
      z: number,
      color = '#f6faf0',
      ox = 0,
      oy = -4,
      align: CanvasTextAlign = 'center'
    ) => {
      const px = this.toPX(x) + ox;
      const pz = this.toPZ(z) + oy;
      ctx.font = 'bold 8px Nunito, sans-serif';
      ctx.textAlign = align;
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = 'rgba(10, 14, 12, 0.88)';
      ctx.strokeText(text, px, pz);
      ctx.fillStyle = color;
      ctx.fillText(text, px, pz);
    };

    drawLabel('Weipertshausen', REAL_SPOTS.weipertshausen.x, REAL_SPOTS.weipertshausen.z, '#f6faf0', 0, 11);
    drawLabel('Ried', REAL_SPOTS.ried.x, REAL_SPOTS.ried.z, '#f6faf0', 4, -5);
    drawLabel('Ammerland', REAL_SPOTS.schlossAmmerland.x, REAL_SPOTS.schlossAmmerland.z, '#9ee5ff', 2, -9, 'center');
    drawLabel('Wimpasing', REAL_SPOTS.wimpasing.x, REAL_SPOTS.wimpasing.z, '#f6faf0', 10, 11, 'center');
    drawLabel('Münsing', REAL_SPOTS.muensingAltwirt.x, REAL_SPOTS.muensingAltwirt.z, '#ffe785', -6, -6);
    drawLabel('SEE', -1600, -140, '#9ee5ff', 0, 0);
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
    ctx.lineWidth = 1.6;
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
