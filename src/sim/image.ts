import { NICHES } from './niches';
import { makeRng, randFloat, randInt, type Rng } from './rng';
import type { AvatarSpec, NicheId, StyleId } from './types';

/**
 * Prozedurale Bilderzeugung. Jedes Bild entsteht deterministisch aus seinem
 * Seed - nach dem Neuladen sieht derselbe Post exakt gleich aus.
 */

interface StyleSpec {
  /** Helligkeitsanhebung. */
  lift: number;
  /** Saettigung. */
  sat: number;
  /** Kontrast. */
  contrast: number;
  /** Farbstich als rgba-Overlay. */
  tint: string;
  /** Staerke der Filmkoernung. */
  grain: number;
  /** Staerke der Vignette. */
  vignette: number;
  /** Schwarzweiss. */
  mono?: boolean;
}

const STYLES: Record<StyleId, StyleSpec> = {
  vivid: { lift: 0.02, sat: 1.35, contrast: 1.12, tint: 'rgba(255,90,40,0.05)', grain: 0.05, vignette: 0.28 },
  film: { lift: 0.05, sat: 0.9, contrast: 0.95, tint: 'rgba(255,190,120,0.12)', grain: 0.16, vignette: 0.35 },
  mono: { lift: 0.03, sat: 0, contrast: 1.2, tint: 'rgba(255,255,255,0.03)', grain: 0.12, vignette: 0.42, mono: true },
  golden: { lift: 0.05, sat: 1.15, contrast: 1.05, tint: 'rgba(255,160,50,0.22)', grain: 0.07, vignette: 0.32 },
  studio: { lift: 0.07, sat: 1.05, contrast: 1.02, tint: 'rgba(255,255,255,0.1)', grain: 0.03, vignette: 0.12 },
  neon: { lift: -0.04, sat: 1.5, contrast: 1.25, tint: 'rgba(120,0,255,0.16)', grain: 0.09, vignette: 0.5 },
  pastel: { lift: 0.09, sat: 0.8, contrast: 0.9, tint: 'rgba(255,225,240,0.2)', grain: 0.05, vignette: 0.1 },
  moody: { lift: -0.1, sat: 0.95, contrast: 1.18, tint: 'rgba(10,20,60,0.22)', grain: 0.11, vignette: 0.55 },
};

export interface ImageOptions {
  seed: number;
  niche: NicheId;
  style: StyleId;
}

/** Zeichnet ein komplettes Beitragsbild in ein Canvas-Element. */
export function drawPostImage(canvas: HTMLCanvasElement, opts: ImageOptions) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const rng = makeRng(opts.seed);
  const niche = NICHES[opts.niche];
  const style = STYLES[opts.style] ?? STYLES.vivid;
  const palette = shiftPalette(niche.palette, rng, style);

  ctx.clearRect(0, 0, w, h);
  drawBackground(ctx, w, h, palette, rng, style);

  switch (niche.motif) {
    case 'mountain': drawMountain(ctx, w, h, palette, rng); break;
    case 'skyline': drawSkyline(ctx, w, h, palette, rng); break;
    case 'plate': drawPlate(ctx, w, h, palette, rng); break;
    case 'body': drawBody(ctx, w, h, palette, rng); break;
    case 'portrait': drawPortrait(ctx, w, h, palette, rng); break;
    case 'grid': drawGrid(ctx, w, h, palette, rng); break;
    case 'wave': drawWave(ctx, w, h, palette, rng); break;
    case 'creature': drawCreature(ctx, w, h, palette, rng); break;
    case 'stage': drawStage(ctx, w, h, palette, rng); break;
    case 'figure': drawFigure(ctx, w, h, palette, rng); break;
    default: drawAbstract(ctx, w, h, palette, rng); break;
  }

  drawBokeh(ctx, w, h, palette, rng);
  applyStyle(ctx, w, h, style, rng);
}

