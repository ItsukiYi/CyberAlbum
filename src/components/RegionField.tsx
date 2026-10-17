import React, { useMemo, useState } from 'react';
import REGIONS from '../data/region.json';
import type { Region } from '../db/types';

/**
 * 自定义地点选择（替代安卓原生下拉）。
 * 深色三级联动面板：省 → 市 → 区 点选，需「确定」才写入。
 */
interface Props {
  value: Region | null;
  onChange: (r: Region | null) => void;
  placeholder?: string;
}

const regData = REGIONS as Record<string, Record<string, string[]>>;

export function RegionField({ value, onChange, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [temp, setTemp] = useState<Region>({ province: '', city: '', district: '' });

  const provinces = useMemo(() => Object.keys(regData), []);
  const cities = useMemo(() => (temp.province ? Object.keys(regData[temp.province] ?? {}) : []), [temp.province]);
  const districts = useMemo(
    () => (temp.province && temp.city ? regData[temp.province]?.[temp.city] ?? [] : []),
    [temp.province, temp.city]
  );

  const openPanel = () => {
    setTemp(value ? { ...value } : { province: '', city: '', district: '' });
    setOpen(true);
  };
  const close = () => setOpen(false);

  const confirm = () => {
    // 选了省才写入；没选也直接关闭（确定始终可点）
    if (temp.province) {
      onChange({ ...temp });
    }
    close();
  };
  const clear = () => {
    onChange(null);
    close();
  };

  const shown = value ? [value.province, value.city, value.district].filter(Boolean).join(' · ') : '';
  const hasValue = Boolean(value?.province);

  return (
    <>
      <button type="button" className={`date-trigger${open ? ' open' : ''}`} onClick={openPanel}>
        <span className={`date-text${hasValue ? '' : ' empty'}`}>
          {shown || placeholder || '选择地点'}
        </span>
        <span className="date-chev">{open ? '▲' : '▼'}</span>
      </button>

      {open && <div className="date-backdrop" onClick={close} />}

      {open && (
        <div className="date-pop region-pop">
          <div className="date-head">
            <span className="date-title">选择地点</span>
          </div>

          <div className="region-cols">
            <div className="region-col">
              {provinces.map((p) => (
                <button
                  type="button"
                  key={p}
                  className={`region-opt${temp.province === p ? ' sel' : ''}`}
                  onClick={() => setTemp({ province: p, city: '', district: '' })}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="region-col">
              {cities.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={`region-opt${temp.city === c ? ' sel' : ''}`}
                  onClick={() => setTemp({ ...temp, city: c, district: '' })}
                >
                  {c}
                </button>
              ))}
              {temp.province && cities.length === 0 && <span className="region-empty">—</span>}
            </div>
            <div className="region-col">
              {districts.map((d) => (
                <button
                  type="button"
                  key={d}
                  className={`region-opt${temp.district === d ? ' sel' : ''}`}
                  onClick={() => setTemp({ ...temp, district: d })}
                >
                  {d}
                </button>
              ))}
              {temp.city && districts.length === 0 && <span className="region-empty">—</span>}
            </div>
          </div>

          <div className="date-foot">
            {hasValue && (
              <button type="button" className="date-clear" onClick={clear}>
                清除
              </button>
            )}
            <span className="date-foot-spacer" />
            <button type="button" className="date-today" onClick={close}>
              关闭
            </button>
            <button type="button" className="date-ok" onClick={confirm}>
              确定
            </button>
          </div>
        </div>
      )}
    </>
  );
}
