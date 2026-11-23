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

  // Authentic British/European countryside pasture grass (more natural, less neon)
  ctx.fillStyle = '#5e8742';
  ctx.fillRect(0, 0, 1024, 1024);

  for (let i = 0; i < 3200; i++) {
    ctx.fillStyle =
      i % 3 === 0
        ? 'rgba(104,142,66,0.35)'
        : i % 3 === 1
          ? 'rgba(72,108,48,0.34)'
          : 'rgba(130,152,78,0.22)';
    ctx.beginPath();
    ctx.arc(Math.random() * 1024, Math.random() * 1024, 6 + Math.random() * 24, 0, Math.PI * 2);
    ctx.fill();
  }

  // Main farmyard hardcore / weathered concrete & compacted gravel apron
  ctx.fillStyle = '#9d978c';
  ctx.beginPath();
  ctx.roundRect(150, 145, 724, 710, 95);
  ctx.fill();

  // Weathered asphalt/gravel mottling
  for (let i = 0; i < 4200; i++) {
    const x = 145 + Math.random() * 734;
    const y = 140 + Math.random() * 720;
    ctx.fillStyle =
      i % 3 === 0
        ? 'rgba(128,122,110,0.32)'
        : i % 3 === 1
          ? 'rgba(182,175,160,0.25)'
          : 'rgba(92,86,76,0.22)';
    ctx.fillRect(x, y, 4 + Math.random() * 6, 4 + Math.random() * 6);
  }

  // Muddy tractor ruts & farm lane leading from north gate through yard to trailer & barn
  ctx.strokeStyle = 'rgba(116, 94, 68, 0.52)';
  ctx.lineCap = 'round';
  ctx.lineWidth = 44;
  ctx.beginPath();
  ctx.moveTo(512, 865);
  ctx.lineTo(512, 220);
  ctx.moveTo(220, 500);
  ctx.lineTo(800, 500);
  ctx.moveTo(512, 500);
  ctx.lineTo(310, 240);
  ctx.moveTo(512, 500);
  ctx.lineTo(750, 320);
  ctx.stroke();

  // Darker tire rut lines
  ctx.strokeStyle = 'rgba(84, 68, 48, 0.34)';
  ctx.lineWidth = 10;
  for (const off of [-14, 14]) {
    ctx.beginPath();
    ctx.moveTo(512 + off, 860);
    ctx.lineTo(512 + off, 230);
    ctx.stroke();
  }

  // Subtle straw scatter right in front of the Hay Barn (natural visual clue!)
  for (let i = 0; i < 420; i++) {
    const sx = 435 + Math.random() * 190;
    const sy = 155 + Math.random() * 155;
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(218, 178, 72, 0.65)' : 'rgba(182, 142, 48, 0.5)';
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
  // Subtle grayscale/warm-tinted painterly grass & clover texture that multiplies cleanly with terrain vertexColors!
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#e2e6de';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2400; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.fillStyle =
      i % 3 === 0
        ? 'rgba(255,255,245,0.28)'
        : i % 3 === 1
          ? 'rgba(135,152,120,0.25)'
          : 'rgba(175,188,155,0.22)';
    ctx.fillRect(x, y, 2, 7 + Math.random() * 8);
  }
  // Tiny subtle wildflower flecks
  for (let i = 0; i < 45; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,244,180,0.55)' : 'rgba(255,255,255,0.5)';
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2.5, 2.5);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(34, 28);
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
  ctx.fillStyle = '#3a3e43';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3600; i++) {
    const v = 42 + Math.floor(Math.random() * 38);
    ctx.fillStyle = `rgb(${v},${v + 2},${v + 4})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  // Subtle German Landstraße white edge markings & dashed centerline (u = across width, v = along road)
  ctx.fillStyle = 'rgba(232, 236, 234, 0.42)';
  ctx.fillRect(10, 0, 5, 256);
  ctx.fillRect(241, 0, 5, 256);
  ctx.fillStyle = 'rgba(240, 242, 238, 0.52)';
  ctx.fillRect(125, 24, 6, 92);
  ctx.fillRect(125, 152, 6, 92);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 2);
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
