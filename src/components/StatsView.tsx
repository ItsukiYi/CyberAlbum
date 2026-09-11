import React, { useMemo } from 'react';
import { useStore } from '../state/store';

function BarList({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; count: number; color?: string }[];
}) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <section className="stat-block">
      <h2>{title}</h2>
      {rows.map((r) => (
        <div className="stat-row" key={r.label}>
          <span className="stat-label" title={r.label}>
            {r.label}
          </span>
          <span className="stat-bar">
            <span
              className="stat-bar-fill"
              style={{
                width: `${(r.count / max) * 100}%`,
                background: r.color ?? '#6d5ce0',
              }}
            />
          </span>
          <span className="stat-num">{r.count}</span>
        </div>
      ))}
    </section>
  );
}

export function StatsView() {
  const { items, photos, types } = useStore();

  const byType = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) {
      if (it.typeId) m.set(it.typeId, (m.get(it.typeId) ?? 0) + 1);
    }
    return types
      .map((t) => ({ label: t.name, count: m.get(t.id) ?? 0, color: t.color }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [items, types]);

  const byWork = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) {
      if (it.work) m.set(it.work, (m.get(it.work) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [items]);

  const byYear = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) {
      if (it.date) {
        const y = it.date.slice(0, 4);
        m.set(y, (m.get(y) ?? 0) + 1);
      }
    }
    return Array.from(m.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.label.localeCompare(a.label));
  }, [items]);

  const signed = useMemo(() => {
    let none = 0,
      signedC = 0,
      to = 0;
    for (const it of items) {
      if (it.signed === 'to') to++;
      else if (it.signed === 'signed') signedC++;
      else none++;
    }
    return { none, signedC, to };
  }, [items]);

  const cards = useMemo(
    () => [
      { label: '周边总数', value: items.length, icon: '📦' },
      { label: '照片总数', value: photos.length, icon: '🖼️' },
      { label: 'IP 数', value: new Set(items.map((i) => i.work).filter(Boolean)).size, icon: '📖' },
      { label: '参与场次', value: new Set(items.map((i) => i.event).filter(Boolean)).size, icon: '🎫' },
    ],
    [items, photos]
  );

  return (
    <div className="stats">
      <header className="settings-header">
        <h1>统计</h1>
      </header>

      <div className="stat-cards">
        {cards.map((c) => (
          <div className="stat-card" key={c.label}>
            <div className="stat-card-icon">{c.icon}</div>
            <div className="stat-card-value">{c.value}</div>
            <div className="stat-card-label">{c.label}</div>
          </div>
        ))}
      </div>

      <BarList title="按类型" rows={byType} />
      <BarList title="按 IP（Top 12）" rows={byWork} />
      <BarList title="按年份" rows={byYear} />

      {items.length > 0 && (
        <section className="stat-block">
          <h2>签名情况</h2>
          <div className="stat-pies">
            <div className="stat-pie">
              <div className="pie-num">{signed.signedC + signed.to}</div>
              <div className="pie-label">有签名</div>
            </div>
            <div className="stat-pie">
              <div className="pie-num">{signed.to}</div>
              <div className="pie-label">其中 To签</div>
            </div>
            <div className="stat-pie">
              <div className="pie-num">{signed.none}</div>
              <div className="pie-label">无签名</div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
