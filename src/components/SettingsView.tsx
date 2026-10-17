import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import {
  deleteCustomField,
  deleteType,
  saveCustomField,
  saveSettings,
  saveType,
  uid,
} from '../db/repo';
import type { CustomFieldDef, TypeDef } from '../db/types';
import { exportBackup, exportSync, getLastSyncTime, importBackup, importMerge } from '../utils/backup';
import { Btn } from './ui';
import { SelectField } from './SelectField';
import { ColorField } from './ColorField';

/** 新增类型时按顺序循环取的颜色（与预设类型的配色风格一致） */
const PALETTE = [
  '#e25c6c',
  '#e07b3a',
  '#3a8de0',
  '#2fae8f',
  '#8b5ce0',
  '#d94f9e',
  '#5c6bc0',
  '#43a047',
  '#f0a530',
  '#607d8b',
  '#9aa0a6',
];

function TypeRow({ t, onDelete }: { t: TypeDef; onDelete: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState(t.name);
  // 外部(如新增空行)变化时同步；本地输入(IME 组合/连打)不会被打断
  useEffect(() => {
    setName(t.name);
  }, [t.id, t.name]);
  const commitName = () => {
    const v = name.trim();
    if (v && v !== t.name) saveType({ ...t, name: v });
  };
  return (
    <div className="setting-row">
      <input
        className="input row-input"
        value={name}
        placeholder="类型名称"
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <ColorField value={t.color} onChange={(c) => saveType({ ...t, color: c })} />
      {confirming ? (
        <button className="btn btn-danger btn-sm" onClick={() => onDelete(t.id)}>
          确定?
        </button>
      ) : (
        <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(true)}>
          删除
        </button>
      )}
    </div>
  );
}

function FieldRow({ f, onDelete }: { f: CustomFieldDef; onDelete: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState(f.name);
  const [opts, setOpts] = useState(f.options.join(', '));
  useEffect(() => {
    setName(f.name);
    setOpts(f.options.join(', '));
  }, [f.id, f.name, f.options]);
  const commitName = () => {
    const v = name.trim();
    if (v && v !== f.name) saveCustomField({ ...f, name: v });
  };
  const commitOpts = () => {
    const parsed = opts.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    saveCustomField({ ...f, options: parsed });
  };
  return (
    <div className="setting-row field-def">
      <input
        className="input row-input"
        value={name}
        placeholder="字段名"
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <SelectField
        className="row-select"
        value={f.kind}
        options={[
          { value: 'text', label: '文本' },
          { value: 'number', label: '数字' },
          { value: 'select', label: '下拉' },
        ]}
        onChange={(v) => saveCustomField({ ...f, kind: v as CustomFieldDef['kind'] })}
      />
      {f.kind === 'select' && (
        <input
          className="input row-input"
          value={opts}
          placeholder="选项，用逗号分隔"
          onChange={(e) => setOpts(e.target.value)}
          onBlur={commitOpts}
        />
      )}
      {confirming ? (
        <button className="btn btn-danger btn-sm" onClick={() => onDelete(f.id)}>
          确定?
        </button>
      ) : (
        <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(true)}>
          删除
        </button>
      )}
    </div>
  );
}

