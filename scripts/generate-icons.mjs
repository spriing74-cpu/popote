// Génère les icônes PNG de la PWA sans dépendance externe (encodeur PNG minimal).
// Usage : npm run icons
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const BG = [31, 78, 95];
const PLATE = [247, 243, 238];
const RIM = [224, 122, 63];
const FORK = [31, 78, 95];

function crcTable() {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
}
const CRC = crcTable();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Couleur d'un point (coordonnées normalisées 0..1). */
function colorAt(x, y, scale) {
  const cx = 0.5, cy = 0.5;
  const d = Math.hypot(x - cx, y - cy);
  const r = 0.34 * scale;
  // fourchette stylisée (manche + 3 dents) au centre de l'assiette
  const fx = (x - cx) / scale, fy = (y - cy) / scale;
  const handle = Math.abs(fx) < 0.025 && fy > -0.02 && fy < 0.2;
  const head = fy > -0.08 && fy <= -0.02 && Math.abs(fx) < 0.07;
  const tines = fy > -0.2 && fy <= -0.08 && (Math.abs(fx) < 0.015 || Math.abs(Math.abs(fx) - 0.05) < 0.015);
  if (d < r * 0.78 && (handle || head || tines)) return FORK;
  if (d < r * 0.78) return PLATE;
  if (d < r * 0.86) return RIM;
  if (d < r) return PLATE;
  return BG;
}

function png(size, scale) {
  const ss = 3; // suréchantillonnage pour l'anticrénelage
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const c = colorAt((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size, scale);
          r += c[0]; g += c[1]; b += c[2];
        }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = Math.round(r / ss / ss);
      raw[o + 1] = Math.round(g / ss / ss);
      raw[o + 2] = Math.round(b / ss / ss);
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync(join(outDir, 'icon-192.png'), png(192, 1.15));
writeFileSync(join(outDir, 'icon-512.png'), png(512, 1.15));
writeFileSync(join(outDir, 'icon-maskable-512.png'), png(512, 0.95));
writeFileSync(join(outDir, 'apple-touch-icon.png'), png(180, 1.15));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="14" fill="rgb(${BG})"/>
<circle cx="32" cy="32" r="25" fill="rgb(${PLATE})"/>
<circle cx="32" cy="32" r="21.5" fill="rgb(${RIM})"/>
<circle cx="32" cy="32" r="19.5" fill="rgb(${PLATE})"/>
<path d="M27 17v10h10V17M32 17v27" stroke="rgb(${FORK})" stroke-width="2.4" fill="none" stroke-linecap="round"/>
</svg>`;
writeFileSync(join(outDir, 'favicon.svg'), svg);
console.log('Icônes générées dans', outDir);
