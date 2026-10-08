import { useCallback, useEffect, useRef, useState } from "react";
import { getBookingConfig } from "../services/bookingApi";

const CACHE_KEY = "lane_booking_config";
const CACHE_TTL_MS = 10 * 60 * 1000;

export function useBookingConfig() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        let data = null;
        if (attempt === 0) {
          try {
            const cached = sessionStorage.getItem(CACHE_KEY);
            if (cached) {
              const parsed = JSON.parse(cached);
              const age = Date.now() - (parsed.fetchedAt || 0);
              if (age < CACHE_TTL_MS) data = parsed.data;
            }
          } catch (_) {
            data = null;
          }
        }

        if (!data) {
          data = await getBookingConfig();
          try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), data }));
          } catch (_) {
            // ignore storage errors
          }
        }

        if (!cancelled && mounted.current) {
          setConfig(data);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled && mounted.current) {
          setError(e);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      mounted.current = false;
    };
  }, [attempt]);

  const refetch = useCallback(() => setAttempt((n) => n + 1), []);

  return { config, loading, error, refetch };
}