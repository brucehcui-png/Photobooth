const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Helper to write raw PNG file without external dependencies
function createPNG(width, height, pixelFn) {
  // RGBA buffer: 4 bytes per pixel + 1 filter byte per scanline
  const rowSize = width * 4 + 1;
  const rawData = Buffer.alloc(height * rowSize);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y, width, height);
      const pixelOffset = rowOffset + 1 + x * 4;
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);

  // PNG Header
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth: 8
  ihdr[9] = 6; // Color type: 6 (RGBA)
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  const ihdrChunk = createChunk('IHDR', ihdr);
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4);
  data.copy(chunk, 8);
  const crc = crc32(chunk.subarray(4, 8 + len));
  chunk.writeUInt32BE(crc >>> 0, 8 + len);
  return chunk;
}

// CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c = c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// Icon design: Modern iOS dark glass style camera / photobooth
function iconPixel(x, y, w, h) {
  const nx = x / w;
  const ny = y / h;
  const cx = 0.5;
  const cy = 0.5;
  const dx = nx - cx;
  const dy = ny - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Background: Deep dark vignette gradient with subtle purple-blue glow
  const bgGrad = Math.max(0, 1 - dist * 1.2);
  let r = Math.round(18 + bgGrad * 30);
  let g = Math.round(18 + bgGrad * 24);
  let b = Math.round(28 + bgGrad * 60);
  let a = 255;

  // Squircle icon mask (for rounded icons)
  const squircle = Math.pow(Math.abs(dx * 2), 4) + Math.pow(Math.abs(dy * 2), 4);
  if (squircle > 1.05) {
    return [0, 0, 0, 0];
  }

  // Camera body outer white rounded frame
  const inOuter = Math.abs(dx) < 0.32 && Math.abs(dy) < 0.28;
  const bodyDist = Math.max(Math.abs(dx) / 0.32, Math.abs(dy) / 0.28);

  // Stylized Photobooth film strip icon in center
  // 3 frames vertical
  const stripW = 0.22;
  const stripH = 0.36;
  if (Math.abs(dx) < stripW && Math.abs(dy) < stripH) {
    // White photo strip paper
    r = 252;
    g = 252;
    b = 254;

    // Small frames
    const frameY = ny;
    // Check if inside one of 3 frame boxes
    const f1 = frameY > 0.18 && frameY < 0.35;
    const f2 = frameY > 0.41 && frameY < 0.59;
    const f3 = frameY > 0.65 && frameY < 0.82;
    const inFrameX = Math.abs(dx) < 0.17;

    if (inFrameX && (f1 || f2 || f3)) {
      if (f1) {
        // Sunset pink/orange photo
        r = Math.round(255 - (frameY - 0.18) * 400);
        g = Math.round(100 + (frameY - 0.18) * 300);
        b = 160;
      } else if (f2) {
        // Cyan / mint photo
        r = 60;
        g = Math.round(190 + (frameY - 0.41) * 300);
        b = 240;
      } else {
        // Violet / warm photo
        r = Math.round(180 + (frameY - 0.65) * 300);
        g = 120;
        b = 240;
      }
    }
  }

  // Shutter / flash accent dot top right
  const flashDist = Math.sqrt(Math.pow(nx - 0.72, 2) + Math.pow(ny - 0.25, 2));
  if (flashDist < 0.05) {
    r = 255;
    g = 210;
    b = 60;
  }

  return [r, g, b, a];
}

const publicDir = path.join(__dirname, '..', 'public');
fs.mkdirSync(publicDir, { recursive: true });

// 180x180 apple-touch-icon
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), createPNG(180, 180, iconPixel));
// 192x192
fs.writeFileSync(path.join(publicDir, 'icon-192.png'), createPNG(192, 192, iconPixel));
// 512x512
fs.writeFileSync(path.join(publicDir, 'icon-512.png'), createPNG(512, 512, iconPixel));
// favicon
fs.writeFileSync(path.join(publicDir, 'icon.png'), createPNG(64, 64, iconPixel));

console.log('Successfully generated app icons!');
