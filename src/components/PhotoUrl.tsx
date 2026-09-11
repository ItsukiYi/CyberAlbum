import { useEffect, useState } from 'react';
import { useStore } from '../state/store';

const cache = new Map<string, string>();

export function photoUrl(key: string, blob?: Blob): string | undefined {
  const hit = cache.get(key);
  if (hit) return hit;
  if (!blob) return undefined;
  const url = URL.createObjectURL(blob);
  cache.set(key, url);
  return url;
}

export function usePhotoUrl(photoId: string | null | undefined): string | undefined {
  const { photosById } = useStore();
  const [url, setUrl] = useState<string | undefined>(() =>
    photoId ? photoUrl(`p:${photoId}`, photosById.get(photoId)?.blob) : undefined
  );

  useEffect(() => {
    if (!photoId) {
      setUrl(undefined);
      return;
    }
    const blob = photosById.get(photoId)?.blob;
    const u = photoUrl(`p:${photoId}`, blob);
    setUrl(u);
  }, [photoId, photosById]);

  return url;
}
