/**
 * Generates placeholder tray icons for the Electron app.
 * Uses only Node.js built-ins — no external dependencies.
 * Run once from repo root: node frontend/scripts/generate-icons.mjs
 * Output: frontend/electron/assets/tray-icon.png  (256×256 solid VETA blue)
 *         frontend/electron/assets/tray-icon.ico  (ICO wrapping a 16×16 PNG frame)
 */

import { writeFileSync } from "fs";
import { deflateSync } from "zlib";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, "../electron/assets");

// ── CRC-32 ────────────────────────────────────────────────────────────────────

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[i] = c;
}
function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// ── PNG builder ───────────────────────────────────────────────────────────────

function u32be(n) {
  const b = Buffer.allocUnsafe(4);
  b.writeUInt32BE(n, 0);
  return b;
}

function pngChunk(tag, data) {
  const t = Buffer.from(tag);
  const d = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return Buffer.concat([
    u32be(d.length),
    t,
    d,
    u32be(crc32(Buffer.concat([t, d]))),
  ]);
}

function makePNG(w, h, r, g, b) {
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB colour type
  ihdr[10] = ihdr[11] = ihdr[12] = 0;

  const row = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x++) {
    row[1 + x * 3] = r;
    row[2 + x * 3] = g;
    row[3 + x * 3] = b;
  }
  const raw = Buffer.concat(Array(h).fill(row));

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── ICO builder (embeds a PNG frame) ─────────────────────────────────────────

function makeICO(pngData, size) {
  // ICONDIR: reserved(2) + type(2)=1 + count(2)=1
  const iconDir = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]);
  // ICONDIRENTRY: w(1) h(1) colorCount(1) reserved(1) planes(2) bitCount(2) size(4) offset(4)
  const entry = Buffer.allocUnsafe(16);
  entry[0] = size === 256 ? 0 : size; // 0 means 256 in ICO spec
  entry[1] = size === 256 ? 0 : size;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngData.length, 8);
  entry.writeUInt32LE(6 + 16, 12); // offset = ICONDIR(6) + ICONDIRENTRY(16)
  return Buffer.concat([iconDir, entry, pngData]);
}

// ── Generate ──────────────────────────────────────────────────────────────────

// VETA brand colour: #1A478B (dark navy blue)
const R = 0x1a, G = 0x47, B = 0x8b;

const png256 = makePNG(256, 256, R, G, B);
writeFileSync(join(ASSETS_DIR, "tray-icon.png"), png256);
console.log("Written tray-icon.png (256×256)");

const png16 = makePNG(16, 16, R, G, B);
writeFileSync(join(ASSETS_DIR, "tray-icon.ico"), makeICO(png16, 16));
console.log("Written tray-icon.ico (16×16 PNG frame)");
