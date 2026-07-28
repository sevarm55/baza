/**
 * Знак Tetr и иконки приложения. Запуск: npm run icons
 *
 * Рисуем в коде, а не картинкой из генератора: логотип живёт в точной
 * геометрии — равная толщина, равные зазоры, один угол на все элементы,
 * честное оптическое центрирование. Генератор каждый раз промахивается
 * именно в этом, а здесь всё воспроизводимо до пикселя.
 *
 * Знак: три записи, положенные стопкой и наклонённые как одно целое.
 * Наклон здесь не украшение — ровные горизонтальные полосы читаются
 * как иконка «меню», а наклонённые уже нет.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

/* ────────────────────────── геометрия ────────────────────────── */

/* Порядок полос — порядок смысла: сверху то, что нажимают, снизу то,
   ради чего всё считается. Те же три цвета несёт весь интерфейс. */
const BG = '#F5F3EF';
const BARS = [
  { color: '#F97316', y: -0.155, x0: -0.27, x1: 0.15 }, // мандарин — действие
  { color: '#4338CA', y: 0.0, x0: -0.23, x1: 0.27 }, // индиго — опора
  { color: '#10B981', y: 0.155, x0: -0.19, x1: 0.11 }, // мята — деньги
];

const THICKNESS = 0.115;
const RADIUS = THICKNESS / 2;
/** Отрицательный угол поднимает правый конец вверх. */
const ANGLE = (-13 * Math.PI) / 180;

const COS = Math.cos(ANGLE);
const SIN = Math.sin(ANGLE);

type Point = { x: number; y: number };

function rotate(p: Point): Point {
  return { x: p.x * COS - p.y * SIN, y: p.x * SIN + p.y * COS };
}

/** Концы полос после поворота, в системе с началом в центре знака. */
const SEGMENTS = BARS.map((b) => ({
  color: b.color,
  a: rotate({ x: b.x0, y: b.y }),
  b: rotate({ x: b.x1, y: b.y }),
}));

/* Центрируем по фактической рамке, а не на глаз: иначе знак всегда
   уезжает в угол, и на иконке это заметно по краям. */
const bounds = SEGMENTS.reduce(
  (acc, s) => ({
    minX: Math.min(acc.minX, s.a.x, s.b.x) - 0,
    maxX: Math.max(acc.maxX, s.a.x, s.b.x),
    minY: Math.min(acc.minY, s.a.y, s.b.y),
    maxY: Math.max(acc.maxY, s.a.y, s.b.y),
  }),
  { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
);
const OFFSET = {
  x: -(bounds.minX + bounds.maxX) / 2,
  y: -(bounds.minY + bounds.maxY) / 2,
};

/** Расстояние от точки до отрезка — так капсула получается сама собой. */
function distanceToSegment(px: number, py: number, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : ((px - a.x) * dx + (py - a.y) * dy) / lengthSq;
  const clamped = Math.min(1, Math.max(0, t));
  return Math.hypot(px - (a.x + clamped * dx), py - (a.y + clamped * dy));
}

/* ────────────────────────── растр ────────────────────────── */

function hex(value: string): [number, number, number] {
  return [
    parseInt(value.slice(1, 3), 16),
    parseInt(value.slice(3, 5), 16),
    parseInt(value.slice(5, 7), 16),
  ];
}

const BG_RGB = hex(BG);
const BAR_RGB = SEGMENTS.map((s) => hex(s.color));

/** Сколько знака в этой точке и какой полосы. */
function sample(x: number, y: number): number {
  for (let i = 0; i < SEGMENTS.length; i++) {
    const s = SEGMENTS[i];
    if (distanceToSegment(x, y, s.a, s.b) <= RADIUS) return i;
  }
  return -1;
}

function render(size: number): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  const SS = 3; // сглаживание: без него края капсул рвутся

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // накапливаем покрытие отдельно по каждой полосе
      const hits = [0, 0, 0];
      let total = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const nx = (x + (sx + 0.5) / SS) / size - 0.5 - OFFSET.x;
          const ny = (y + (sy + 0.5) / SS) / size - 0.5 - OFFSET.y;
          const hit = sample(nx, ny);
          if (hit >= 0) {
            hits[hit]++;
            total++;
          }
        }
      }

      const samples = SS * SS;
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) {
        let value = BG_RGB[c] * (1 - total / samples);
        for (let b = 0; b < 3; b++) value += BAR_RGB[b][c] * (hits[b] / samples);
        px[i + c] = Math.round(value);
      }
      px[i + 3] = 255;
    }
  }
  return px;
}

/* ────────────────────────── PNG ────────────────────────── */

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
  ihdr[8] = 8;
  ihdr[9] = 6;

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ────────────────────────── SVG ────────────────────────── */

/** Тот же знак вектором — для лендинга и всего, что печатается. */
function buildSvg(size = 512, background = true): string {
  const to = (v: number) => (v * size).toFixed(2);
  const lines = SEGMENTS.map(
    (s) =>
      `  <line x1="${to(s.a.x + OFFSET.x + 0.5)}" y1="${to(s.a.y + OFFSET.y + 0.5)}" ` +
      `x2="${to(s.b.x + OFFSET.x + 0.5)}" y2="${to(s.b.y + OFFSET.y + 0.5)}" ` +
      `stroke="${s.color}" stroke-width="${to(THICKNESS)}" stroke-linecap="round"/>`,
  ).join('\n');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`,
    background ? `  <rect width="${size}" height="${size}" rx="${to(0.22)}" fill="${BG}"/>` : '',
    lines,
    '</svg>',
    '',
  ]
    .filter(Boolean)
    .join('\n');
}

/* ────────────────────────── вывод ────────────────────────── */

mkdirSync('public', { recursive: true });

for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-icon.png', 180],
] as const) {
  writeFileSync(`public/${name}`, encodePng(size, render(size)));
  console.log(`public/${name}  ${size}×${size}`);
}

writeFileSync('public/logo.svg', buildSvg());
console.log('public/logo.svg  вектор с фоном');

writeFileSync('public/mark.svg', buildSvg(512, false));
console.log('public/mark.svg  знак без фона');
