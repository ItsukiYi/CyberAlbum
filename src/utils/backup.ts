// 备份：导出 zip（items.json + photos/*.jpg），导入时整体还原
import JSZip from 'jszip';
import { db } from '../db/db';
import {
  deleteItem,
  listItems,
  listPhotos,
  getSettings,
  listTypes,
  listCustomFields,
  uid,
} from '../db/repo';

const BACKUP_VERSION = 1;

export async function exportBackup(): Promise<Blob> {
  const [items, photos, types, fields, settings] = await Promise.all([
    listItems(),
    listPhotos(),
    listTypes(),
    listCustomFields(),
    getSettings(),
  ]);

  const zip = new JSZip();
  const manifest = {
    app: 'shouna',
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    types,
    customFields: fields,
    settings,
    items: items.map((it) => ({ ...it })),
  };
  zip.file('items.json', JSON.stringify(manifest));

  const folder = zip.folder('photos');
  if (folder) {
    for (const p of photos) {
      folder.file(`${p.id}.jpg`, p.blob);
    }
  }
  // 照片元数据：双面色纸的正/反标记
  const photoMeta: Record<string, 'front' | 'back'> = {};
  for (const p of photos) if (p.side) photoMeta[p.id] = p.side;
  if (Object.keys(photoMeta).length) zip.file('photos.json', JSON.stringify(photoMeta));
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

export async function importBackup(file: Blob): Promise<{ items: number }> {
  const zip = await JSZip.loadAsync(file);
  const jsonFile = zip.file('items.json');
  if (!jsonFile) throw new Error('备份文件里没有 items.json');

  const text = await jsonFile.async('text');
  const manifest = JSON.parse(text);
  if (manifest.app !== 'shouna') throw new Error('不是收纳册的备份文件');

  const photoFolder = zip.folder('photos');
  const items = (manifest.items as Array<Record<string, unknown>>) ?? [];

  // 重建照片 id 映射（防止和已有对象 URL 冲突）
  const idMap = new Map<string, string>();
  for (const it of items) {
    const photoIds = (it.photoIds as string[]) ?? [];
    for (const pid of photoIds) {
      const newId = uid('p');
      idMap.set(pid, newId);
    }
  }

  // 事务外先解压照片（JSZip 异步不属于 Dexie 事务，放进事务会触发 committed too early）
  const sideMetaRaw = zip.file('photos.json');
  const sideMeta: Record<string, 'front' | 'back'> = sideMetaRaw ? JSON.parse(await sideMetaRaw.async('text')) : {};
  const photoRows: Array<{ id: string; itemId: string; blob: Blob; order: number; addedAt: number; side?: 'front' | 'back' }> = [];
  if (photoFolder) {
    const photosInZip: Array<{ pid: string; file: import('jszip').JSZipObject }> = [];
    photoFolder.forEach((_rel, file) => {
      if (!file.name.toLowerCase().endsWith('.jpg')) return;
      const pid = file.name.split('/').pop()!.replace(/\.jpg$/i, '');
      photosInZip.push({ pid, file });
    });
    const order = new Map<string, number>();
    await Promise.all(
      photosInZip.map(async ({ pid, file }) => {
        const blob = await file.async('blob');
        const mapped = idMap.get(pid) ?? pid;
        const o = order.get(mapped) ?? 0;
        order.set(mapped, o + 1);
        const itemId = findItemIdForPhoto(items, pid);
        photoRows.push({ id: mapped, itemId: itemId ?? 'orphan', blob, order: o, addedAt: Date.now(), side: sideMeta[pid] });
      })
    );
  }

  // 事务内只做 Dexie 操作：清理 + 写入
  await db.transaction('rw', db.items, db.photos, db.types, db.customFields, db.settings, async () => {
    await db.items.clear();
    await db.photos.clear();
    await db.types.clear();
    await db.customFields.clear();

    if (Array.isArray(manifest.types) && manifest.types.length) {
      await db.types.bulkAdd(manifest.types);
    }
    if (Array.isArray(manifest.customFields)) {
      await db.customFields.bulkAdd(manifest.customFields);
    }
    if (manifest.settings) {
      await db.settings.put({ ...manifest.settings, id: 'main' });
    }

    await db.items.bulkPut(
      items.map((raw) => ({
        ...(raw as object),
        id: typeof raw.id === 'string' ? raw.id : uid('i'),
        photoIds: ((raw.photoIds as string[]) ?? []).map((p) => idMap.get(p) ?? p),
        mainPhotoId: raw.mainPhotoId ? idMap.get(raw.mainPhotoId as string) ?? (raw.mainPhotoId as string) : null,
      })) as never
    );

    if (photoRows.length) {
      await db.photos.bulkPut(photoRows);
    }
  });

  return { items: items.length };
}

function findItemIdForPhoto(items: Array<Record<string, unknown>>, photoId: string): string | null {
  for (const it of items) {
    const ids = (it.photoIds as string[]) ?? [];
    if (ids.includes(photoId)) return (it.id as string) ?? null;
  }
  return null;
}

// ---------- 增量同步（跨设备迁移） ----------

const LAST_SYNC_KEY = 'shouna:lastSyncTime';

/** 本设备上次导出同步包的时间 */
export function getLastSyncTime(): number {
  return Number(localStorage.getItem(LAST_SYNC_KEY) || '0');
}

/**
 * 导出同步包：只包含「上次导出之后」新增/修改的记录及其照片。
 * types / 自定义字段 全量（体积小）；settings 不导出（保持各设备偏好独立）。
 */
export async function exportSync(): Promise<{ blob: Blob; count: number; exportedAt: number }> {
  const baseline = getLastSyncTime();
  const [allItems, photos, types, fields] = await Promise.all([
    listItems(),
    listPhotos(),
    listTypes(),
    listCustomFields(),
  ]);
  const items = allItems.filter((it) => it.updatedAt > baseline);
  const itemIds = new Set(items.map((it) => it.id));
  const selPhotos = photos.filter((p) => itemIds.has(p.itemId));
  const exportedAt = Date.now();

  const zip = new JSZip();
  const manifest = {
    app: 'shouna',
    version: BACKUP_VERSION,
    mode: 'incremental',
    exportedAt,
    types,
    customFields: fields,
    items: items.map((it) => ({ ...it, photoIds: it.photoIds.slice() })),
  };
  zip.file('items.json', JSON.stringify(manifest));
  const folder = zip.folder('photos');
  if (folder) {
    for (const p of selPhotos) {
      folder.file(`${p.id}.jpg`, p.blob);
    }
  }
  const photoMeta: Record<string, 'front' | 'back'> = {};
  for (const p of selPhotos) if (p.side) photoMeta[p.id] = p.side;
  if (Object.keys(photoMeta).length) zip.file('photos.json', JSON.stringify(photoMeta));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  localStorage.setItem(LAST_SYNC_KEY, String(exportedAt));
  return { blob, count: items.length, exportedAt };
}

/** 重置本设备的同步基线（下次导出会包含全部） */
export function resetSyncBaseline(): void {
  localStorage.removeItem(LAST_SYNC_KEY);
}

/**
 * 合并导入：把另一台设备导出的内容并入本机（不清空、按 id 补进）。
 * 完整备份文件（无 mode）也能以合并方式导入。
 */
export async function importMerge(file: Blob): Promise<{ items: number; photos: number; mode: 'full' | 'incremental' }> {
  const zip = await JSZip.loadAsync(file);
  const jsonFile = zip.file('items.json');
  if (!jsonFile) throw new Error('文件里没有 items.json');
  const manifest = JSON.parse(await jsonFile.async('text'));
  if (manifest.app !== 'shouna') throw new Error('不是收纳册的备份/同步文件');
  const mode: 'full' | 'incremental' = manifest.mode === 'incremental' ? 'incremental' : 'full';
  const items = (manifest.items as Array<Record<string, unknown>>) ?? [];

  // 照片 id 冲突重映射（跨设备罕见，但稳妥）
  const idMap = new Map<string, string>();
  for (const it of items) {
    const photoIds = (it.photoIds as string[]) ?? [];
    for (const pid of photoIds) {
      idMap.set(pid, uid('p'));
    }
  }

  // 照片解压（事务外）
  const sideMetaRaw = zip.file('photos.json');
  const sideMeta: Record<string, 'front' | 'back'> = sideMetaRaw ? JSON.parse(await sideMetaRaw.async('text')) : {};
  const photoRows: Array<{ id: string; itemId: string; blob: Blob; order: number; addedAt: number; side?: 'front' | 'back' }> = [];
  const photoFolder = zip.folder('photos');
  if (photoFolder) {
    const photosInZip: Array<{ pid: string; file: import('jszip').JSZipObject }> = [];
    photoFolder.forEach((_rel, file) => {
      if (!file.name.toLowerCase().endsWith('.jpg')) return;
      const pid = file.name.split('/').pop()!.replace(/\.jpg$/i, '');
      photosInZip.push({ pid, file });
    });
    let orderCounter = 0;
    await Promise.all(
      photosInZip.map(async ({ pid, file }) => {
        const blob = await file.async('blob');
        const mapped = idMap.get(pid) ?? pid;
        const itemId = findItemIdForPhoto(items, pid) ?? 'orphan';
        photoRows.push({ id: mapped, itemId, blob, order: orderCounter++, addedAt: Date.now(), side: sideMeta[pid] });
      })
    );
  }

  await db.transaction('rw', db.items, db.photos, db.types, db.customFields, async () => {
    if (Array.isArray(manifest.types) && manifest.types.length) {
      for (const t of manifest.types) await db.types.put(t);
    }
    if (Array.isArray(manifest.customFields)) {
      for (const f of manifest.customFields) await db.customFields.put(f);
    }
    for (const raw of items) {
      await db.items.put({
        ...(raw as object),
        id: typeof raw.id === 'string' ? raw.id : uid('i'),
        photoIds: ((raw.photoIds as string[]) ?? []).map((p) => idMap.get(p) ?? p),
        mainPhotoId: raw.mainPhotoId ? idMap.get(raw.mainPhotoId as string) ?? (raw.mainPhotoId as string) : null,
      } as never);
    }
    if (photoRows.length) {
      await db.photos.bulkPut(photoRows);
    }
  });

  return { items: items.length, photos: photoRows.length, mode };
}
