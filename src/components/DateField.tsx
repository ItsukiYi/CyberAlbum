import React, { useMemo, useState } from 'react';

/**
 * 自定义日期选择（替代 <input type="date"> 的安卓原生弹窗）：
 * 深色主题日历面板，年/月切换、今天、清除，风格与 App 一致。
 * value 格式 'YYYY-MM-DD' 或 ''。
 */
interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

const WEEK = ['一', '二', '三', '四', '五', '六', '日'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function cnDate(v: string): string {
  if (!v) return '';
  const [y, m, d] = v.split('-').map(Number);
  return `${y} 年 ${m} 月 ${d} 日`;
}

/** 42 格日历网格，周一开头，含上月/下月补位 */
function buildGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const startDay = (first.getDay() + 6) % 7; // 周一=0
  const cells: Date[] = [];
  for (let i = startDay - 1; i >= 0; i--) cells.push(new Date(year, month, -i));
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length < 42) {
    const last = cells[cells.length - 1];
    cells.push(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1));
  }
  return cells;
}

export function DateField({ value, onChange, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const now = new Date();
  const selected = value ? new Date(value + 'T00:00:00') : null;
  const [view, setView] = useState(() => ({
    y: selected?.getFullYear() ?? now.getFullYear(),
    m: selected?.getMonth() ?? now.getMonth(),
  }));
  const cells = useMemo(() => buildGrid(view.y, view.m), [view.y, view.m]);
  const todayStr = fmtDate(now);

  const pick = (d: Date) => {
    onChange(fmtDate(d));
    setOpen(false);
  };
  const clear = () => {
    onChange('');
    setOpen(false);
  };
  const shift = (dm: number) => {
    const d = new Date(view.y, view.m + dm, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  };

  return (
    <>
      <button
        type="button"
        className={`date-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`date-text${value ? '' : ' empty'}`}>
          {value ? cnDate(value) : placeholder ?? '选择日期'}
        </span>
        <span className="date-chev">{open ? '▲' : '▼'}</span>
      </button>

      {open && <div className="date-backdrop" onClick={() => setOpen(false)} />}

      {open && (
        <div className="date-pop">
          <div className="date-head">
            <button type="button" className="date-nav" onClick={() => shift(-1)} aria-label="上月">
              ‹
            </button>
            <span className="date-title">
              {view.y} 年 {view.m + 1} 月
            </span>
            <button type="button" className="date-nav" onClick={() => shift(1)} aria-label="下月">
              ›
            </button>
          </div>

          <div className="date-grid">
            {WEEK.map((w) => (
              <span className="date-week" key={w}>
                {w}
              </span>
            ))}
            {cells.map((d, i) => {
              const inMonth = d.getMonth() === view.m;
              const sel = value === fmtDate(d);
              const isToday = fmtDate(d) === todayStr;
              return (
                <button
                  type="button"
                  key={i}
                  className={`date-cell${inMonth ? '' : ' dim'}${sel ? ' sel' : ''}${isToday ? ' today' : ''}`}
                  onClick={() => pick(d)}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          <div className="date-foot">
            {value && (
              <button type="button" className="date-clear" onClick={clear}>
                清除
              </button>
            )}
            <span className="date-foot-spacer" />
            <button type="button" className="date-today" onClick={() => pick(now)}>
              今天
            </button>
          </div>
        </div>
      )}
    </>
  );
}
