/**
 * 自动图片美化：纯像素算法（无 DOM/Canvas 依赖，便于测试）。
 * 三步（可独立测试）：
 *  1. whiteBalancePixels —— 灰度世界白平衡，修正色温偏色（偏黄/偏蓝）
 *  2. stretchPixels —— 亮度直方图 0.5%~99.5% 拉伸，提升对比度与层次
 *  3. saturatePixels —— 乘法式饱和度微增，颜色更鲜亮、接近实物观感
 * autoEnhancePixels 依序组合三步（原地修改，返回同一数组）。
 */
export function autoEnhancePixels(data: Uint8ClampedArray): Uint8ClampedArray {
  whiteBalancePixels(data);
  stretchPixels(data);
  saturatePixels(data);
  return data;
}

/** 灰度世界白平衡（原地修改）：把三通道均值拉向中性灰，增益限制在 0.65~1.5 防过度 */
export function whiteBalancePixels(data: Uint8ClampedArray): void {
  const len = data.length;
  if (len === 0) return;
  const n = len / 4;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  for (let i = 0; i < len; i += 4) {
    sumR += data[i];
    sumG += data[i + 1];
    sumB += data[i + 2];
  }
  const avgR = sumR / n;
  const avgG = sumG / n;
  const avgB = sumB / n;
  const avgGray = (avgR + avgG + avgB) / 3 || 255;
  const clampGain = (v: number) => Math.min(1.5, Math.max(0.65, v));
  const gainR = clampGain(avgGray / avgR);
  const gainG = clampGain(avgGray / avgG);
  const gainB = clampGain(avgGray / avgB);
  for (let i = 0; i < len; i += 4) {
    data[i] = data[i] * gainR;
    data[i + 1] = data[i + 1] * gainG;
    data[i + 2] = data[i + 2] * gainB;
  }
}

/** 亮度直方图 0.5%~99.5% 拉伸（原地修改）：提升对比度 */
export function stretchPixels(data: Uint8ClampedArray): void {
  const len = data.length;
  if (len === 0) return;
  const n = len / 4;
  const hist = new Uint32Array(256);
  for (let i = 0; i < len; i += 4) {
    const lum = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    hist[Math.min(255, lum | 0)]++;
  }
  const total = n;
  let lo = 0;
  let acc = 0;
  const loTarget = total * 0.005;
  while (lo < 255 && acc < loTarget) {
    acc += hist[lo];
    lo++;
  }
  let hi = 255;
  let hiAcc = 0;
  const hiTarget = total * 0.005;
  while (hi > 0 && hiAcc < hiTarget) {
    hiAcc += hist[hi];
    hi--;
  }
  lo = Math.min(lo, Math.max(0, hi - 8));
  const range = Math.max(16, hi - lo);
  const scale = 255 / range;
  for (let i = 0; i < len; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = (r * 299 + g * 587 + b * 114) / 1000;
    if (lum < 0.5) continue; // 纯黑保持
    const newLum = Math.min(255, Math.max(0, (lum - lo) * scale));
    const t = newLum / lum;
    data[i] = r * t;
    data[i + 1] = g * t;
    data[i + 2] = b * t;
  }
}

/** 乘法式饱和度增强（原地修改）：out = lum + (c - lum) * sat */
export function saturatePixels(data: Uint8ClampedArray, sat = 1.12): void {
  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = (r * 299 + g * 587 + b * 114) / 1000;
    data[i] = lum + (r - lum) * sat;
    data[i + 1] = lum + (g - lum) * sat;
    data[i + 2] = lum + (b - lum) * sat;
  }
}