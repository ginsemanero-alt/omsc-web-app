import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

// A filter whose value lives in the URL (?status=ongoing) so the back button
// and a refresh keep it. The default value is never written, which keeps the
// plain page address clean. Edits replace the current history entry (typing
// or picking a filter should not fill the back button); a click-through from
// a dashboard card is an ordinary link and does push.
export function useUrlFilter(key: string, fallback: string): [string, (next: string) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? fallback;

  const setValue = useCallback(
    (next: string) => {
      setParams(
        (previous) => {
          const updated = new URLSearchParams(previous);
          if (next === fallback) updated.delete(key);
          else updated.set(key, next);
          return updated;
        },
        { replace: true }
      );
    },
    [key, fallback, setParams]
  );

  return [value, setValue];
}
