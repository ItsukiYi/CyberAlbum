import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { deletePhoto, saveItem, savePhoto, saveSettings, uid } from '../db/repo';
import type { Item, Region, SignedState } from '../db/types';
import { Modal, Btn, Field, Segmented } from './ui';
import { PhotoEditor } from './PhotoEditor';
import { TagInput } from './TagInput';
import { AutoInput } from './AutoInput';
import { compressImage, fileToImage } from '../utils/image';
import REGIONS from '../data/region.json';

interface DraftPhoto {
  id: string;
  blob: Blob;
  side?: 'front' | 'back';
}

interface Draft {
  name: string;
  typeId: string;
  work: string;
  cosers: string[];
  event: string;
  date: string;
  signed: SignedState;
  toSign: string;
  region: Region | null;
  location: string;
  quantity: string;
  price: string;
  source: string;
  notes: string;
  tags: string;
  custom: Record<string, string>;
}

function emptyDraft(typeId: string): Draft {
  return {
    name: '',
    typeId,
    work: '',
    cosers: [],
    event: '',
    date: '',
    signed: 'none',
    toSign: '',
    region: null,
    location: '',
    quantity: '',
    price: '',
    source: '',
    notes: '',
    tags: '',
    custom: {},
  };
}

function parseNum(s: string): number | null {
  const t = s.trim().replace(/[¥￥,，]/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function DraftThumb({ blob, className = '' }: { blob: Blob; className?: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url ? <img src={url} alt="" className={className} /> : <div className="tile-empty" />;
}

export function ItemForm() {
  const store = useStore();
  const { types, customFields, settings, formItem, closeForm, items } = store;
  const photosById = store.photosById;

  const defaultTypeId = useMemo(() => types[0]?.id ?? '', [types]);

  const [draft, setDraft] = useState<Draft>(() => {
    if (formItem) {
      return {
        name: formItem.name,
        typeId: formItem.typeId ?? '',
        work: formItem.work,
        cosers: formItem.cosers?.length
          ? [...formItem.cosers]
          : formItem.author
            ? [formItem.author]
            : [],
        event: formItem.event,
        date: formItem.date,
        signed: formItem.signed,
        toSign: formItem.toSign,
        region: formItem.region ?? null,
        location: formItem.location,
        quantity: formItem.quantity != null ? String(formItem.quantity) : '',
        price: formItem.price != null ? String(formItem.price) : '',
        source: formItem.source,
        notes: formItem.notes,
        tags: formItem.tags.join(', '),
        custom: { ...formItem.custom },
      };
    }
    return emptyDraft(defaultTypeId);
  });

  // 省市区联动数据
  const regData = REGIONS as Record<string, Record<string, string[]>>;
  const provOptions = useMemo(() => Object.keys(regData), []);
  const cityOptions = useMemo(
    () => (draft.region?.province ? Object.keys(regData[draft.region.province] ?? {}) : []),
    [draft.region?.province]
  );
  const distOptions = useMemo(() => {
    const p = draft.region?.province;
    const c = draft.region?.city;
    return p && c ? (regData[p]?.[c] ?? []) : [];
  }, [draft.region?.province, draft.region?.city]);

  // 联想：收集所有已录入过的 Coser / IP / 场次
  const coserSuggestions = useMemo(() => {
    const s = new Set<string>();
    for (const it of items) {
      if (it.author) s.add(it.author);
      for (const c of it.cosers ?? []) if (c) s.add(c);
    }
    return [...s];
  }, [items]);
  const ipSuggestions = useMemo(() => [...new Set(items.map((i) => i.work).filter(Boolean))], [items]);
  const eventSuggestions = useMemo(() => [...new Set(items.map((i) => i.event).filter(Boolean))], [items]);

  const [photos, setPhotos] = useState<DraftPhoto[]>(() => {
    if (!formItem) return [];
    return formItem.photoIds.map((id) => {
      const rec = photosById.get(id);
      return { id, blob: rec?.blob ?? new Blob(), side: rec?.side };
    });
  });

  const [editQueue, setEditQueue] = useState<Blob[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [flash, setFlash] = useState(false);
  const [skip, setSkip] = useState(settings.skipCorrection ?? false);
  const [processingPhotos, setProcessingPhotos] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  // 照片已拍正 → 跳过矫正：直接压缩进照片列表
  const toggleSkip = () => {
    const v = !skip;
    setSkip(v);
    saveSettings({ ...settings, skipCorrection: v });
  };

  // 折叠区里已填了多少项，用于在收起时提示
  const moreFilled = useMemo(() => {
    let n = 0;
    if (draft.location.trim()) n++;
    if (draft.quantity.trim()) n++;
    if (draft.price.trim()) n++;
    if (draft.source.trim()) n++;
    if (draft.tags.trim()) n++;
    if (draft.notes.trim()) n++;
    return n;
  }, [draft.location, draft.quantity, draft.price, draft.source, draft.tags, draft.notes]);

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const blobs: Blob[] = Array.from(files);
      if (blobs.length) {
        if (skip) {
          // 跳过矫正：压缩后直接加入
          setProcessingPhotos(true);
          try {
            const added = await Promise.all(
              blobs.map(async (file) => ({ id: uid('p'), blob: await compressImage(await fileToImage(file)) }))
            );
            setPhotos((prev) => [...prev, ...added]);
          } catch (err) {
            console.error(err);
          } finally {
            setProcessingPhotos(false);
          }
        } else {
          setEditQueue((q) => [...q, ...blobs]);
        }
      }
    }
    e.target.value = '';
  };

  const finishEditing = (resultBlob: Blob) => {
    setPhotos((prev) => [...prev, { id: uid('p'), blob: resultBlob }]);
    setEditQueue((q) => q.slice(1));
  };

  const skipEditing = () => setEditQueue((q) => q.slice(1));
  const cancelEditing = () => setEditQueue([]);

  const removePhoto = (id: string) => setPhotos((prev) => prev.filter((p) => p.id !== id));

  // 循环切换 无标记 → 正面 → 反面 → 无标记
  const cycleSide = (id: string) =>
    setPhotos((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, side: p.side === 'front' ? 'back' : p.side === 'back' ? undefined : 'front' } : p
      )
    );

  const save = async (keepEditing: boolean) => {
    const name = draft.name.trim();
    if (!name) {
      setError('请填写名称');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const item: Item = {
        id: formItem?.id ?? uid('i'),
        name,
        typeId: draft.typeId || null,
        work: draft.work.trim(),
        cosers: draft.cosers,
        author: draft.cosers[0] ?? '',
        event: draft.event.trim(),
        date: draft.date,
        signed: draft.signed,
        toSign: draft.toSign.trim(),
        region: draft.region,
        location: draft.location.trim(),
        quantity: parseNum(draft.quantity),
        price: parseNum(draft.price),
        source: draft.source.trim(),
        notes: draft.notes.trim(),
        tags: draft.tags
          .split(/[,，、\s]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        custom: draft.custom,
        photoIds: photos.map((p) => p.id),
        mainPhotoId: photos[0]?.id ?? null,
        createdAt: formItem?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      };

      await saveItem(item);

      const existingIds = new Set(formItem?.photoIds ?? []);
      for (const p of photos) {
        if (!existingIds.has(p.id)) {
          await savePhoto({
            id: p.id,
            itemId: item.id,
            blob: p.blob,
            order: photos.indexOf(p),
            addedAt: Date.now(),
            side: p.side,
          });
        }
      }
      for (const oldId of existingIds) {
        if (!photos.some((p) => p.id === oldId)) await deletePhoto(oldId);
      }

      if (keepEditing) {
        // 连续录入：保留常用值（作品/作者/场次/日期/签名状态/自定义字段/类型），
        // 清空每件都不同的内容，自动聚焦名称
        setDraft({
          ...draft,
          name: '',
          toSign: '',
          location: '',
          quantity: '',
          price: '',
          source: '',
          notes: '',
          tags: '',
        });
        setPhotos([]);
        setFlash(true);
        window.setTimeout(() => setFlash(false), 1600);
        requestAnimationFrame(() => nameRef.current?.focus());
      } else {
        closeForm();
      }
    } catch (err) {
      console.error(err);
      setError('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const activeField = (show: boolean, defs: { label: string; value: string; key: keyof Draft }[]) =>
    show ? defs : [];

  return (
    <>
      {editQueue.length > 0 && (
        <PhotoEditor
          blob={editQueue[0]}
          index={0}
          total={editQueue.length}
          onDone={finishEditing}
          onSkip={skipEditing}
          onCancel={cancelEditing}
        />
      )}
      <Modal
        title={formItem ? '编辑周边' : '新增周边'}
        onClose={closeForm}
        wide
        footer={
          <div className="form-actions">
            <Btn onClick={closeForm} disabled={saving}>
              取消
            </Btn>
            {!formItem && (
              <Btn variant="soft" onClick={() => save(false)} disabled={saving}>
                {saving ? '保存中…' : '保存'}
              </Btn>
            )}
            <Btn variant="primary" onClick={() => save(!formItem)} disabled={saving}>
              {saving ? '保存中…' : formItem ? '保存' : '继续录入'}
            </Btn>
          </div>
        }
      >
        <div className="form">
          {/* 照片 */}
          <div className="photo-strip">
            {photos.map((p) => (
              <div
                className={`photo-tile${photos[0]?.id === p.id ? ' is-main' : ''}`}
                key={p.id}
              >
                <DraftThumb blob={p.blob} />
                {photos[0]?.id === p.id && <span className="main-flag">主图</span>}
                <button
                  className={`tile-side${p.side ? '' : ' none'}`}
                  onClick={() => cycleSide(p.id)}
                  aria-label="标记正面或反面"
                >
                  {p.side === 'front' ? '正' : p.side === 'back' ? '反' : '面'}
                </button>
                <button
                  className="tile-del"
                  onClick={() => removePhoto(p.id)}
                  aria-label="删除照片"
                >
                  ✕
                </button>
              </div>
            ))}
            {photos.length < 60 && (
              <div className="photo-add">
                <label className="add-cam">
                  📷<input type="file" accept="image/*" capture="environment" hidden onChange={onPickFiles} />
                </label>
                <label className="add-album">
                  🖼️<input type="file" accept="image/*" multiple hidden onChange={onPickFiles} />
                </label>
              </div>
            )}
          </div>
          {processingPhotos && <div className="form-flash">正在压缩照片…</div>}
          <label className="skip-correct">
            <input type="checkbox" checked={skip} onChange={toggleSkip} />
            <span>照片已拍正，跳过边角矫正（直接使用原图）</span>
          </label>

          {error && <div className="form-error">{error}</div>}
          {flash && <div className="form-flash">✅ 已保存，继续录入下一条</div>}

          <Field label="名称" required>
            <input
              ref={nameRef}
              className="input"
              value={draft.name}
              placeholder="推荐命名：角色名或皮肤-角色名"
              onChange={(e) => set({ name: e.target.value })}
              autoFocus
            />
          </Field>

          <Field label="类型">
            <select className="input" value={draft.typeId} onChange={(e) => set({ typeId: e.target.value })}>
              <option value="">未分类</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="field-row">
            <Field label="IP">
              <AutoInput value={draft.work} onChange={(v) => set({ work: v })} suggestions={ipSuggestions} placeholder="IP / 作品名" />
            </Field>
            <Field label="Coser">
              <TagInput
                values={draft.cosers}
                onChange={(v) => set({ cosers: v })}
                suggestions={coserSuggestions}
                placeholder="输入 Coser 名，回车添加"
                hint="多人海报依次添加，回车确认"
              />
            </Field>
          </div>

          <div className="field-row">
            <Field label="场次">
              <AutoInput value={draft.event} onChange={(v) => set({ event: v })} suggestions={eventSuggestions} placeholder="场次 / 活动名" />
            </Field>
            <Field label="日期">
              <input type="date" className="input" value={draft.date} onChange={(e) => set({ date: e.target.value })} />
            </Field>
          </div>

          <Field label="地点">
            <div className="region-picker">
              <select
                className="input"
                value={draft.region?.province ?? ''}
                onChange={(e) =>
                  set({ region: e.target.value ? { province: e.target.value, city: '', district: '' } : null })
                }
              >
                <option value="">省</option>
                {provOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <select
                className="input"
                value={draft.region?.city ?? ''}
                disabled={!draft.region?.province}
                onChange={(e) =>
                  set({ region: { province: draft.region!.province, city: e.target.value, district: '' } })
                }
              >
                <option value="">市</option>
                {cityOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                className="input"
                value={draft.region?.district ?? ''}
                disabled={!draft.region?.city}
                onChange={(e) =>
                  set({ region: { province: draft.region!.province, city: draft.region!.city, district: e.target.value } })
                }
              >
                <option value="">区/县</option>
                {distOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </Field>

          <Field label="签名状态">
            <Segmented<SignedState>
              options={[
                { value: 'none', label: '无签名' },
                { value: 'signed', label: '有签名' },
                { value: 'to', label: 'To签' },
              ]}
              value={draft.signed}
              onChange={(v) => set({ signed: v })}
            />
          </Field>
          
          {customFields.map((f) => (
            <Field label={f.name} key={f.id}>
              {f.kind === 'select' ? (
                <select
                  className="input"
                  value={draft.custom[f.id] ?? ''}
                  onChange={(e) => set({ custom: { ...draft.custom, [f.id]: e.target.value } })}
                >
                  <option value="">—</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : f.kind === 'number' ? (
                <input
                  className="input"
                  inputMode="numeric"
                  value={draft.custom[f.id] ?? ''}
                  onChange={(e) => set({ custom: { ...draft.custom, [f.id]: e.target.value } })}
                />
              ) : (
                <input
                  className="input"
                  value={draft.custom[f.id] ?? ''}
                  onChange={(e) => set({ custom: { ...draft.custom, [f.id]: e.target.value } })}
                />
              )}
            </Field>
          ))}

          {/* 更多信息（可折叠，默认收起，减轻录入负担） */}
          <div className="form-more">
            <button type="button" className="form-more-toggle" onClick={() => setMoreOpen((v) => !v)}>
              <span className="form-more-label">{moreOpen ? '收起更多信息' : '更多信息'}</span>
              {!moreOpen && moreFilled > 0 && <span className="form-more-count">{moreFilled} 项已填</span>}
              <span className="form-more-chev">{moreOpen ? '▲' : '▼'}</span>
            </button>
            {moreOpen && (
              <div className="form-more-body">
                {activeField(settings.showLocation, [{ label: '存放位置', value: draft.location, key: 'location' }]).map((f) => (
                  <Field label={f.label} key={f.key}>
                    <input className="input" value={f.value} placeholder="哪个柜子 / 抽屉 / 箱子" onChange={(e) => set({ [f.key]: e.target.value } as Partial<Draft>)} />
                  </Field>
                ))}
                {activeField(settings.showQuantity, [{ label: '数量', value: draft.quantity, key: 'quantity' }]).map((f) => (
                  <Field label={f.label} key={f.key}>
                    <input className="input" inputMode="numeric" value={f.value} placeholder="1" onChange={(e) => set({ [f.key]: e.target.value } as Partial<Draft>)} />
                  </Field>
                ))}
                {activeField(settings.showPrice, [{ label: '价格', value: draft.price, key: 'price' }]).map((f) => (
                  <Field label={f.label} key={f.key}>
                    <input className="input" inputMode="decimal" value={f.value} placeholder="0" onChange={(e) => set({ [f.key]: e.target.value } as Partial<Draft>)} />
                  </Field>
                ))}
                {activeField(settings.showSource, [{ label: '来源', value: draft.source, key: 'source' }]).map((f) => (
                  <Field label={f.label} key={f.key}>
                    <input className="input" value={f.value} placeholder="购买 / 赠品" onChange={(e) => set({ [f.key]: e.target.value } as Partial<Draft>)} />
                  </Field>
                ))}

                <Field label="标签" hint="用逗号或空格分隔，方便日后搜索">
                  <input className="input" value={draft.tags} placeholder="徽章, 限定, 一套" onChange={(e) => set({ tags: e.target.value })} />
                </Field>

                <Field label="备注">
                  <textarea className="input textarea" rows={3} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
                </Field>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
