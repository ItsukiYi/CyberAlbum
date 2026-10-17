// 图片加载 / 压缩 / 旋转
import type { Point } from './geometry';
import { warpPerspective } from './perspective';
import { autoEnhancePixels } from './enhance';

const MAX_DIM = 2000;
const JPEG_QUALITY = 0.85;

export async function fileToImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片加载失败'));
    };
    img.src = url;
  });
}

export function imageToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建画布');
  ctx.drawImage(img, 0, 0);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, quality = JPEG_QUALITY): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('图片编码失败'));
      },
      'image/jpeg',
      quality
    );
  });
}

/** 压缩到长边 <= MAX_DIM 的 JPEG Blob，同时处理 EXIF 方向 */
export async function compressImage(img: HTMLImageElement, enhance = false): Promise<Blob> {
  return compressCanvas(imageToCanvas(img), undefined, enhance);
}

/** 直接把画布压缩输出为 JPEG Blob */
export async function compressCanvas(canvas: HTMLCanvasElement, quality = JPEG_QUALITY, enhance = false): Promise<Blob> {
  if (enhance) autoEnhance(canvas);
  const srcW = canvas.width;
  const srcH = canvas.height;
  const scale = Math.min(1, MAX_DIM / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('无法创建画布');
  ctx.drawImage(canvas, 0, 0, w, h);
  return canvasToBlob(out, quality);
}

/**
 * 自动图片美化（原地修改画布像素）：白平衡 → 对比度拉伸 → 饱和度微增。
 * 用于改善实拍照片与实物之间的观感差距（偏色/发灰/发闷）。
 */
export function autoEnhance(src: HTMLCanvasElement): HTMLCanvasElement {
  if (!src.width || !src.height) return src;
  const ctx = src.getContext('2d', { willReadFrequently: true });
  if (!ctx) return src;
  const img = ctx.getImageData(0, 0, src.width, src.height);
  autoEnhancePixels(img.data);
  ctx.putImageData(img, 0, 0);
  return src;
}

/** 顺时针旋转 90° */
export function rotateCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = src.height;
  out.height = src.width;
  const ctx = out.getContext('2d');
  if (!ctx) return src;
  ctx.translate(src.height, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(src, 0, 0);
  return out;
}

/** 默认四角 = 整个画面 */
export function fullFrameCorners(w: number, h: number): Point[] {
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
}

export function cornersEqual(a: Point[], b: Point[], tol = 2): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y) > tol) return false;
  }
  return true;
}

export interface CropResult {
  blob: Blob;
  canvas: HTMLCanvasElement;
}

/** 用四边形裁切并矫正成矩形，再压缩输出 */
export async function cropQuadToBlob(
  src: HTMLCanvasElement,
  corners: Point[],
  enhance = false
): Promise<CropResult> {
  const quad = corners as [Point, Point, Point, Point];
  const warped = warpPerspective(src, quad);
  if (enhance) autoEnhance(warped);
  const blob = await canvasToBlob(warped);
  return { blob, canvas: warped };
}
