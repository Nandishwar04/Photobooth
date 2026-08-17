import type { SignedPhoto } from "@/types/photobooth";

/**
 * Composes the final vertical photobooth strip entirely in the browser
 * via Canvas, from the 8 already-captured shots (4 host + 4 guest). Runs
 * only on the HOST device once a round finalizes. Keeping composition
 * client-side avoids needing a server-side image stack (e.g. `canvas`'s
 * native bindings) that's awkward to run reliably in Vercel's serverless
 * functions.
 */

const STRIP_WIDTH = 960;
const OUTER_PADDING = 56;
const HEADER_HEIGHT = 220;
const FOOTER_HEIGHT = 200;
const ROW_GAP = 28;
const PHOTO_GAP = 20;
const PHOTO_HEIGHT = 340;
const CORNER_RADIUS = 18;

const COLORS = {
  paper: "#FFF8F2",
  ink: "#2B2523",
  blush: "#E8A7B8",
  rose: "#C9788F",
  cream: "#FFFDF9",
  umber: "#806C63",
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load a photo for the strip."));
    img.src = url;
  });
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const imgRatio = img.width / img.height;
  const boxRatio = w / h;
  let sx = 0,
    sy = 0,
    sw = img.width,
    sh = img.height;

  if (imgRatio > boxRatio) {
    sw = img.height * boxRatio;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / boxRatio;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function drawHeart(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  const topCurveHeight = size * 0.3;
  ctx.moveTo(cx, cy + topCurveHeight);
  ctx.bezierCurveTo(cx, cy, cx - size / 2, cy, cx - size / 2, cy + topCurveHeight);
  ctx.bezierCurveTo(
    cx - size / 2,
    cy + (size + topCurveHeight) / 2,
    cx,
    cy + (size + topCurveHeight) / 1.3,
    cx,
    cy + size
  );
  ctx.bezierCurveTo(
    cx,
    cy + (size + topCurveHeight) / 1.3,
    cx + size / 2,
    cy + (size + topCurveHeight) / 2,
    cx + size / 2,
    cy + topCurveHeight
  );
  ctx.bezierCurveTo(cx + size / 2, cy, cx, cy, cx, cy + topCurveHeight);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const angle = (Math.PI / 2) * i;
    ctx.moveTo(cx, cy);
    ctx.quadraticCurveTo(
      cx + Math.cos(angle + 0.4) * size * 0.3,
      cy + Math.sin(angle + 0.4) * size * 0.3,
      cx + Math.cos(angle) * size,
      cy + Math.sin(angle) * size
    );
    ctx.quadraticCurveTo(
      cx + Math.cos(angle - 0.4) * size * 0.3,
      cy + Math.sin(angle - 0.4) * size * 0.3,
      cx,
      cy
    );
  }
  ctx.fill();
  ctx.restore();
}

function applyFilmGrain(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 14;
    data[i] = Math.min(255, Math.max(0, (data[i] ?? 0) + noise));
    data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] ?? 0) + noise));
    data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] ?? 0) + noise));
  }
  ctx.putImageData(imageData, 0, 0);
}

async function ensureFontsLoaded() {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  await Promise.all([
    document.fonts.load('600 46px "Playfair Display"'),
    document.fonts.load('600 40px "Playfair Display"'),
    document.fonts.load('500 30px "Caveat"'),
  ]).catch(() => undefined);
}