/* ------------------------------------------------------------------ */
/* Hintergrund & Nachbearbeitung                                       */
/* ------------------------------------------------------------------ */

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, palette: string[], rng: Rng, style: StyleSpec) {
  const g = ctx.createLinearGradient(0, 0, randFloat(rng, -0.3, 1.3) * w, h);
  g.addColorStop(0, palette[0]);
  g.addColorStop(0.55, palette[1]);
  g.addColorStop(1, palette[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Weiche Farbwolken - erzeugt die Anmutung eines Mesh-Gradienten.
  const blobs = randInt(rng, 2, 4);
  for (let i = 0; i < blobs; i++) {
    const x = randFloat(rng, 0, w);
    const y = randFloat(rng, 0, h);
    const r = randFloat(rng, w * 0.25, w * 0.7);
    const color = palette[randInt(rng, 0, palette.length - 1)];
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    // Farbe statt Helligkeit: sonst waschen sich die Bilder zu Weiss aus.
    rg.addColorStop(0, withAlpha(color, 0.3 + style.lift * 0.5));
    rg.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
  }
}

function applyStyle(ctx: CanvasRenderingContext2D, w: number, h: number, style: StyleSpec, rng: Rng) {
  if (style.mono) {
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = 'hsl(0,0%,50%)';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  } else if (style.sat > 1.1) {
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = `hsl(0,${Math.min(100, style.sat * 62)}%,50%)`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.fillStyle = style.tint;
  ctx.fillRect(0, 0, w, h);

  if (style.lift > 0) {
    ctx.fillStyle = `rgba(255,255,255,${style.lift * 0.9})`;
    ctx.fillRect(0, 0, w, h);
  } else if (style.lift < 0) {
    ctx.fillStyle = `rgba(0,0,0,${-style.lift * 1.6})`;
    ctx.fillRect(0, 0, w, h);
  }

  // Vignette
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, `rgba(0,0,0,${style.vignette})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  // Filmkoernung: einmal erzeugte Kachel, die ueber das Bild gelegt wird.
  // Eine Pixelschleife pro Bild waere auf langsamen Geraeten die teuerste
  // Operation der ganzen App.
  if (style.grain > 0.02) {
    const pattern = ctx.createPattern(grainTile(), 'repeat');
    if (pattern) {
      ctx.globalAlpha = style.grain * 0.55;
      ctx.fillStyle = pattern;
      // Versatz, damit nicht jedes Bild dieselbe Koernung an derselben Stelle hat.
      const ox = Math.floor(rng() * GRAIN_SIZE);
      const oy = Math.floor(rng() * GRAIN_SIZE);
      ctx.translate(-ox, -oy);
      ctx.fillRect(ox, oy, w + GRAIN_SIZE, h + GRAIN_SIZE);
      ctx.translate(ox, oy);
      ctx.globalAlpha = 1;
    }
  }
}

const GRAIN_SIZE = 128;
let grainCanvas: HTMLCanvasElement | undefined;

/** Erzeugt die Koernungskachel beim ersten Bedarf und behaelt sie. */
function grainTile(): HTMLCanvasElement {
  if (grainCanvas) return grainCanvas;
  const c = document.createElement('canvas');
  c.width = GRAIN_SIZE;
  c.height = GRAIN_SIZE;
  const g = c.getContext('2d');
  if (g) {
    const img = g.createImageData(GRAIN_SIZE, GRAIN_SIZE);
    const rng = makeRng(20240914);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rng();
      const on = v > 0.8;
      const bright = v > 0.93;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = bright ? 255 : 0;
      img.data[i + 3] = on ? 128 : 0;
    }
    g.putImageData(img, 0, 0);
  }
  grainCanvas = c;
  return c;
}

function drawBokeh(ctx: CanvasRenderingContext2D, w: number, h: number, palette: string[], rng: Rng) {
  const n = randInt(rng, 0, 5);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const x = randFloat(rng, 0, w);
    const y = randFloat(rng, 0, h * 0.7);
    const r = randFloat(rng, w * 0.015, w * 0.07);
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, withAlpha(palette[3], 0.3));
    rg.addColorStop(0.7, withAlpha(palette[3], 0.08));
    rg.addColorStop(1, withAlpha(palette[3], 0));
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

/* ------------------------------------------------------------------ */
/* Motive                                                              */
/* ------------------------------------------------------------------ */

/** Erzeugt eine natuerlich wirkende Kammlinie per Mittelpunktverschiebung. */
function ridgeLine(rng: Rng, width: number, baseY: number, amp: number, steps = 64): number[] {
  let points = [baseY + (rng() - 0.5) * amp, baseY - amp * (0.4 + rng() * 0.6), baseY + (rng() - 0.5) * amp];
  let displacement = amp * 0.55;
  while (points.length - 1 < steps) {
    const next: number[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      next.push(points[i]);
      next.push((points[i] + points[i + 1]) / 2 + (rng() - 0.5) * displacement);
    }
    next.push(points[points.length - 1]);
    points = next;
    displacement *= 0.55;
  }
  void width;
  return points;
}

function drawMountain(ctx: CanvasRenderingContext2D, w: number, h: number, palette: string[], rng: Rng) {
  const hasLake = rng() > 0.45;
  const horizon = hasLake ? h * 0.68 : h * 0.86;

  // Sonne
  const sunX = randFloat(rng, 0.2, 0.8) * w;
  const sunY = randFloat(rng, 0.14, 0.38) * h;
  const sunR = randFloat(rng, w * 0.04, w * 0.09);
  ctx.globalCompositeOperation = 'lighter';
  const sg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 5);
  sg.addColorStop(0, 'rgba(255,248,225,0.95)');
  sg.addColorStop(0.12, 'rgba(255,222,165,0.55)');
  sg.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';

  const layers = randInt(rng, 3, 5);
  const ridges: { points: number[]; color: string; baseY: number }[] = [];
  for (let l = 0; l < layers; l++) {
    const t = l / (layers - 1 || 1);
    const baseY = horizon - (1 - t) * h * 0.26;
    const amp = h * (0.19 - t * 0.09);
    const points = ridgeLine(rng, w, baseY, amp);
    const color = mix(palette[2], palette[0], 0.08 + t * 0.3);
    ridges.push({ points, color, baseY });

    ctx.beginPath();
    ctx.moveTo(0, points[0]);
    for (let i = 1; i < points.length; i++) ctx.lineTo((i / (points.length - 1)) * w, points[i]);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = withAlpha(color, 0.93 - t * 0.08);
    ctx.fill();

    // Dunstschicht vor jedem Kamm gibt Tiefe.
    if (l < layers - 1) {
      const hg = ctx.createLinearGradient(0, baseY - h * 0.04, 0, baseY + h * 0.1);
      hg.addColorStop(0, withAlpha(palette[3], 0));
      hg.addColorStop(1, withAlpha(palette[3], 0.13));
      ctx.fillStyle = hg;
      ctx.fillRect(0, baseY - h * 0.04, w, h * 0.14);
    }
  }

  if (hasLake) {
    // Wasserflaeche mit gespiegelten Kaemmen
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, horizon, w, h - horizon);
    ctx.clip();
    const wg = ctx.createLinearGradient(0, horizon, 0, h);
    wg.addColorStop(0, withAlpha(palette[1], 0.75));
    wg.addColorStop(1, withAlpha(palette[2], 0.95));
    ctx.fillStyle = wg;
    ctx.fillRect(0, horizon, w, h - horizon);

    ctx.globalAlpha = 0.3;
    for (const r of ridges) {
      ctx.beginPath();
      ctx.moveTo(0, 2 * horizon - r.points[0]);
      for (let i = 1; i < r.points.length; i++) {
        ctx.lineTo((i / (r.points.length - 1)) * w, 2 * horizon - r.points[i]);
      }
      ctx.lineTo(w, horizon);
      ctx.lineTo(0, horizon);
      ctx.closePath();
      ctx.fillStyle = r.color;
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Wellenlinien
    ctx.strokeStyle = withAlpha(palette[3], 0.28);
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 14; i++) {
      const y = horizon + Math.pow(i / 14, 1.6) * (h - horizon);
      ctx.beginPath();
      ctx.moveTo(randFloat(rng, 0, w * 0.4), y);
      ctx.lineTo(randFloat(rng, w * 0.5, w), y);
      ctx.stroke();
    }
    ctx.restore();
  } else if (rng() > 0.5) {
    // Nadelbaeume im Vordergrund
    ctx.fillStyle = 'rgba(12,20,16,0.88)';
    for (let i = 0; i < randInt(rng, 5, 14); i++) {
      const x = randFloat(rng, 0, w);
      const th = randFloat(rng, h * 0.09, h * 0.22);
      const tw = th * 0.32;
      ctx.beginPath();
      ctx.moveTo(x, h - th);
      ctx.lineTo(x + tw / 2, h);
      ctx.lineTo(x - tw / 2, h);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawSkyline(ctx: CanvasRenderingContext2D, w: number, h: number, palette: string[], rng: Rng) {
  // Abendhimmel als farbiger Verlauf hinter der Stadt
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.8);
  sky.addColorStop(0, withAlpha(mix(palette[2], '#000018', 0.35), 0.8));
  sky.addColorStop(0.62, withAlpha(palette[0], 0.55));
  sky.addColorStop(1, withAlpha(palette[3], 0.4));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h * 0.85);
  if (rng() > 0.5) {
    const sx = randFloat(rng, 0.15, 0.85) * w;
    const sy = h * randFloat(rng, 0.5, 0.66);
    ctx.globalCompositeOperation = 'lighter';
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, w * 0.3);
    sg.addColorStop(0, 'rgba(255,230,190,0.6)');
    sg.addColorStop(1, 'rgba(255,190,120,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }

  const rows = randInt(rng, 2, 3);
  for (let r = 0; r < rows; r++) {
    const t = r / rows;
    const baseY = h * (0.72 + t * 0.12);
    let x = -randFloat(rng, 0, 40);
    while (x < w) {
      const bw = randFloat(rng, w * 0.05, w * 0.14);
      const bh = randFloat(rng, h * 0.1, h * 0.38) * (1 - t * 0.35);
      const y = baseY - bh;
      ctx.fillStyle = withAlpha(mix(palette[2], '#05060a', 0.55 - t * 0.35), 0.97 - t * 0.12);
      ctx.fillRect(x, y, bw, bh + h);
      // Fenster
      const cols = Math.max(1, Math.floor(bw / 12));
      const rowsW = Math.max(1, Math.floor(bh / 16));
      for (let cx = 0; cx < cols; cx++) {
        for (let cy = 0; cy < rowsW; cy++) {
          if (rng() > 0.62) {
            ctx.fillStyle = `rgba(255,${randInt(rng, 190, 240)},${randInt(rng, 120, 200)},${randFloat(rng, 0.45, 0.95).toFixed(2)})`;
            ctx.fillRect(x + 5 + cx * 12, y + 7 + cy * 16, 4, 6);
          }
        }
      }
      x += bw + randFloat(rng, 3, 14);
    }
  }
}

function drawPlate(ctx: CanvasRenderingContext2D, w: number, h: number, palette: string[], rng: Rng) {
  // Tischplatte mit Holzmaserung
  const tableTop = h * randFloat(rng, 0.0, 0.25);
  ctx.fillStyle = withAlpha(mix(palette[2], '#3a2a20', 0.5), 0.55);
  ctx.fillRect(0, tableTop, w, h - tableTop);
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    const y = tableTop + (i / 9) * (h - tableTop) + randFloat(rng, -6, 6);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(w * 0.3, y + randFloat(rng, -5, 5), w * 0.7, y + randFloat(rng, -5, 5), w, y);
    ctx.stroke();
  }

  const variant = randInt(rng, 0, 2);
  const isBowl = variant === 1;
  const cx = w / 2 + randFloat(rng, -w * 0.05, w * 0.05);
  const cy = h / 2 + randFloat(rng, -h * 0.04, h * 0.06);
  const r = Math.min(w, h) * (variant === 1 ? randFloat(rng, 0.38, 0.46) : randFloat(rng, 0.29, 0.36));

  if (variant === 2) {
    // Zweiter, angeschnittener Teller am Rand
    drawDish(ctx, w * randFloat(rng, 0.78, 0.95), h * randFloat(rng, 0.12, 0.3), r * 0.7, palette, rng, false);
    // Besteck
    ctx.strokeStyle = 'rgba(225,225,232,0.75)';
    ctx.lineWidth = Math.max(3, r * 0.05);
    ctx.lineCap = 'round';
    const fx = cx - r * 1.35;
    ctx.beginPath();
    ctx.moveTo(fx, cy - r * 0.45);
    ctx.lineTo(fx, cy + r * 0.55);
    ctx.stroke();
  }

  drawDish(ctx, cx, cy, r, palette, rng, isBowl);
}

/** Einzelnes Gedeck: Teller oder Schale mit Speise. */
function drawDish(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  palette: string[],
  rng: Rng,
  isBowl: boolean,
) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.07, cy + r * 0.09, r * 1.04, r * 1.0, 0, 0, Math.PI * 2);
  ctx.fill();

  const ceramic = rng() > 0.7 ? mix(palette[2], '#ffffff', 0.75) : '#f7f3ee';
  const pg = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.08, cx, cy, r);
  pg.addColorStop(0, '#ffffff');
  pg.addColorStop(0.7, ceramic);
  pg.addColorStop(1, mix(ceramic, '#000000', 0.16));
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  if (isBowl) {
    // Innenschatten macht aus dem Teller eine Schale
    const ig = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 0.85);
    ig.addColorStop(0, 'rgba(0,0,0,0.05)');
    ig.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = ig;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = 'rgba(0,0,0,0.07)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Speise
  const spread = isBowl ? 0.62 : 0.66;
  const items = randInt(rng, 14, 26);
  for (let i = 0; i < items; i++) {
    const a = rng() * Math.PI * 2;
    const d = Math.pow(rng(), 0.55) * r * spread;
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d * 0.92;
    const s = randFloat(rng, r * 0.12, r * 0.3);
    ctx.fillStyle = withAlpha(palette[randInt(rng, 0, 1)], randFloat(rng, 0.7, 1));
    ctx.beginPath();
    ctx.ellipse(x, y, s, s * randFloat(rng, 0.55, 1), rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    // Glanzlicht auf der Speise
    if (rng() > 0.6) {
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath();
      ctx.ellipse(x - s * 0.25, y - s * 0.3, s * 0.3, s * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Kraeuter
  for (let i = 0; i < randInt(rng, 4, 11); i++) {
    const a = rng() * Math.PI * 2;
    const d = rng() * r * spread;
    ctx.fillStyle = `rgba(${randInt(rng, 70, 110)},${randInt(rng, 130, 170)},${randInt(rng, 55, 90)},0.9)`;
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * 0.05, r * 0.018, a, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBody(ctx: CanvasRenderingContext2D, w: number, h: number, palette: string[], rng: Rng) {
  // Lichtstrahlen als Hintergrunddynamik
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.translate(w * randFloat(rng, 0.2, 0.8), 0);
    ctx.rotate(randFloat(rng, -0.5, 0.5));
    const lg = ctx.createLinearGradient(0, 0, 0, h);
    lg.addColorStop(0, withAlpha(palette[3], 0.16));
    lg.addColorStop(1, withAlpha(palette[3], 0));
    ctx.fillStyle = lg;
    ctx.fillRect(-w * 0.03, 0, w * 0.06, h);
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';

  // Bodenschatten verankert die Figur im Raum
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.93, w * 0.2, h * 0.02, 0, 0, Math.PI * 2);
  ctx.fill();

  const cx = w * randFloat(rng, 0.44, 0.56);
  const baseY = h * 0.92;
  const s = h / 620;
  const dark = withAlpha(mix(palette[2], '#000000', 0.55), 0.94);
  const pose = randInt(rng, 0, 2);
  ctx.fillStyle = dark;
  ctx.strokeStyle = dark;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Kopf
  ctx.beginPath();
  ctx.ellipse(cx, baseY - 340 * s, 30 * s, 34 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  // Hals
  ctx.lineWidth = 18 * s;
  ctx.beginPath();
  ctx.moveTo(cx, baseY - 312 * s);
  ctx.lineTo(cx, baseY - 292 * s);
  ctx.stroke();

  // Oberkoerper mit V-Form
  ctx.beginPath();
  ctx.moveTo(cx - 76 * s, baseY - 286 * s);
  ctx.quadraticCurveTo(cx, baseY - 302 * s, cx + 76 * s, baseY - 286 * s);
  ctx.quadraticCurveTo(cx + 58 * s, baseY - 200 * s, cx + 42 * s, baseY - 128 * s);
  ctx.quadraticCurveTo(cx, baseY - 112 * s, cx - 42 * s, baseY - 128 * s);
  ctx.quadraticCurveTo(cx - 58 * s, baseY - 200 * s, cx - 76 * s, baseY - 286 * s);
  ctx.closePath();
  ctx.fill();

  // Beine
  ctx.lineWidth = 30 * s;
  ctx.beginPath();
  if (pose === 2) {
    // Ausfallschritt
    ctx.moveTo(cx - 26 * s, baseY - 126 * s);
    ctx.lineTo(cx - 90 * s, baseY - 40 * s);
    ctx.lineTo(cx - 96 * s, baseY);
    ctx.moveTo(cx + 26 * s, baseY - 126 * s);
    ctx.lineTo(cx + 70 * s, baseY - 60 * s);
    ctx.lineTo(cx + 74 * s, baseY);
  } else {
    ctx.moveTo(cx - 26 * s, baseY - 126 * s);
    ctx.lineTo(cx - 40 * s, baseY);
    ctx.moveTo(cx + 26 * s, baseY - 126 * s);
    ctx.lineTo(cx + 44 * s, baseY);
  }
  ctx.stroke();

  // Arme je nach Pose
  ctx.lineWidth = 24 * s;
  const shoulderY = baseY - 280 * s;
  ctx.beginPath();
  if (pose === 0) {
    // Hantel ueber Kopf
    ctx.moveTo(cx - 70 * s, shoulderY);
    ctx.lineTo(cx - 96 * s, shoulderY - 60 * s);
    ctx.lineTo(cx - 70 * s, shoulderY - 118 * s);
    ctx.moveTo(cx + 70 * s, shoulderY);
    ctx.lineTo(cx + 96 * s, shoulderY - 60 * s);
    ctx.lineTo(cx + 70 * s, shoulderY - 118 * s);
    ctx.stroke();
    ctx.lineWidth = 13 * s;
    ctx.beginPath();
    ctx.moveTo(cx - 150 * s, shoulderY - 118 * s);
    ctx.lineTo(cx + 150 * s, shoulderY - 118 * s);
    ctx.stroke();
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + side * 132 * s, shoulderY - 118 * s, 16 * s, 34 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (pose === 1) {
    // Kurzhanteln haengend
    ctx.moveTo(cx - 72 * s, shoulderY);
    ctx.lineTo(cx - 96 * s, shoulderY + 90 * s);
    ctx.moveTo(cx + 72 * s, shoulderY);
    ctx.lineTo(cx + 96 * s, shoulderY + 90 * s);
    ctx.stroke();
    for (const side of [-1, 1]) {
      ctx.fillRect(cx + side * 96 * s - 26 * s, shoulderY + 84 * s, 52 * s, 16 * s);
    }
  } else {
    // Arme in die Hueften
    ctx.moveTo(cx - 72 * s, shoulderY);
    ctx.lineTo(cx - 104 * s, shoulderY + 70 * s);
    ctx.lineTo(cx - 48 * s, shoulderY + 96 * s);
    ctx.moveTo(cx + 72 * s, shoulderY);
    ctx.lineTo(cx + 104 * s, shoulderY + 70 * s);
    ctx.lineTo(cx + 48 * s, shoulderY + 96 * s);
    ctx.stroke();
  }

  // Kantenlicht von hinten
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = withAlpha(palette[3], 0.35);
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.moveTo(cx + 74 * s, baseY - 286 * s);
  ctx.quadraticCurveTo(cx + 58 * s, baseY - 200 * s, cx + 42 * s, baseY - 128 * s);
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}

function drawPortrait(ctx: CanvasRenderingContext2D, w: number, h: number, palette: string[], rng: Rng) {
  const profile = rng() > 0.62;
  const cx = w * randFloat(rng, 0.36, 0.64);
  const cy = h * randFloat(rng, 0.4, 0.5);
  const r = Math.min(w, h) * randFloat(rng, 0.16, 0.22);
  const dir = rng() > 0.5 ? 1 : -1;

  // Farbiger Lichtkegel hinter der Person
  const bg = ctx.createRadialGradient(cx + r * dir * 0.6, cy - r * 0.4, r * 0.3, cx, cy, r * 3.4);
  bg.addColorStop(0, withAlpha(palette[0], 0.4));
  bg.addColorStop(1, withAlpha(palette[2], 0));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const skin = mix(palette[2], '#120a12', 0.45);
  const hair = mix(palette[2], '#000000', 0.62);
  ctx.fillStyle = withAlpha(skin, 0.95);

  // Schultern
  ctx.beginPath();
  ctx.moveTo(cx - r * 2.4, h);
  ctx.quadraticCurveTo(cx - r * 1.45, cy + r * 1.05, cx + (profile ? r * 0.2 : 0), cy + r * 1.0);
  ctx.quadraticCurveTo(cx + r * 1.45, cy + r * 1.05, cx + r * 2.4, h);
  ctx.closePath();
  ctx.fill();

  // Kopf
  ctx.beginPath();
  if (profile) {
    // Gesicht im Profil: Stirn, Nase, Kinn
    ctx.moveTo(cx - dir * r * 0.75, cy - r * 0.85);
    ctx.quadraticCurveTo(cx + dir * r * 0.75, cy - r * 0.95, cx + dir * r * 0.72, cy - r * 0.1);
    ctx.quadraticCurveTo(cx + dir * r * 0.95, cy + r * 0.02, cx + dir * r * 0.66, cy + r * 0.2);
    ctx.quadraticCurveTo(cx + dir * r * 0.72, cy + r * 0.62, cx + dir * r * 0.2, cy + r * 0.95);
    ctx.quadraticCurveTo(cx - dir * r * 0.6, cy + r * 1.05, cx - dir * r * 0.78, cy + r * 0.2);
    ctx.closePath();
  } else {
    ctx.ellipse(cx, cy, r * 0.74, r * 0.98, 0, 0, Math.PI * 2);
  }
  ctx.fill();

  // Frisur
  ctx.fillStyle = withAlpha(hair, 0.96);
  const style = randInt(rng, 0, 2);
  ctx.beginPath();
  ctx.ellipse(cx - (profile ? dir * r * 0.2 : 0), cy - r * 0.42, r * 0.88, r * 0.72, 0, Math.PI * 1.02, Math.PI * 1.98);
  ctx.fill();
  if (style === 0) {
    // lange Haare seitlich
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + side * r * 0.82, cy + r * 0.25, r * 0.26, r * 0.85, side * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (style === 1) {
    // Dutt
    ctx.beginPath();
    ctx.arc(cx - (profile ? dir * r * 0.75 : 0), cy - r * 1.05, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Streiflicht auf der Wange
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = withAlpha(palette[3], 0.2);
  ctx.beginPath();
  ctx.ellipse(cx + dir * r * 0.35, cy + r * 0.05, r * 0.26, r * 0.6, -dir * 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  // Kleidungsdetail
  ctx.fillStyle = withAlpha(mix(palette[0], '#000000', 0.25), 0.8);
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.5, cy + r * 1.05);
  ctx.lineTo(cx, cy + r * 1.7);
  ctx.lineTo(cx + r * 0.5, cy + r * 1.05);
  ctx.lineTo(cx + r * 0.9, h);
  ctx.lineTo(cx - r * 0.9, h);
  ctx.closePath();
  ctx.fill();
}

/** Ganzkoerper-Pose vor einer Studiowand - das klassische Mode-Foto. */
function drawFigure(ctx: CanvasRenderingContext2D, w: number, h: number, palette: string[], rng: Rng) {
  // Studiowand mit Bodenkante
  const floorY = h * randFloat(rng, 0.78, 0.88);
  ctx.fillStyle = withAlpha(mix(palette[1], '#ffffff', 0.35), 0.6);
  ctx.fillRect(0, 0, w, floorY);
  ctx.fillStyle = withAlpha(mix(palette[2], '#000000', 0.2), 0.55);
  ctx.fillRect(0, floorY, w, h - floorY);

  const cx = w * randFloat(rng, 0.4, 0.6);
  // Die Figur soll den Bildausschnitt fuellen wie in einem echten Lookbook.
  const s = h / 470;
  const headY = h * randFloat(rng, 0.12, 0.17);
  const hipY = floorY - 165 * s;
  const skin = mix(palette[2], '#1a1016', 0.4);
  const outfit = rng() > 0.5 ? mix(palette[0], '#000000', randFloat(rng, 0.1, 0.5)) : mix(palette[1], '#ffffff', randFloat(rng, 0, 0.4));
  const legwear = rng() > 0.5 ? outfit : mix(palette[2], '#000000', 0.3);

  // Schatten am Boden
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(cx, floorY + 6 * s, 90 * s, 12 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = withAlpha(skin, 0.95);
  ctx.strokeStyle = withAlpha(skin, 0.95);
  ctx.lineCap = 'round';

  // Kopf und Haare
  ctx.beginPath();
  ctx.ellipse(cx, headY, 26 * s, 31 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = withAlpha(mix(palette[2], '#000000', 0.6), 0.96);
  ctx.beginPath();
  ctx.ellipse(cx, headY - 10 * s, 30 * s, 28 * s, 0, Math.PI * 1.03, Math.PI * 1.97);
  ctx.fill();
  if (rng() > 0.45) {
    ctx.beginPath();
    ctx.ellipse(cx - 28 * s, headY + 26 * s, 12 * s, 40 * s, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 28 * s, headY + 26 * s, 12 * s, 40 * s, -0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // Beine
  ctx.strokeStyle = withAlpha(legwear, 0.95);
  ctx.lineWidth = 26 * s;
  const stance = randFloat(rng, 12, 40) * s;
  ctx.beginPath();
  ctx.moveTo(cx - 18 * s, hipY);
  ctx.lineTo(cx - stance, floorY);
  ctx.moveTo(cx + 18 * s, hipY);
  ctx.lineTo(cx + stance * 0.6, floorY);
  ctx.stroke();

  // Oberteil / Kleid
  const dress = rng() > 0.5;
  ctx.fillStyle = withAlpha(outfit, 0.96);
  ctx.beginPath();
  ctx.moveTo(cx - 58 * s, headY + 42 * s);
  ctx.quadraticCurveTo(cx, headY + 24 * s, cx + 58 * s, headY + 42 * s);
  if (dress) {
    ctx.quadraticCurveTo(cx + 70 * s, hipY, cx + 62 * s, hipY + 70 * s);
    ctx.lineTo(cx - 62 * s, hipY + 70 * s);
    ctx.quadraticCurveTo(cx - 70 * s, hipY, cx - 52 * s, headY + 42 * s);
  } else {
    ctx.lineTo(cx + 44 * s, hipY + 6 * s);
    ctx.lineTo(cx - 44 * s, hipY + 6 * s);
  }
  ctx.closePath();
  ctx.fill();

  // Arme
  ctx.strokeStyle = withAlpha(skin, 0.95);
  ctx.lineWidth = 19 * s;
  const armOut = randFloat(rng, 0.5, 1.4);
  ctx.beginPath();
  ctx.moveTo(cx - 48 * s, headY + 52 * s);
  ctx.lineTo(cx - 48 * s - 26 * s * armOut, hipY - 10 * s);
  ctx.moveTo(cx + 48 * s, headY + 52 * s);
  ctx.lineTo(cx + 48 * s + 18 * s * armOut, hipY - 30 * s);
  ctx.stroke();

  // Accessoire: Tasche oder Guertel
  ctx.fillStyle = withAlpha(mix(palette[0], '#000000', 0.45), 0.9);
  if (rng() > 0.5) {
    ctx.fillRect(cx - 74 * s * armOut - 16 * s, hipY - 24 * s, 32 * s, 26 * s);
  } else {
    ctx.fillRect(cx - 46 * s, hipY - 24 * s, 92 * s, 12 * s);
  }
}

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, palette: string[], rng: Rng) {
  const horizon = h * randFloat(rng, 0.42, 0.55);
  // Dunkler Boden unter dem Horizont, damit das Gitter Kontrast bekommt.
  const fg = ctx.createLinearGradient(0, horizon, 0, h);
  fg.addColorStop(0, withAlpha(mix(palette[2], '#000000', 0.5), 0.55));
  fg.addColorStop(1, withAlpha(mix(palette[2], '#000000', 0.75), 0.9));
  ctx.fillStyle = fg;
  ctx.fillRect(0, horizon, w, h - horizon);
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = withAlpha(palette[3], 0.55);
  ctx.lineWidth = 1.8;
  // Fluchtlinien
  const vp = w * randFloat(rng, 0.35, 0.65);
  for (let i = -12; i <= 12; i++) {
    ctx.beginPath();
    ctx.moveTo(vp + i * w * 0.14, horizon);
    ctx.lineTo(vp + i * w * 0.85, h);
    ctx.stroke();
  }
  for (let i = 0; i < 14; i++) {
    const t = Math.pow(i / 14, 2);
    const y = horizon + t * (h - horizon);
    ctx.globalAlpha = 0.16 + t * 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Leuchtender Horizont
  const hg = ctx.createLinearGradient(0, horizon - h * 0.06, 0, horizon + h * 0.01);
  hg.addColorStop(0, withAlpha(palette[3], 0));
  hg.addColorStop(1, withAlpha(palette[3], 0.7));
  ctx.fillStyle = hg;
  ctx.fillRect(0, horizon - h * 0.06, w, h * 0.07);
  ctx.globalCompositeOperation = 'source-over';

  // Schwebende Panels wie geoeffnete Fenster
  for (let i = 0; i < randInt(rng, 2, 5); i++) {
    const bw = randFloat(rng, w * 0.16, w * 0.34);
    const bh = bw * randFloat(rng, 0.5, 0.8);
    const x = randFloat(rng, w * 0.05, w * 0.95 - bw);
    const y = randFloat(rng, h * 0.06, horizon - bh * 0.6);
    ctx.fillStyle = withAlpha(mix(palette[2], '#000000', 0.4), 0.72);
    ctx.fillRect(x, y, bw, bh);
    ctx.strokeStyle = withAlpha(palette[3], 0.55);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, bw, bh);
    // Titelleiste und Textzeilen
    ctx.fillStyle = withAlpha(palette[0], 0.6);
    ctx.fillRect(x, y, bw, bh * 0.12);
    ctx.fillStyle = withAlpha(palette[3], 0.4);
    for (let l = 0; l < Math.floor(bh / 14); l++) {
      ctx.fillRect(x + bw * 0.07, y + bh * 0.24 + l * 13, bw * randFloat(rng, 0.2, 0.78), 4);
    }
  }
}

function drawWave(ctx: CanvasRenderingContext2D, w: number, h: number, palette: string[], rng: Rng) {
  const bands = randInt(rng, 4, 8);
  for (let i = 0; i < bands; i++) {
    const t = i / bands;
    const amp = randFloat(rng, h * 0.03, h * 0.12);
    const freq = randFloat(rng, 1.2, 3.5);
    const phase = rng() * Math.PI * 2;
    const y0 = h * (0.2 + t * 0.7);
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) {
      ctx.lineTo(x, y0 + Math.sin((x / w) * Math.PI * 2 * freq + phase) * amp);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = withAlpha(mix(palette[i % 3], palette[(i + 1) % 3], t), 0.45);
    ctx.fill();
  }
}

function drawCreature(ctx: CanvasRenderingContext2D, w: number, h: number, palette: string[], rng: Rng) {
  const cx = w * randFloat(rng, 0.4, 0.6);
  const cy = h * randFloat(rng, 0.52, 0.6);
  const r = Math.min(w, h) * randFloat(rng, 0.15, 0.19);
  const fur = mix(palette[0], palette[2], randFloat(rng, 0.2, 0.6));

  // Koerper
  ctx.fillStyle = withAlpha(fur, 0.95);
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 1.25, r * 1.25, r * 0.95, 0, 0, Math.PI * 2);
  ctx.fill();
  // Kopf
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r * 0.92, 0, 0, Math.PI * 2);
  ctx.fill();
  // Ohren
  const pointy = rng() > 0.5;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    if (pointy) {
      ctx.moveTo(cx + side * r * 0.5, cy - r * 0.6);
      ctx.lineTo(cx + side * r * 0.95, cy - r * 1.35);
      ctx.lineTo(cx + side * r * 1.0, cy - r * 0.35);
    } else {
      ctx.ellipse(cx + side * r * 0.85, cy - r * 0.25, r * 0.3, r * 0.55, side * 0.3, 0, Math.PI * 2);
    }
    ctx.closePath();
    ctx.fill();
  }
  // Schnauze
  ctx.fillStyle = withAlpha(mix(fur, '#ffffff', 0.55), 0.95);
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.42, r * 0.45, r * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  // Augen und Nase
  ctx.fillStyle = 'rgba(25,20,18,0.92)';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + side * r * 0.38, cy - r * 0.1, r * 0.11, r * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.26, r * 0.15, r * 0.11, 0, 0, Math.PI * 2);
  ctx.fill();
  // Lichtpunkte in den Augen
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(cx + side * r * 0.34, cy - r * 0.15, r * 0.04, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawStage(ctx: CanvasRenderingContext2D, w: number, h: number, palette: string[], rng: Rng) {
  ctx.globalCompositeOperation = 'lighter';
  const cones = randInt(rng, 2, 4);
  for (let i = 0; i < cones; i++) {
    const topX = randFloat(rng, 0.1, 0.9) * w;
    const spread = randFloat(rng, w * 0.12, w * 0.3);
    const g = ctx.createLinearGradient(topX, 0, topX, h * 0.85);
    const c = palette[randInt(rng, 0, 3)];
    g.addColorStop(0, withAlpha(c, 0.55));
    g.addColorStop(1, withAlpha(c, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(topX - w * 0.015, 0);
    ctx.lineTo(topX + w * 0.015, 0);
    ctx.lineTo(topX + spread, h * 0.85);
    ctx.lineTo(topX - spread, h * 0.85);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  // Publikum als Silhouette
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(0, h * 0.86, w, h * 0.14);
  for (let i = 0; i < 26; i++) {
    const x = randFloat(rng, 0, w);
    const r = randFloat(rng, w * 0.015, w * 0.035);
    ctx.beginPath();
    ctx.arc(x, h * (0.86 + rng() * 0.05), r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - r, h * 0.87, r * 2, h * 0.13);
  }
  // Person auf der Buehne
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  const px = w * randFloat(rng, 0.35, 0.65);
  ctx.beginPath();
  ctx.arc(px, h * 0.6, w * 0.035, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(px - w * 0.04, h * 0.64, w * 0.08, h * 0.22);
}

function drawAbstract(ctx: CanvasRenderingContext2D, w: number, h: number, palette: string[], rng: Rng) {
  // Dominante Grundform gibt der Komposition einen Mittelpunkt.
  const fx = w * randFloat(rng, 0.3, 0.7);
  const fy = h * randFloat(rng, 0.35, 0.65);
  const fr = Math.min(w, h) * randFloat(rng, 0.22, 0.34);
  ctx.fillStyle = withAlpha(mix(palette[0], palette[2], 0.25), 0.88);
  ctx.beginPath();
  if (rng() > 0.5) {
    ctx.arc(fx, fy, fr, 0, Math.PI * 2);
  } else {
    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate(randFloat(rng, -0.6, 0.6));
    ctx.rect(-fr, -fr * randFloat(rng, 0.6, 1.1), fr * 2, fr * randFloat(rng, 1.2, 2));
    ctx.restore();
  }
  ctx.fill();

  const shapes = randInt(rng, 4, 8);
  for (let i = 0; i < shapes; i++) {
    const x = randFloat(rng, 0, w);
    const y = randFloat(rng, 0, h);
    const r = randFloat(rng, w * 0.1, w * 0.3);
    ctx.fillStyle = withAlpha(palette[randInt(rng, 0, 3)], randFloat(rng, 0.5, 0.92));
    ctx.beginPath();
    if (rng() > 0.45) {
      // Organische Blob-Form aus verschobenen Kontrollpunkten
      const points = randInt(rng, 5, 9);
      for (let p = 0; p <= points; p++) {
        const a = (p / points) * Math.PI * 2;
        const rr = r * randFloat(rng, 0.6, 1.25);
        const px = x + Math.cos(a) * rr;
        const py = y + Math.sin(a) * rr * 0.9;
        if (p === 0) ctx.moveTo(px, py);
        else ctx.quadraticCurveTo(x + Math.cos(a - 0.3) * rr * 1.2, y + Math.sin(a - 0.3) * rr * 1.2, px, py);
      }
    } else {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rng() * Math.PI);
      ctx.rect(-r / 2, -r / 2, r, r * randFloat(rng, 0.3, 1.4));
      ctx.restore();
    }
    ctx.closePath();
    ctx.fill();
  }
  // Kraeftige Linien als grafische Struktur
  ctx.strokeStyle = withAlpha(mix(palette[2], '#000000', 0.4), 0.55);
  ctx.lineWidth = randFloat(rng, 2, 6);
  for (let i = 0; i < randInt(rng, 2, 7); i++) {
    ctx.beginPath();
    ctx.moveTo(randFloat(rng, 0, w), randFloat(rng, 0, h));
    ctx.lineTo(randFloat(rng, 0, w), randFloat(rng, 0, h));
    ctx.stroke();
  }
}

/* ------------------------------------------------------------------ */
/* Avatare & Farbwerkzeuge                                             */
/* ------------------------------------------------------------------ */

/** Zeichnet einen Avatar: Farbverlauf, Muster und Initialen. */
export function drawAvatar(canvas: HTMLCanvasElement, spec: AvatarSpec) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const s = canvas.width;
  const rng = makeRng(spec.seed);
  ctx.clearRect(0, 0, s, s);

  const g = ctx.createLinearGradient(0, 0, s, s);
  g.addColorStop(0, `hsl(${spec.hue},72%,58%)`);
  g.addColorStop(1, `hsl(${spec.hue2},68%,42%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);

  ctx.globalAlpha = 0.35;
  ctx.fillStyle = `hsl(${(spec.hue + 180) % 360},70%,70%)`;
  for (let i = 0; i < 3 + (spec.shape % 3); i++) {
    ctx.beginPath();
    const x = randFloat(rng, 0, s);
    const y = randFloat(rng, 0, s);
    const r = randFloat(rng, s * 0.15, s * 0.5);
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `600 ${Math.round(s * 0.4)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(spec.initials, s / 2, s / 2 + s * 0.02);
}

/** Verschiebt die Nischenpalette leicht, damit nicht alle Bilder gleich wirken. */
function shiftPalette(palette: string[], rng: Rng, style: StyleSpec): string[] {
  const shift = randInt(rng, -18, 18);
  return palette.map((c, i) => {
    const { h, s, l } = hexToHsl(c);
    const nh = (h + shift + 360) % 360;
    const ns = Math.max(0, Math.min(100, s * (style.mono ? 0.15 : style.sat)));
    const nl = Math.max(4, Math.min(96, l + style.lift * 100 * (i === 2 ? -0.5 : 1)));
    return `hsl(${nh},${ns.toFixed(0)}%,${nl.toFixed(0)}%)`;
  });
}

function withAlpha(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  if (color.startsWith('hsl(')) return color.replace('hsl(', 'hsla(').replace(')', `,${a})`);
  if (color.startsWith('#')) {
    const { r, g, b } = hexToRgb(color);
    return `rgba(${r},${g},${b},${a})`;
  }
  return color;
}

function mix(a: string, b: string, t: number): string {
  const ca = toRgb(a);
  const cb = toRgb(b);
  return `rgb(${Math.round(ca.r + (cb.r - ca.r) * t)},${Math.round(ca.g + (cb.g - ca.g) * t)},${Math.round(ca.b + (cb.b - ca.b) * t)})`;
}

function toRgb(color: string): { r: number; g: number; b: number } {
  if (color.startsWith('#')) return hexToRgb(color);
  const m = color.match(/hsla?\(([-\d.]+),\s*([\d.]+)%,\s*([\d.]+)%/);
  if (m) return hslToRgb(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
  const r = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (r) return { r: +r[1], g: +r[2], b: +r[3] };
  return { r: 128, g: 128, b: 128 };
}

function hexToRgb(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function hexToHsl(hex: string) {
  const { r, g, b } = hex.startsWith('#') ? hexToRgb(hex) : toRgb(hex);
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: l * 100 };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rr) h = ((gg - bb) / d) % 6;
  else if (max === gg) h = (bb - rr) / d + 2;
  else h = (rr - gg) / d + 4;
  return { h: ((h * 60) + 360) % 360, s: s * 100, l: l * 100 };
}

function hslToRgb(h: number, s: number, l: number) {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}
