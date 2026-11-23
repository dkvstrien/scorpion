import * as THREE from 'three';
import { getSurfaceType, getTerrainHeight, getTerrainNormal } from './terrain';

const MAX_MARKS = 360;

export class TireTrackSystem {
  private instMesh: THREE.InstancedMesh;
  private cursor = 0;
  private dummy = new THREE.Object3D();
  private normal = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private quat = new THREE.Quaternion();
  private yawQuat = new THREE.Quaternion();
  private color = new THREE.Color();

  constructor(scene: THREE.Scene) {
    // Textured chevron lug imprint quad
    const geo = new THREE.PlaneGeometry(0.56, 0.72);
    geo.rotateX(-Math.PI / 2);

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = 'rgba(28, 22, 16, 0.62)';
    // Agricultural chevron lugs!
    for (let y = 6; y < 58; y += 16) {
      ctx.beginPath();
      ctx.moveTo(4, y + 6);
      ctx.lineTo(30, y);
      ctx.lineTo(30, y + 8);
      ctx.lineTo(4, y + 14);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(60, y + 6);
      ctx.lineTo(34, y);
      ctx.lineTo(34, y + 8);
      ctx.lineTo(60, y + 14);
      ctx.closePath();
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);

    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2
    });

    this.instMesh = new THREE.InstancedMesh(geo, mat, MAX_MARKS);
    this.instMesh.frustumCulled = false;

    // Initialize hidden underground
    this.dummy.position.set(0, -100, 0);
    this.dummy.scale.setScalar(0.001);
    this.dummy.updateMatrix();
    for (let i = 0; i < MAX_MARKS; i++) {
      this.instMesh.setMatrixAt(i, this.dummy.matrix);
      this.instMesh.setColorAt(i, new THREE.Color(0x524231));
    }
    this.instMesh.instanceMatrix.needsUpdate = true;
    scene.add(this.instMesh);
  }

  public stampWheel(worldX: number, worldZ: number, heading: number): void {
    const surface = getSurfaceType(worldX, worldZ);
    if (surface === 'asphalt' || surface === 'cobble' || surface === 'water') return;

    const y = getTerrainHeight(worldX, worldZ) + 0.032;
    getTerrainNormal(worldX, worldZ, this.normal);

    this.quat.setFromUnitVectors(this.up, this.normal);
    this.yawQuat.setFromAxisAngle(this.up, heading);
    this.quat.multiply(this.yawQuat);

    this.dummy.position.set(worldX, y, worldZ);
    this.dummy.quaternion.copy(this.quat);
    this.dummy.scale.set(1, 1, 1);
    this.dummy.updateMatrix();

    if (surface === 'mud') {
      this.color.setHex(0x4b3825);
    } else if (surface === 'gravel') {
      this.color.setHex(0x6e6252);
    } else {
      this.color.setHex(0x3f572b);
    }

    this.instMesh.setMatrixAt(this.cursor, this.dummy.matrix);
    this.instMesh.setColorAt(this.cursor, this.color);
    this.instMesh.instanceMatrix.needsUpdate = true;
    if (this.instMesh.instanceColor) this.instMesh.instanceColor.needsUpdate = true;

    this.cursor = (this.cursor + 1) % MAX_MARKS;
  }
}
