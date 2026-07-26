/**
 * Генератор иконок приложения. Запуск: npm run icons
 *
 * Рисуем в коде, а не кладём готовые PNG: иконку можно пересобрать
 * в любой момент, а в репозитории нет бинарников, которые никто
 * не может отредактировать.
 *
 * Мотив — три столбика: это про учёт и отчёты, читается на 48 пикселях
 * и не требует шрифта, который пришлось бы растеризовать вручную.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

/* ----------------------------- PNG ----------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

function encodePng(size: number, rgba: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // бит на канал
  ihdr[9] = 6; // RGBA

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // фильтр none
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------------------- рисунок ---------------------------- */

const BG: [number, number, number] = [0x4f, 0x8c, 0xff];
const FG: [number, number, number] = [0xff, 0xff, 0xff];

/** Три столбика разной высоты, скруглённые с обоих концов. */
const BARS = [
  { cx: 0.34, top: 0.44 },
  { cx: 0.5, top: 0.28 },
  { cx: 0.66, top: 0.12 },
];
const BOTTOM = 0.74;
const RADIUS = 0.05;

/** Расстояние от точки до отрезка — так капсула получается сама собой. */
function distanceToBar(x: number, y: number, cx: number, top: number): number {
  const y0 = top + RADIUS;
  const y1 = BOTTOM - RADIUS;
  const cy = Math.min(Math.max(y, y0), y1);
  return Math.hypot(x - cx, y - cy);
}

function coverage(x: number, y: number): number {
  const d = Math.min(...BARS.map((b) => distanceToBar(x, y, b.cx, b.top)));
  return d <= RADIUS ? 1 : 0;
}

function render(size: number): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  const SS = 3; // сглаживание: без него края столбиков рвутся

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          hits += coverage((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
        }
      }
      const a = hits / (SS * SS);
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(BG[c] * (1 - a) + FG[c] * a);
      px[i + 3] = 255;
    }
  }
  return px;
}

/* ---------------------------- вывод ---------------------------- */

mkdirSync('public', { recursive: true });

for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-icon.png', 180],
] as const) {
  writeFileSync(`public/${name}`, encodePng(size, render(size)));
  console.log(`public/${name}  ${size}×${size}`);
}
