// 自动边缘检测：从照片里找出色纸/海报等矩形物的四个角
// 思路：用图像边框估算背景色 → 前景掩膜 → 取最大连通块 → 凸包 → 最小外接矩形
// 返回源图坐标系的四角 [TL, TR, BR, BL]，找不到则返回 null

export interface Point {
  x: number;
  y: number;
}

/** 从像素数据构建前景掩膜（不依赖 canvas，可单测；scale 用于坐标换算回源图） */
function buildMaskFromPixels(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  scale = 1
): { mask: Uint8Array; w: number; h: number; ring: number; scale: number } | null {
  // 边框环平均色 = 背景色
  const ring = Math.max(2, Math.round(w * 0.03));
  let r = 0,
    g = 0,
    b = 0,
    count = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const onBorder = x < ring || y < ring || x >= w - ring || y >= h - ring;
      if (onBorder) {
        const i = (y * w + x) * 4;
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        count++;
      }
    }
  }
  if (count === 0) return null;
  r /= count;
  g /= count;
  b /= count;

  // 前景掩膜：和背景差距够大就算
  const mask = new Uint8Array(w * h);
  const thresh = 34;
  for (let y = ring; y < h - ring; y++) {
    for (let x = ring; x < w - ring; x++) {
      const i = (y * w + x) * 4;
      const dr = data[i] - r;
      const dg = data[i + 1] - g;
      const db = data[i + 2] - b;
      if (dr * dr + dg * dg + db * db > thresh * thresh) mask[y * w + x] = 1;
    }
  }
  return { mask, w, h, ring, scale };
}

