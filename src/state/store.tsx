import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { liveQuery } from 'dexie';
import { db } from '../db/db';
import {
  ensureSeed,
  getSettings,
  listCustomFields,
  listItems,
  listPhotos,
  listTypes,
} from '../db/repo';
import type {
  AppSettings,
  CustomFieldDef,
  Item,
  PhotoRec,
  TypeDef,
} from '../db/types';

export type Tab = 'library' | 'stats' | 'settings';

interface StoreValue {
  items: Item[];
  photos: PhotoRec[];
  types: TypeDef[];
  customFields: CustomFieldDef[];
  settings: AppSettings;
  photosById: Map<string, PhotoRec>;
  loaded: boolean;

  tab: Tab;
  setTab: (t: Tab) => void;

  detailId: string | null;
  openDetail: (id: string) => void;
  closeDetail: () => void;

  formOpen: boolean;
  formItem: Item | null;
  openForm: (item?: Item | null) => void;
  closeForm: () => void;

  refresh: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

function useReactive<T>(querier: () => Promise<T>, initial: T, deps: unknown[]): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    const sub = liveQuery(querier).subscribe({
      next: (v) => setValue(v as T),
      error: (err) => console.error(err),
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const items = useReactive(() => listItems(), [] as Item[], []);
  const photos = useReactive(() => listPhotos(), [] as PhotoRec[], []);
  const types = useReactive(() => listTypes(), [] as TypeDef[], []);
  const customFields = useReactive(() => listCustomFields(), [] as CustomFieldDef[], []);
  const settings = useReactive(() => getSettings(), null as unknown as AppSettings, []);
  const [loaded, setLoaded] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [tab, setTab] = useState<Tab>('library');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formItem, setFormItem] = useState<Item | null>(null);

  useEffect(() => {
    ensureSeed().then(() => setRefreshKey((k) => k + 1));
  }, []);

  // 初次数据加载完成后再显示
  useEffect(() => {
    if (loaded) return;
    if (items.length > 0 || types.length > 0 || refreshKey > 0) setLoaded(true);
  }, [items, types, refreshKey, loaded]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const openDetail = useCallback((id: string) => setDetailId(id), []);
  const closeDetail = useCallback(() => setDetailId(null), []);
  const openForm = useCallback((item: Item | null = null) => {
    setFormItem(item);
    setFormOpen(true);
    setDetailId(null); // 编辑时关闭详情弹窗
  }, []);
  const closeForm = useCallback(() => setFormOpen(false), []);

  const photosById = useMemo(() => {
    const m = new Map<string, PhotoRec>();
    for (const p of photos) m.set(p.id, p);
    return m;
  }, [photos]);

  const value = useMemo<StoreValue>(
    () => ({
      items,
      photos,
      types,
      customFields,
      settings: settings ?? ({ id: 'main' } as AppSettings),
      photosById,
      loaded,
      tab,
      setTab,
      detailId,
      openDetail,
      closeDetail,
      formOpen,
      formItem,
      openForm,
      closeForm,
      refresh,
    }),
    [items, photos, types, customFields, settings, photosById, loaded, tab, detailId, formOpen, formItem, openForm, closeForm, refresh]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore 必须在 StoreProvider 内使用');
  return ctx;
}
