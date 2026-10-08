import { useEffect, useRef, useState } from "react";
import { getBookingSlots } from "../services/bookingApi";

export function useBookingSlots({ areaId, courseId, has_a_DL, femaleInstructorPreference, learnerLat, learnerLng }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const locationReady =
    typeof learnerLat === "number" && typeof learnerLng === "number";

  useEffect(() => {
    let cancelled = false;
    if (!locationReady && !areaId || !courseId || typeof has_a_DL !== "boolean") {
      setResult(null);
      setLoading(false);
      setError(null);
      return undefined;
    }

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const data = await getBookingSlots({
          areaId: locationReady ? undefined : areaId,
          courseId,
          has_a_DL,
          from: null,
          femaleInstructorPreference: Boolean(femaleInstructorPreference),
          learnerLat: locationReady ? learnerLat : undefined,
          learnerLng: locationReady ? learnerLng : undefined,
        });
        if (!cancelled && mounted.current) {
          setResult(data);
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
    };
  }, [areaId, courseId, has_a_DL, femaleInstructorPreference, learnerLat, learnerLng, locationReady, attempt]);

  const refetch = () => setAttempt((n) => n + 1);

  return { result, loading, error, refetch };
}