// 透视矫正：把源图中一个任意四边形区域，矫正为矩形
import type { Point } from './geometry';

function gauss(A: number[][], b: number[], n: number): number[] {
  const m = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) continue;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = 0; r < n; r++) {
    if (Math.abs(m[r][r]) > 1e-12) x[r] = m[r][n] / m[r][r];
  }
  return x;
}

// 计算单应矩阵：把 目标矩形(u,v) 映射到 源四边形(x,y)
// 返回函数 H(u,v) -> {x,y}
function homography(
  src: [Point, Point, Point, Point], // 源四角
  dst: [Point, Point, Point, Point] // 目标矩形四角
): (u: number, v: number) => Point {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const u = dst[i].x;
    const v = dst[i].y;
    const x = src[i].x;
    const y = src[i].y;
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    b.push(y);
  }
  const h = gauss(A, b, 8);
  return (u: number, v: number) => {
    const denom = h[6] * u + h[7] * v + 1;
    if (Math.abs(denom) < 1e-9) return { x: u, y: v };
    return {
      x: (h[0] * u + h[1] * v + h[2]) / denom,
      y: (h[3] * u + h[4] * v + h[5]) / denom,
    };
  };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * 将 src 画布中的四边形 quad（[TL,TR,BR,BL]，源坐标系）矫正成矩形画布
 */
export function warpPerspective(
  src: HTMLCanvasElement,
  quad: [Point, Point, Point, Point],
  maxOutDim = 2200
): HTMLCanvasElement {
  const [tl, tr, br, bl] = quad;
  let outW = Math.round((dist(tl, tr) + dist(bl, br)) / 2);
  let outH = Math.round((dist(tl, bl) + dist(tr, br)) / 2);
  outW = Math.max(1, outW);
  outH = Math.max(1, outH);
  const scale = Math.min(1, maxOutDim / Math.max(outW, outH));
  outW = Math.round(outW * scale);
  outH = Math.round(outH * scale);

  const dst = document.createElement('canvas');
  dst.width = outW;
  dst.height = outH;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  const dctx = dst.getContext('2d');
  if (!sctx || !dctx) return dst;

  const sData = sctx.getImageData(0, 0, src.width, src.height);
  const sPix = sData.data;
  const sw = src.width;
  const sh = src.height;
  const dData = dctx.createImageData(outW, outH);
  const dPix = dData.data;

  const H = homography(quad, [
    { x: 0, y: 0 },
    { x: outW - 1, y: 0 },
    { x: outW - 1, y: outH - 1 },
    { x: 0, y: outH - 1 },
  ]);

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const s = H(x, y);
      const sx = Math.min(sw - 1, Math.max(0, s.x));
      const sy = Math.min(sh - 1, Math.max(0, s.y));
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(sw - 1, x0 + 1);
      const y1 = Math.min(sh - 1, y0 + 1);
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      const o = (y * outW + x) * 4;
      for (let c = 0; c < 3; c++) {
        const v =
          (sPix[i00 + c] * (1 - fx) + sPix[i10 + c] * fx) * (1 - fy) +
          (sPix[i01 + c] * (1 - fx) + sPix[i11 + c] * fx) * fy;
        dPix[o + c] = v;
      }
      dPix[o + 3] = 255;
    }
  }
  dctx.putImageData(dData, 0, 0);
  return dst;
}
