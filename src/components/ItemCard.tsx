import React from 'react';
import { useStore } from '../state/store';
import type { Item } from '../db/types';
import { usePhotoUrl } from './PhotoUrl';

export function ItemCard({ item, onClick }: { item: Item; onClick: () => void }) {
  const { types } = useStore();
  const url = usePhotoUrl(item.mainPhotoId);
  const type = types.find((t) => t.id === item.typeId);
  const signed = item.signed === 'to' ? 'To签' : item.signed === 'signed' ? '签名' : null;

  return (
    <div className="card" onClick={onClick}>
      <div className="card-thumb">
        {url ? (
          <img src={url} alt={item.name} loading="lazy" />
        ) : (
          <div className="card-thumb-empty">📦</div>
        )}
        {signed && <span className="card-sign">{signed}</span>}
      </div>
      <div className="card-body">
        <div className="card-name" title={item.name}>
          {item.name || '未命名'}
        </div>
        <div className="card-meta">
          {type && (
            <span className="badge" style={{ background: type.color + '22', color: type.color }}>
              {type.name}
            </span>
          )}
          <span className="card-sub">
            {item.event || item.work || item.date || ''}
          </span>
        </div>
      </div>
    </div>
  );
}