export function SettingsView() {
  const store = useStore();
  const { types, customFields, settings, photos, items } = store;
  const [msg, setMsg] = useState('');
  const [syncMsg, setSyncMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const syncRef = useRef<HTMLInputElement>(null);
  const lastSync = getLastSyncTime();

  const addType = () => {
    const t: TypeDef = {
      id: uid('t'),
      name: '',
      color: PALETTE[types.length % PALETTE.length],
      order: Date.now(),
    };
    saveType(t);
  };

  const addField = () => {
    const f: CustomFieldDef = { id: uid('f'), name: '', kind: 'text', options: [], order: Date.now() };
    saveCustomField(f);
  };

  const toggle = (key: keyof typeof settings) => {
    saveSettings({ ...settings, [key]: !settings[key] });
  };

  const totalBytes = photos.reduce((s, p) => s + (p.blob?.size ?? 0), 0);
  const mb = (totalBytes / 1024 / 1024).toFixed(1);

  const doExport = async () => {
    setBusy(true);
    try {
      const blob = await exportBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const d = new Date();
      a.download = `收纳册备份-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMsg('备份已导出 ✅ 请妥善保存 zip 文件');
    } catch (err) {
      console.error(err);
      setMsg('导出失败：' + (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doImport = async (file: File) => {
    if (!window.confirm('导入会覆盖当前全部数据，确定继续吗？')) return;
    setBusy(true);
    try {
      const r = await importBackup(file);
      setMsg(`导入完成 ✅ 共 ${r.items} 件周边`);
    } catch (err) {
      setMsg('导入失败：' + (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doExportSync = async () => {
    setBusy(true);
    try {
      const { blob, count } = await exportSync();
      if (count === 0) {
        setSyncMsg('自从上次同步后没有新增/修改，无需导出');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const d = new Date();
      a.download = `收纳册同步-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setSyncMsg(`已导出 ${count} 条增量（含照片）✅ 传到另一台设备并「导入同步包」合并即可`);
    } catch (err) {
      setSyncMsg('导出失败：' + (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doImportSync = async (file: File) => {
    setBusy(true);
    try {
      const r = await importMerge(file);
      setSyncMsg(`合并完成 ✅ 新增 ${r.items} 条记录、${r.photos} 张照片（不清空本机数据）`);
    } catch (err) {
      setSyncMsg('合并失败：' + (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings">
      <header className="settings-header">
        <h1>设置</h1>
      </header>

      <section className="settings-section">
        <h2>周边类型</h2>
        <p className="settings-desc">用于分类和筛选，随时可增删改</p>
        {types.map((t) => (
          <TypeRow key={t.id} t={t} onDelete={(id) => deleteType(id)} />
        ))}
        <button className="btn btn-soft btn-block" onClick={addType}>
          + 新增类型
        </button>
      </section>

      <section className="settings-section">
        <h2>自定义字段</h2>
        <p className="settings-desc">除了内置字段，可以自己加字段来记录</p>
        {customFields.map((f) => (
          <FieldRow key={f.id} f={f} onDelete={(id) => deleteCustomField(id)} />
        ))}
        <button className="btn btn-soft btn-block" onClick={addField}>
          + 新增字段
        </button>
      </section>

      <section className="settings-section">
        <h2>可选字段</h2>
        <div className="setting-row">
          <span className="setting-label">存放位置</span>
          <input type="checkbox" checked={settings.showLocation} onChange={() => toggle('showLocation')} />
        </div>
        <div className="setting-row">
          <span className="setting-label">数量</span>
          <input type="checkbox" checked={settings.showQuantity} onChange={() => toggle('showQuantity')} />
        </div>
        <div className="setting-row">
          <span className="setting-label">价格</span>
          <input type="checkbox" checked={settings.showPrice} onChange={() => toggle('showPrice')} />
        </div>
        <div className="setting-row">
          <span className="setting-label">来源</span>
          <input type="checkbox" checked={settings.showSource} onChange={() => toggle('showSource')} />
        </div>
      </section>

      <section className="settings-section">
        <h2>照片处理</h2>
        <div className="setting-row">
          <span className="setting-label">自动美化照片</span>
          <input type="checkbox" checked={settings.autoEnhance} onChange={() => toggle('autoEnhance')} />
        </div>
        <p className="settings-desc">自动修正色偏（白平衡）、提升对比度与饱和度，让照片观感更接近实物。拍照/矫正/导入时自动应用，可随时关闭。</p>
      </section>

      <section className="settings-section">
        <h2>双机迁移同步</h2>
        <p className="settings-desc">主力机拍完 → 导出同步包（只含上次同步后的新增）→ 用隔空投送/微信/USB 传到另一台设备 → 导入合并。两边可交替同步，数据不清空。</p>
        <div className="setting-row">
          <span className="setting-label">
            上次同步：{lastSync ? new Date(lastSync).toLocaleString('zh-CN') : '还没同步过'}
          </span>
        </div>
        <div className="backup-actions">
          <Btn onClick={doExportSync} disabled={busy}>
            📤 导出同步包
          </Btn>
          <Btn onClick={() => syncRef.current?.click()} disabled={busy}>
            ⬆️ 导入同步包
          </Btn>
          <input
            ref={syncRef}
            type="file"
            accept=".zip,application/zip"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) doImportSync(f);
              e.target.value = '';
            }}
          />
        </div>
        {syncMsg && <p className="settings-msg">{syncMsg}</p>}
      </section>

      <section className="settings-section">
        <h2>数据</h2>
        <div className="setting-row">
          <span className="setting-label">
            共 {items.length} 件周边 · 照片占用 {mb} MB
          </span>
        </div>
        <div className="setting-row">
          <span className="setting-label">数据保存在本机浏览器里，建议定期备份</span>
        </div>
        <div className="backup-actions">
          <Btn onClick={doExport} disabled={busy}>
            ⬇️ 导出备份
          </Btn>
          <Btn onClick={() => importRef.current?.click()} disabled={busy}>
            ⬆️ 导入备份
          </Btn>
          <input
            ref={importRef}
            type="file"
            accept=".zip,application/zip"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) doImport(f);
              e.target.value = '';
            }}
          />
        </div>
        {msg && <p className="settings-msg">{msg}</p>}
      </section>

      <section className="settings-section">
        <h2>使用提示</h2>
        <ul className="tips">
          <li>在手机上：添加到主屏幕即可当 App 用（Android 请用 Chrome）。</li>
          <li>数据只存在当前设备的浏览器里，换设备不会自动同步。</li>
          <li>照片建议横平竖直地拍，自动识别更准。</li>
        </ul>
      </section>
    </div>
  );
}