export async function composePhotoStrip(photos: SignedPhoto[]): Promise<Blob> {
  await ensureFontsLoaded();
  const shotNumbers = Array.from(new Set(photos.map((p) => p.shotNumber))).sort((a, b) => a - b);
  const rowCount = shotNumbers.length;

  const height =
    OUTER_PADDING * 2 +
    HEADER_HEIGHT +
    rowCount * PHOTO_HEIGHT +
    (rowCount - 1) * ROW_GAP +
    FOOTER_HEIGHT;

  const canvas = document.createElement("canvas");
  canvas.width = STRIP_WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported.");

  // Background
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(0, 0, STRIP_WIDTH, height);

  // Outer card
  drawRoundedRect(ctx, 16, 16, STRIP_WIDTH - 32, height - 32, 28);
  ctx.fillStyle = COLORS.cream;
  ctx.fill();
  ctx.save();
  ctx.shadowColor = "rgba(43, 37, 35, 0.18)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  drawRoundedRect(ctx, 16, 16, STRIP_WIDTH - 32, height - 32, 28);
  ctx.fillStyle = COLORS.cream;
  ctx.fill();
  ctx.restore();

  // Header
  const fontDisplay = (px: number) => `600 ${px}px "Playfair Display", serif`;
  const fontHand = (px: number) => `500 ${px}px "Caveat", cursive`;

  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.ink;
  ctx.font = fontDisplay(46);
  ctx.fillText("OUR LITTLE DAY", STRIP_WIDTH / 2, OUTER_PADDING + 78);

  drawHeart(ctx, STRIP_WIDTH / 2, OUTER_PADDING + 100, 26, COLORS.rose);

  ctx.font = fontHand(30);
  ctx.fillStyle = COLORS.umber;
  ctx.fillText("captured, just for us", STRIP_WIDTH / 2, OUTER_PADDING + 168);

  // Rows
  const contentWidth = STRIP_WIDTH - OUTER_PADDING * 2;
  const photoWidth = (contentWidth - PHOTO_GAP) / 2;

  let rowY = OUTER_PADDING + HEADER_HEIGHT;
  for (const shotNumber of shotNumbers) {
    const host = photos.find((p) => p.role === "HOST" && p.shotNumber === shotNumber);
    const guest = photos.find((p) => p.role === "GUEST" && p.shotNumber === shotNumber);
    if (!host || !guest) continue;

    const [hostImg, guestImg] = await Promise.all([loadImage(host.url), loadImage(guest.url)]);

    const leftX = OUTER_PADDING;
    const rightX = OUTER_PADDING + photoWidth + PHOTO_GAP;

    for (const [img, x] of [
      [hostImg, leftX],
      [guestImg, rightX],
    ] as const) {
      ctx.save();
      drawRoundedRect(ctx, x, rowY, photoWidth, PHOTO_HEIGHT, CORNER_RADIUS);
      ctx.clip();
      drawCoverImage(ctx, img, x, rowY, photoWidth, PHOTO_HEIGHT);
      ctx.restore();

      ctx.save();
      drawRoundedRect(ctx, x, rowY, photoWidth, PHOTO_HEIGHT, CORNER_RADIUS);
      ctx.lineWidth = 3;
      ctx.strokeStyle = COLORS.cream;
      ctx.stroke();
      ctx.restore();
    }

    rowY += PHOTO_HEIGHT + ROW_GAP;
  }

  // Footer
  const footerCenterY = rowY + FOOTER_HEIGHT / 2 - 10;
  ctx.fillStyle = COLORS.ink;
  ctx.font = fontDisplay(40);
  ctx.fillText("HAPPY BIRTHDAY", STRIP_WIDTH / 2, footerCenterY);
  drawHeart(ctx, STRIP_WIDTH / 2, footerCenterY + 24, 24, COLORS.blush);

  drawStar(ctx, OUTER_PADDING + 20, OUTER_PADDING + 40, 10, COLORS.blush);
  drawStar(ctx, STRIP_WIDTH - OUTER_PADDING - 20, OUTER_PADDING + 40, 8, COLORS.rose);
  drawStar(ctx, OUTER_PADDING + 24, height - OUTER_PADDING - 30, 9, COLORS.rose);
  drawStar(ctx, STRIP_WIDTH - OUTER_PADDING - 24, height - OUTER_PADDING - 30, 11, COLORS.blush);

  applyFilmGrain(ctx, STRIP_WIDTH, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not render the photo strip."))),
      "image/jpeg",
      0.92
    );
  });
}
