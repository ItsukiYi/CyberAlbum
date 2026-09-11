import React from 'react';
import { useStore, type Tab } from '../state/store';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'library', label: '图库', icon: '🗂️' },
  { key: 'stats', label: '统计', icon: '📊' },
  { key: 'settings', label: '设置', icon: '⚙️' },
];

export function TabBar() {
  const { tab, setTab, openForm } = useStore();
  return (
    <nav className="tabbar">
      <button className="fab" onClick={() => openForm(null)} aria-label="新增周边">
        ＋
      </button>
      {TABS.map((t) => (
        <button
          key={t.key}
          className={`tab-item${tab === t.key ? ' active' : ''}`}
          onClick={() => setTab(t.key)}
        >
          <span className="tab-icon">{t.icon}</span>
          <span className="tab-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
