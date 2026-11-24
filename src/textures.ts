import * as THREE from 'three';

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

export function createClaasDoorTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 256);

  ctx.fillStyle = '#1d2224';
  ctx.fillRect(0, 0, 512, 256);

  // Seed green right panel
  ctx.fillStyle = '#9fd32e';
  ctx.beginPath();
  ctx.moveTo(310, 0);
  ctx.lineTo(512, 0);
  ctx.lineTo(512, 256);
  ctx.lineTo(255, 256);
  ctx.closePath();
  ctx.fill();

  // Signature white slanted stripe
  ctx.fillStyle = '#f6f8f4';
  ctx.beginPath();
  ctx.moveTo(0, 128);
  ctx.lineTo(355, 70);
  ctx.lineTo(338, 134);
  ctx.lineTo(0, 186);
  ctx.closePath();
  ctx.fill();

  // Seed green lower accent ribbon
  ctx.fillStyle = '#9fd32e';
  ctx.beginPath();
  ctx.moveTo(0, 186);
  ctx.lineTo(338, 134);
  ctx.lineTo(324, 178);
  ctx.lineTo(0, 226);
  ctx.closePath();
  ctx.fill();

  // CLAAS red wordmark
  ctx.save();
  ctx.translate(152, 138);
  ctx.rotate(-0.155);
  ctx.fillStyle = '#d6241a';
  ctx.font = 'italic 900 48px "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CLAAS', 0, 0);
  ctx.restore();

  // SCORPION 741 VARIPOWER
  ctx.save();
  ctx.translate(310, 172);
  ctx.rotate(-0.12);
  ctx.fillStyle = '#181c1d';
  ctx.font = 'italic 900 30px "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SCORPION', 0, 0);

  ctx.fillStyle = '#f8faf6';
  ctx.font = 'italic 900 22px "Arial Black", sans-serif';
  ctx.fillText('741', 102, -22);

  ctx.fillStyle = '#181c1d';
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.fillText('VARIPOWER', 14, 17);
  ctx.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createHayTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#cfa03c';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 800; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const len = 14 + Math.random() * 34;
    const ang = (Math.random() - 0.5) * 0.42;
    ctx.strokeStyle = i % 3 === 0 ? '#e8c15d' : i % 3 === 1 ? '#a87a24' : '#dbb14d';
    ctx.lineWidth = 1.4 + Math.random() * 1.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }

  // Baler twine cords
  ctx.fillStyle = '#754c24';
  ctx.fillRect(0, 56, 256, 6);
  ctx.fillRect(0, 194, 256, 6);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function createWrappedSilageTexture(tint: 'white' | 'mint' = 'white', popped = false): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  const base = tint === 'white' ? '#eaece6' : '#c3d6ba';
  const streak = tint === 'white' ? '#f9faf7' : '#d8ebd0';
  const crease = tint === 'white' ? '#cfd4ca' : '#a0b896';

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);

  // Stretched plastic wrap overlapping bands & subtle mud specks
  for (let i = 0; i < 28; i++) {
    const y = (i / 28) * 256;
    ctx.fillStyle = i % 2 === 0 ? streak : crease;
    ctx.globalAlpha = 0.34;
    ctx.fillRect(0, y, 256, 4 + (i % 3) * 3);
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = crease;
  ctx.lineWidth = 1.8;
  for (let x = -256; x < 512; x += 38) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 88, 256);
    ctx.stroke();
  }

  // Subtle field dust near bottom
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = 'rgba(110, 92, 68, 0.16)';
    ctx.beginPath();
    ctx.arc(Math.random() * 256, 180 + Math.random() * 76, 2 + Math.random() * 5, 0, Math.PI * 2);
    ctx.fill();
  }

  if (popped) {
    // Jagged tear exposing fermented green-brown silage inside
    ctx.fillStyle = '#384620';
    ctx.beginPath();
    ctx.moveTo(48, 80);
    ctx.lineTo(120, 56);
    ctx.lineTo(192, 74);
    ctx.lineTo(212, 138);
    ctx.lineTo(166, 194);
    ctx.lineTo(84, 182);
    ctx.lineTo(40, 136);
    ctx.closePath();
    ctx.fill();

    for (let i = 0; i < 180; i++) {
      const x = 56 + Math.random() * 140;
      const y = 72 + Math.random() * 106;
      ctx.strokeStyle = i % 2 === 0 ? '#566829' : '#76712b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 28, y + (Math.random() - 0.5) * 18);
      ctx.stroke();
    }

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(48, 80);
    ctx.lineTo(120, 56);
    ctx.lineTo(192, 74);
    ctx.lineTo(212, 138);
    ctx.lineTo(166, 194);
    ctx.lineTo(84, 182);
    ctx.lineTo(40, 136);
    ctx.closePath();
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCrateTexture(damaged = false): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#bc864c';
  ctx.fillRect(0, 0, 256, 256);

  for (let y = 0; y < 256; y += 42) {
    ctx.fillStyle = y % 84 === 0 ? '#b27b42' : '#c69056';
    ctx.fillRect(0, y, 256, 39);
    ctx.fillStyle = '#5c3918';
    ctx.fillRect(0, y + 39, 256, 3);
  }

  // Border frame
  ctx.strokeStyle = '#8f5d2b';
  ctx.lineWidth = 24;
  ctx.strokeRect(12, 12, 232, 232);

  // Stenciled farm produce badge
  ctx.fillStyle = 'rgba(54, 34, 16, 0.78)';
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('FARM PRODUCE', 128, 118);
  ctx.font = 'bold 17px sans-serif';
  ctx.fillText('HANDLE WITH FORKS', 128, 146);

  // Upward stacking arrows
  ctx.fillRect(46, 174, 12, 24);
  ctx.beginPath();
  ctx.moveTo(40, 176);
  ctx.lineTo(52, 160);
  ctx.lineTo(64, 176);
  ctx.fill();

  ctx.fillRect(198, 174, 12, 24);
  ctx.beginPath();
  ctx.moveTo(192, 176);
  ctx.lineTo(204, 160);
  ctx.lineTo(216, 176);
  ctx.fill();

  if (damaged) {
    // Dark splinter cracks & crushed slats
    ctx.strokeStyle = '#2d1a0a';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(30, 40);
    ctx.lineTo(132, 130);
    ctx.lineTo(220, 75);
    ctx.moveTo(132, 130);
    ctx.lineTo(95, 226);
    ctx.stroke();

    ctx.fillStyle = 'rgba(175, 40, 26, 0.45)';
    ctx.beginPath();
    ctx.arc(135, 145, 36, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createBarrelTexture(hueColor = '#b34329'): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = hueColor;
  ctx.fillRect(0, 0, 256, 256);

  ctx.fillStyle = '#e3d6b8';
  ctx.fillRect(0, 88, 256, 80);

  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(0, 78, 256, 8);
  ctx.fillRect(0, 170, 256, 8);

  for (let i = 0; i < 220; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(98,42,16,0.5)' : 'rgba(55,25,12,0.35)';
    ctx.beginPath();
    ctx.arc(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 7, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createFarmGroundTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(1024, 1024);

  // Transparent outer margin so gravel farmyard blends organically into Bavarian meadow terrain!
  ctx.clearRect(0, 0, 1024, 1024);

  // Soft feathered grass/dirt border transition
  const outerGrad = ctx.createRadialGradient(512, 512, 340, 512, 512, 505);
  outerGrad.addColorStop(0, 'rgba(128, 121, 108, 0.98)');
  outerGrad.addColorStop(0.74, 'rgba(120, 114, 101, 0.94)');
  outerGrad.addColorStop(0.88, 'rgba(98, 102, 74, 0.55)');
  outerGrad.addColorStop(1, 'rgba(74, 108, 48, 0.0)');
  ctx.fillStyle = outerGrad;
  ctx.beginPath();
  ctx.roundRect(24, 34, 976, 956, 150);
  ctx.fill();

  // Main Bavarian farmyard compacted gravel & weathered concrete courtyard
  ctx.fillStyle = '#8b8477';
  ctx.beginPath();
  ctx.roundRect(78, 86, 868, 852, 110);
  ctx.fill();

  // Natural crushed-limestone gravel grain & subtle dark earth mottling
  for (let i = 0; i < 6500; i++) {
    const x = 70 + Math.random() * 884;
    const y = 78 + Math.random() * 868;
    ctx.fillStyle =
      i % 4 === 0
        ? 'rgba(110,104,92,0.34)'
        : i % 4 === 1
          ? 'rgba(154,148,134,0.28)'
          : i % 4 === 2
            ? 'rgba(78,73,65,0.25)'
            : 'rgba(94,104,70,0.12)';
    ctx.fillRect(x, y, 3 + Math.random() * 6, 3 + Math.random() * 6);
  }

  // Main East-West tractor driveway & cross-yard ruts leading straight to East & West exits
  ctx.strokeStyle = 'rgba(96, 82, 62, 0.48)';
  ctx.lineCap = 'round';
  ctx.lineWidth = 52;
  ctx.beginPath();
  ctx.moveTo(45, 420);
  ctx.lineTo(980, 420);
  ctx.moveTo(512, 175);
  ctx.lineTo(512, 860);
  ctx.moveTo(512, 420);
  ctx.lineTo(340, 820);
  ctx.moveTo(512, 420);
  ctx.lineTo(720, 760);
  ctx.stroke();

  // Darker paired tire ruts along the main exit lane
  ctx.strokeStyle = 'rgba(66, 56, 42, 0.36)';
  ctx.lineWidth = 10;
  for (const off of [-16, 16]) {
    ctx.beginPath();
    ctx.moveTo(60, 420 + off);
    ctx.lineTo(965, 420 + off);
    ctx.stroke();
  }

  // Subtle straw scatter in front of the South Hay Barn
  for (let i = 0; i < 480; i++) {
    const sx = 540 + Math.random() * 220;
    const sy = 690 + Math.random() * 170;
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(208, 170, 68, 0.58)' : 'rgba(170, 134, 44, 0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + (Math.random() - 0.5) * 14, sy + (Math.random() - 0.5) * 14);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createBarnWoodTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#8f3025';
  ctx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 28) {
    ctx.fillStyle = x % 56 === 0 ? '#842b21' : '#99362a';
    ctx.fillRect(x, 0, 26, 256);
    ctx.fillStyle = '#521711';
    ctx.fillRect(x + 26, 0, 2, 256);
  }
  // Subtle weathering grain
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = 'rgba(30, 14, 10, 0.14)';
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 18);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 1.5);
  return tex;
}

export function createPebbledashTexture(): THREE.CanvasTexture {
  // Inspired by the grey pebbledash farm building in the user's photo!
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#8b857b';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3600; i++) {
    const shade = 105 + Math.floor(Math.random() * 58);
    ctx.fillStyle = `rgb(${shade}, ${shade - 4}, ${shade - 10})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2.5, 2.5);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  return tex;
}

export function createCorrugatedMetalTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#6f777d';
  ctx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 16) {
    ctx.fillStyle = '#838b91';
    ctx.fillRect(x, 0, 7, 256);
    ctx.fillStyle = '#565d63';
    ctx.fillRect(x + 7, 0, 5, 256);
  }
  // Light rust streaks
  for (let i = 0; i < 45; i++) {
    ctx.fillStyle = 'rgba(130, 74, 42, 0.22)';
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 8, 28);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 2);
  return tex;
}

export function createStoneWallTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 128);
  ctx.fillStyle = '#646058';
  ctx.fillRect(0, 0, 256, 128);
  const colors = ['#827d73', '#736e65', '#918a7f', '#635f57', '#999286'];
  let row = 0;
  for (let y = 2; y < 126; y += 22) {
    let x = row % 2 === 0 ? 0 : -18;
    while (x < 256) {
      const w = 28 + Math.random() * 34;
      const h = 18;
      ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
      ctx.beginPath();
      ctx.roundRect(x + 2, y, w - 3, h, 4);
      ctx.fill();
      x += w;
    }
    row++;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(7, 1);
  return tex;
}

export function createConcreteTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#a4a49d';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1600; i++) {
    const v = 135 + Math.floor(Math.random() * 44);
    ctx.fillStyle = `rgba(${v},${v},${v - 5},0.35)`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 4, 4);
  }
  // Panel seam lines
  ctx.strokeStyle = 'rgba(70,70,66,0.4)';
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, 252, 252);
  ctx.beginPath();
  ctx.moveTo(128, 0);
  ctx.lineTo(128, 256);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

export function createDetailBumpTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4200; i++) {
    const v = 90 + Math.floor(Math.random() * 80);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 4, 2 + Math.random() * 4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(28, 28);
  return tex;
}

export function createMeadowDetailTexture(): THREE.CanvasTexture {
  // High-frequency grass-blade, clover & earthy grain detail texture centered around neutral 0.5 (128)
  // for crisp world-space micro-modulation on terrain down to tire distance!
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3600; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.fillStyle =
      i % 3 === 0
        ? 'rgba(176,184,162,0.42)'
        : i % 3 === 1
          ? 'rgba(84,96,76,0.42)'
          : 'rgba(146,154,132,0.34)';
    ctx.fillRect(x, y, 2, 5 + Math.random() * 7);
  }
  // Fine soil & gravel flecks
  for (let i = 0; i < 900; i++) {
    const v = i % 2 === 0 ? 105 : 152;
    ctx.fillStyle = `rgba(${v},${v},${v - 4},0.34)`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2.5, 2.5);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function createGravelRoadTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#8d836f';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4800; i++) {
    const v = 104 + Math.floor(Math.random() * 58);
    ctx.fillStyle = `rgb(${v},${v - 7},${v - 19})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }
  // Subtle grassy wheel-track median down the middle of Bavarian Feldwege
  ctx.fillStyle = 'rgba(94, 126, 62, 0.34)';
  ctx.fillRect(102, 0, 52, 256);
  // Subtle darker tire tracks
  ctx.fillStyle = 'rgba(86, 76, 60, 0.28)';
  ctx.fillRect(44, 0, 38, 256);
  ctx.fillRect(174, 0, 38, 256);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function createCobbleTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#6c6860';
  ctx.fillRect(0, 0, 256, 256);
  const shades = ['#9d978c', '#8f897f', '#aba59a', '#7e7870', '#a39d92'];
  let row = 0;
  for (let y = 2; y < 254; y += 22) {
    let x = row % 2 === 0 ? 2 : -10;
    while (x < 256) {
      const w = 22 + Math.random() * 14;
      ctx.fillStyle = shades[Math.floor(Math.random() * shades.length)];
      ctx.beginPath();
      ctx.roundRect(x, y, w - 3, 18, 4);
      ctx.fill();
      x += w;
    }
    row++;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

export function createAsphaltTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#3b3f44';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4200; i++) {
    const v = 46 + Math.floor(Math.random() * 34);
    ctx.fillStyle = `rgb(${v},${v + 1},${v + 3})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  // Clean shoulder curb border & crisp German Landstraße white edge & dashed center markings
  ctx.fillStyle = '#4c514b';
  ctx.fillRect(0, 0, 7, 256);
  ctx.fillRect(249, 0, 7, 256);
  ctx.fillStyle = 'rgba(228, 232, 228, 0.56)';
  ctx.fillRect(11, 0, 5, 256);
  ctx.fillRect(240, 0, 5, 256);
  ctx.fillStyle = 'rgba(235, 238, 232, 0.62)';
  ctx.fillRect(125, 24, 6, 90);
  ctx.fillRect(125, 152, 6, 90);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 2);
  return tex;
}

export function createVillageAsphaltTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#474b50';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4200; i++) {
    const v = 56 + Math.floor(Math.random() * 34);
    ctx.fillStyle = `rgb(${v},${v + 1},${v + 2})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  // Subtle Bavarian cobblestone/granite curb edge strip along village streets
  ctx.fillStyle = '#6f6c64';
  ctx.fillRect(0, 0, 10, 256);
  ctx.fillRect(246, 0, 10, 256);
  ctx.fillStyle = 'rgba(42, 44, 46, 0.4)';
  for (let y = 0; y < 256; y += 16) {
    ctx.fillRect(0, y, 10, 2);
    ctx.fillRect(246, y, 10, 2);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function createSkyEnvTexture(mode: 'morning' | 'afternoon' | 'sunset' | 'dusk'): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 256);
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  if (mode === 'morning') {
    grad.addColorStop(0, '#6a9ec9');
    grad.addColorStop(0.46, '#c7dfed');
    grad.addColorStop(0.54, '#e5ebe2');
    grad.addColorStop(1, '#4c6642');
  } else if (mode === 'afternoon') {
    grad.addColorStop(0, '#4688c7');
    grad.addColorStop(0.47, '#a7d2ec');
    grad.addColorStop(0.54, '#d9e6dc');
    grad.addColorStop(1, '#4d6f3b');
  } else if (mode === 'sunset') {
    grad.addColorStop(0, '#364d7a');
    grad.addColorStop(0.35, '#a8675c');
    grad.addColorStop(0.5, '#f2a863');
    grad.addColorStop(0.56, '#7a5942');
    grad.addColorStop(1, '#303b2a');
  } else {
    grad.addColorStop(0, '#101c33');
    grad.addColorStop(0.42, '#243c61');
    grad.addColorStop(0.52, '#3d526e');
    grad.addColorStop(1, '#1a231c');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  // Soft sun disk in environment reflection
  const sunY = mode === 'sunset' ? 122 : mode === 'dusk' ? 140 : 68;
  const sunRad = mode === 'dusk' ? 18 : 34;
  const sunGrad = ctx.createRadialGradient(380, sunY, 2, 380, sunY, sunRad);
  sunGrad.addColorStop(0, mode === 'dusk' ? 'rgba(200,220,255,0.6)' : 'rgba(255,250,225,0.95)');
  sunGrad.addColorStop(1, 'rgba(255,230,180,0)');
  ctx.fillStyle = sunGrad;
  ctx.fillRect(320, sunY - sunRad, sunRad * 2 + 40, sunRad * 2);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

export function createWaterRippleBumpTexture(): THREE.CanvasTexture {
  // Seamlessly tileable isotropic Alpine lake ripple heightmap (soft organic shimmer, zero scanline stripes!)
  const w = 256;
  const h = 256;
  const [c, ctx] = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const data = img.data;
  const tau = Math.PI * 2;
  for (let y = 0; y < h; y++) {
    const ny = y / h;
    for (let x = 0; x < w; x++) {
      const nx = x / w;
      const v =
        Math.sin((nx * 3 + ny * 2) * tau) * 0.24 +
        Math.sin((nx * 4 - ny * 5 + 0.3) * tau) * 0.22 +
        Math.sin((nx * 7 + ny * 6 + 0.8) * tau) * 0.16 +
        Math.cos((nx * 11 - ny * 9) * tau) * 0.12 +
        Math.sin((nx * 13 + ny * 12 + 0.5) * tau) * 0.09;
      const g = Math.max(0, Math.min(255, Math.round(128 + v * 120)));
      const idx = (y * w + x) * 4;
      data[idx] = g;
      data[idx + 1] = g;
      data[idx + 2] = g;
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(28, 44);
  return tex;
}

export function createBaroqueChurchTexture(): THREE.CanvasTexture {
  // Warm Upper Bavarian cream-ochre lime-plaster stucco with subtle Baroque recess bays & sandstone base
  const [c, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = '#f3ebda';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle vertical lime-wash warmth gradient (slightly warmer near eaves, cooler weathered base)
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, 'rgba(232, 214, 178, 0.35)');
  grad.addColorStop(0.55, 'rgba(246, 240, 226, 0.05)');
  grad.addColorStop(0.88, 'rgba(182, 172, 152, 0.28)');
  grad.addColorStop(1, 'rgba(148, 138, 120, 0.48)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Faint Baroque recessed plaster panel borders
  ctx.strokeStyle = 'rgba(188, 172, 142, 0.45)';
  ctx.lineWidth = 4;
  for (let x = 18; x < 512; x += 128) {
    ctx.strokeRect(x, 34, 92, 392);
    ctx.strokeStyle = 'rgba(255, 252, 244, 0.55)';
    ctx.strokeRect(x + 4, 38, 84, 384);
    ctx.strokeStyle = 'rgba(188, 172, 142, 0.45)';
  }

  // Natural hand-troweled Bavarian stucco grain
  for (let i = 0; i < 4200; i++) {
    const shade = 212 + Math.floor(Math.random() * 34);
    ctx.fillStyle = `rgba(${shade}, ${shade - 8}, ${shade - 22}, 0.22)`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 3, 3);
  }

  // Pale sandstone plinth band along bottom edge
  ctx.fillStyle = '#c5bca9';
  ctx.fillRect(0, 456, 512, 56);
  ctx.fillStyle = '#a89f8d';
  ctx.fillRect(0, 452, 512, 6);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export function createBaroquePalaceTexture(): THREE.CanvasTexture {
  // Authentic 1685 Schloss Ammerland warm ochre-cream Baroque palace facade (3 stories of pedimented windows)
  const [c, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = '#f3dfae';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle plaster mottling
  for (let i = 0; i < 3600; i++) {
    const v = 218 + Math.floor(Math.random() * 30);
    ctx.fillStyle = `rgba(${v}, ${v - 20}, ${v - 54}, 0.22)`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 3, 3);
  }

  // Rusticated pale-stone ground floor band
  ctx.fillStyle = '#d9ccb2';
  ctx.fillRect(0, 366, 512, 146);
  ctx.strokeStyle = 'rgba(130, 118, 98, 0.35)';
  ctx.lineWidth = 2;
  for (let y = 370; y < 512; y += 28) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }

  // Horizontal Baroque stringcourse cornice lines separating stories
  ctx.fillStyle = '#fbf4e3';
  ctx.fillRect(0, 358, 512, 10);
  ctx.fillRect(0, 198, 512, 8);
  ctx.fillRect(0, 16, 512, 12);
  ctx.fillStyle = 'rgba(130, 104, 62, 0.35)';
  ctx.fillRect(0, 368, 512, 4);
  ctx.fillRect(0, 206, 512, 4);

  // Pale cream Baroque vertical pilaster strips between window bays
  for (let x = 0; x < 512; x += 128) {
    ctx.fillStyle = 'rgba(252, 245, 228, 0.55)';
    ctx.fillRect(x, 28, 16, 330);
    ctx.fillRect(x + 112, 28, 16, 330);
  }

  // 3 stories x 4 bays of tall Baroque palace windows with white surrounds, pediments & mullions
  const rows = [
    { y: 58, h: 102, ped: true },
    { y: 224, h: 108, ped: true },
    { y: 392, h: 92, ped: false }
  ];
  for (const r of rows) {
    for (let col = 0; col < 4; col++) {
      const wx = col * 128 + 38;
      const ww = 52;
      // White Baroque frame surround
      ctx.fillStyle = '#faf5e8';
      ctx.fillRect(wx - 7, r.y - 7, ww + 14, r.h + 14);
      // Decorative gable/arched pediment cap on upper stories
      if (r.ped) {
        ctx.fillStyle = '#f5ecd8';
        ctx.beginPath();
        ctx.moveTo(wx - 11, r.y - 7);
        ctx.lineTo(wx + ww / 2, r.y - 22);
        ctx.lineTo(wx + ww + 11, r.y - 7);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(140, 118, 84, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      // Deep reflective palace window glass
      const gGrad = ctx.createLinearGradient(wx, r.y, wx, r.y + r.h);
      gGrad.addColorStop(0, '#2c3d4f');
      gGrad.addColorStop(0.5, '#3b5166');
      gGrad.addColorStop(1, '#202d3a');
      ctx.fillStyle = gGrad;
      ctx.fillRect(wx, r.y, ww, r.h);
      // White wooden cross-mullions
      ctx.fillStyle = '#f4efe2';
      ctx.fillRect(wx + ww / 2 - 2, r.y, 4, r.h);
      ctx.fillRect(wx, r.y + r.h * 0.36, ww, 3);
      ctx.fillRect(wx, r.y + r.h * 0.68, ww, 3);
      // Stone window sill
      ctx.fillStyle = '#d4c9b4';
      ctx.fillRect(wx - 10, r.y + r.h + 6, ww + 20, 6);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export function createBavarianParasolTexture(): THREE.CanvasTexture {
  // Classic Bavarian Weiß-Blau striped Biergarten parasol & lakeside awning texture
  const [c, ctx] = makeCanvas(256, 256);
  const stripes = 8;
  const sw = 256 / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#1d6fb8' : '#f4f2ea';
    ctx.fillRect(i * sw, 0, sw + 1, 256);
  }
  // Subtle scalloped valance border along bottom edge
  ctx.fillStyle = 'rgba(18, 52, 88, 0.25)';
  ctx.fillRect(0, 234, 256, 22);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
