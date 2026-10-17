import React, { useRef, useState } from 'react';

interface Props {
  values: string[];
  onChange: (values: string[]) => void;
  suggestions?: string[]; // 已录入过的候选，用于联想
  placeholder?: string;
  hint?: string;
}

export function TagInput({ values, onChange, suggestions = [], placeholder, hint }: Props) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const add = (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    if (!values.includes(v)) onChange([...values, v]);
  };

  const submit = () => {
    add(text);
    setText('');
  };

  // 聚焦即显示已有候选（空输入=全部，有输入=过滤），点选直接加入；输入新名字回车=新增
  const cands = focused
    ? (text.trim()
        ? suggestions.filter((s) => s !== text.trim() && s.includes(text.trim()) && !values.includes(s))
        : suggestions.filter((s) => !values.includes(s)))
        .slice(0, 8)
    : [];

  return (
    <div className="tag-input" ref={boxRef}>
      <div className="tag-chips">
        {values.map((v) => (
          <span className="tag-chip" key={v}>
            {v}
            <button
              type="button"
              className="tag-chip-del"
              aria-label="删除"
              onClick={() => onChange(values.filter((x) => x !== v))}
            >
              ✕
            </button>
          </span>
        ))}
        <input
          className="input tag-input-field"
          value={text}
          placeholder={values.length ? '' : placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
              e.preventDefault();
              submit();
            } else if (e.key === 'Backspace' && !text && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={() => {
            submit();
            // 延时关闭，避免点击联想项时列表先卸载导致 click 丢失（触摸端 blur 竞态）
            window.setTimeout(() => setFocused(false), 150);
          }}
          onFocus={() => setFocused(true)}
        />
      </div>
      {cands.length > 0 && (
        <div className="tag-suggest">
          {cands.map((s) => (
            <button
              type="button"
              key={s}
              className="tag-suggest-item"
              onPointerDown={(e) => e.preventDefault()}
              onTouchStart={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                add(s);
                setText('');
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}