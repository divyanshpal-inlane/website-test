// Pure input validators for the booking flow. No Deno imports — usable from the
// Node test harness and from any edge function.

export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/[^\d]/g, "");
  // Only accept exactly 10 digits, or 12 digits starting with 91, or 11 digits starting with 0
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return null;
}

export function isValidPhone(raw: unknown): boolean {
  const p = normalizePhone(raw);
  // Must be exactly 10 digits and start with 6-9 (Indian mobile numbers)
  return p !== null && p.length === 10 && /^[6-9]/.test(p);
}

export function isValidEmail(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  // Stricter email regex: no consecutive dots, no leading/trailing dots in local or domain part
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed) &&
    !trimmed.includes("..") &&
    !trimmed.startsWith(".") &&
    !trimmed.endsWith(".") &&
    !trimmed.includes("@.") &&
    !trimmed.includes(".@") &&
    trimmed.split("@")[1]?.includes(".") &&
    !trimmed.split("@")[1]?.startsWith(".") &&
    !trimmed.split("@")[1]?.endsWith(".");
}

export function isValidPincode(raw: unknown): boolean {
  return typeof raw === "string" && /^[0-9]{6}$/.test(raw.trim());
}

export function isValidTime(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(raw);
}

export function isValidDateISO(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const d = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === raw;
}

export function normalizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length < 2 || trimmed.length > 120) return null;
  return trimmed;
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// "Today" in IST (UTC+05:30) — used for all booking-day math so a learner in
// India doesn't see boundary-slipped dates.
export function istTodayISO(now: Date = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

export function dateToWeekdayLower(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d))
    .toLocaleDateString("en-US", { weekday: "long" })
    .toLowerCase();
}

/**
 * Parse a wall-clock time into minutes since midnight.
 *
 * Accepts "HH:MM" AND Postgres `time` output ("HH:MM:SS" / "HH:MM:SS.ffffff").
 * Seconds are ignored. The seconds form is REQUIRED: every `Schedule.start_time`
 * / `end_time` read from the DB arrives as "06:00:00". A strict "HH:MM"-only
 * parser turns every real schedule row into NaN, a NaN block never overlaps
 * anything, and booked instructors then look free (this shipped once).
 * Anything else (25:00, 12:60, garbage) is still NaN.
 */
export function timeToMinutes(time: string): number {
  if (typeof time !== "string") return NaN;
  const match = time.match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/);
  if (!match) return NaN;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h * 60 + m;
}

export function minutesToTime(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}