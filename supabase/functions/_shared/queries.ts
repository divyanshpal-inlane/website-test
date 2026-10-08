// Shared data-access helpers for the booking edge functions.
//
// The unbounded window fetch is paginated (offset/range) so occupancy is never
// silently truncated by the PostgREST row cap. Deterministic `order("id")` keeps
// every invocation reading the SAME row set in the SAME order.

import { normalizeZoneRings, type ServiceZone } from "./serviceability.ts";

export interface ScheduleWindowRow {
  id: number;
  instructor_id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  booking_id?: string | null;
  booking?: { created_at?: string } | null;
}

const PAGE_SIZE = 1000;

export async function fetchAllScheduleWindow(
  client: any,
  dateFrom: string,
  dateTo: string,
): Promise<ScheduleWindowRow[]> {
  const rows: ScheduleWindowRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from("Schedule")
      .select("id, instructor_id, date, start_time, end_time, status, booking_id, booking:booking_id(created_at)")
      .not("status", "in", "(cancelled,rejected)")
      .gte("date", dateFrom)
      .lte("date", dateTo)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as ScheduleWindowRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

/**
 * Driving-zone polygons from `instructor_service_zones`, as stored.
 *
 * Column names must match the live table: `coordinates` (JSONB ring) and
 * `raw_name`. An earlier revision read `geometry`/`source_name`, which do not
 * exist in this schema — PostgREST rejected the whole select, so every
 * location-mode call (check-location-serviceability, get-booking-slots,
 * create-booking) failed rather than degrading.
 *
 * `kind = 'polygon'` is enforced here because only polygons can contain a
 * point; `kind = 'point'` rows exist in the schema but carry no area and are
 * ignored. There is no radius fallback: an instructor without a polygon is
 * never serviceable.
 *
 * Rough zones are filtered OUT in JS, not with `.eq("is_rough", false)`:
 * `is_rough` is NULL on rows written before that column existed, and a SQL
 * equality would silently drop those verified zones. This mirrors the admin
 * app's `is_rough === true` test exactly. A rough polygon is a provisional
 * onboarding boundary, so letting one drive serviceability would auto-match
 * real customers to an instructor Ops never confirmed.
 */
export async function fetchServiceZones(client: any): Promise<ServiceZone[]> {
  const { data, error } = await client
    .from("instructor_service_zones")
    .select("instructor_id,kind,coordinates,raw_name,is_rough")
    .eq("kind", "polygon");
  if (error) throw error;

  const out: ServiceZone[] = [];
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    if (r.is_rough === true) continue;
    const rings = normalizeZoneRings(r.coordinates);
    if (rings.length === 0) continue;
    out.push({
      instructorId: String(r.instructor_id),
      sourceName: r.raw_name == null ? undefined : String(r.raw_name),
      rings,
    });
  }
  return out;
}

/** Active service areas (id, name) for location -> area resolution. */
export async function fetchActiveAreas(client: any): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await client
    .from("Serviceable_Areas")
    .select("id, name")
    .eq("active", true);
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string; name: string }>);
}