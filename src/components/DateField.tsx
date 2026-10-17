import React, { useMemo, useState } from 'react';

/**
 * 自定义日期选择（替代 <input type="date"> 的安卓原生弹窗）。
 * 深色主题；支持快速切年/切月（点击标题进入年/月网格）；日视图点选后需「确定」才写入。
 * value 格式 'YYYY-MM-DD' 或 ''。
 */
interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

const WEEK = ['一', '二', '三', '四', '五', '六', '日'];
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

type Mode = 'day' | 'month' | 'year';

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
  const startDay = (first.getDay() + 6) % 7;
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
  const [mode, setMode] = useState<Mode>('day');
  const [view, setView] = useState(() => ({
    y: selected?.getFullYear() ?? now.getFullYear(),
    m: selected?.getMonth() ?? now.getMonth(),
  }));
  const [pending, setPending] = useState<string | null>(null);

  const cells = useMemo(() => buildGrid(view.y, view.m), [view.y, view.m]);
  const todayStr = fmtDate(now);

  const close = () => {
    setOpen(false);
    setMode('day');
    setPending(null);
  };

  const shift = (step: number) => {
    if (mode === 'day') {
      const d = new Date(view.y, view.m + step, 1);
      setView({ y: d.getFullYear(), m: d.getMonth() });
    } else if (mode === 'month') {
      setView({ y: view.y + step, m: view.m });
    } else {
      setView({ y: view.y + step * 12, m: view.m });
    }
  };

  const confirm = () => {
    if (pending) onChange(pending);
    close();
  };
  const clear = () => {
    onChange('');
    close();
  };

  let title = `${view.y} 年 ${view.m + 1} 月`;
  if (mode === 'month') title = `${view.y} 年`;
  if (mode === 'year') title = `${view.y} 年`;

  const showTitle = () => {
    if (mode === 'day') setMode('month');
    else if (mode === 'month') setMode('year');
    else setMode('day');
  };

  return (
    <>
      <button type="button" className={`date-trigger${open ? ' open' : ''}`} onClick={() => setOpen((v) => !v)}>
        <span className={`date-text${value ? '' : ' empty'}`}>{value ? cnDate(value) : placeholder ?? '选择日期'}</span>
        <span className="date-chev">{open ? '▲' : '▼'}</span>
      </button>

      {open && <div className="date-backdrop" onClick={close} />}

      {open && (
        <div className="date-pop">
          <div className="date-head">
            <button type="button" className="date-nav" onClick={() => shift(-1)} aria-label="上一档">
              ‹
            </button>
            <button type="button" className="date-title date-title-btn" onClick={showTitle}>
              {title}
              <span className="date-title-hint">{mode === 'day' ? '（点此切年/月）' : ''}</span>
            </button>
            <button type="button" className="date-nav" onClick={() => shift(1)} aria-label="下一档">
              ›
            </button>
          </div>

          {mode === 'day' && (
            <div className="date-grid">
              {WEEK.map((w) => (
                <span className="date-week" key={w}>
                  {w}
                </span>
              ))}
              {cells.map((d, i) => {
                const inMonth = d.getMonth() === view.m;
                const dayStr = fmtDate(d);
                const sel = (pending ?? value) === dayStr;
                const isToday = dayStr === todayStr;
                return (
                  <button
                    type="button"
                    key={i}
                    className={`date-cell${inMonth ? '' : ' dim'}${sel ? ' sel' : ''}${isToday ? ' today' : ''}`}
                    onClick={() => setPending(dayStr)}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
          )}

          {mode === 'month' && (
            <div className="date-mgrid">
              {MONTHS.map((m, i) => (
                <button
                  type="button"
                  key={m}
                  className={`date-mcell${i === view.m ? ' sel' : ''}`}
                  onClick={() => {
                    setView({ y: view.y, m: i });
                    setMode('day');
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          {mode === 'year' && (
            <div className="date-mgrid">
              {Array.from({ length: 12 }, (_, k) => view.y - 6 + k).map((y) => (
                <button
                  type="button"
                  key={y}
                  className={`date-mcell${y === view.y ? ' sel' : ''}`}
                  onClick={() => {
                    setView({ y, m: view.m });
                    setMode('month');
                  }}
                >
                  {y}
                </button>
              ))}
            </div>
          )}

          <div className="date-foot">
            {value && (
              <button type="button" className="date-clear" onClick={clear}>
                清除
              </button>
            )}
            <span className="date-foot-spacer" />
            {mode === 'day' && (
              <button type="button" className="date-today" onClick={() => setPending(todayStr)}>
                今天
              </button>
            )}
            {mode === 'day' ? (
              <button type="button" className="date-ok" onClick={confirm}>
                确定
              </button>
            ) : (
              <button type="button" className="date-ok" onClick={close}>
                关闭
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
