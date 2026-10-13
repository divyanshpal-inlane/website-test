// PostgREST embed helpers. Pure — no Deno imports so the Node test harness
// can import this file directly.
//
// A many-to-one embed (`booking` -> `Learner` via `learner_id`) is returned by
// PostgREST as a to-one OBJECT, while a one-to-many embed comes back as an
// ARRAY. Historically some call sites indexed `[0]`, which silently nulls
// every to-one lookup (object[0] === undefined). `toOneRow` accepts either
// shape so both call sites can share one safe accessor.

export function toOneRow<T>(
  value: T | T[] | null | undefined,
): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
