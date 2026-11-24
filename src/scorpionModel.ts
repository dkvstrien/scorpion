import * as THREE from 'three';

export type AttachmentType = 'none' | 'forks' | 'spike' | 'grabber' | 'grapple' | 'bucket';

export interface WheelPivotRef {
  pivot: THREE.Group;
  spin: THREE.Group;
  isFront: boolean;
  baseY: number;
  localX: number;
  localZ: number;
  compression: number;
}

export interface ScorpionModelRefs {
  chassisGroup: THREE.Group;
  wheelPivots: WheelPivotRef[];
  steeringWheelMesh: THREE.Group;
  driverHead: THREE.Mesh;
  driverLeftArm: THREE.Mesh;
  aPillarLeds: THREE.MeshStandardMaterial[];
  workSpotLights: THREE.SpotLight[];
  ledLensMat: THREE.MeshStandardMaterial;
  beaconLight: THREE.Mesh;
  boomPivot: THREE.Group;
  innerBoom: THREE.Group;
  headPivot: THREE.Group;
  attachmentMount: THREE.Group;
  liftCylOuter: THREE.Mesh;
  liftCylRod: THREE.Mesh;
  boomBaseLocal: THREE.Vector3;
  cylAnchorLocal: THREE.Vector3;
  exhaustTipLocal: THREE.Vector3;
}

/**
 * Crisp 2022 CLAAS Scorpion 741 Varipower side hood decal (green base + dark slate stripe + red/white CLAAS & 741 SCORPION VARIPOWER).
 */
function createHoodDecalTexture(flipped = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 192;
  const ctx = c.getContext('2d')!;

  // CLAAS Seed Green base
  ctx.fillStyle = '#9fd32e';
  ctx.fillRect(0, 0, 512, 192);

  if (flipped) {
    ctx.translate(512, 0);
    ctx.scale(-1, 1);
  }

  // Signature dark slate diagonal swoosh & cooling vent panel
  ctx.fillStyle = '#2d3337';
  ctx.beginPath();
  ctx.moveTo(0, 128);
  ctx.lineTo(512, 102);
  ctx.lineTo(512, 192);
  ctx.lineTo(0, 192);
  ctx.closePath();
  ctx.fill();

  // Thin CLAAS red accent line
  ctx.fillStyle = '#d9381e';
  ctx.fillRect(16, 98, 480, 6);

  // Dark cooling louvres at rear of hood
  ctx.fillStyle = '#1b1f22';
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(30 + i * 16, 134, 9, 44);
  }

  // CLAAS brand badge + 741 SCORPION + VARIPOWER
  ctx.fillStyle = '#d9381e';
  ctx.font = '900 32px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('CLAAS', 28, 46);

  ctx.fillStyle = '#1d2226';
  ctx.font = '900 44px sans-serif';
  ctx.fillText('SCORPION', 155, 50);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 44px sans-serif';
  ctx.fillText('741', 402, 50);

  ctx.fillStyle = '#eef4e8';
  ctx.font = '800 22px sans-serif';
  ctx.fillText('VARIPOWER', 210, 158);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Boom side decal ("SCORPION 741" in crisp dark slate & white on CLAAS green boom).
 */
function createBoomDecalTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#9fd32e';
  ctx.fillRect(0, 0, 512, 128);

  ctx.fillStyle = '#262c30';
  ctx.fillRect(0, 96, 512, 32);

  ctx.fillStyle = '#d9381e';
  ctx.fillRect(0, 90, 512, 6);

  ctx.fillStyle = '#1b2024';
  ctx.font = '900 46px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SCORPION  741', 256, 48);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Rear counterweight CLAAS badge & German Bavarian agricultural plate (TÖL - SC 741).
 */
function createRearCounterweightTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#2e3438';
  ctx.fillRect(0, 0, 512, 256);

  // Subtle recessed panel line
  ctx.strokeStyle = '#1d2225';
  ctx.lineWidth = 6;
  ctx.strokeRect(18, 18, 476, 220);

  // Bold white CLAAS lettering across counterweight
  ctx.fillStyle = '#f2f5f0';
  ctx.font = '900 66px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CLAAS', 256, 78);

  // Red stripe under CLAAS
  ctx.fillStyle = '#d9381e';
  ctx.fillRect(110, 120, 292, 8);

  // German green-lettered agricultural license plate (Bad Tölz-Wolfratshausen / Münsing: TÖL SC 741)
  ctx.fillStyle = '#f5f6f2';
  ctx.fillRect(166, 152, 180, 44);
  ctx.fillStyle = '#1a4ea8';
  ctx.fillRect(166, 152, 22, 44);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('D', 177, 182);
  ctx.strokeStyle = '#1d6b2f';
  ctx.lineWidth = 3;
  ctx.strokeRect(166, 152, 180, 44);
  ctx.fillStyle = '#1d6b2f';
  ctx.font = '900 22px monospace';
  ctx.fillText('TÖL SC741', 266, 175);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Cab lower door panel with CLAAS badge & dark trim.
 */
function createCabDoorPanelTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 192;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#2d3337';
  ctx.fillRect(0, 0, 256, 192);

  // Green CLAAS accent stripe along cab lower sill
  ctx.fillStyle = '#9fd32e';
  ctx.fillRect(0, 18, 256, 48);
  ctx.fillStyle = '#d9381e';
  ctx.fillRect(0, 66, 256, 7);

  ctx.fillStyle = '#1d2226';
  ctx.font = '900 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CLAAS 741', 128, 43);

  // Lower dark steel panel + step kickplate
  ctx.fillStyle = '#3a4146';
  ctx.fillRect(18, 92, 220, 76);
  ctx.strokeStyle = '#1b1f22';
  ctx.lineWidth = 4;
  ctx.strokeRect(18, 92, 220, 76);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Builds an accurate 2022 CLAAS Scorpion 741 Varipower (Platform 2 / Type K33) visual model.
 * Keeps all physics attachment anchors & wheel coordinates exact so Priority B handling is 100% preserved!
 */
export function buildScorpion741Model(): ScorpionModelRefs {
  const chassisGroup = new THREE.Group();
  const wheelPivots: WheelPivotRef[] = [];
  const aPillarLeds: THREE.MeshStandardMaterial[] = [];
  const workSpotLights: THREE.SpotLight[] = [];

  // Authentic CLAAS Scorpion 741 PBR material palette
  const claasGreen = new THREE.MeshStandardMaterial({ color: 0x9fd32e, roughness: 0.34, metalness: 0.14 });
  const darkSlate = new THREE.MeshStandardMaterial({ color: 0x2f3539, roughness: 0.56, metalness: 0.38 });
  const midSlate = new THREE.MeshStandardMaterial({ color: 0x4d555c, roughness: 0.45, metalness: 0.5 });
  const wheelOrange = new THREE.MeshStandardMaterial({ color: 0xe0441f, roughness: 0.34, metalness: 0.22 });
  const tireRubber = new THREE.MeshStandardMaterial({ color: 0x1e2124, roughness: 0.94 });
  const roofWhite = new THREE.MeshStandardMaterial({ color: 0xf2f4ef, roughness: 0.4 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xdce4ea, roughness: 0.14, metalness: 0.92 });
  const blackRubber = new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.88 });
  const redAccent = new THREE.MeshStandardMaterial({ color: 0xd9341c, roughness: 0.38, metalness: 0.2 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x1a2e38,
    roughness: 0.08,
    metalness: 0.46,
    transparent: true,
    opacity: 0.42
  });

  const hoodTexR = createHoodDecalTexture(false);
  const boomTex = createBoomDecalTexture();
  const rearTex = createRearCounterweightTexture();
  const doorTex = createCabDoorPanelTexture();

  // === 1. STEPPED DARK-GREY STEEL CHASSIS & REAR COUNTERWEIGHT + AUTO TRAILER HITCH ===
  const lowerFrame = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.56, 4.08), darkSlate);
  lowerFrame.position.set(0, 0.84, 0.14);
  lowerFrame.castShadow = true;
  lowerFrame.receiveShadow = true;
  chassisGroup.add(lowerFrame);

  // Heavy front axle cross-beam & protective skid plate
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.42, 0.52), darkSlate);
  frontBumper.position.set(0, 0.86, -1.86);
  frontBumper.castShadow = true;
  chassisGroup.add(frontBumper);

  // Front recovery tow pin & grille guard
  const frontTow = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.22), midSlate);
  frontTow.position.set(0, 0.78, -2.14);
  chassisGroup.add(frontTow);

  // Sculpted dark-grey rear counterweight with beveled lower skirt & CLAAS + TÖL plate texture!
  const cwMain = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.86, 0.76), [
    darkSlate,
    darkSlate,
    darkSlate,
    darkSlate,
    new THREE.MeshStandardMaterial({ map: rearTex, roughness: 0.5, metalness: 0.28 }),
    darkSlate
  ]);
  cwMain.position.set(0, 1.24, 2.08);
  cwMain.castShadow = true;
  cwMain.receiveShadow = true;
  chassisGroup.add(cwMain);

  // Beveled lower rear counterweight skirt
  const cwLower = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.32, 0.54), darkSlate);
  cwLower.position.set(0, 0.76, 1.98);
  cwLower.rotation.x = 0.28;
  chassisGroup.add(cwLower);

  // Signature sculpted CLAAS-green rear upper cowling arch wrapping around the low boom tower
  const rearArchL = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.46, 0.96), claasGreen);
  rearArchL.position.set(-0.68, 1.78, 1.92);
  rearArchL.castShadow = true;
  chassisGroup.add(rearArchL);

  const rearArchR = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.46, 0.96), claasGreen);
  rearArchR.position.set(0.68, 1.78, 1.92);
  rearArchR.castShadow = true;
  chassisGroup.add(rearArchR);

  // Rear boom pivot saddle & structural dark-steel tower cheeks
  for (const sx of [-0.26, 0.54]) {
    const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.82, 0.92), darkSlate);
    cheek.position.set(sx, 1.74, 1.62);
    cheek.castShadow = true;
    chassisGroup.add(cheek);
  }

  // Rear Automatic Trailer Hitch (drawbar clevis + red locking pin + 7-pin electrical socket!)
  const hitchMount = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.26), midSlate);
  hitchMount.position.set(0, 0.9, 2.48);
  chassisGroup.add(hitchMount);
  const hitchJawTop = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.26), darkSlate);
  hitchJawTop.position.set(0, 0.98, 2.66);
  const hitchJawBot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.26), darkSlate);
  hitchJawBot.position.set(0, 0.82, 2.66);
  const hitchPin = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.34, 8), redAccent);
  hitchPin.position.set(0, 0.94, 2.71);
  const rearSocket = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.08, 8), blackRubber);
  rearSocket.rotation.x = Math.PI / 2;
  rearSocket.position.set(0.28, 0.96, 2.5);
  chassisGroup.add(hitchJawTop, hitchJawBot, hitchPin, rearSocket);

  // Rear LED Combination Taillights (red brake + amber indicator + white reverse lens)
  const tailRedMat = new THREE.MeshStandardMaterial({ color: 0xd92518, emissive: 0x770c00, roughness: 0.25 });
  const tailAmberMat = new THREE.MeshStandardMaterial({ color: 0xf2a516, emissive: 0x553200, roughness: 0.25 });
  for (const sx of [-0.78, 0.78]) {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.09), blackRubber);
    housing.position.set(sx, 1.5, 2.48);
    chassisGroup.add(housing);
    const redL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.11, 0.04), tailRedMat);
    redL.position.set(sx - (sx < 0 ? -0.06 : 0.06), 1.5, 2.52);
    const ambL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.04), tailAmberMat);
    ambL.position.set(sx + (sx < 0 ? -0.1 : 0.1), 1.5, 2.52);
    chassisGroup.add(redL, ambL);
  }

  // Left-side recessed 2-step aluminum boarding stairs + under-cab hydraulic fuel tank
  const fuelTank = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.48, 1.15), darkSlate);
  fuelTank.position.set(-0.78, 0.84, 0.15);
  fuelTank.castShadow = true;
  chassisGroup.add(fuelTank);
  const fuelCap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 8), redAccent);
  fuelCap.position.set(-0.96, 1.08, 0.56);
  chassisGroup.add(fuelCap);
  for (const sy of [0.58, 0.86]) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.045, 0.62), chrome);
    step.position.set(-1.02, sy, 0.05);
    chassisGroup.add(step);
  }

  // === 2. SLOPED RIGHT-SIDE CLAAS GREEN ENGINE HOOD + DECALS + EXHAUST STACK ===
  const hoodDecalMat = new THREE.MeshStandardMaterial({ map: hoodTexR, roughness: 0.36, metalness: 0.12 });
  const hoodMain = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.84, 2.55), [
    hoodDecalMat, // +X right outer face (shows CLAAS SCORPION 741 VARIPOWER!)
    claasGreen,
    claasGreen,
    darkSlate,
    darkSlate,
    claasGreen
  ]);
  hoodMain.position.set(0.68, 1.52, 0.48);
  hoodMain.castShadow = true;
  hoodMain.receiveShadow = true;
  chassisGroup.add(hoodMain);

  // Characteristic downward-sloped forward engine nose for high right-side visibility!
  const hoodSlope = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.58, 1.15), claasGreen);
  hoodSlope.position.set(0.68, 1.38, -1.24);
  hoodSlope.rotation.x = 0.24;
  hoodSlope.castShadow = true;
  chassisGroup.add(hoodSlope);

  // Top radiator intake grille (dark charcoal recessed louvre panel)
  const topGrille = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.06, 1.25), darkSlate);
  topGrille.position.set(0.68, 1.95, 0.55);
  chassisGroup.add(topGrille);

  // Front right headlight + amber turn indicator on nose
  const headLampMat = new THREE.MeshStandardMaterial({ color: 0xfff8dc, emissive: 0xffe49e, emissiveIntensity: 0.8 });
  for (const hx of [-0.74, 0.74]) {
    const hBox = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.12), blackRubber);
    hBox.position.set(hx, 1.16, -2.02);
    const hLens = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.03), headLampMat);
    hLens.position.set(hx, 1.16, -2.08);
    chassisGroup.add(hBox, hLens);
  }

  // Curved vertical exhaust stack with perforated heat-shield & angled tailpipe
  const exhaustBase = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.58, 10), darkSlate);
  exhaustBase.position.set(0.96, 2.22, 1.48);
  const exhaustTip = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.06, 0.42, 10), darkSlate);
  exhaustTip.position.set(0.99, 2.66, 1.54);
  exhaustTip.rotation.z = -0.18;
  exhaustTip.rotation.x = 0.24;
  const exhaustShield = new THREE.Mesh(new THREE.CylinderGeometry(0.092, 0.092, 0.44, 10, 1, true, -1.2, 2.4), midSlate);
  exhaustShield.position.set(0.96, 2.22, 1.48);
  chassisGroup.add(exhaustBase, exhaustTip, exhaustShield);

  // === 3. OFFSET PANORAMIC LEFT CAB (WHITE ROOF + BEACON + FRONT & REAR LED WORKLIGHTS) ===
  const cab = new THREE.Group();
  cab.position.set(-0.56, 1.42, 0.14);

  // Lower cab door sill with CLAAS 741 livery + black door handle
  const cabDoorLower = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.64, 1.66), [
    darkSlate,
    new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.38, metalness: 0.14 }),
    darkSlate,
    darkSlate,
    darkSlate,
    darkSlate
  ]);
  cabDoorLower.position.set(-0.56, 0.06, 0.0);
  cabDoorLower.castShadow = true;
  cab.add(cabDoorLower);

  const doorHandle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.24), blackRubber);
  doorHandle.position.set(-0.63, 0.28, 0.38);
  cab.add(doorHandle);

  // Rear cab bulkhead (dark slate frame + CLAAS green outer trim + rear glass window!)
  const rearBulkheadLower = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.54, 0.22), claasGreen);
  rearBulkheadLower.position.set(0, 0.04, 0.84);
  rearBulkheadLower.castShadow = true;
  cab.add(rearBulkheadLower);
  const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.96, 0.06), glassMat);
  rearGlass.position.set(0, 0.86, 0.85);
  cab.add(rearGlass);

  // Curved dark-slate ROPS cab pillars (swept A-pillars + vertical B/C pillars)
  const pillarSpecs: [number, number, number, number][] = [
    [-0.56, 0.84, -0.78, 0.22],
    [0.56, 0.84, -0.78, 0.22],
    [-0.56, 0.84, 0.82, 0],
    [0.56, 0.84, 0.82, 0]
  ];
  for (const [px, py, pz, rx] of pillarSpecs) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.085, 1.38, 0.095), darkSlate);
    p.position.set(px, py, pz);
    p.rotation.x = rx;
    p.castShadow = true;
    cab.add(p);
  }

  // Live 6-Bar A-Pillar Load-Moment LED Strip (Green -> Yellow -> Red!)
  for (let i = 0; i < 6; i++) {
    const ledColor = i < 3 ? 0x5ee034 : i < 5 ? 0xf5b822 : 0xff3b24;
    const mat = new THREE.MeshStandardMaterial({
      color: ledColor,
      emissive: ledColor,
      emissiveIntensity: 0.08
    });
    aPillarLeds.push(mat);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.045, 0.04), mat);
    bar.position.set(0.49, 0.56 + i * 0.072, -0.72);
    cab.add(bar);
  }

  // Panoramic curved windshield + skylight curve + large side glass windows + wiper blade!
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.06, 1.24, 0.05), glassMat);
  windshield.position.set(0, 0.84, -0.82);
  windshield.rotation.x = 0.24;
  cab.add(windshield);

  const skylight = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.05, 0.42), glassMat);
  skylight.position.set(0, 1.46, -0.52);
  skylight.rotation.x = 0.24;
  cab.add(skylight);

  // Front windshield wiper blade
  const wiperArm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.62, 0.03), blackRubber);
  wiperArm.position.set(-0.08, 0.64, -0.89);
  wiperArm.rotation.x = 0.24;
  wiperArm.rotation.z = -0.32;
  cab.add(wiperArm);

  const sideGlassL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.06, 1.56), glassMat);
  sideGlassL.position.set(-0.56, 0.92, 0.0);
  cab.add(sideGlassL);

  const sideGlassR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.06, 1.56), glassMat);
  sideGlassR.position.set(0.56, 0.92, 0.0);
  cab.add(sideGlassR);

  // Left & Right Wide-Angle Wing Mirrors on Tubular Brackets
  for (const side of [-1, 1]) {
    const mArm = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.46, 6), blackRubber);
    mArm.rotation.z = side * 1.15;
    mArm.position.set(side * 0.72, 1.12, -0.72);
    const mHead = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.14), blackRubber);
    mHead.position.set(side * 0.92, 1.16, -0.78);
    cab.add(mArm, mHead);
  }

  // Detailed Interior: Air-suspension seat, animated operator, right armrest joystick & steering wheel
  const seatBase = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.24, 0.52), darkSlate);
  seatBase.position.set(0, 0.18, 0.26);
  const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.72, 0.16), darkSlate);
  seatBack.position.set(0, 0.56, 0.48);
  seatBack.rotation.x = -0.12;
  cab.add(seatBase, seatBack);

  const driverCoat = new THREE.MeshStandardMaterial({ color: 0x2a5438, roughness: 0.82 });
  const driverSkin = new THREE.MeshStandardMaterial({ color: 0xf0c299, roughness: 0.75 });
  const driverTorso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.52, 0.26), driverCoat);
  driverTorso.position.set(0, 0.54, 0.24);
  cab.add(driverTorso);

  const driverHead = new THREE.Mesh(new THREE.SphereGeometry(0.155, 10, 8), driverSkin);
  driverHead.position.set(0, 0.97, 0.2);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.175, 0.075, 10), claasGreen);
  cap.position.y = 0.12;
  const capBrim = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.025, 0.12), darkSlate);
  capBrim.position.set(0, 0.09, -0.14);
  driverHead.add(cap, capBrim);
  cab.add(driverHead);

  const driverLeftArm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.45), driverCoat);
  driverLeftArm.position.set(-0.18, 0.68, -0.05);
  cab.add(driverLeftArm);

  // Right-hand Varipower joystick console
  const joystickPod = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.42), darkSlate);
  joystickPod.position.set(0.32, 0.44, 0.06);
  const joystickStick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.18, 8), blackRubber);
  joystickStick.position.set(0.32, 0.58, -0.02);
  joystickStick.rotation.x = 0.15;
  cab.add(joystickPod, joystickStick);

  const dash = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.46, 0.44), darkSlate);
  dash.position.set(0, 0.24, -0.58);
  cab.add(dash);

  const steeringWheelMesh = new THREE.Group();
  steeringWheelMesh.position.set(0, 0.62, -0.38);
  steeringWheelMesh.rotation.x = 0.55;
  steeringWheelMesh.add(new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.028, 8, 16), blackRubber));
  steeringWheelMesh.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.032, 0.032), midSlate));
  cab.add(steeringWheelMesh);

  // Signature CLAAS White Cab Roof with Sculpted Overhang Cap + Black Trim Skirt
  const roofTrim = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.08, 1.92), darkSlate);
  roofTrim.position.set(0, 1.5, 0.04);
  const roofWhiteCap = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.16, 1.88), roofWhite);
  roofWhiteCap.position.set(0, 1.6, 0.04);
  roofWhiteCap.castShadow = true;
  cab.add(roofTrim, roofWhiteCap);

  // Front (4x) AND Rear (2x) Roof LED Worklights!
  const ledLensMat = new THREE.MeshStandardMaterial({
    color: 0xfff8dc,
    emissive: 0xffe49e,
    emissiveIntensity: 0.65
  });
  for (const lx of [-0.46, -0.18, 0.18, 0.46]) {
    const lampHousing = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.11, 0.11), blackRubber);
    lampHousing.position.set(lx, 1.71, -0.84);
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.03), ledLensMat);
    lens.position.set(lx, 1.71, -0.9);
    cab.add(lampHousing, lens);
  }
  for (const rlx of [-0.38, 0.38]) {
    const rHousing = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.11, 0.11), blackRubber);
    rHousing.position.set(rlx, 1.71, 0.94);
    const rLens = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.03), ledLensMat);
    rLens.position.set(rlx, 1.71, 1.0);
    cab.add(rHousing, rLens);
  }

  // Front LED Worklight SpotLights
  for (const slx of [-0.36, 0.36]) {
    const sl = new THREE.SpotLight(0xfff1cc, 0, 46, Math.PI * 0.28, 0.55, 1.25);
    sl.position.set(slx, 1.72, -0.92);
    const tgt = new THREE.Object3D();
    tgt.position.set(slx * 1.4, -0.2, -16);
    cab.add(tgt);
    sl.target = tgt;
    cab.add(sl);
    workSpotLights.push(sl);
  }

  // Amber Rotating Roof Beacon (right-rear of white roof)
  const beaconBase = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.1, 10), blackRubber);
  beaconBase.position.set(0.4, 1.72, 0.58);
  cab.add(beaconBase);
  const beaconLight = new THREE.Mesh(
    new THREE.CylinderGeometry(0.082, 0.082, 0.18, 12),
    new THREE.MeshStandardMaterial({
      color: 0xffa000,
      emissive: 0xff8800,
      emissiveIntensity: 0.9,
      roughness: 0.2
    })
  );
  beaconLight.position.set(0.4, 1.85, 0.58);
  cab.add(beaconLight);

  chassisGroup.add(cab);

  // === 4. CHUNKY 460/70 R24 AGRICULTURAL TIRES ON CLAAS RED-ORANGE RIMS + STEERING MUDGUARDS ===
  const wheelCoords: [number, number, boolean][] = [
    [-1.08, -1.28, true],
    [1.08, -1.28, true],
    [-1.08, 1.38, false],
    [1.08, 1.38, false]
  ];

  for (const [wx, wz, isFront] of wheelCoords) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, 0.74, wz);

    // Wheel-hugging dark mudguard mounted to steering pivot on front (turns with wheel!) & chassis on rear
    const fender = new THREE.Mesh(
      new THREE.CylinderGeometry(0.84, 0.84, 0.54, 14, 1, true, -Math.PI * 0.34, Math.PI * 0.68),
      darkSlate
    );
    fender.rotation.z = Math.PI / 2;
    fender.castShadow = true;
    if (isFront) {
      fender.position.set(0, 0.04, 0);
      pivot.add(fender);
    } else {
      fender.position.set(wx, 0.78, wz);
      chassisGroup.add(fender);
    }

    const spin = new THREE.Group();
    // Main tire carcass
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.73, 0.73, 0.5, 22), tireRubber);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    tire.receiveShadow = true;
    spin.add(tire);

    // Directional V-Chevron agricultural tread lugs (left + right angled bars!)
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const lugL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.11), tireRubber);
      lugL.position.set(-0.12, Math.cos(a) * 0.73, Math.sin(a) * 0.73);
      lugL.rotation.set(-a, 0.32, 0);
      spin.add(lugL);

      const a2 = a + Math.PI / 16;
      const lugR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.11), tireRubber);
      lugR.position.set(0.12, Math.cos(a2) * 0.73, Math.sin(a2) * 0.73);
      lugR.rotation.set(-a2, -0.32, 0);
      spin.add(lugR);
    }

    // CLAAS red-orange recessed steel wheel rim + outer lip ring
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.52, 20), wheelOrange);
    rim.rotation.z = Math.PI / 2;
    spin.add(rim);

    // Heavy planetary hub cap + 8 lug bolts on outer face
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.58, 12), darkSlate);
    hub.rotation.z = Math.PI / 2;
    spin.add(hub);

    const outSign = wx < 0 ? -1 : 1;
    for (let b = 0; b < 8; b++) {
      const ba = (b / 8) * Math.PI * 2;
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.04, 6), chrome);
      bolt.rotation.z = Math.PI / 2;
      bolt.position.set(outSign * 0.27, Math.cos(ba) * 0.28, Math.sin(ba) * 0.28);
      spin.add(bolt);
    }

    pivot.add(spin);
    chassisGroup.add(pivot);
    wheelPivots.push({ pivot, spin, isFront, baseY: 0.74, localX: wx, localZ: wz, compression: 0.14 });
  }

  // === 5. LOW REAR-PIVOTING TELESCOPIC BOOM ALONGSIDE CAB (WITH FRONT WIPER + 4-PIN SOCKET!) ===
  const boomBaseLocal = new THREE.Vector3(0.14, 1.72, 1.42);
  const cylAnchorLocal = new THREE.Vector3(0.14, 0.96, 0.12);
  const boomPivot = new THREE.Group();
  boomPivot.position.copy(boomBaseLocal);
  chassisGroup.add(boomPivot);

  const boomSideMat = new THREE.MeshStandardMaterial({ map: boomTex, roughness: 0.36, metalness: 0.16 });
  const outerBoom = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.5, 3.68), [
    boomSideMat,
    boomSideMat,
    claasGreen,
    darkSlate,
    darkSlate,
    claasGreen
  ]);
  outerBoom.position.set(0, 0, -1.8);
  outerBoom.castShadow = true;
  boomPivot.add(outerBoom);

  // Dark steel wear-pad collar & front rubber wiper lip at mouth of outer boom!
  const boomCollar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.56, 0.24), darkSlate);
  boomCollar.position.set(0, 0, -3.56);
  boomPivot.add(boomCollar);
  const boomWiper = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.06), blackRubber);
  boomWiper.position.set(0, 0.27, -3.69);
  boomPivot.add(boomWiper);

  // Boom-mounted LED worklight (left side near boom collar)
  const boomLamp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.12), blackRubber);
  boomLamp.position.set(-0.29, 0.16, -3.38);
  const boomLens = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.03), ledLensMat);
  boomLens.position.set(-0.29, 0.16, -3.45);
  boomPivot.add(boomLamp, boomLens);

  // Inner telescopic dark-slate steel boom + angled quick-hitch nose + 4-pin front electrical socket!
  const innerBoom = new THREE.Group();
  innerBoom.position.set(0, 0, -3.55);
  const innerBeam = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.38, 3.85), midSlate);
  innerBeam.position.set(0, 0, 1.75);
  innerBeam.castShadow = true;
  innerBoom.add(innerBeam);

  const boomNose = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.44, 0.62), darkSlate);
  boomNose.position.set(0, -0.1, -0.26);
  boomNose.rotation.x = 0.28;
  boomNose.castShadow = true;
  innerBoom.add(boomNose);

  // Front hydraulic quick-coupler manifold + 4-pin electrical socket on boom head!
  const hydBlock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.18), midSlate);
  hydBlock.position.set(-0.27, -0.02, -0.22);
  const fourPinSocket = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.09, 8), blackRubber);
  fourPinSocket.rotation.x = Math.PI / 2;
  fourPinSocket.position.set(0.25, 0.04, -0.34);
  innerBoom.add(hydBlock, fourPinSocket);

  // Twin curved hydraulic hoses arching into the boom nose
  for (const hx of [-0.14, 0.14]) {
    const hose = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.028, 6, 12, Math.PI), blackRubber);
    hose.position.set(hx, 0.13, -0.22);
    hose.rotation.y = Math.PI / 2;
    innerBoom.add(hose);
  }
  boomPivot.add(innerBoom);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, -0.26, -0.52);
  const couplerPlate = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.56, 0.18), darkSlate);
  couplerPlate.castShadow = true;
  headPivot.add(couplerPlate);
  // Red hydraulic lock indicator bar on quick-coupler
  const lockBar = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.06, 0.06), redAccent);
  lockBar.position.set(0, 0.22, -0.1);
  headPivot.add(lockBar);

  const attachmentMount = new THREE.Group();
  attachmentMount.position.set(0, -0.05, -0.08);
  headPivot.add(attachmentMount);
  innerBoom.add(headPivot);

  // Hydraulic lift cylinder (dark slate barrel + mirror-chrome rod)
  const liftCylOuter = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.76, 10), darkSlate);
  liftCylOuter.castShadow = true;
  chassisGroup.add(liftCylOuter);

  const liftCylRod = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.054, 1.0, 10), chrome);
  chassisGroup.add(liftCylRod);

  return {
    chassisGroup,
    wheelPivots,
    steeringWheelMesh,
    driverHead,
    driverLeftArm,
    aPillarLeds,
    workSpotLights,
    ledLensMat,
    beaconLight,
    boomPivot,
    innerBoom,
    headPivot,
    attachmentMount,
    liftCylOuter,
    liftCylRod,
    boomBaseLocal,
    cylAnchorLocal,
    exhaustTipLocal: new THREE.Vector3(0.99, 2.88, 1.56)
  };
}

