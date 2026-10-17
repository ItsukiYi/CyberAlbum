import React, { useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * 自定义颜色选择（替代 <input type="color"> 的安卓原生色板）。
 * 深色主题：预设色板 + 自定义 hex 输入。
 */
interface Props {
  value: string;
  onChange: (v: string) => void;
}

const PRESET_COLORS = [
  '#e25c6c',
  '#e07b3a',
  '#f0a530',
  '#2fae8f',
  '#43a047',
  '#3a8de0',
  '#5c6bc0',
  '#6d5ce0',
  '#8b5ce0',
  '#d94f9e',
  '#607d8b',
  '#9aa0a6',
  '#f44336',
  '#ff9800',
  '#ffeb3b',
  '#4caf50',
  '#009688',
  '#00bcd4',
  '#2196f3',
  '#3f51b5',
  '#9c27b0',
  '#e91e63',
  '#795548',
  '#111111',
];

export function ColorField({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(value);

  const openPanel = () => {
    setHex(value);
    setOpen(true);
  };

  const commit = (c: string) => {
    onChange(c);
    setOpen(false);
  };

  const isHex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex);

  return (
    <>
      <button
        type="button"
        className={`color-trigger${open ? ' open' : ''}`}
        onClick={openPanel}
        aria-label="更换颜色"
      >
        <span className="color-swatch" style={{ background: value }} />
        <span className="date-text">{value}</span>
        <span className="date-chev">{open ? '▲' : '▼'}</span>
      </button>

      {open &&
        createPortal(
          <>
            <div className="date-backdrop" onClick={() => setOpen(false)} />
            <div className="date-pop color-pop">
              <div className="date-head">
                <span className="date-title">选择颜色</span>
              </div>
              <div className="color-grid">
                {PRESET_COLORS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className={`color-cell${value === c ? ' sel' : ''}`}
                    style={{ background: c }}
                    onClick={() => commit(c)}
                    aria-label={c}
                  />
                ))}
              </div>
              <div className="color-custom">
                <input
                  className="input color-hex"
                  value={hex}
                  placeholder="#RRGGBB"
                  onChange={(e) => setHex(e.target.value)}
                />
                <button
                  type="button"
                  className="date-ok"
                  disabled={!isHex}
                  onClick={() => isHex && commit(hex)}
                >
                  确定
                </button>
              </div>
              <div className="date-foot">
                <span className="date-foot-spacer" />
                <button type="button" className="date-today" onClick={() => setOpen(false)}>
                  关闭
                </button>
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  );
}
