import { useState } from "react";
import { createBooking, isSlotConflict } from "../services/bookingApi";

const IDEM_KEY = "lane_booking_idem_key_v1";

function uuidv4() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // crypto.randomUUID only exists on secure contexts (HTTPS / localhost).
  // Fallback UUID v4 generator so payment works on plain-HTTP previews too.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function currentKey() {
  let key = null;
  try {
    key = sessionStorage.getItem(IDEM_KEY);
  } catch (_) {
    key = null;
  }
  if (!key) key = uuidv4();
  return key;
}

function saveKey(key) {
  try {
    sessionStorage.setItem(IDEM_KEY, key);
  } catch (_) {
    // ignore
  }
}

function clearKey() {
  try {
    sessionStorage.removeItem(IDEM_KEY);
  } catch (_) {
    // ignore
  }
}

/**
 * createBooking wrapper that owns the idempotency key. The same key is reused
 * across retries (so a never-paid booking replays instead of doubling), and is
 * regenerated after a slot conflict (learner picks fresh slots) or after a
 * successful NEW booking (so the learner can buy another course without the
 * stale key replaying the previous booking).
 */
export function useCreateBooking() {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const create = async (payload) => {
    setCreating(true);
    setError(null);
    const idempotencyKey = currentKey();
    saveKey(idempotencyKey);
    try {
      const data = await createBooking({ ...payload, idempotencyKey });
      if (data?.bookingId && !data?.replay) clearKey();
      return data;
    } catch (e) {
      if (isSlotConflict(e)) clearKey();
      setError(e);
      throw e;
    } finally {
      setCreating(false);
    }
  };

  const resetKey = clearKey;

  return { create, creating, error, resetKey };
}