// 生成 PWA 图标 PNG（纯 Node，无依赖）
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'icons');

// ---- PNG 编码 ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function encodePNG(width, height, rgba) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- 绘制 ----
const BG = [109, 92, 224]; // #6d5ce0
const WHITE = [255, 255, 255];
const MUTED = [201, 196, 245]; // #c9c4f5

function insideRounded(x, y, x0, y0, x1, y1, r) {
  const nx = Math.max(x0 + r, Math.min(x, x1 - r));
  const ny = Math.max(y0 + r, Math.min(y, y1 - r));
  const dx = x - nx;
  const dy = y - ny;
  return dx * dx + dy * dy <= r * r;
}

function blend(src, dst, a) {
  // dst 是 Buffer 的偏移起点（RGBA）
  for (let i = 0; i < 3; i++) dst[i] = Math.round(src[i] * a + dst[i] * (1 - a));
  if (dst[3] === 0) dst[3] = 255;
}

function drawIcon(N) {
  const buf = Buffer.alloc(N * N * 4);
  const x0 = N * 0.29;
  const y0 = N * 0.19;
  const w = N * 0.46;
  const h = N * 0.6;
  const r = N * 0.05;
  // 背景
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const o = (y * N + x) * 4;
      buf[o] = BG[0];
      buf[o + 1] = BG[1];
      buf[o + 2] = BG[2];
      buf[o + 3] = 255;
      // 背卡
      if (insideRounded(x, y, x0 - N * 0.04, y0 - N * 0.04, x0 + w, y0 + h, r)) {
        buf[o] = WHITE[0];
        buf[o + 1] = WHITE[1];
        buf[o + 2] = WHITE[2];
        buf[o + 3] = 115; // 半透明背卡
      }
    }
  }
  // 前卡 + 文字线
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const o = (y * N + x) * 4;
      if (insideRounded(x, y, x0, y0, x0 + w, y0 + h, r)) {
        buf[o] = WHITE[0];
        buf[o + 1] = WHITE[1];
        buf[o + 2] = WHITE[2];
        buf[o + 3] = 255;
      }
    }
  }
  const line = (lx, ly, lw, color, alpha = 1) => {
    for (let y = Math.floor(ly); y < ly + N * 0.028; y++) {
      for (let x = Math.floor(lx); x < lx + lw; x++) {
        if (y >= 0 && y < N && x >= 0 && x < N) {
          const o = (y * N + x) * 4;
          if (buf[o + 3] === 255) blend(color, buf.subarray(o, o + 4), alpha);
        }
      }
    }
  };
  line(x0 + N * 0.04, y0 + N * 0.07, w - N * 0.08, BG, 0.9);
  line(x0 + N * 0.04, y0 + N * 0.17, w - N * 0.3, MUTED);
  line(x0 + N * 0.04, y0 + N * 0.26, w - N * 0.18, MUTED);
  line(x0 + N * 0.04, y0 + N * 0.35, w - N * 0.4, MUTED);
  // 底部紫色小圆片
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const o = (y * N + x) * 4;
      if (buf[o + 3] === 255 && insideRounded(x, y, x0 + N * 0.04, y0 + N * 0.46, x0 + N * 0.24, y0 + N * 0.46 + N * 0.055, N * 0.0275)) {
        blend(BG, buf.subarray(o, o + 4), 0.85);
      }
    }
  }
  return buf;
}

mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) {
  const png = encodePNG(size, size, drawIcon(size));
  writeFileSync(join(outDir, `icon-${size}.png`), png);
  console.log(`icon-${size}.png 生成完成`);
}