/** 缩至小图 → 背景色估计 → 前景掩膜 */
function buildMask(src: HTMLCanvasElement): { mask: Uint8Array; w: number; h: number; ring: number; scale: number } | null {
  const maxDim = 300;
  const scale = Math.min(1, maxDim / Math.max(src.width, src.height));
  const w = Math.max(2, Math.round(src.width * scale));
  const h = Math.max(2, Math.round(src.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  return buildMaskFromPixels(data, w, h, scale);
}

/** 掩膜上的四边形检测（两路合并），供两个入口共用 */
function detectQuadsFromBm(bm: { mask: Uint8Array; w: number; h: number; ring: number; scale: number }): Point[][] | null {
  const { mask, w, h, ring, scale } = bm;
  const imgArea = (w - ring * 2) * (h - ring * 2);

  const a = quadsFromBlobs(mask, w, h, scale, imgArea);
  const b = quadsFromProjection(mask, w, h, ring, scale, imgArea);

  return mergeQuads([...a, ...b]);
}

/** 把识别四边形角点限制在图像范围内（外接矩形可能越界） */
function clampQuadsToImage(quads: Point[][], w: number, h: number): Point[][] {
  return quads.map((q) =>
    q.map((p) => ({ x: Math.min(w, Math.max(0, p.x)), y: Math.min(h, Math.max(0, p.y)) }))
  );
}

/**
 * 自动检测照片里的色纸/海报等矩形物，返回候选四边形（源图坐标 [TL,TR,BR,BL]）。
 * 两路检测合并：
 *  - 连通块 → 最小外接矩形（对分离的多张有效）
 *  - 行/列投影切分（对上下/左右并排、在 mask 里连成一块的多张有效）
 * 每张色纸对应一个四边形，按面积从大到小排列，找不到则返回 null。
 */
export function detectQuadsFromCanvas(src: HTMLCanvasElement): Point[][] | null {
  const bm = buildMask(src);
  if (!bm) return null;
  const r = detectQuadsFromBm(bm);
  return r ? clampQuadsToImage(r, src.width, src.height) : null;
}

/** 与 detectQuadsFromCanvas 相同的检测，但直接吃像素数据（不依赖 canvas，便于测试） */
export function detectQuadsFromPixels(data: Uint8ClampedArray, w: number, h: number): Point[][] | null {
  const bm = buildMaskFromPixels(data, w, h);
  if (!bm) return null;
  const r = detectQuadsFromBm(bm);
  return r ? clampQuadsToImage(r, w, h) : null;
}

/** 连通块法：每块取最小外接矩形，形状过差/过小/几乎占满的过滤掉 */
function quadsFromBlobs(mask: Uint8Array, w: number, h: number, scale: number, imgArea: number): Point[][] {
  const inv = 1 / scale;
  const quads: Point[][] = [];
  const blobs = allBlobs(mask, w, h);
  for (const blob of blobs) {
    if (blob.length < 30) continue;
    const step = Math.max(1, Math.ceil(blob.length / 12000));
    const pts: Point[] = [];
    for (let i = 0; i < blob.length; i += step) {
      pts.push({ x: blob[i] % w, y: Math.floor(blob[i] / w) });
    }
    const hull = convexHull(pts);
    if (hull.length < 4) continue;
    const mab = minAreaRect(hull);
    const hullArea = polygonArea(hull);
    const rectArea = mab.w * mab.h;
    if (rectArea <= 0) continue;
    const ratio = hullArea / rectArea;
    if (rectArea < imgArea * 0.04) continue;
    if (rectArea > imgArea * 0.985) continue;
    if (ratio < 0.62) continue;
    quads.push(mab.corners.map((c) => ({ x: c.x * inv, y: c.y * inv })));
    if (quads.length >= 6) break;
  }
  return quads;
}

/** 投影切分法：行/列投影找前景段；连体大块内部用投影低谷（valley）切分多张 */
function quadsFromProjection(mask: Uint8Array, w: number, h: number, ring: number, scale: number, imgArea: number): Point[][] {
  const inv = 1 / scale;
  const minN = Math.max(ring, 2);
  const thr = Math.max(3, Math.round(w * 0.02));
  const rowC = new Float32Array(h);
  const colC = new Float32Array(w);
  for (let y = minN; y < h - minN; y++) {
    let c = 0;
    for (let x = minN; x < w - minN; x++) c += mask[y * w + x];
    rowC[y] = c;
  }
  for (let x = minN; x < w - minN; x++) {
    let c = 0;
    for (let y = minN; y < h - minN; y++) c += mask[y * w + x];
    colC[x] = c;
  }
  const rowSegs = splitProfiles(rowC, h, thr);
  const colSegs = splitProfiles(colC, w, thr);

  const out: Point[][] = [];
  for (const [rs, re] of rowSegs) {
    for (const [cs, ce] of colSegs) {
      const bw = ce - cs + 1;
      const bh = re - rs + 1;
      if (bw < 4 || bh < 4) continue;
      let cnt = 0;
      for (let y = rs; y <= re; y++) {
        let idx = y * w + cs;
        for (let x = cs; x <= ce; x++, idx++) cnt += mask[idx];
      }
      const area = bw * bh;
      if (area < imgArea * 0.03) continue; // 太小，不像主体
      if (cnt < area * 0.42) continue; // 区域内前景密度不足
      out.push([
        { x: cs * inv, y: rs * inv },
        { x: ce * inv, y: rs * inv },
        { x: ce * inv, y: re * inv },
        { x: cs * inv, y: re * inv },
      ]);
      if (out.length >= 6) return out;
    }
  }
  return out;
}

/** 把投影段切成连续段，允许 ≤3 行/列的缺口（噪声）合并 */
function runSegments(active: (i: number) => boolean, n: number): [number, number][] {
  const segs: [number, number][] = [];
  let s = -1;
  for (let i = 0; i < n; i++) {
    if (active(i) && s === -1) s = i;
    else if (!active(i) && s !== -1) {
      segs.push([s, i - 1]);
      s = -1;
    }
  }
  if (s !== -1) segs.push([s, n - 1]);
  const merged: [number, number][] = [];
  for (const [a, b] of segs) {
    const last = merged[merged.length - 1];
    if (last && a - last[1] <= 3) last[1] = b;
    else merged.push([a, b]);
  }
  return merged;
}

/**
 * 带低谷切分的投影段：先按 active 分段，再在每个段内部找「明显变窄的谷」
 * （count ≤ 段内峰值 × valleyRatio），在谷处把连体的多张切开。
 * 每段最多切一次（应对"上下/左右两张连体"）。
 */
function splitProfiles(counts: Float32Array, n: number, thr: number, valleyRatio = 0.34): [number, number][] {
  const segs = runSegments((i) => counts[i] > thr, n);
  const out: [number, number][] = [];
  for (const [s, e] of segs) {
    let max = 0;
    for (let i = s; i <= e; i++) if (counts[i] > max) max = counts[i];
    if (max <= 0) continue;
    // 找第一个低谷（连续低值区间的起点），在其处切两半
    let cutAt = -1;
    for (let i = s; i <= e; i++) {
      if (counts[i] <= max * valleyRatio) {
        cutAt = i;
        break;
      }
    }
    if (cutAt > s && cutAt <= e) {
      // 把谷附近切掉：前半 [s, cutAt-2]，后半 [cutAt+1, e]
      const mid = cutAt;
      if (mid - 1 >= s) out.push([s, Math.max(s, mid - 2)]);
      if (mid + 1 <= e) out.push([Math.min(e, mid + 1), e]);
    } else {
      out.push([s, e]);
    }
  }
  return out;
}

function bboxOf(q: Point[]): { x1: number; y1: number; x2: number; y2: number } {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of q) {
    if (p.x < x1) x1 = p.x;
    if (p.x > x2) x2 = p.x;
    if (p.y < y1) y1 = p.y;
    if (p.y > y2) y2 = p.y;
  }
  return { x1, y1, x2, y2 };
}

/**
 * 合并两路结果：
 *  - 一个四边形若同时包含 ≥2 个其他四边形的中心 → 它是把多张连在一起的合并框，丢弃
 *  - 相互覆盖面积过大（交叠 / 较小者 > 60%）→ 去重
 * 按面积降序，最多 6 个。
 */
function mergeQuads(list: Point[][]): Point[][] | null {
  const areaOf = (q: Point[]) => {
    const b = bboxOf(q);
    return (b.x2 - b.x1) * (b.y2 - b.y1);
  };
  const sorted = [...list].filter((q) => areaOf(q) > 0).sort((a, b) => areaOf(b) - areaOf(a));
  const centers = sorted.map((q) => {
    const b = bboxOf(q);
    return { x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 };
  });
  const keep: Point[][] = [];
  for (let i = 0; i < sorted.length; i++) {
    const A = sorted[i];
    const b = bboxOf(A);
    // 统计其他候选的中心是否落在 A 内
    let inside = 0;
    for (let j = 0; j < sorted.length; j++) {
      if (j === i) continue;
      const c = centers[j];
      if (c.x > b.x1 && c.x < b.x2 && c.y > b.y1 && c.y < b.y2) inside++;
    }
    if (inside >= 2) continue; // 连体合并框：被拆分成多张，丢弃
    let dup = false;
    for (const o of keep) {
      const ob = bboxOf(o);
      const ix = Math.max(0, Math.min(b.x2, ob.x2) - Math.max(b.x1, ob.x1));
      const iy = Math.max(0, Math.min(b.y2, ob.y2) - Math.max(b.y1, ob.y1));
      const inter = ix * iy;
      const minArea = Math.min((b.x2 - b.x1) * (b.y2 - b.y1), (ob.x2 - ob.x1) * (ob.y2 - ob.y1));
      if (minArea > 0 && inter / minArea > 0.6) {
        dup = true;
        break;
      }
    }
    if (!dup) keep.push(A);
  }
  return keep.length ? keep.slice(0, 6) : null;
}

/** 兼容旧接口：只取最大的一张 */
export function detectQuadFromCanvas(src: HTMLCanvasElement): Point[] | null {
  return detectQuadsFromCanvas(src)?.[0] ?? null;
}

// ---------- 连通块（按面积降序） ----------
// 返回的是像素索引数组；像素数可超过 65535，必须用 Uint32Array 承载
function allBlobs(mask: Uint8Array, w: number, h: number): Uint32Array[] {
  const visited = new Uint8Array(w * h);
  const blobs: Uint32Array[] = [];
  const stack = new Int32Array(w * h);
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;
    let top = 0;
    stack[top++] = start;
    visited[start] = 1;
    const out = new Uint32Array(w * h); // 存放像素索引，必须 32 位（像素数可超过 65535）
    let n = 0;
    while (top > 0) {
      const idx = stack[--top];
      out[n++] = idx;
      const x = idx % w;
      const y = (idx / w) | 0;
      const neighbors = [
        idx - 1,
        idx + 1,
        idx - w,
        idx + w,
      ];
      for (const ni of neighbors) {
        if (ni < 0 || ni >= mask.length) continue;
        if (x === 0 && ni === idx - 1) continue;
        if (x === w - 1 && ni === idx + 1) continue;
        if (!mask[ni] || visited[ni]) continue;
        visited[ni] = 1;
        stack[top++] = ni;
      }
    }
    blobs.push(out.subarray(0, n));
  }
  blobs.sort((a, b) => b.length - a.length);
  return blobs;
}

