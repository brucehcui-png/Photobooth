// Pixel Art transformation engine with color quantization, Bayer dithering, and retro palettes

export type PixelArtPalette =
  | "arcade"    // Vibrant 16-bit arcade color
  | "pico8"     // Classic 16-color fantasy console
  | "gameboy"   // 4-shade Game Boy DMG-01 green LCD
  | "cyberpunk" // Neon pink, cyan, electric purple
  | "onebit";   // 1-bit monochrome Game Boy Camera dither

export type PixelSize = "fine" | "classic" | "chunky";

export interface PixelArtOptions {
  palette?: PixelArtPalette;
  pixelSize?: PixelSize;
  dither?: boolean;
}

// 4x4 Bayer Matrix for ordered dithering
const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

// Color definitions [R, G, B]
const GAMEBOY_PALETTE = [
  [15, 56, 15],     // Darkest green
  [48, 98, 48],     // Dark green
  [139, 172, 15],   // Light green
  [155, 188, 15],   // Bright yellow-green
];

const ONEBIT_PALETTE = [
  [12, 12, 14],     // Deep black
  [245, 245, 250],  // Bright white
];

const CYBERPUNK_PALETTE = [
  [10, 10, 24],     // Deep void
  [45, 16, 75],     // Dark plum
  [180, 20, 110],   // Hot magenta
  [255, 60, 140],   // Neon pink
  [14, 116, 144],   // Deep cyan
  [6, 182, 212],    // Cyan
  [52, 211, 153],   // Mint
  [254, 240, 138],  // Neon yellow
  [255, 255, 255],  // Bright highlight
];

const PICO8_PALETTE = [
  [0, 0, 0],        // 00 black
  [29, 43, 83],     // 01 dark blue
  [126, 37, 83],    // 02 dark purple
  [0, 135, 81],     // 03 dark green
  [171, 82, 54],    // 04 brown
  [95, 87, 79],     // 05 dark gray
  [194, 195, 199],  // 06 light gray
  [255, 241, 232],  // 07 white
  [255, 0, 77],     // 08 red
  [255, 163, 0],    // 09 orange
  [255, 236, 39],   // 10 yellow
  [0, 228, 54],     // 11 green
  [41, 173, 255],   // 12 blue
  [131, 118, 156],  // 13 indigo
  [255, 119, 168],  // 14 pink
  [255, 204, 170],  // 15 peach
];

// Helper to find closest color in a fixed palette with dithering offset
function findClosestPaletteColor(
  r: number,
  g: number,
  b: number,
  palette: number[][]
): [number, number, number] {
  let bestDist = Infinity;
  let bestColor = palette[0];

  for (let i = 0; i < palette.length; i++) {
    const pr = palette[i][0];
    const pg = palette[i][1];
    const pb = palette[i][2];

    const dr = r - pr;
    const dg = g - pg;
    const db = b - pb;
    const dist = 0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db;

    if (dist < bestDist) {
      bestDist = dist;
      bestColor = palette[i];
    }
  }

  return [bestColor[0], bestColor[1], bestColor[2]];
}

// 16-bit arcade color quantization with Bayer dithering
function quantizeArcade(
  r: number,
  g: number,
  b: number,
  ditherVal: number
): [number, number, number] {
  const gray = 0.299 * r + 0.587 * g + 0.114 * b;
  r = Math.min(255, Math.max(0, gray + (r - gray) * 1.25));
  g = Math.min(255, Math.max(0, gray + (g - gray) * 1.25));
  b = Math.min(255, Math.max(0, gray + (b - gray) * 1.25));

  const levels = 6;
  const step = 255 / (levels - 1);
  const spread = step * 0.45;

  const qr = Math.round(Math.min(255, Math.max(0, r + ditherVal * spread)) / step) * step;
  const qg = Math.round(Math.min(255, Math.max(0, g + ditherVal * spread)) / step) * step;
  const qb = Math.round(Math.min(255, Math.max(0, b + ditherVal * spread)) / step) * step;

  return [Math.min(255, qr), Math.min(255, qg), Math.min(255, qb)];
}

// Module-level reusable offscreen mini canvas to prevent GC pressure during live video loop
let cachedMiniCanvas: HTMLCanvasElement | null = null;
let cachedMiniCtx: CanvasRenderingContext2D | null = null;

