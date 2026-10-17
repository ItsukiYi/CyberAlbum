import React, { useState } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  suggestions?: string[]; // 已录入过的候选，用于联想
  placeholder?: string;
}

/**
 * 单行输入 + 已录入词联想：聚焦即显示全部候选（点选填入），输入时按前缀过滤。
 * 联想项按下时阻止 blur 转移 + blur 延时关闭，避免触摸端点击丢失。
 */
export function AutoInput({ value, onChange, suggestions = [], placeholder }: Props) {
  const [open, setOpen] = useState(false);

  const cands = open
    ? (value.trim()
        ? suggestions.filter((s) => s !== value.trim() && s.includes(value.trim()))
        : suggestions.filter((s) => s !== value))
        .slice(0, 8)
    : [];

  return (
    <div className="auto-input">
      <input
        className="input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      />
      {cands.length > 0 && (
        <div className="tag-suggest">
          {cands.map((s) => (
            <button
              key={s}
              type="button"
              className="tag-suggest-item"
              onPointerDown={(e) => e.preventDefault()}
              onTouchStart={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(s);
                setOpen(false);
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
