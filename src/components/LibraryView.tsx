import React, { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import type { Filters } from '../db/types';
import { EMPTY_FILTERS } from '../db/types';
import { filterItems, sortItems } from '../utils/filter';
import type { SortKey } from '../utils/filter';
import { ItemCard } from './ItemCard';
import { FilterPanel } from './FilterPanel';
import { BatchImport } from './BatchImport';
import { EmptyState } from './ui';

export function LibraryView() {
  const { items, types, openDetail } = useStore();
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS });
  const [showFilter, setShowFilter] = useState(false);
  const [showBatch, setShowBatch] = useState(false);
  const [sort, setSort] = useState<SortKey>('newest');

  const patchFilters = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const clearFilters = () => setFilters({ ...EMPTY_FILTERS });

  const filtered = useMemo(() => sortItems(filterItems(items, filters), sort), [items, filters, sort]);

  const activeCount =
    (filters.typeId ? 1 : 0) +
    (filters.work ? 1 : 0) +
    (filters.author ? 1 : 0) +
    (filters.event ? 1 : 0) +
    (filters.year ? 1 : 0) +
    (filters.region?.province ? 1 : 0) +
    (filters.signed !== 'all' ? 1 : 0) +
    Object.values(filters.custom).filter(Boolean).length;

  return (
    <div className="library">
      <header className="library-header">
        <div className="library-title">
          <h1>电子收纳册</h1>
          <span className="count">{filtered.length} 件</span>
        </div>
        <div className="searchbar">
          <span className="search-icon">🔍</span>
          <input
            type="search"
            placeholder="搜索名称 / IP / Coser / 场次 / 标签…"
            value={filters.search}
            onChange={(e) => patchFilters({ search: e.target.value })}
          />
        </div>
        <div className="library-tools">
          <button className={`filter-toggle${activeCount ? ' has-active' : ''}`} onClick={() => setShowFilter((v) => !v)}>
            {showFilter ? '收起筛选' : '筛选'}
            {activeCount > 0 && <span className="filter-count">{activeCount}</span>}
          </button>
          <button className="batch-toggle" onClick={() => setShowBatch(true)}>
            ⚡ 批量
          </button>
          <select className="sort-select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="newest">最新录入</option>
            <option value="oldest">最早录入</option>
            <option value="name">按名称</option>
            <option value="date">按日期</option>
          </select>
        </div>
      </header>

      {showFilter && (
        <FilterPanel
          filters={filters}
          onChange={patchFilters}
          onClear={clearFilters}
        />
      )}

      {filtered.length === 0 ? (
        <EmptyState icon="🗂️" text={items.length === 0 ? '还没有周边，点右下角 + 开始录入' : '没有符合条件的周边'} />
      ) : (
        <div className="grid">
          {filtered.map((item) => (
            <ItemCard key={item.id} item={item} onClick={() => openDetail(item.id)} />
          ))}
        </div>
      )}
      {showBatch && <BatchImport onClose={() => setShowBatch(false)} />}
    </div>
  );
}
