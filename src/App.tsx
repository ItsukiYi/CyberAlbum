import React from 'react';
import { StoreProvider, useStore } from './state/store';
import { TabBar } from './components/TabBar';
import { LibraryView } from './components/LibraryView';
import { StatsView } from './components/StatsView';
import { SettingsView } from './components/SettingsView';
import { ItemForm } from './components/ItemForm';
import { ItemDetail } from './components/ItemDetail';

function Shell() {
  const { tab, loaded, formOpen, detailId } = useStore();

  if (!loaded) {
    return (
      <div className="boot">
        <div className="boot-logo">📚</div>
        <div className="boot-text">电子收纳册</div>
      </div>
    );
  }

  return (
    <div className="app">
      <main className="main">
        {tab === 'library' && <LibraryView />}
        {tab === 'stats' && <StatsView />}
        {tab === 'settings' && <SettingsView />}
      </main>
      <TabBar />
      {formOpen && <ItemForm />}
      {detailId && <ItemDetail itemId={detailId} />}
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
