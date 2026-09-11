import React, { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { deleteItem } from '../db/repo';
import type { Item } from '../db/types';
import { Modal, Btn, Badge } from './ui';
import { usePhotoUrl } from './PhotoUrl';

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="d-row">
      <span className="d-label">{label}</span>
      <span className="d-value">{value}</span>
    </div>
  );
}

export function ItemDetail({ itemId }: { itemId: string }) {
  const { items, photosById, types, customFields, closeDetail, openForm } = useStore();
  const item: Item | undefined = items.find((i) => i.id === itemId);
  const [idx, setIdx] = useState(0);
  const [confirming, setConfirming] = useState(false);

  const orderedPhotos = useMemo(() => {
    if (!item) return [] as NonNullable<ReturnType<typeof photosById.get>>[];
    return item.photoIds
      .map((id) => photosById.get(id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .sort((a, b) => a.order - b.order);
  }, [item, photosById]);

  const curId = orderedPhotos.length ? orderedPhotos[Math.min(idx, orderedPhotos.length - 1)].id : undefined;
  const url = usePhotoUrl(curId);

  if (!item) {
    return (
      <Modal title="详情" onClose={closeDetail}>
        <p>这条记录已被删除。</p>
      </Modal>
    );
  }

  const type = types.find((t) => t.id === item.typeId);

  const confirmDelete = async () => {
    await deleteItem(item.id);
    setConfirming(false);
    closeDetail();
  };

  const signedLabel =
    item.signed === 'to' ? `To签${item.toSign ? `：${item.toSign}` : ''}` : item.signed === 'signed' ? '有签名' : '无签名';

  return (
    <Modal
      title={item.name || '未命名'}
      onClose={closeDetail}
      footer={
        <div className="d-actions">
          <Btn onClick={() => openForm(item)}>编辑</Btn>
          {confirming ? (
            <Btn danger onClick={confirmDelete}>
              确认删除？
            </Btn>
          ) : (
            <Btn danger onClick={() => setConfirming(true)}>
              删除
            </Btn>
          )}
        </div>
      }
      wide
    >
      <div className="detail">
        {orderedPhotos.length > 0 && url ? (
          <div className="carousel">
            <img
              src={url}
              alt={item.name}
              draggable={false}
              onClick={() => setIdx((i) => (i + 1) % orderedPhotos.length)}
            />
            {orderedPhotos.length > 1 && (
              <>
                <button
                  className="carousel-btn left"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIdx((i) => (i - 1 + orderedPhotos.length) % orderedPhotos.length);
                  }}
                >
                  ‹
                </button>
                <button
                  className="carousel-btn right"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIdx((i) => (i + 1) % orderedPhotos.length);
                  }}
                >
                  ›
                </button>
                <span className="carousel-index">
                  {idx + 1} / {orderedPhotos.length}
                </span>
              </>
            )}
            {orderedPhotos[idx]?.side && (
              <span className={`carousel-side ${orderedPhotos[idx].side}`}>
                {orderedPhotos[idx].side === 'front' ? '正面' : '反面'}
              </span>
            )}
          </div>
        ) : (
          <div className="detail-nophoto">📦 暂无照片</div>
        )}

        <div className="d-fields">
          {type && <Badge color={type.color}>{type.name}</Badge>}
          <Row label="IP" value={item.work} />
          <Row label="Coser" value={item.cosers?.length ? item.cosers.join('、') : item.author} />
          <Row label="场次" value={item.event} />
          <Row label="地点" value={item.region ? [item.region.province, item.region.city, item.region.district].filter(Boolean).join(' ') : undefined} />
          <Row label="日期" value={item.date} />
          <div className="d-row">
            <span className="d-label">签名</span>
            <span className="d-value">{signedLabel}</span>
          </div>
          {customFields.map((f) => (
            <Row key={f.id} label={f.name} value={item.custom[f.id]} />
          ))}
          <Row label="存放位置" value={item.location} />
          <Row label="数量" value={item.quantity != null ? String(item.quantity) : undefined} />
          <Row label="价格" value={item.price != null ? `¥${item.price}` : undefined} />
          <Row label="来源" value={item.source} />
          {item.tags.length > 0 && (
            <div className="d-row">
              <span className="d-label">标签</span>
              <span className="d-tags">
                {item.tags.map((t) => (
                  <span className="tag" key={t}>
                    {t}
                  </span>
                ))}
              </span>
            </div>
          )}
          <Row label="备注" value={item.notes} />
        </div>
      </div>
    </Modal>
  );
}
