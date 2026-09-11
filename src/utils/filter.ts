import type { Filters, Item } from '../db/types';

export function filterItems(items: Item[], f: Filters): Item[] {
  let out = items;
  const q = f.search.trim().toLowerCase();
  if (q) {
    out = out.filter((it) => {
      const regionStr = it.region ? [it.region.province, it.region.city, it.region.district].join(' ') : '';
      const hay = [it.name, it.work, it.author, ...(it.cosers ?? []), it.event, it.location, regionStr, it.notes, it.toSign, ...it.tags]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }
  if (f.typeId) out = out.filter((it) => it.typeId === f.typeId);
  if (f.work) out = out.filter((it) => it.work === f.work);
  if (f.author) out = out.filter((it) => it.author === f.author || (it.cosers ?? []).includes(f.author));
  if (f.event) out = out.filter((it) => it.event === f.event);
  if (f.region?.province) {
    out = out.filter((it) => it.region?.province === f.region!.province);
    if (f.region.city) {
      out = out.filter((it) => it.region?.city === f.region!.city);
      if (f.region.district) {
        out = out.filter((it) => it.region?.district === f.region!.district);
      }
    }
  }
  if (f.year) out = out.filter((it) => (it.date ? it.date.slice(0, 4) === f.year : false));
  if (f.signed !== 'all') out = out.filter((it) => it.signed === f.signed);
  const customKeys = Object.keys(f.custom);
  if (customKeys.length) {
    out = out.filter((it) =>
      customKeys.every((k) => (f.custom[k] ? (it.custom[k] ?? '') === f.custom[k] : true))
    );
  }
  return out;
}

export type SortKey = 'newest' | 'oldest' | 'name' | 'date';

export function sortItems(items: Item[], key: SortKey): Item[] {
  const arr = [...items];
  switch (key) {
    case 'newest':
      return arr.sort((a, b) => b.createdAt - a.createdAt);
    case 'oldest':
      return arr.sort((a, b) => a.createdAt - b.createdAt);
    case 'name':
      return arr.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    case 'date':
      return arr.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    default:
      return arr;
  }
}
