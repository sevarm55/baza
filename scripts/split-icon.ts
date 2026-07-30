/**
 * Разбор иконки на слои для Icon Composer. Запуск: npm run icon:split
 *
 * Зачем это вообще нужно. В iOS 26 стекло на иконке не рисуется в
 * картинке — его накладывает система, и накладывает послойно. Значит
 * плоскую картинку «буква на фоне» надо разнять обратно на два слоя:
 * фон отдельно, буква отдельно и с прозрачностью вокруг. Только тогда
 * Icon Composer сможет дать блик и преломление именно букве, а не
 * всему квадрату разом.
 *
 * Резать руками в редакторе можно, но край буквы сглажен, и «волшебная
 * палочка» либо съедает полпикселя по контуру, либо оставляет вокруг
 * фиолетовую кайму. На иконке в 40 пикселей эта кайма видна. Поэтому
 * считаем честно.
 *
 * Как считаем. Картинка состоит ровно из двух вещей: линейный градиент
 * фона и заливка буквы одним цветом. Тогда каждый пиксель — это смесь
 * P = α·L + (1−α)·B, где B известен (градиент — это плоскость, её можно
 * подогнать по рамке), L — цвет буквы. Отсюда α выражается точно, и
 * сглаженный край переходит в прозрачность сам собой, без ручного
 * порога и без каймы.
 */
import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';

/** Сторона исходника для Icon Composer. Больше не нужно, меньше — потеря. */
const OUT = 1024;

/* ────────────────────────── чтение PNG ────────────────────────── */

type Image = { width: number; height: number; rgba: Uint8Array };

function decodePng(file: Buffer): Image {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((b, i) => file[i] === b)) {
    throw new Error('Это не PNG. Сохраните картинку как PNG.');
  }

  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  const idat: Buffer[] = [];

  for (let at = 8; at < file.length; ) {
    const length = file.readUInt32BE(at);
    const type = file.toString('ascii', at + 4, at + 8);
    const data = file.subarray(at + 8, at + 8 + length);
    at += 12 + length;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error('Чересстрочный PNG не поддерживается.');
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (depth !== 8) throw new Error(`Нужен PNG с 8 битами на канал, а здесь ${depth}.`);
  if (colorType !== 2 && colorType !== 6) {
    throw new Error('Нужен цветной PNG (RGB или RGBA), без палитры и без серого.');
  }

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));

  /* Расфильтровка. Каждая строка в PNG закодирована относительно соседей —
     это и есть то, что даёт сжатие; читать её без этого нельзя. */
  const flat = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = flat.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? flat.subarray((y - 1) * stride, y * stride) : null;

    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? out[i - channels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= channels ? prev[i - channels] : 0;
      let value = line[i];

      switch (filter) {
        case 0:
          break;
        case 1:
          value += a;
          break;
        case 2:
          value += b;
          break;
        case 3:
          value += (a + b) >> 1;
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          break;
        }
        default:
          throw new Error(`Неизвестный фильтр строки: ${filter}`);
      }
      out[i] = value & 0xff;
    }
  }

  /* Дальше удобнее работать с одним форматом, поэтому RGB дополняем альфой. */
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < width * height; i++, j += channels) {
    rgba[i * 4] = flat[j];
    rgba[i * 4 + 1] = flat[j + 1];
    rgba[i * 4 + 2] = flat[j + 2];
    rgba[i * 4 + 3] = channels === 4 ? flat[j + 3] : 255;
  }

  return { width, height, rgba };
}

/* ────────────────────────── запись PNG ────────────────────────── */

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

/* ────────────────────────── фон как плоскость ────────────────────────── */

/** Коэффициенты одного канала: c = a·x + b·y + d, где x и y в долях стороны. */
type Plane = [number, number, number];

/**
 * Подгонка градиента по точкам. Линейный градиент любого направления —
 * вертикальный, горизонтальный, диагональный — это ровно плоскость, так
 * что трёх коэффициентов хватает и гадать про направление не нужно.
 */
