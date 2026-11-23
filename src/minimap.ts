import * as THREE from 'three';

export interface MiniMapMarker {
  x: number;
  z: number;
  color: string;
  label?: string;
  pulse?: boolean;
}

export class MuensingMiniMap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Map covers x: -135..85, z: -115..45
  private minX = -132;
  private maxX = 82;
  private minZ = -112;
  private maxZ = 42;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  private toPX(x: number): number {
    return ((x - this.minX) / (this.maxX - this.minX)) * this.canvas.width;
  }

  private toPZ(z: number): number {
    return ((z - this.minZ) / (this.maxZ - this.minZ)) * this.canvas.height;
  }

  public render(
    tractorPos: THREE.Vector3,
    tractorHeading: number,
    cars: { x: number; z: number }[],
    markers: MiniMapMarker[],
    elapsed: number
  ): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Bavarian pasture background
    ctx.fillStyle = '#486b35';
    ctx.fillRect(0, 0, w, h);

    // Starnberger See (Lake Starnberg) on the west!
    const shoreX = this.toPX(-100);
    ctx.fillStyle = '#256c8f';
    ctx.fillRect(0, 0, shoreX, h);
    ctx.strokeStyle = '#9db7a8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(shoreX, 0);
    ctx.lineTo(shoreX, h);
    ctx.stroke();

    // Farmyard gravel courtyard
    ctx.fillStyle = '#8b8170';
    ctx.fillRect(this.toPX(-31), this.toPZ(-30), this.toPX(31) - this.toPX(-31), this.toPZ(30) - this.toPZ(-30));

    // Duck pond
    ctx.fillStyle = '#3b86a8';
    ctx.beginPath();
    ctx.arc(this.toPX(12), this.toPZ(23), 4.5, 0, Math.PI * 2);
    ctx.fill();

    // Kirchberg hill contour
    ctx.fillStyle = 'rgba(130, 175, 92, 0.35)';
    ctx.beginPath();
    ctx.ellipse(this.toPX(-21), this.toPZ(-67.5), 14, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    // Münsing Roads!
    ctx.strokeStyle = '#2f343a';
    ctx.lineCap = 'round';

    // Hauptstraße + Ammerlander Straße down to Lake Starnberg pier!
    ctx.lineWidth = 7.5;
    ctx.beginPath();
    ctx.moveTo(this.toPX(-106), this.toPZ(-40));
    ctx.lineTo(this.toPX(80), this.toPZ(-40));
    ctx.stroke();

    // Gate drive
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    ctx.moveTo(this.toPX(-1.5), this.toPZ(-28));
    ctx.lineTo(this.toPX(-1.5), this.toPZ(-40));
    ctx.stroke();

    // Weipertshausener Straße
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    ctx.moveTo(this.toPX(2), this.toPZ(-40));
    ctx.lineTo(this.toPX(2), this.toPZ(-104));
    ctx.stroke();

    // Am Kirchberg loop & Bachstraße
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.moveTo(this.toPX(-38), this.toPZ(-40));
    ctx.lineTo(this.toPX(-38), this.toPZ(-84));
    ctx.lineTo(this.toPX(38), this.toPZ(-84));
    ctx.lineTo(this.toPX(38), this.toPZ(-40));
    ctx.stroke();

    // Wooden Pier (Steg) at Starnberger See
    ctx.strokeStyle = '#a87d4b';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(this.toPX(-101), this.toPZ(-40));
    ctx.lineTo(this.toPX(-120), this.toPZ(-40));
    ctx.stroke();

    // Landmark Dots & Tiny Labels
    const landmarks: [number, number, string, string][] = [
      [-21, -67.5, '⛪', '#f7f3e3'],
      [22, -55, '🍺', '#ffe299'],
      [60, -56, '🛒', '#5cc2ff'],
      [-25, -3, '🔧', '#a2d730']
    ];
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [lx, lz, icon] of landmarks) {
      ctx.fillText(icon, this.toPX(lx), this.toPZ(lz));
    }

    // Crisp micro labels
    ctx.font = 'bold 8px Nunito, sans-serif';
    ctx.fillStyle = 'rgba(235, 248, 255, 0.88)';
    ctx.fillText('SEE', this.toPX(-117), this.toPZ(-75));
    ctx.fillText('MÜNSING', this.toPX(2), this.toPZ(-96));
    ctx.fillText('FARM', this.toPX(0), this.toPZ(15));

    // Village Cars
    ctx.fillStyle = '#e8ecf0';
    for (const c of cars) {
      ctx.fillRect(this.toPX(c.x) - 1.5, this.toPZ(c.z) - 1.5, 3, 3);
    }

    // Active Job Markers
    for (const m of markers) {
      const mx = this.toPX(m.x);
      const mz = this.toPZ(m.z);
      if (m.pulse) {
        const r = 4.5 + Math.sin(elapsed * 5) * 2.2;
        ctx.strokeStyle = m.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(mx, mz, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.arc(mx, mz, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // CLAAS Scorpion 741 live arrow!
    const tx = this.toPX(tractorPos.x);
    const tz = this.toPZ(tractorPos.z);
    ctx.save();
    ctx.translate(tx, tz);
    // heading = 0 faces -Z (up on canvas!)
    ctx.rotate(-tractorHeading);
    ctx.fillStyle = '#a2d730';
    ctx.strokeStyle = '#151b14';
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
