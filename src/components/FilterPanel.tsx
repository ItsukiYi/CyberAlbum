import React, { useMemo } from 'react';
import { useStore } from '../state/store';
import type { Filters, SignedState } from '../db/types';
import { Btn, EmptyState } from './ui';

function distinct(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function ChipGroup({
  label,
  values,
  value,
  onPick,
}: {
  label: string;
  values: string[];
  value: string | null;
  onPick: (v: string | null) => void;
}) {
  return (
    <div className="fg">
      <div className="fg-label">{label}</div>
      <div className="chip-wrap">
        <button className={`chip${value === null ? ' active' : ''}`} onClick={() => onPick(null)}>
          全部
        </button>
        {values.map((v) => (
          <button
            key={v}
            className={`chip${value === v ? ' active' : ''}`}
            onClick={() => onPick(value === v ? null : v)}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

export function FilterPanel({
  filters,
  onChange,
  onClear,
}: {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  onClear: () => void;
}) {
  const { items, types, customFields } = useStore();

  const opts = useMemo(() => {
    const provinces = distinct(items.map((i) => (i.region?.province ? i.region.province : ''))).filter(Boolean);
    const p = filters.region?.province;
    const c = filters.region?.city;
    const cities = p
      ? distinct(items.filter((i) => i.region?.province === p).map((i) => (i.region?.city ? i.region.city : ''))).filter(Boolean)
      : [];
    const districts =
      p && c
        ? distinct(
            items
              .filter((i) => i.region?.province === p && i.region?.city === c)
              .map((i) => (i.region?.district ? i.region.district : ''))
          ).filter(Boolean)
        : [];
    return {
      works: distinct(items.map((i) => i.work)),
      authors: distinct(items.flatMap((i) => [i.author, ...(i.cosers ?? [])])).filter(Boolean),
      events: distinct(items.map((i) => i.event)),
      years: distinct(items.map((i) => (i.date ? i.date.slice(0, 4) : ''))),
      provinces,
      cities,
      districts,
    };
  }, [items, filters.region?.province, filters.region?.city]);

  const typeOptions = types;

  const hasActive =
    filters.typeId !== null ||
    filters.work !== null ||
    filters.author !== null ||
    filters.event !== null ||
    filters.year !== null ||
    filters.region !== null ||
    filters.signed !== 'all' ||
    Object.values(filters.custom).some((v) => v);

  return (
    <div className="filter-panel">
      <div className="filter-head">
        <span>筛选</span>
        {hasActive && (
          <button className="filter-clear" onClick={onClear}>
            清空全部
          </button>
        )}
      </div>

      <ChipGroup
        label="类型"
        values={typeOptions.map((t) => t.name)}
        value={filters.typeId ? typeOptions.find((t) => t.id === filters.typeId)?.name ?? null : null}
        onPick={(name) => {
          const t = name ? typeOptions.find((x) => x.name === name) : undefined;
          onChange({ typeId: t ? t.id : null });
        }}
      />

      <ChipGroup label="IP" values={opts.works} value={filters.work} onPick={(v) => onChange({ work: v })} />
      <ChipGroup label="Coser" values={opts.authors} value={filters.author} onPick={(v) => onChange({ author: v })} />
      <ChipGroup label="场次" values={opts.events} value={filters.event} onPick={(v) => onChange({ event: v })} />
      <ChipGroup label="年份" values={opts.years} value={filters.year} onPick={(v) => onChange({ year: v })} />

      {opts.provinces.length > 0 && (
        <div className="fg">
          <div className="fg-label">地区</div>
          <div className="region-picker">
            <select
              className="input"
              value={filters.region?.province ?? ''}
              onChange={(e) =>
                onChange({ region: e.target.value ? { province: e.target.value, city: '', district: '' } : null })
              }
            >
              <option value="">省</option>
              {opts.provinces.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select
              className="input"
              value={filters.region?.city ?? ''}
              disabled={!filters.region?.province}
              onChange={(e) =>
                onChange({ region: { province: filters.region!.province, city: e.target.value, district: '' } })
              }
            >
              <option value="">市</option>
              {opts.cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              className="input"
              value={filters.region?.district ?? ''}
              disabled={!filters.region?.city}
              onChange={(e) =>
                onChange({
                  region: {
                    province: filters.region!.province,
                    city: filters.region!.city,
                    district: e.target.value,
                  },
                })
              }
            >
              <option value="">区/县</option>
              {opts.districts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="fg">
        <div className="fg-label">签名状态</div>
        <div className="chip-wrap">
          {(
            [
              ['all', '全部'],
              ['none', '无签名'],
              ['signed', '签名'],
              ['to', 'To签'],
            ] as [Filters['signed'], string][]
          ).map(([v, label]) => (
            <button
              key={v}
              className={`chip${filters.signed === v ? ' active' : ''}`}
              onClick={() => onChange({ signed: v })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {customFields.length > 0 && (
        <>
          {customFields.map((f) => (
            <div className="fg" key={f.id}>
              <div className="fg-label">{f.name}</div>
              <div className="chip-wrap">
                <button
                  className={`chip${!filters.custom[f.id] ? ' active' : ''}`}
                  onClick={() => onChange({ custom: { ...filters.custom, [f.id]: '' } })}
                >
                  全部
                </button>
                {f.kind === 'select'
                  ? f.options.map((o) => (
                      <button
                        key={o}
                        className={`chip${filters.custom[f.id] === o ? ' active' : ''}`}
                        onClick={() => onChange({ custom: { ...filters.custom, [f.id]: filters.custom[f.id] === o ? '' : o } })}
                      >
                        {o}
                      </button>
                    ))
                  : distinct(items.map((i) => i.custom[f.id] ?? '')).map((o) => (
                      <button
                        key={o}
                        className={`chip${filters.custom[f.id] === o ? ' active' : ''}`}
                        onClick={() => onChange({ custom: { ...filters.custom, [f.id]: filters.custom[f.id] === o ? '' : o } })}
                      >
                        {o}
                      </button>
                    ))}
              </div>
            </div>
          ))}
        </>
      )}

      {!hasActive && items.length === 0 && (
        <EmptyState icon="🔍" text="还没有周边，点右下角 + 开始录入" />
      )}
    </div>
  );
}

export function activeFilterChips(filters: Filters, typeName: string | undefined): { label: string; clear: () => void }[] {
  const chips: { label: string; clear: () => void }[] = [];
  if (filters.search) chips.push({ label: `搜索「${filters.search}」`, clear: () => {} });
  if (filters.typeId && typeName) chips.push({ label: typeName, clear: () => {} });
  if (filters.work) chips.push({ label: `IP·${filters.work}`, clear: () => {} });
  if (filters.author) chips.push({ label: `Coser·${filters.author}`, clear: () => {} });
  if (filters.event) chips.push({ label: `场次·${filters.event}`, clear: () => {} });
  if (filters.year) chips.push({ label: `${filters.year} 年`, clear: () => {} });
  if (filters.region?.province)
    chips.push({ label: `地点·${[filters.region.province, filters.region.city, filters.region.district].filter(Boolean).join(' ')}`, clear: () => {} });
  if (filters.signed === 'signed') chips.push({ label: '有签名', clear: () => {} });
  if (filters.signed === 'to') chips.push({ label: 'To签', clear: () => {} });
  if (filters.signed === 'none') chips.push({ label: '无签名', clear: () => {} });
  return chips;
}

export type { SignedState };