function fitPlane(points: { x: number; y: number; v: number }[]): Plane {
  let sxx = 0, sxy = 0, sx = 0, syy = 0, sy = 0, n = 0;
  let sxv = 0, syv = 0, sv = 0;

  for (const p of points) {
    sxx += p.x * p.x;
    sxy += p.x * p.y;
    sx += p.x;
    syy += p.y * p.y;
    sy += p.y;
    n += 1;
    sxv += p.x * p.v;
    syv += p.y * p.v;
    sv += p.v;
  }

  /* Обычная система нормальных уравнений 3×3, решённая по Крамеру. */
  const m = [
    [sxx, sxy, sx],
    [sxy, syy, sy],
    [sx, sy, n],
  ];
  const rhs = [sxv, syv, sv];

  const det = (a: number[][]) =>
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
    a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
    a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);

  const base = det(m);
  if (Math.abs(base) < 1e-9) return [0, 0, sv / Math.max(1, n)];

  const swap = (col: number) => det(m.map((row, i) => row.map((v, j) => (j === col ? rhs[i] : v))));
  return [swap(0) / base, swap(1) / base, swap(2) / base];
}

const at = (p: Plane, x: number, y: number) => p[0] * x + p[1] * y + p[2];

/* ────────────────────────── разбор ────────────────────────── */

const source = process.argv[2] ?? 'ios/AppIcon.src.png';
const image = decodePng(readFileSync(source));
const { width, height } = image;

if (width !== height) {
  throw new Error(`Иконка должна быть квадратной, а здесь ${width}×${height}.`);
}

const pixel = (i: number) => [image.rgba[i * 4], image.rgba[i * 4 + 1], image.rgba[i * 4 + 2]];

/* Опора — рамка по краю. Буква до края не достаёт никогда: у иконки
   обязательно есть поля, иначе система срежет её своей маской. */
const frame = Math.max(2, Math.round(width * 0.02));
let seeds: { x: number; y: number; i: number }[] = [];
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const edge = x < frame || y < frame || x >= width - frame || y >= height - frame;
    if (edge) seeds.push({ x: x / width, y: y / height, i: y * width + x });
  }
}

/* Подгоняем дважды: если в рамку что-то всё же попало — водяной знак,
   тень, случайный мазок, — вторая попытка выкидывает промахи и считает
   градиент уже по чистому. */
let planes: [Plane, Plane, Plane] = [
  [0, 0, 0],
  [0, 0, 0],
  [0, 0, 0],
];
for (let pass = 0; pass < 2; pass++) {
  planes = [0, 1, 2].map((ch) =>
    fitPlane(seeds.map((s) => ({ x: s.x, y: s.y, v: pixel(s.i)[ch] }))),
  ) as [Plane, Plane, Plane];

  if (pass === 0) {
    const miss = seeds.map((s) => {
      const p = pixel(s.i);
      return [0, 1, 2].reduce((sum, ch) => sum + Math.abs(p[ch] - at(planes[ch], s.x, s.y)), 0);
    });
    const cutoff = [...miss].sort((a, b) => a - b)[Math.floor(miss.length * 0.9)];
    seeds = seeds.filter((_, k) => miss[k] <= cutoff);
  }
}

/** Фон в точке — то, что было бы, не будь там буквы. */
const background = (x: number, y: number) =>
  [0, 1, 2].map((ch) => at(planes[ch], x / width, y / height));

/* Цвет буквы берём из картинки, а не из палитры бренда: генератор
   почти наверняка сдвинул оттенок, и подставить «правильный» лайм
   значило бы отдать в Icon Composer не то, что человеку понравилось. */
const deviation = new Float32Array(width * height);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = y * width + x;
    const p = pixel(i);
    const b = background(x, y);
    deviation[i] = Math.hypot(p[0] - b[0], p[1] - b[1], p[2] - b[2]);
  }
}
const ranked = [...deviation].sort((a, b) => b - a);
const core = ranked[Math.floor(ranked.length * 0.02)]; // заведомо внутри буквы

let sum = [0, 0, 0];
let count = 0;
for (let i = 0; i < deviation.length; i++) {
  if (deviation[i] < core) continue;
  const p = pixel(i);
  sum = [sum[0] + p[0], sum[1] + p[1], sum[2] + p[2]];
  count++;
}
if (count === 0) throw new Error('Не нашёл букву: картинка выглядит одноцветной.');
const letter = sum.map((v) => v / count);

