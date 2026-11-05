import { useEffect, useRef, useState } from 'react';
import { readErrorText } from './errors';

/** Runs `fn` whenever `key` changes; keeps the last result while reloading. */
export function useAsync<T>(
  fn: (() => Promise<T>) | null,
  key: string,
): { data: T | undefined; dataKey: string | null; error: string | null; loading: boolean } {
  const [data, setData] = useState<T | undefined>(undefined);
  const [dataKey, setDataKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    const run = fnRef.current;
    if (!run) {
      setData(undefined);
      setDataKey(null);
      setError(null);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    run()
      .then((v) => {
        if (!alive) return;
        setData(v);
        setDataKey(key);
        setError(null);
      })
      .catch((e: unknown) => {
        if (alive) setError(readErrorText(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [key]);

  return { data, dataKey, error, loading };
}
