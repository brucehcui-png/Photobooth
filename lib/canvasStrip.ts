// High-resolution photo booth strip generator with Pixel Art transformation

import {
  drawPixelArt,
  PixelArtPalette,
  PixelSize,
} from "./pixelArt";

export interface StripOptions {
  palette?: PixelArtPalette;
  pixelSize?: PixelSize;
  dither?: boolean;
  stripColor?: "white" | "black";
  dateText?: string;
}

export async function createPhotoStrip(
  photoDataUrls: string[],
  options: StripOptions = {}
): Promise<{ blob: Blob; dataUrl: string }> {
  const {
    palette = "arcade",
    pixelSize = "classic",
    dither = true,
    stripColor = "white",
    dateText = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    }).toUpperCase(),
  } = options;

  // Load all 4 photos as Image objects
  const images = await Promise.all(
    photoDataUrls.map(
      (src) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        })
    )
  );

  // Dimensions (crisp high-res output: 800px width)
  const stripWidth = 800;
  const paddingX = 40;
  const paddingTop = 48;
  const gap = 32;
  const photoWidth = stripWidth - paddingX * 2; // 720px
  const photoHeight = Math.round(photoWidth * (3 / 4)); // 540px (classic 4:3 photo ratio)
  const footerHeight = 150;

  const totalHeight =
    paddingTop +
    images.length * photoHeight +
    (images.length - 1) * gap +
    footerHeight;

  const canvas = document.createElement("canvas");
  canvas.width = stripWidth;
  canvas.height = totalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  if (!ctx) {
    throw new Error("Unable to obtain 2D canvas context");
  }

  // 1. Draw Strip Background (White border / paper)
  const isWhite = stripColor === "white";
  ctx.fillStyle = isWhite ? "#FFFFFF" : "#121214";
  ctx.fillRect(0, 0, stripWidth, totalHeight);

  // Pixelated border accent along edge of strip
  if (isWhite) {
    ctx.strokeStyle = "#E2E2E2";
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, stripWidth - 4, totalHeight - 4);
  }

  // 2. Draw each of the 4 photos transformed into Pixel Art
  images.forEach((img, index) => {
    const y = paddingTop + index * (photoHeight + gap);
    const x = paddingX;

    // Draw photo placeholder background
    ctx.fillStyle = isWhite ? "#EFEFEF" : "#1F1F23";
    ctx.fillRect(x, y, photoWidth, photoHeight);

    // Compute center-crop (cover) onto a temporary cropped canvas first
    const imgAspect = img.width / img.height;
    const targetAspect = photoWidth / photoHeight;

    let sx = 0;
    let sy = 0;
    let sw = img.width;
    let sh = img.height;

    if (imgAspect > targetAspect) {
      sw = img.height * targetAspect;
      sx = (img.width - sw) / 2;
    } else {
      sh = img.width / targetAspect;
      sy = (img.height - sh) / 2;
    }

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = photoWidth;
    cropCanvas.height = photoHeight;
    const cropCtx = cropCanvas.getContext("2d");
    if (cropCtx) {
      cropCtx.drawImage(img, sx, sy, sw, sh, 0, 0, photoWidth, photoHeight);

      // Render as Pixel Art into the main canvas!
      drawPixelArt(ctx, cropCanvas, x, y, photoWidth, photoHeight, {
        palette,
        pixelSize,
        dither,
      });
    }

    // Outer pixel frame border around each photo
    ctx.strokeStyle = isWhite ? "rgba(0, 0, 0, 0.15)" : "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, photoWidth, photoHeight);
  });

  // 3. Draw Retro Pixel Art Photobooth Footer
  const footerCenterY = totalHeight - footerHeight / 2 - 8;
  const textColor = isWhite ? "#1A1A1A" : "#FFFFFF";
  const subTextColor = isWhite ? "#666666" : "#A3A3A3";

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Main Photobooth title with pixel vibe
  ctx.fillStyle = textColor;
  ctx.font = "900 24px -apple-system, BlinkMacSystemFont, 'SF Pro Display', monospace, sans-serif";
  ctx.letterSpacing = "6px";
  ctx.fillText("👾  P I X E L  B O O T H  👾", stripWidth / 2, footerCenterY - 20);

  // Date stamp
  ctx.fillStyle = subTextColor;
  ctx.font = "700 15px -apple-system, BlinkMacSystemFont, monospace, sans-serif";
  ctx.letterSpacing = "3px";
  ctx.fillText(dateText, stripWidth / 2, footerCenterY + 14);

  // 8-bit stamp info
  ctx.fillStyle = isWhite ? "#8A8A8A" : "#777777";
  ctx.font = "600 12px -apple-system, BlinkMacSystemFont, monospace, sans-serif";
  ctx.letterSpacing = "2px";
  const paletteLabel = palette.toUpperCase();
  ctx.fillText(`8-BIT RETRO • ${paletteLabel} • 4 SHOTS`, stripWidth / 2, footerCenterY + 40);

  // 4. Export as PNG Blob
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("Canvas toBlob failed"));
      },
      "image/png",
      0.95
    );
  });

  const dataUrl = canvas.toDataURL("image/png", 0.95);

  return { blob, dataUrl };
}