const hex = (c: number[]) =>
  '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();

/* ────────────────────────── альфа ────────────────────────── */

/* Проекция на направление «фон → буква». Всё, что отклонилось вбок
   (шум, артефакты сжатия), в покрытие не попадает — только движение
   в сторону цвета буквы. */
const alpha = new Float32Array(width * height);
let minX = width, minY = height, maxX = 0, maxY = 0;

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = y * width + x;
    const p = pixel(i);
    const b = background(x, y);
    const dir = [letter[0] - b[0], letter[1] - b[1], letter[2] - b[2]];
    const len = dir[0] ** 2 + dir[1] ** 2 + dir[2] ** 2;
    const dot = (p[0] - b[0]) * dir[0] + (p[1] - b[1]) * dir[1] + (p[2] - b[2]) * dir[2];

    const a = Math.min(1, Math.max(0, len === 0 ? 0 : dot / len));
    alpha[i] = a;

    if (a > 0.5) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}

/* ────────────────────────── вывод ────────────────────────── */

/* Уменьшаем усреднением по площади, а не выборкой ближайшего: край
   буквы сглажен, и выборка превратила бы его в лесенку ровно там, где
   Icon Composer потом будет вести по нему блик. */
function resampleAlpha(size: number): Float32Array {
  const out = new Float32Array(size * size);
  const scale = width / size;

  for (let y = 0; y < size; y++) {
    const y0 = Math.floor(y * scale);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * scale));
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor(x * scale);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * scale));

      let total = 0;
      let n = 0;
      for (let sy = y0; sy < y1 && sy < height; sy++) {
        for (let sx = x0; sx < x1 && sx < width; sx++) {
          total += alpha[sy * width + sx];
          n++;
        }
      }
      out[y * size + x] = n === 0 ? 0 : total / n;
    }
  }
  return out;
}

if (width < OUT) {
  console.warn(`⚠ Исходник ${width}px — меньше 1024. Слои выйдут мягче, чем нужно.`);
}

const size = Math.min(OUT, width);
const mask = size === width ? alpha : resampleAlpha(size);

/* Слой буквы: цвет ровный, вся форма живёт в прозрачности. Так Icon
   Composer видит силуэт и может лить по нему стекло. */
const foreground = new Uint8Array(size * size * 4);
for (let i = 0; i < size * size; i++) {
  foreground[i * 4] = Math.round(letter[0]);
  foreground[i * 4 + 1] = Math.round(letter[1]);
  foreground[i * 4 + 2] = Math.round(letter[2]);
  foreground[i * 4 + 3] = Math.round(mask[i] * 255);
}

/* Фон рисуем заново по подогнанной плоскости, а не вырезаем из исходника:
   вырезанный оставил бы на месте буквы призрак — след от её сглаженного
   края. Пересчитанный градиент чист. */
const backdrop = new Uint8Array(size * size * 4);
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const b = background((x * width) / size, (y * height) / size);
    const i = (y * size + x) * 4;
    backdrop[i] = Math.round(Math.min(255, Math.max(0, b[0])));
    backdrop[i + 1] = Math.round(Math.min(255, Math.max(0, b[1])));
    backdrop[i + 2] = Math.round(Math.min(255, Math.max(0, b[2])));
    backdrop[i + 3] = 255;
  }
}

writeFileSync('ios/AppIcon.foreground.png', encodePng(size, foreground));
writeFileSync('ios/AppIcon.background.png', encodePng(size, backdrop));

const inset = Math.min(minX, minY, width - 1 - maxX, height - 1 - maxY) / width;
const corners = [
  background(0, 0),
  background(width - 1, 0),
  background(0, height - 1),
  background(width - 1, height - 1),
];

console.log(`исходник        ${source}  ${width}×${height}`);
console.log(`цвет буквы      ${hex(letter)}`);
console.log(`градиент фона   ${hex(corners[0])} → ${hex(corners[3])}`);
console.log(`поле вокруг     ${(inset * 100).toFixed(1)}% стороны`);
console.log('');
console.log(`ios/AppIcon.foreground.png   ${size}×${size}  буква, фон прозрачный`);
console.log(`ios/AppIcon.background.png   ${size}×${size}  чистый градиент`);
