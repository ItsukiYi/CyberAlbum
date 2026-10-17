import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { saveItem, savePhoto, saveSettings, uid } from '../db/repo';
import type { Item, SignedState } from '../db/types';
import { Modal, Btn, Field, Segmented } from './ui';
import { AutoInput } from './AutoInput';
import { DateField } from './DateField';
import { detectQuadsFromCanvas } from '../utils/geometry';
import {
  canvasToBlob,
  compressCanvas,
  compressImage,
  cornersEqual,
  cropQuadToBlob,
  fileToImage,
  fullFrameCorners,
  imageToCanvas,
  rotateCanvas,
} from '../utils/image';

interface Props {
  onClose: () => void;
}

type Mode = 'single' | 'album';

interface Preview {
  id: string;
  blob: Blob;
  corrected?: boolean; // 该张是否成功执行了自动边角矫正
}

function Thumb({ file }: { file: File }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url ? <img src={url} alt="" /> : null;
}

function ThumbBlob({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url ? <img src={url} alt="" /> : <div className="tile-empty" />;
}

function emptyItem(photoIds: string[], notes: string): Item {
  return {
    id: uid('i'),
    name: '',
    typeId: null,
    work: '',
    cosers: [],
    author: '',
    event: '',
    date: '',
    signed: 'none',
    toSign: '',
    region: null,
    location: '',
    quantity: null,
    price: null,
    source: '',
    notes,
    tags: [],
    custom: {},
    photoIds,
    mainPhotoId: photoIds[0] ?? null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function BatchImport({ onClose }: Props) {
  const { settings, refresh, types, items } = useStore();
  const [files, setFiles] = useState<File[]>([]);
  const [picked, setPicked] = useState(false);
  const [mode, setMode] = useState<Mode>('single');
  const [skip, setSkip] = useState(settings.skipCorrection ?? false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [preview, setPreview] = useState<Preview[] | null>(null);
  const [photoCount, setPhotoCount] = useState(0); // 图集模式实际导入的照片数（preview 清空后仍可用）
  const [albumInfo, setAlbumInfo] = useState({
    name: '',
    typeId: '',
    work: '',
    event: '',
    date: '',
    signed: 'none' as SignedState,
  });

  const ipSug = useMemo(() => [...new Set(items.map((i) => i.work).filter(Boolean))], [items]);
  const eventSug = useMemo(() => [...new Set(items.map((i) => i.event).filter(Boolean))], [items]);

  const toggleSkip = () => {
    const v = !skip;
    setSkip(v);
    saveSettings({ ...settings, skipCorrection: v });
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fs = e.target.files ? Array.from(e.target.files) : [];
    setFiles(fs);
    setPicked(fs.length > 0);
    setDone(null);
    setPreview(null);
    e.target.value = '';
  };

  /** 处理一张照片 → 可能裁出多张（一图多色纸），输出前按设置自动美化 */
  const processFile = async (file: File): Promise<{ blobs: Blob[]; corrected: boolean }> => {
    const img = await fileToImage(file);
    const cv = imageToCanvas(img);
    const en = settings.autoEnhance;
    if (skip) return { blobs: [await compressImage(img, en)], corrected: false };
    const quads = detectQuadsFromCanvas(cv) ?? [];
    const valid = quads.filter((q) => !cornersEqual(q, fullFrameCorners(cv.width, cv.height), 3));
    if (valid.length > 1) {
      // 一张照片里有多张色纸：各自裁正
      const out: Blob[] = [];
      for (const q of valid) out.push((await cropQuadToBlob(cv, q, en)).blob);
      return { blobs: out, corrected: true };
    }
    const q = valid[0] ?? null;
    return q
      ? { blobs: [(await cropQuadToBlob(cv, q, en)).blob], corrected: true }
      : { blobs: [await compressCanvas(cv, undefined, en)], corrected: false };
  };

  /** 阶段 1：处理照片 → 预览 */
  const process = async () => {
    if (!files.length || busy) return;
    setBusy(true);
    const out: Preview[] = [];
    for (const file of files) {
      try {
        const r = await processFile(file);
        for (const b of r.blobs) out.push({ id: uid('p'), blob: b, corrected: r.corrected });
      } catch (err) {
        console.error('照片处理失败:', err);
      }
    }
    setPreview(out);
    setBusy(false);
    if (!out.length) setDone(0);
  };

  /** 预览里旋转（解决朝向颠倒） */
  const rotatePreview = async (id: string) => {
    const p = preview?.find((x) => x.id === id);
    if (!p || busy) return;
    const img = await fileToImage(p.blob);
    const blob = await canvasToBlob(rotateCanvas(imageToCanvas(img)));
    setPreview((prev) => (prev ?? []).map((x) => (x.id === id ? { ...x, blob } : x)));
  };

  /** 阶段 2：确认导入 */
  const confirmImport = async () => {
    const blobs = preview ?? [];
    if (!blobs.length || busy) return;
    setBusy(true);
    let saved = 0;
    try {
      if (mode === 'album') {
        const photoIds = blobs.map(() => uid('p'));
        const item: Item = {
          ...emptyItem(photoIds, albumInfo.name.trim() ? '' : '批量导入图集，待填写'),
          name: albumInfo.name.trim(),
          typeId: albumInfo.typeId || null,
          work: albumInfo.work.trim(),
          event: albumInfo.event.trim(),
          date: albumInfo.date,
          signed: albumInfo.signed,
        };
        await saveItem(item);
        for (let i = 0; i < blobs.length; i++) {
          await savePhoto({ id: photoIds[i], itemId: item.id, blob: blobs[i].blob, order: i, addedAt: Date.now() });
        }
        saved = blobs.length ? 1 : 0;
      } else {
        for (const b of blobs) {
          const photoId = uid('p');
          const item = emptyItem([photoId], '批量导入，待填写');
          await saveItem(item);
          await savePhoto({ id: photoId, itemId: item.id, blob: b.blob, order: 0, addedAt: Date.now() });
          saved++;
        }
      }
      setPreview(null);
      setPhotoCount(blobs.length);
      setDone(saved);
      if (saved > 0) refresh();
    } finally {
      setBusy(false);
    }
  };

  const pickerLabel = mode === 'album' ? '选择照片（写真集/海报集的全部页面，可多选）' : '选择照片（可多选，一张含多张色纸也会自动拆出）';
  const doneLabel =
    mode === 'album'
      ? done && done > 0
        ? `✅ 已导入 ${photoCount} 张照片合成 1 条记录，去图库补填信息`
        : '❌ 一张都没成功，请重试'
      : done && done > 0
        ? `✅ 已导入 ${done} 件，去图库补填信息`
        : '❌ 一张都没成功，请重试';

  return (
    <Modal
      title="批量导入照片"
      onClose={onClose}
      footer={
        <div className="form-actions">
          <Btn onClick={onClose} disabled={busy}>
            关闭
          </Btn>
          {picked && done == null && !preview && (
            <Btn variant="primary" onClick={process} disabled={busy}>
              {busy ? '处理中…' : '处理照片'}
            </Btn>
          )}
          {preview && preview.length > 0 && done == null && (
            <Btn variant="primary" onClick={confirmImport} disabled={busy}>
              {busy ? '导入中…' : `确认导入 ${preview.length} 张`}
            </Btn>
          )}
        </div>
      }
    >
      <div className="form">
        <p className="batch-desc">
          选择照片后先<b>处理</b>（自动裁正、一张含多张色纸会拆出多张），再在预览里<b>旋转调整朝向</b>，最后确认导入。
        </p>

        <div className="batch-mode">
          <button type="button" className={`batch-mode-btn${mode === 'single' ? ' active' : ''}`} onClick={() => setMode('single')}>
            每张一条
          </button>
          <button type="button" className={`batch-mode-btn${mode === 'album' ? ' active' : ''}`} onClick={() => setMode('album')}>
            📖 合为一条（图集）
          </button>
        </div>

        {mode === 'album' && (
          <div className="album-info">
            <div className="album-info-title">这条图集的基本信息（选填，导入后自动带上）</div>
            <Field label="名称">
              <input
                className="input"
                value={albumInfo.name}
                placeholder="如：某作品写真集"
                onChange={(e) => setAlbumInfo({ ...albumInfo, name: e.target.value })}
              />
            </Field>
            <div className="field-row">
              <Field label="类型">
                <select
                  className="input"
                  value={albumInfo.typeId}
                  onChange={(e) => setAlbumInfo({ ...albumInfo, typeId: e.target.value })}
                >
                  <option value="">未分类</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="IP">
                <AutoInput
                  value={albumInfo.work}
                  onChange={(v) => setAlbumInfo({ ...albumInfo, work: v })}
                  suggestions={ipSug}
                  placeholder="IP"
                />
              </Field>
            </div>
            <div className="field-row">
              <Field label="场次">
                <AutoInput
                  value={albumInfo.event}
                  onChange={(v) => setAlbumInfo({ ...albumInfo, event: v })}
                  suggestions={eventSug}
                  placeholder="场次"
                />
              </Field>
              <Field label="日期">
                <DateField value={albumInfo.date} onChange={(v) => setAlbumInfo({ ...albumInfo, date: v })} />
              </Field>
            </div>
            <Field label="签名状态">
              <Segmented<SignedState>
                options={[
                  { value: 'none', label: '无签名' },
                  { value: 'signed', label: '有签名' },
                  { value: 'to', label: 'To签' },
                ]}
                value={albumInfo.signed}
                onChange={(v) => setAlbumInfo({ ...albumInfo, signed: v })}
              />
            </Field>
          </div>
        )}

        <label className="skip-correct">
          <input type="checkbox" checked={skip} onChange={toggleSkip} />
          <span>照片已拍正，跳过边角矫正</span>
        </label>

        <label className="batch-picker">
          <span className="batch-picker-icon">🖼️</span>
          <span>{picked ? `已选 ${files.length} 张` : pickerLabel}</span>
          <input type="file" accept="image/*" multiple hidden onChange={onPick} />
        </label>

        {picked && !preview && done == null && (
          <div className="batch-thumbs">
            {files.slice(0, 12).map((f, i) => (
              <Thumb key={i} file={f} />
            ))}
            {files.length > 12 && <span className="batch-more">+{files.length - 12}</span>}
          </div>
        )}

        {preview && preview.length > 0 && done == null && (
          <div>
            <div className="preview-list">
              {preview.map((p) => (
                <div className="preview-item" key={p.id}>
                  <ThumbBlob blob={p.blob} />
                  <span className={`preview-tag${p.corrected ? ' ok' : ''}`}>
                    {p.corrected ? '已矫正' : '原图'}
                  </span>
                  <button
                    type="button"
                    className="preview-rot"
                    aria-label="旋转这张"
                    onClick={() => rotatePreview(p.id)}
                    disabled={busy}
                  >
                    ↻
                  </button>
                </div>
              ))}
            </div>
            <p className="batch-desc">共 {preview.length} 张。「已矫正」= 自动识别到边框并裁正；「原图」= 未识别到（保持原样）。朝向颠倒的点「↻」转正，确认后导入。</p>
          </div>
        )}

        {busy && (
          <div className="batch-progress">
            <div className="spinner" />
            <span>正在处理…</span>
          </div>
        )}

        {done != null && <div className="form-flash">{doneLabel}</div>}
      </div>
    </Modal>
  );
}