export function buildAttachmentMesh(type: Exclude<AttachmentType, 'none'>): THREE.Group {
  const g = new THREE.Group();
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x2f3539, roughness: 0.48, metalness: 0.5 });
  const accentSteel = new THREE.MeshStandardMaterial({ color: 0x525a60, roughness: 0.44, metalness: 0.56 });
  const claasGreen = new THREE.MeshStandardMaterial({ color: 0x9fd32e, roughness: 0.36, metalness: 0.16 });
  const claasRed = new THREE.MeshStandardMaterial({ color: 0xd94420, roughness: 0.44, metalness: 0.22 });
  const yellowTip = new THREE.MeshStandardMaterial({ color: 0xe6b822, roughness: 0.45, metalness: 0.22 });

  const backplate = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.72, 0.14), darkSteel);
  backplate.position.set(0, 0.08, -0.08);
  backplate.castShadow = true;
  g.add(backplate);

  if (type === 'forks') {
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.14, 0.16), accentSteel);
    topRail.position.set(0, 0.42, -0.14);
    topRail.castShadow = true;
    g.add(topRail);

    const laserMat = new THREE.MeshBasicMaterial({ color: 0x9fd32e, transparent: true, opacity: 0.58 });
    for (const sx of [-0.42, 0.42]) {
      const upright = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.78, 0.14), darkSteel);
      upright.position.set(sx, 0.04, -0.2);
      upright.castShadow = true;
      g.add(upright);

      const tine = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.075, 1.56), darkSteel);
      tine.position.set(sx, -0.32, -0.96);
      tine.castShadow = true;
      g.add(tine);

      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.08, 0.26), yellowTip);
      tip.position.set(sx, -0.32, -1.62);
      g.add(tip);

      const laser = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 2.2, 6), laserMat);
      laser.name = sx < 0 ? 'forkLaserL' : 'forkLaserR';
      laser.rotation.x = Math.PI / 2;
      laser.position.set(sx, -0.32, -2.85);
      laser.visible = false;
      g.add(laser);
    }
  } else if (type === 'spike') {
    const guard = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.92, 0.12), claasRed);
    guard.position.set(0, 0.2, -0.12);
    guard.castShadow = true;
    g.add(guard);

    for (const sx of [-0.42, 0.42]) {
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.22, 10), darkSteel);
      collar.rotation.x = Math.PI / 2;
      collar.position.set(sx, -0.16, -0.22);
      g.add(collar);

      const spear = new THREE.Mesh(new THREE.ConeGeometry(0.055, 1.55, 10), accentSteel);
      spear.rotation.x = -Math.PI / 2;
      spear.position.set(sx, -0.16, -1.02);
      spear.castShadow = true;
      g.add(spear);
    }
    const topSpear = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.9, 10), accentSteel);
    topSpear.rotation.x = -Math.PI / 2;
    topSpear.position.set(0, 0.42, -0.6);
    g.add(topSpear);
  } else if (type === 'grabber') {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.22, 0.24), darkSteel);
    rail.position.set(0, 0.1, -0.2);
    rail.castShadow = true;
    g.add(rail);

    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.35, 10), claasGreen);
    cyl.rotation.z = Math.PI / 2;
    cyl.position.set(0, 0.32, -0.2);
    g.add(cyl);

    for (const side of [-1, 1]) {
      const armPivot = new THREE.Group();
      armPivot.name = side < 0 ? 'grabberLeft' : 'grabberRight';
      armPivot.position.set(side * 0.88, 0.08, -0.24);

      const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.56, 0.24), claasGreen);
      shoulder.castShadow = true;
      armPivot.add(shoulder);

      const reach = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.52, 1.26), darkSteel);
      reach.position.set(side * 0.04, 0, -0.72);
      reach.castShadow = true;
      armPivot.add(reach);

      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.62, 12), claasGreen);
      pad.scale.set(0.45, 1, 1.65);
      pad.position.set(-side * 0.05, 0, -1.24);
      pad.rotation.y = side * 0.28;
      pad.castShadow = true;
      armPivot.add(pad);

      g.add(armPivot);
    }
  } else if (type === 'grapple') {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.66, 0.18), darkSteel);
    frame.position.set(0, 0.08, -0.15);
    frame.castShadow = true;
    g.add(frame);

    for (const sx of [-0.62, -0.21, 0.21, 0.62]) {
      const tine = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.32), darkSteel);
      tine.position.set(sx, -0.24, -0.82);
      tine.castShadow = true;
      g.add(tine);

      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.24, 6), accentSteel);
      tooth.rotation.x = -Math.PI / 2;
      tooth.position.set(sx, -0.24, -1.52);
      g.add(tooth);
    }

    const jawPivot = new THREE.Group();
    jawPivot.name = 'grappleJaw';
    jawPivot.position.set(0, 0.42, -0.22);

    const jawBar = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.16, 0.16), claasRed);
    jawBar.castShadow = true;
    jawPivot.add(jawBar);

    for (const sx of [-0.52, 0, 0.52]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.14, 1.05), darkSteel);
      arm.position.set(sx, 0.12, -0.52);
      arm.rotation.x = 0.22;
      jawPivot.add(arm);

      const fang = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.58, 0.12), claasRed);
      fang.position.set(sx, -0.16, -1.04);
      fang.rotation.x = 0.35;
      jawPivot.add(fang);
    }
    g.add(jawPivot);
  } else if (type === 'bucket') {
    const bw = 2.15;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.12, 1.38), darkSteel);
    floor.position.set(0, -0.34, -0.78);
    floor.castShadow = true;
    g.add(floor);

    const back = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.92, 0.12), accentSteel);
    back.position.set(0, 0.12, -0.14);
    back.castShadow = true;
    g.add(back);

    const topLip = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.12, 0.42), claasGreen);
    topLip.position.set(0, 0.56, -0.3);
    g.add(topLip);

    for (const sx of [-bw * 0.5 + 0.06, bw * 0.5 - 0.06]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 1.28), darkSteel);
      side.position.set(sx, 0.1, -0.72);
      g.add(side);
    }

    const edge = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.04, 0.08, 0.18), yellowTip);
    edge.position.set(0, -0.36, -1.5);
    g.add(edge);
  }

  return g;
}