function largestBlob(mask: Uint8Array, w: number, h: number): Uint32Array | null {
  return allBlobs(mask, w, h)[0] ?? null;
}

// ---------- 凸包（Andrew 单调链） ----------
export function convexHull(points: Point[]): Point[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
    lower.push(pt);
  }
  const upper: Point[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const pt = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop();
    upper.push(pt);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

// ---------- 多边形面积（鞋带公式） ----------
function polygonArea(poly: Point[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

// ---------- 最小外接矩形（旋转卡壳） ----------
function minAreaRect(poly: Point[]): {
  w: number;
  h: number;
  angle: number;
  corners: Point[];
} {
  let minArea = Infinity;
  let best: { cx: number; cy: number; w: number; h: number; angle: number } | null = null;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p0 = poly[i];
    const p1 = poly[(i + 1) % n];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    const ux = dx / len;
    const uy = dy / len;
    const vx = -uy;
    const vy = ux;
    let minU = Infinity,
      maxU = -Infinity,
      minV = Infinity,
      maxV = -Infinity;
    for (const p of poly) {
      const u = p.x * ux + p.y * uy;
      const v = p.x * vx + p.y * vy;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const area = (maxU - minU) * (maxV - minV);
    if (area < minArea) {
      minArea = area;
      best = {
        cx: (minU + maxU) / 2,
        cy: (minV + maxV) / 2,
        w: maxU - minU,
        h: maxV - minV,
        angle: Math.atan2(uy, ux),
      };
    }
  }
  if (!best) {
    const cx = poly.reduce((s, p) => s + p.x, 0) / n;
    const cy = poly.reduce((s, p) => s + p.y, 0) / n;
    return { w: 1, h: 1, angle: 0, corners: [0, 1, 2, 3].map((i) => ({ x: cx, y: cy })) };
  }
  const { cx, cy, w, h, angle } = best;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const vx = -uy;
  const vy = ux;
  const order: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  return {
    w,
    h,
    angle,
    corners: order.map(([su, sv]) => ({
      x: cx + su * (w / 2) * ux + sv * (h / 2) * vx,
      y: cy + su * (w / 2) * uy + sv * (h / 2) * vy,
    })),
  };
}
