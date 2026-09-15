/**
 * Erzeugt die App-Icons. Gezeichnet wird im Browser (Canvas), damit
 * Verlaeufe und Rundungen sauber aussehen; die Ergebnisse liegen danach als
 * PNG im Projekt und werden mit eingecheckt.
 *
 * Aufruf: node scripts/make-icons.mjs   (benoetigt playwright)
 */
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const SIZES = [
  { size: 192, file: 'icon-192.png', padding: 0 },
  { size: 512, file: 'icon-512.png', padding: 0 },
  { size: 180, file: 'icon-180.png', padding: 0 },
  // Fuer Android-Icons, die zugeschnitten werden koennen.
  { size: 512, file: 'icon-maskable-512.png', padding: 0.18 },
  { size: 32, file: 'favicon-32.png', padding: 0 },
];

const draw = `(size, padding) => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const pad = size * padding;
  const box = size - pad * 2;
  const radius = padding > 0 ? box * 0.5 : box * 0.235;

  // Hintergrund im Farbverlauf der App
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  const grad = ctx.createLinearGradient(pad, pad, pad + box, pad + box);
  grad.addColorStop(0, '#f9ce34');
  grad.addColorStop(0.5, '#ee2a7b');
  grad.addColorStop(1, '#6228d7');
  ctx.beginPath();
  ctx.roundRect(pad, pad, box, box, radius);
  ctx.fillStyle = grad;
  ctx.fill();

  // Kamera-Umriss
  const cx = size / 2;
  const cy = size / 2;
  const line = box * 0.072;
  ctx.strokeStyle = 'rgba(255,255,255,0.97)';
  ctx.lineWidth = line;
  ctx.beginPath();
  ctx.roundRect(cx - box * 0.29, cy - box * 0.29, box * 0.58, box * 0.58, box * 0.18);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, box * 0.155, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + box * 0.19, cy - box * 0.19, line * 0.62, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.97)';
  ctx.fill();

  return canvas.toDataURL('image/png');
}`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
await page.goto('about:blank');
for (const { size, file, padding } of SIZES) {
  const dataUrl = await page.evaluate(`(${draw})(${size}, ${padding})`);
  writeFileSync(`public/icons/${file}`, Buffer.from(String(dataUrl).split(',')[1], 'base64'));
  console.log('geschrieben:', file, size + 'px');
}
await browser.close();
