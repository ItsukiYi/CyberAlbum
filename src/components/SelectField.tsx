import React, { useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * 通用下拉选择（替代 <select> 的安卓原生列表弹窗）。
 * 深色主题、Portal 挂载 body 顶层、点选即写入并关闭。
 */
export interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  options: SelectOption[];
  onChange: (v: string) => void;
  placeholder?: string;
  allowEmpty?: boolean; // 顶部提供「未选择」项（值 ''）
  emptyLabel?: string;
  className?: string; // 附加到触发器的类（用于控制宽度等）
}

export function SelectField({
  value,
  options,
  onChange,
  placeholder = '请选择',
  allowEmpty = false,
  emptyLabel = '未选择',
  className = '',
}: Props) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className={`date-trigger select-trigger${open ? ' open' : ''} ${className}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`date-text${value ? '' : ' empty'}`}>{current ? current.label : placeholder}</span>
        <span className="date-chev">{open ? '▲' : '▼'}</span>
      </button>

      {open &&
        createPortal(
          <>
            <div className="date-backdrop" onClick={() => setOpen(false)} />
            <div className="date-pop select-pop">
              <div className="date-head">
                <span className="date-title">选择</span>
              </div>
              <div className="select-list">
                {allowEmpty && (
                  <button
                    type="button"
                    className={`select-opt${value === '' ? ' sel' : ''}`}
                    onClick={() => pick('')}
                  >
                    {emptyLabel}
                  </button>
                )}
                {options.map((o) => (
                  <button
                    type="button"
                    key={o.value}
                    className={`select-opt${value === o.value ? ' sel' : ''}`}
                    onClick={() => pick(o.value)}
                  >
                    {o.label}
                  </button>
                ))}
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