function getMiniCanvas(width: number, height: number) {
  if (typeof document === "undefined") return null;
  if (!cachedMiniCanvas) {
    cachedMiniCanvas = document.createElement("canvas");
    cachedMiniCtx = cachedMiniCanvas.getContext("2d", { willReadFrequently: true });
  }
  if (cachedMiniCanvas.width !== width || cachedMiniCanvas.height !== height) {
    cachedMiniCanvas.width = width;
    cachedMiniCanvas.height = height;
    cachedMiniCtx = cachedMiniCanvas.getContext("2d", { willReadFrequently: true });
  }
  return { canvas: cachedMiniCanvas, ctx: cachedMiniCtx };
}

/**
 * Transforms an image element or canvas into pixel art on target 2D context
 */
export function drawPixelArt(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  dx: number,
  dy: number,
  dWidth: number,
  dHeight: number,
  options: PixelArtOptions = {}
) {
  const { palette = "arcade", pixelSize = "classic", dither = true } = options;

  let blockCols = 90;
  if (pixelSize === "fine") blockCols = 130;
  if (pixelSize === "chunky") blockCols = 54;

  const aspect = dWidth / dHeight;
  const lowW = blockCols;
  const lowH = Math.max(1, Math.round(lowW / aspect));

  const mini = getMiniCanvas(lowW, lowH);
  if (!mini || !mini.ctx) return;
  const { canvas: miniCanvas, ctx: miniCtx } = mini;

  // Draw source scaled down into low-res buffer
  miniCtx.drawImage(source, 0, 0, lowW, lowH);

  // Read pixel buffer and apply color quantization & ordered dithering
  const imgData = miniCtx.getImageData(0, 0, lowW, lowH);
  const data = imgData.data;

  for (let y = 0; y < lowH; y++) {
    for (let x = 0; x < lowW; x++) {
      const idx = (y * lowW + x) * 4;
      let r = data[idx];
      let g = data[idx + 1];
      let b = data[idx + 2];

      const ditherFactor = dither
        ? (BAYER_4X4[y % 4][x % 4] / 16) - 0.5
        : 0;

      let pr: number, pg: number, pb: number;

      if (palette === "gameboy") {
        const spread = 45;
        const adjR = r + ditherFactor * spread;
        const adjG = g + ditherFactor * spread;
        const adjB = b + ditherFactor * spread;
        [pr, pg, pb] = findClosestPaletteColor(adjR, adjG, adjB, GAMEBOY_PALETTE);
      } else if (palette === "pico8") {
        const spread = 35;
        const adjR = r + ditherFactor * spread;
        const adjG = g + ditherFactor * spread;
        const adjB = b + ditherFactor * spread;
        [pr, pg, pb] = findClosestPaletteColor(adjR, adjG, adjB, PICO8_PALETTE);
      } else if (palette === "cyberpunk") {
        const spread = 40;
        const adjR = r + ditherFactor * spread;
        const adjG = g + ditherFactor * spread;
        const adjB = b + ditherFactor * spread;
        [pr, pg, pb] = findClosestPaletteColor(adjR, adjG, adjB, CYBERPUNK_PALETTE);
      } else if (palette === "onebit") {
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const threshold = 128 + ditherFactor * 90;
        const val = lum >= threshold ? 250 : 15;
        pr = val;
        pg = val;
        pb = val;
      } else {
        [pr, pg, pb] = quantizeArcade(r, g, b, ditherFactor);
      }

      data[idx] = pr;
      data[idx + 1] = pg;
      data[idx + 2] = pb;
    }
  }

  miniCtx.putImageData(imgData, 0, 0);

  // Upscale mini canvas using Nearest-Neighbor interpolation (crisp pixel blocks)
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  (ctx as unknown as { webkitImageSmoothingEnabled?: boolean }).webkitImageSmoothingEnabled = false;
  (ctx as unknown as { mozImageSmoothingEnabled?: boolean }).mozImageSmoothingEnabled = false;
  (ctx as unknown as { msImageSmoothingEnabled?: boolean }).msImageSmoothingEnabled = false;

  ctx.drawImage(miniCanvas, 0, 0, lowW, lowH, dx, dy, dWidth, dHeight);
  ctx.restore();
}
