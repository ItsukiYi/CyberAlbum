import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { detectQuadsFromCanvas, type Point } from '../utils/geometry';
import {
  compressCanvas,
  cornersEqual,
  cropQuadToBlob,
  fileToImage,
  fullFrameCorners,
  imageToCanvas,
  rotateCanvas,
} from '../utils/image';

interface View {
  scale: number;
  ox: number;
  oy: number;
  cw: number;
  ch: number;
  dpr: number;
}

interface Props {
  blob: Blob;
  index: number;
  total: number;
  onDone: (blob: Blob) => void;
  onSkip: () => void;
  onCancel: () => void;
}

const LENS_SIZE = 132;
const LENS_ZOOM = 2.4;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** 点是否在四边形内部（各边叉积同号） */
function pointInQuad(p: Point, quad: Point[]): boolean {
  if (quad.length < 4) return false;
  let signs = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(cross) < 1e-9) continue;
    if (cross > 0) signs |= 1;
    else signs |= 2;
    if (signs === 3) return false;
  }
  return true;
}

export function PhotoEditor({ blob, index, total, onDone, onSkip, onCancel }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lensCanvasRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<HTMLCanvasElement | null>(null);
  const viewRef = useRef<View | null>(null);
  const lensRef = useRef<{ x: number; y: number; sx: number; sy: number } | null>(null);
  const touchPreventRef = useRef<null | (() => void)>(null);

  const [source, setSource] = useState<HTMLCanvasElement | null>(null);
  const [quads, setQuads] = useState<Point[][]>([]);
  const [active, setActive] = useState(0);
  const [view, setView] = useState<View | null>(null);
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState(false);

  // 单独的 lens 状态驱动渲染（可在 move 里即时合并）
  const [, forceLens] = useState(0);

  const activeRef = useRef(active);
  activeRef.current = active;
  const quadsRef = useRef(quads);
  quadsRef.current = quads;

  const corners = useMemo<Point[]>(() => quads[active] ?? [], [quads, active]);

  // 载入图片 + 自动识别（支持同图多张）
  useEffect(() => {
    let alive = true;
    setBusy(true);
    setHint('正在识别边缘…');
    fileToImage(blob)
      .then(async (img) => {
        if (!alive) return;
        const cv = imageToCanvas(img);
        sourceRef.current = cv;
        setSource(cv);
        const defaultQuad = fullFrameCorners(cv.width, cv.height);
        const found = detectQuadsFromCanvas(cv);
        if (!alive) return;
        if (found && found.length) {
          setQuads(found);
          setActive(0);
          setHint(found.length > 1 ? `识别到 ${found.length} 张纸片，点击想要的那张后微调` : '已自动识别，可拖动四角微调');
        } else {
          setQuads([defaultQuad]);
          setActive(0);
          setHint('未能自动识别，请拖动四角手动调整');
        }
        setBusy(false);
      })
      .catch(() => {
        setBusy(false);
        setHint('图片加载失败');
      });
    return () => {
      alive = false;
    };
  }, [blob]);

  // 计算显示布局
  const computeView = useCallback(() => {
    const stage = stageRef.current;
    const src = sourceRef.current;
    if (!stage || !src) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const scale = Math.min((rect.width - 8) / src.width, (rect.height - 8) / src.height, 2);
    const w = src.width * scale;
    const h = src.height * scale;
    const v: View = { scale, ox: (rect.width - w) / 2, oy: (rect.height - h) / 2, cw: rect.width, ch: rect.height, dpr };
    viewRef.current = v;
    setView(v);
  }, []);

  useEffect(() => {
    computeView();
    const stage = stageRef.current;
    if (!stage) return;
    const ro = new ResizeObserver(computeView);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [computeView, source]);

  // 阻止浏览器侧滑返回（边缘拖角时误触导航手势）
  useEffect(() => {
    const prevent = (e: TouchEvent) => e.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    stage.addEventListener('touchmove', prevent, { passive: false });
    document.addEventListener('touchmove', prevent, { passive: false });
    touchPreventRef.current = () => {
      stage.removeEventListener('touchmove', prevent);
      document.removeEventListener('touchmove', prevent);
    };
    return () => touchPreventRef.current?.();
  }, []);

  // 绘制
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !view || !source) return;
    canvas.width = Math.round(view.cw * view.dpr);
    canvas.height = Math.round(view.ch * view.dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#16151f';
    ctx.fillRect(0, 0, view.cw, view.ch);
    ctx.drawImage(source, view.ox, view.oy, source.width * view.scale, source.height * view.scale);

    quads.forEach((q, idx) => {
      const pts = q.map((c) => ({ x: c.x * view.scale + view.ox, y: c.y * view.scale + view.oy }));
      const isActive = idx === activeRef.current;
      // 区域外压暗（激活的压得明显，候选的轻微提示）
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(view.cw, 0);
      ctx.lineTo(view.cw, view.ch);
      ctx.lineTo(0, view.ch);
      ctx.closePath();
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(pts[1].x, pts[1].y);
      ctx.lineTo(pts[2].x, pts[2].y);
      ctx.lineTo(pts[3].x, pts[3].y);
      ctx.closePath();
      ctx.fillStyle = isActive ? 'rgba(0,0,0,0.42)' : 'rgba(0,0,0,0.14)';
      ctx.fill('evenodd');
      // 边框
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(pts[1].x, pts[1].y);
      ctx.lineTo(pts[2].x, pts[2].y);
      ctx.lineTo(pts[3].x, pts[3].y);
      ctx.closePath();
      ctx.strokeStyle = isActive ? '#ffffff' : 'rgba(255,255,255,0.55)';
      ctx.lineWidth = isActive ? 2 : 1;
      ctx.stroke();
    });
  }, [source, quads, view]);

  const toSourcePt = (cx: number, cy: number) => {
    const v = viewRef.current;
    const src = sourceRef.current;
    if (!v || !src) return null;
    const x = (cx - v.ox) / v.scale;
    const y = (cy - v.oy) / v.scale;
    return { x: clamp(x, 0, src.width), y: clamp(y, 0, src.height) };
  };

  const handlePos = (i: number): { left: number; top: number } => {
    if (!view || corners.length < 4) return { left: 0, top: 0 };
    const c = corners[i];
    return { left: c.x * view.scale + view.ox, top: c.y * view.scale + view.oy };
  };

  // 放大镜绘制
  const paintLens = useCallback(() => {
    const lc = lensCanvasRef.current;
    const src = sourceRef.current;
    const v = viewRef.current;
    const L = lensRef.current;
    if (!lc || !src || !v || !L) return;
    const dpr = v.dpr;
    lc.width = LENS_SIZE * dpr;
    lc.height = LENS_SIZE * dpr;
    const ctx = lc.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.clearRect(0, 0, LENS_SIZE, LENS_SIZE);
    // 源图窗口（以按压点为中心）
    const half = LENS_SIZE / 2 / LENS_ZOOM;
    const sx0 = clamp(L.sx - half, 0, src.width);
    const sy0 = clamp(L.sy - half, 0, src.height);
    const sw = clamp(L.sx + half, 0, src.width) - sx0;
    const sh = clamp(L.sy + half, 0, src.height) - sy0;
    if (sw <= 0 || sh <= 0) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, sx0, sy0, sw, sh, 0, 0, LENS_SIZE, LENS_SIZE);
    // 暗化非裁剪区 + 裁剪线
    const pts = quadsRef.current[activeRef.current] ?? [];
    if (pts.length === 4 && !cornersEqual(pts, fullFrameCorners(src.width, src.height), 3)) {
      const vpts = pts.map((c) => ({
        x: ((c.x - sx0) / sw) * LENS_SIZE,
        y: ((c.y - sy0) / sh) * LENS_SIZE,
      }));
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(LENS_SIZE, 0);
      ctx.lineTo(LENS_SIZE, LENS_SIZE);
      ctx.lineTo(0, LENS_SIZE);
      ctx.closePath();
      ctx.moveTo(vpts[0].x, vpts[0].y);
      ctx.lineTo(vpts[1].x, vpts[1].y);
      ctx.lineTo(vpts[2].x, vpts[2].y);
      ctx.lineTo(vpts[3].x, vpts[3].y);
      ctx.closePath();
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fill('evenodd');
      // 裁剪边
      ctx.beginPath();
      ctx.moveTo(vpts[0].x, vpts[0].y);
      ctx.lineTo(vpts[1].x, vpts[1].y);
      ctx.lineTo(vpts[2].x, vpts[2].y);
      ctx.lineTo(vpts[3].x, vpts[3].y);
      ctx.closePath();
      ctx.strokeStyle = '#0e76e8';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // 准星
    ctx.strokeStyle = 'rgba(238, 238, 255, 0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LENS_SIZE / 2 - 5, LENS_SIZE / 2);
    ctx.lineTo(LENS_SIZE / 2 + 5, LENS_SIZE / 2);
    ctx.moveTo(LENS_SIZE / 2, LENS_SIZE / 2 - 5);
    ctx.lineTo(LENS_SIZE / 2, LENS_SIZE / 2 + 5);
    ctx.stroke();
  }, []);

  const hideLens = () => {
    lensRef.current = null;
    forceLens(0);
  };

  const showLensAt = (cx: number, cy: number) => {
    const sp = toSourcePt(cx, cy);
    if (!sp) return;
    lensRef.current = { x: cx, y: cy, sx: sp.x, sy: sp.y };
    paintLens();
    forceLens((n) => n + 1);
  };

  const handleLensPos = (): { left: number; top: number } => {
    if (!view || !lensRef.current) return { left: -9999, top: -9999 };
    const cx = lensRef.current.x;
    const cy = lensRef.current.y;
    const dir = cx > view.cw / 2 ? -1 : 1;
    const size = LENS_SIZE / 2 + 12;
    let left = cx + dir * size;
    let top = cy - LENS_SIZE / 2;
    left = clamp(left, 6, view.cw - LENS_SIZE - 6);
    top = clamp(top, 6, view.ch - LENS_SIZE - 6);
    return { left, top };
  };

  const startDrag = (index: number) => (e: React.PointerEvent) => {
    if (!viewRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const stage = stageRef.current!;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    showLensAt(e.clientX, e.clientY);

    const move = (ev: PointerEvent) => {
      const v = viewRef.current;
      const src = sourceRef.current;
      if (!v || !src) return;
      const rect = stage.getBoundingClientRect();
      const x = (ev.clientX - rect.left - v.ox) / v.scale;
      const y = (ev.clientY - rect.top - v.oy) / v.scale;
      const cxp = clamp(x, 0, src.width);
      const cyp = clamp(y, 0, src.height);
      setQuads((prev) =>
        prev.map((q, qi) => (qi === activeRef.current ? q.map((p, j) => (j === index ? { x: cxp, y: cyp } : p)) : q))
      );
      lensRef.current = { x: ev.clientX, y: ev.clientY, sx: cxp, sy: cyp };
      paintLens();
    };
    const up = (ev: PointerEvent) => {
      el.releasePointerCapture(ev.pointerId);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      hideLens();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  // 点击候选四边形切换激活
  const onStagePointerDown = (e: React.PointerEvent) => {
    const v = viewRef.current;
    if (!v || busy) return;
    const rect = stageRef.current!.getBoundingClientRect();
    // 用 stage 坐标算
    const sx = (e.clientX - rect.left - v.ox) / v.scale;
    const sy = (e.clientY - rect.top - v.oy) / v.scale;
    const tgt = quadsRef.current.findIndex((q, qi) => qi !== activeRef.current && pointInQuad({ x: sx, y: sy }, q));
    if (tgt >= 0) {
      e.stopPropagation();
      setActive(tgt);
      setHint(`已切换到第 ${tgt + 1} 张，拖动四角微调`);
    }
  };

  const rotate = () => {
    const src = sourceRef.current;
    if (!src) return;
    const cv = rotateCanvas(src);
    sourceRef.current = cv;
    setSource(cv);
    const found = detectQuadsFromCanvas(cv);
    if (found && found.length) {
      setQuads(found);
      setActive(0);
      setHint(found.length > 1 ? `识别到 ${found.length} 张纸片，点击切换` : '已自动识别，可拖动四角微调');
    } else {
      setQuads([fullFrameCorners(cv.width, cv.height)]);
      setHint('未能自动识别，请拖动四角手动调整');
    }
    computeView();
  };

  const auto = () => {
    const src = sourceRef.current;
    if (!src) return;
    const found = detectQuadsFromCanvas(src);
    if (found && found.length) {
      setQuads(found);
      setActive(0);
      setHint(found.length > 1 ? `识别到 ${found.length} 张纸片，点击切换` : '已自动识别，可拖动四角微调');
    } else {
      setQuads([fullFrameCorners(src.width, src.height)]);
      setHint('未能自动识别，请拖动四角手动调整');
    }
  };

  const reset = () => {
    const src = sourceRef.current;
    if (!src) return;
    setQuads([fullFrameCorners(src.width, src.height)]);
    setActive(0);
    setHint('已重置为整张画面');
  };

  // 一张照片里有多张色纸时，一次把每个候选四边形都裁出来
  const finishAll = async () => {
    const src = sourceRef.current;
    if (!src || busy) return;
    setBusy(true);
    setHint('正在逐张裁剪…');
    try {
      const qs = quadsRef.current;
      const full = fullFrameCorners(src.width, src.height);
      if (qs.length <= 1) {
        await finish();
        return;
      }
      for (const q of qs) {
        const blob = cornersEqual(q, full, 3) ? await compressCanvas(src) : (await cropQuadToBlob(src, q)).blob;
        onDone(blob);
      }
    } catch (err) {
      console.error(err);
      setHint('处理失败，请重试');
      setBusy(false);
    }
  };

  const finish = async () => {
    const src = sourceRef.current;
    if (!src || busy) return;
    setBusy(true);
    setHint('正在处理…');
    try {
      const cur = quadsRef.current[activeRef.current] ?? fullFrameCorners(src.width, src.height);
      if (cornersEqual(cur, fullFrameCorners(src.width, src.height), 3)) {
        const blobOut = await compressCanvas(src);
        onDone(blobOut);
      } else {
        const { blob: blobOut } = await cropQuadToBlob(src, cur);
        onDone(blobOut);
      }
    } catch (err) {
      console.error(err);
      setHint('处理失败，请重试');
      setBusy(false);
    }
  };

  const lensPos = handleLensPos();

  return (
    <div className="editor-backdrop">
      <div className="editor">
        <div className="editor-head">
          <div className="editor-title">
            裁切矫正 <span className="editor-count">{index + 1} / {total}</span>
          </div>
          <button className="btn-icon" onClick={onCancel} aria-label="取消">
            ✕
          </button>
        </div>
        <div className="editor-stage" ref={stageRef} onPointerDown={onStagePointerDown}>
          <canvas ref={canvasRef} className="editor-canvas" />
          {view &&
            quads.map((q, qi) =>
              qi === active
                ? [0, 1, 2, 3].map((i) => {
                    const p = handlePos(i);
                    return (
                      <div
                        key={`${qi}-${i}`}
                        className="corner-handle"
                        style={{ left: p.left - 19, top: p.top - 19 }}
                        onPointerDown={startDrag(i)}
                      />
                    );
                  })
                : null
            )}
          {lensRef.current && (
            <div className="editor-lens" style={{ left: lensPos.left, top: lensPos.top }}>
              <canvas ref={lensCanvasRef} className="editor-lens-canvas" style={{ width: LENS_SIZE, height: LENS_SIZE }} />
            </div>
          )}
        </div>
        <div className="editor-hint">{hint}</div>
        <div className="editor-toolbar">
          <button className="btn" onClick={rotate}>
            🔄 旋转
          </button>
          <button className="btn" onClick={auto}>
            ✨ 自动
          </button>
          <button className="btn" onClick={reset}>
            重置
          </button>
          {quads.length > 1 && (
            <button className="btn" onClick={finishAll} disabled={busy}>
              ✂️ 全部裁出
            </button>
          )}
        </div>
        <div className="editor-actions">
          <button className="btn" onClick={onSkip} disabled={busy}>
            跳过
          </button>
          <button className="btn btn-primary" onClick={finish} disabled={busy}>
            {busy ? '处理中…' : '完成'}
          </button>
        </div>
      </div>
    </div>
  );
}