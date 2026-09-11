import React, { useState } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  suggestions?: string[]; // 已录入过的候选，用于联想
  placeholder?: string;
}

/** 单行输入 + 已录入词联想（点选填入） */
export function AutoInput({ value, onChange, suggestions = [], placeholder }: Props) {
  const [open, setOpen] = useState(false);

  const cands =
    open && value.trim()
      ? suggestions.filter((s) => s !== value.trim() && s.includes(value.trim())).slice(0, 6)
      : [];

  return (
    <div className="auto-input">
      <input
        className="input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      />
      {cands.length > 0 && (
        <div className="tag-suggest">
          {cands.map((s) => (
            <button
              key={s}
              type="button"
              className="tag-suggest-item"
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