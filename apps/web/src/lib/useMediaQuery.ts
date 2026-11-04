import { useCallback, useSyncExternalStore } from 'react';
import tokens from '../design/tokens.json';

/** Từ điểm ngắt md trở lên: bố cục máy tính. Dưới đó: bố cục điện thoại (thẻ). */
export const wideQuery = `(min-width: ${tokens.breakpoint.md})`;

export function useMediaQuery(query: string, fallback = true): boolean {
  const subscribe = useCallback(
    (callback: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', callback);
      return () => list.removeEventListener('change', callback);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : fallback),
    () => fallback,
  );
}