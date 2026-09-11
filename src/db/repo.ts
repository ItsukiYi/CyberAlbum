import { db } from './db';
import type {
  AppSettings,
  CustomFieldDef,
  Item,
  PhotoRec,
  TypeDef,
} from './types';
import { DEFAULT_SETTINGS, PRESET_TYPES } from './types';

export function uid(prefix = ''): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------- 初始化 ----------
export async function ensureSeed(): Promise<void> {
  const count = await db.types.count();
  if (count === 0) {
    await db.types.bulkAdd(PRESET_TYPES.map((t, i) => ({ ...t, order: i })));
  }
  const settingsCount = await db.settings.count();
  if (settingsCount === 0) {
    await db.settings.add({ ...DEFAULT_SETTINGS });
  }
}

// ---------- 周边 ----------
export function listItems(): Promise<Item[]> {
  return db.items.orderBy('createdAt').reverse().toArray();
}

export async function saveItem(item: Item): Promise<void> {
  await db.items.put(item);
}

export async function deleteItem(id: string): Promise<void> {
  await db.transaction('rw', db.items, db.photos, async () => {
    await db.photos.where('itemId').equals(id).delete();
    await db.items.delete(id);
  });
}

// ---------- 照片 ----------
export function listPhotos(): Promise<PhotoRec[]> {
  return db.photos.toArray();
}

export async function savePhoto(photo: PhotoRec): Promise<void> {
  await db.photos.put(photo);
}

export async function deletePhoto(id: string): Promise<void> {
  await db.photos.delete(id);
}

// ---------- 类型 ----------
export function listTypes(): Promise<TypeDef[]> {
  return db.types.orderBy('order').toArray();
}

export async function saveType(t: TypeDef): Promise<void> {
  await db.types.put(t);
}

export async function deleteType(id: string): Promise<void> {
  await db.transaction('rw', db.types, db.items, async () => {
    await db.types.delete(id);
    const items = await db.items.where('typeId').equals(id).toArray();
    for (const it of items) {
      await db.items.put({ ...it, typeId: null });
    }
  });
}

// ---------- 自定义字段 ----------
export function listCustomFields(): Promise<CustomFieldDef[]> {
  return db.customFields.orderBy('order').toArray();
}

export async function saveCustomField(f: CustomFieldDef): Promise<void> {
  await db.customFields.put(f);
}

export async function deleteCustomField(id: string): Promise<void> {
  await db.customFields.delete(id);
}

// ---------- 设置 ----------
export async function getSettings(): Promise<AppSettings> {
  const row = await db.settings.get('main');
  return row ?? { ...DEFAULT_SETTINGS };
}

export async function saveSettings(s: AppSettings): Promise<void> {
  await db.settings.put({ ...s, id: 'main' });
}
