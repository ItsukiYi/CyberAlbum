/**
 * 成熟文档扫描方案：scanic（MIT，UMD ~109KB，wasm 内联 data URI）。
 * - 以普通 <script> 标签运行时加载（file:// 可用），挂全局 window.scanic
 * - 不打包进 bundle（scanic 含 import.meta，会与 file:// 经典脚本冲突）
 * - 主路径：scanic 返回最大文档四角（Canny+膨胀，WASM 加速）
 * - 补充：项目原有算法保留多候选（一图多张色纸拆分）
 */
import { detectQuadsFromCanvas, type Point } from './geometry';

interface ScanicCorner {
  x: number;
  y: number;
}
interface ScanicCorners {
  topLeft: ScanicCorner;
  topRight: ScanicCorner;
  bottomRight: ScanicCorner;
  bottomLeft: ScanicCorner;
}
interface ScanicResult {
  success: boolean;
  corners: ScanicCorners | null;
}
interface ScanicModule {
  Scanner: new (opts?: Record<string, unknown>) => {
    initialize(): Promise<void>;
    scan(img: HTMLCanvasElement, opts?: Record<string, unknown>): Promise<ScanicResult>;
  };
}

let scanicPromise: Promise<ScanicModule> | null = null;
let scannerPromise: Promise<InstanceType<ScanicModule['Scanner']>> | null = null;

function ensureScanic(): Promise<ScanicModule> {
  if (scanicPromise) return scanicPromise;
  scanicPromise = new Promise((resolve, reject) => {
    const win = window as any;
    if (win.scanic && win.scanic.Scanner) {
      resolve(win.scanic as ScanicModule);
      return;
    }
    const s = document.createElement('script');
    s.src = './scanic/scanic.js';
    s.async = true;
    s.onload = () => {
      const sc = (win as any).scanic;
      if (sc && sc.Scanner) {
        resolve(sc as ScanicModule);
      } else {
        const t = setInterval(() => {
          if ((win as any).scanic && (win as any).scanic.Scanner) {
            clearInterval(t);
            resolve((win as any).scanic as ScanicModule);
          }
        }, 100);
        setTimeout(() => {
          clearInterval(t);
          if (!(win as any).scanic) reject(new Error('scanic 加载失败'));
        }, 10000);
      }
    };
    s.onerror = () => reject(new Error('scanic.js 加载失败'));
    document.head.appendChild(s);
  });
  return scanicPromise;
}

function ensureScanner(): Promise<InstanceType<ScanicModule['Scanner']>> {
  if (!scannerPromise) {
    scannerPromise = ensureScanic().then(async (m) => {
      const s = new m.Scanner();
      await s.initialize();
      return s;
    });
  }
  return scannerPromise;
}

/** scanic 成熟检测：单文档四角 [TL,TR,BR,BL]（源图坐标） */
async function detectWithScanic(src: HTMLCanvasElement): Promise<Point[] | null> {
  const s = await ensureScanner();
  const r = await s.scan(src, { mode: 'detect' });
  if (r && r.success && r.corners) {
    return [
      { x: r.corners.topLeft.x, y: r.corners.topLeft.y },
      { x: r.corners.topRight.x, y: r.corners.topRight.y },
      { x: r.corners.bottomRight.x, y: r.corners.bottomRight.y },
      { x: r.corners.bottomLeft.x, y: r.corners.bottomLeft.y },
    ];
  }
  return null;
}

function similarQuad(a: Point[], b: Point[], tol: number): boolean {
  if (a.length !== 4 || b.length !== 4) return false;
  let d = 0;
  for (let i = 0; i < 4; i++) d += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y);
  return d / 4 < tol;
}

/**
 * 自动框选：scanic 成熟方案优先，原算法多候选补充。
 * 返回候选四边形（源图坐标 [TL,TR,BR,BL]）或 null。
 */
export async function detectQuadsSmart(src: HTMLCanvasElement): Promise<Point[][] | null> {
  const legacy = detectQuadsFromCanvas(src) ?? [];
  try {
    const sc = await detectWithScanic(src);
    if (sc) {
      const tol = Math.max(8, Math.max(src.width, src.height) * 0.02);
      const merged = [sc, ...legacy.filter((q) => !similarQuad(q, sc, tol))].slice(0, 6);
      console.log('[scan] scanic ok, candidates=' + merged.length);
      return merged;
    }
  } catch (e) {
    console.warn('[scan] scanic 不可用，使用原算法', e);
  }
  return legacy.length ? legacy : null;
}
