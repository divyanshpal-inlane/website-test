// Persistence helpers for the acquisition-funnel instrumentation.
//
// Pure of Deno-only APIs (no `Deno.*`, no remote imports) so the module can be
// imported by the Node test harness. The Supabase client is always passed in as
// an argument — same pattern as `_shared/admin.ts`.
//
// Tables touched (all service-role only, RLS enabled / 0 policies):
//   lead_sessions       — session stitching anchor
//   funnel_leads        — lead record of record
//   lead_events         — append-only event log
//   funnel_rate_limits  — durable rate-limit counters (Phase 0 delta M3)
//
// ---------------------------------------------------------------------------
// SECURITY POSTURE
// ---------------------------------------------------------------------------
// * The client NEVER supplies a `lead_id`. It is always derived server-side
//   from `lead_sessions.lead_id`, which only `capture-lead` writes.
// * Attribution values are read through a strict allowlist; anything else is
//   dropped. No free-form payloads are ever stored.
// * The client NEVER supplies an `occurred_at` outside the clamped window, and
//   the ingestion time is always stored separately in `created_at`.
// * Rate-limit bucket keys are non-reversible digests. Raw IPs, phones and
//   e-mails are never persisted.

import {
  MAX_PROPERTY_STRING_LENGTH,
  type FunnelEventName,
} from "./funnelTaxonomy.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimal shape of the Supabase client used here (avoids a hard dependency on
 * the SDK types so the module stays trivially mockable in tests).
 */
export interface FunnelQueryBuilder {
  insert(values: unknown): FunnelQueryBuilder;
  upsert(values: unknown, options?: unknown): FunnelQueryBuilder;
  update(values: unknown): FunnelQueryBuilder;
  select(columns?: string, options?: unknown): FunnelQueryBuilder;
  eq(column: string, value: unknown): FunnelQueryBuilder;
  neq(column: string, value: unknown): FunnelQueryBuilder;
  gte(column: string, value: unknown): FunnelQueryBuilder;
  lt(column: string, value: unknown): FunnelQueryBuilder;
  is(column: string, value: unknown): FunnelQueryBuilder;
  not(column: string, operator: string, value: unknown): FunnelQueryBuilder;
  in(column: string, values: unknown[]): FunnelQueryBuilder;
  order(column: string, options?: unknown): FunnelQueryBuilder;
  limit(count: number): FunnelQueryBuilder;
  maybeSingle(): Promise<{ data: any; error: any }>;
  single(): Promise<{ data: any; error: any }>;
}

export interface FunnelDbClient {
  from(table: string): FunnelQueryBuilder;
}

export interface LeadSessionRow {
  id: string;
  client_session_id: string;
  lead_id: string | null;
  created_at: string;
  last_seen_at: string;
  first_utm_source: string | null;
  first_utm_medium: string | null;
  first_utm_campaign: string | null;
  first_referrer_host: string | null;
  first_page_path: string | null;
}

export interface FunnelLeadRow {
  id: string;
  phone_normalized: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  locality: string | null;
  area: string | null;
  source: string | null;
  service_interest: string | null;
  lead_source: string | null;
  status: string;
  session_id: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  gclid: string | null;
  referrer_host: string | null;
  first_utm_source: string | null;
  first_utm_medium: string | null;
  first_utm_campaign: string | null;
  lead_state: string;
  priority_tier: string | null;
  dl_status: string | null;
  area_id: string | null;
  state: string | null;
  last_activity_at: string | null;
  cratio_sync_status: string | null;
  marketing_consent: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface LeadEventRow {
  id: string;
  session_id: string;
  lead_id: string | null;
  event_name: string;
  occurred_at: string;
  page_path: string | null;
  properties: Record<string, unknown>;
  correlation_id: string | null;
  client_event_id: string;
  created_at: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  device_type: string | null;
}

/** First-touch attribution persisted on `lead_sessions`. */
export interface SessionAttribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  referrer_host?: string;
}

/** Last-touch attribution persisted on `funnel_leads`. */
export interface LeadAttribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  gclid?: string;
  referrer_host?: string;
}

// ---------------------------------------------------------------------------
// Allowlists
// ---------------------------------------------------------------------------

/** Keys accepted for session (first-touch) attribution. */
export const SESSION_ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "referrer_host",
] as const;

/** Keys accepted for lead (last-touch) attribution. */
export const LEAD_ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "referrer_host",
] as const;

const SESSION_ATTRIBUTION_SET = new Set<string>(SESSION_ATTRIBUTION_KEYS);
const LEAD_ATTRIBUTION_SET = new Set<string>(LEAD_ATTRIBUTION_KEYS);

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Postgres unique-violation SQLSTATE. */
export const UNIQUE_VIOLATION = "23505";

/** Is this Supabase/PostgREST error a unique violation? */
export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; message?: unknown };
  if (e.code === UNIQUE_VIOLATION) return true;
  return typeof e.message === "string" && e.message.includes("duplicate key value");
}

/** Trim + bound a free-text value; returns undefined when unusable. */
export function cleanText(
  value: unknown,
  maxLength = MAX_PROPERTY_STRING_LENGTH,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

/**
 * Extract a strictly-allowlisted set of attribution values.
 * Unknown keys, non-strings and empty values are dropped (never thrown).
 */
export function sanitizeAttribution<T extends Record<string, string | undefined>>(
  input: unknown,
  allowed: ReadonlySet<string>,
): T {
  const out: Record<string, string> = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return out as T;
  }
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const normalizedKey = key.trim().toLowerCase();
    if (!allowed.has(normalizedKey)) continue;
    const cleaned = cleanText(value);
    if (cleaned === undefined) continue;
    out[normalizedKey] = cleaned;
  }
  return out as T;
}

/** First-touch (session) attribution. */
export function sanitizeSessionAttribution(input: unknown): SessionAttribution {
  return sanitizeAttribution<SessionAttribution>(input, SESSION_ATTRIBUTION_SET);
}

/** Last-touch (lead) attribution. */
export function sanitizeLeadAttribution(input: unknown): LeadAttribution {
  return sanitizeAttribution<LeadAttribution>(input, LEAD_ATTRIBUTION_SET);
}

// ---------------------------------------------------------------------------
// Session resolution
// ---------------------------------------------------------------------------

export interface ResolveSessionInput {
  /** Client-generated uuid4 (authoritative client-side session key). */
  clientSessionId: string;
  /** First-touch attribution; only written when the session is created. */
  attribution?: SessionAttribution;
  /** First page path seen; only written when the session is created. */
  pagePath?: string | null;
}

export interface ResolveSessionResult {
  session: LeadSessionRow;
  /** True when this call created the session row. */
  created: boolean;
}

/**
 * Resolve (and lazily create) the authoritative server-side session row.
 *
 * The client only ever supplies `client_session_id`; the server owns `id`.
 * First-touch attribution is written exactly once, at creation time.
 */
export async function resolveSession(
  client: FunnelDbClient,
  input: ResolveSessionInput,
): Promise<ResolveSessionResult> {
  const attribution = input.attribution ?? {};
  const insertPayload = {
    client_session_id: input.clientSessionId,
    first_utm_source: attribution.utm_source ?? null,
    first_utm_medium: attribution.utm_medium ?? null,
    first_utm_campaign: attribution.utm_campaign ?? null,
    first_referrer_host: attribution.referrer_host ?? null,
    first_page_path: input.pagePath ?? null,
  };

  const { data, error } = await client
    .from("lead_sessions")
    .insert(insertPayload)
    .select("*")
    .maybeSingle();

  if (!error && data) {
    return { session: data as LeadSessionRow, created: true };
  }
  if (error && !isUniqueViolation(error)) {
    throw error;
  }

  // The session already exists (concurrent insert or an earlier visit).
  const { data: existing, error: selectError } = await client
    .from("lead_sessions")
    .select("*")
    .eq("client_session_id", input.clientSessionId)
    .maybeSingle();

  if (selectError) throw selectError;
  if (!existing) {
    throw new Error("lead_session_not_found");
  }

  const session = existing as LeadSessionRow;

  // Touch `last_seen_at` — best effort, never fatal.
  //
  // A session first created by a server-side emit (a location check or a slots
  // view has no page path) keeps `first_page_path` NULL forever otherwise, and
  // the surface metric (M9) can only group sessions that carry one. Backfilling
  // a NULL on the first event that knows the page is NOT an overwrite of
  // first-touch data, so attribution stays exactly as it was.
  const touch: Record<string, unknown> = { last_seen_at: new Date().toISOString() };
  if (!session.first_page_path && input.pagePath) {
    touch.first_page_path = input.pagePath;
  }
  try {
    const { data: touched } = await client
      .from("lead_sessions")
      .update(touch)
      .eq("id", session.id)
      .select("*")
      .maybeSingle();
    if (touched) {
      return { session: touched as LeadSessionRow, created: false };
    }
  } catch {
    // Ignore — the session row itself is what matters.
  }

  return { session, created: false };
}

/**
 * Link a session to a lead. Only ever called by `capture-lead`, with a
 * server-derived lead id. Never overwrites an existing link.
 */
export async function linkSessionToLead(
  client: FunnelDbClient,
  sessionId: string,
  leadId: string,
): Promise<boolean> {
  const { error } = await client
    .from("lead_sessions")
    .update({ lead_id: leadId, last_seen_at: new Date().toISOString() })
    .eq("id", sessionId)
    .is("lead_id", null);
  if (error && !isUniqueViolation(error)) {
    // A non-unique failure here is not fatal: the event log is the record.
    console.error("funnel: link_session_to_lead_failed", error?.message ?? error);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Event writes
// ---------------------------------------------------------------------------

export interface RecordEventInput {
  sessionId: string;
  /** Server-derived. Null for events that happened before the capture. */
  leadId: string | null;
  eventName: FunnelEventName | string;
  /** When the event actually happened (already clamped by the caller). */
  occurredAt?: string;
  pagePath: string | null;
  properties: Record<string, string | number | boolean>;
  correlationId: string | null;
  /** Idempotency key. For `lead_captured` this is `capture:<lead_id>`. */
  clientEventId: string;
  /** Last-touch attribution carried on the event row. */
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  /** Coarse device class (desktop | mobile | tablet). */
  deviceType?: string | null;
}

export interface RecordEventResult {
  inserted: boolean;
  eventId: string | null;
}

/**
 * Append one row to `lead_events`.
 *
 * A unique violation means the same `(session_id, client_event_id)` was already
 * recorded (retry / double render) — that is a SUCCESS, not an error, and is
 * reported as `inserted: false` so the caller can answer `duplicate: true`.
 */
export async function recordEvent(
  client: FunnelDbClient,
  event: RecordEventInput,
): Promise<RecordEventResult> {
  const payload = {
    session_id: event.sessionId,
    lead_id: event.leadId,
    event_name: event.eventName,
    occurred_at: event.occurredAt ?? new Date().toISOString(),
    page_path: event.pagePath,
    properties: event.properties ?? {},
    correlation_id: event.correlationId,
    client_event_id: event.clientEventId,
    utm_source: event.utmSource ?? null,
    utm_medium: event.utmMedium ?? null,
    utm_campaign: event.utmCampaign ?? null,
    device_type: event.deviceType ?? null,
  };

  const { data, error } = await client
    .from("lead_events")
    .insert(payload)
    .select("*")
    .maybeSingle();

  if (error) {
    if (isUniqueViolation(error)) {
      return { inserted: false, eventId: null };
    }
    throw error;
  }

  return { inserted: true, eventId: (data as LeadEventRow | null)?.id ?? null };
}

/**
 * Back-stitch every pre-capture event of a session onto the lead that was
 * captured in it (PRD section 4: "Pre-capture events are keyed on session_id
 * and must be back-stitched to the lead_id once the lead form is submitted").
 *
 * Only rows with `lead_id IS NULL` are touched, so a second capture in the
 * same session cannot re-point an event at a different lead.
 */
export async function backstitchLeadEvents(
  client: FunnelDbClient,
  sessionId: string,
  leadId: string,
): Promise<number> {
  const { data, error } = await client
    .from("lead_events")
    .update({ lead_id: leadId })
    .eq("session_id", sessionId)
    .is("lead_id", null)
    .select("id");

  if (error) {
    console.error("funnel: backstitch_failed", error?.message ?? error);
    return 0;
  }
  return Array.isArray(data) ? data.length : 0;
}

/**
 * Count the events already recorded for a session since `sinceIso`.
 * Used for the durable, cross-instance event rate limit.
 */
export async function countSessionEventsSince(
  client: FunnelDbClient,
  sessionId: string,
  sinceIso: string,
): Promise<number> {
  const { count, error } = await client
    .from("lead_events")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .gte("occurred_at", sinceIso);
  if (error) return 0;
  return typeof count === "number" ? count : 0;
}

/**
 * Count the `lead_captured` events recorded for a session since `sinceIso`.
 */
export async function countSessionCapturesSince(
  client: FunnelDbClient,
  sessionId: string,
  sinceIso: string,
): Promise<number> {
  const { count, error } = await client
    .from("lead_events")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("event_name", "lead_captured")
    .gte("occurred_at", sinceIso);
  if (error) return 0;
  return typeof count === "number" ? count : 0;
}

// ---------------------------------------------------------------------------
// Lead writes
// ---------------------------------------------------------------------------

export interface UpsertLeadInput {
  phoneNormalized: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  locality: string | null;
  area: string | null;
  source: string | null;
  serviceInterest: string | null;
  leadSource: string | null;
  /** The server-side session that produced the capture (nullable). */
  sessionId: string | null;
  attribution: LeadAttribution;
  firstTouch: SessionAttribution;
  /** PRD section 4 lead state (defaults to `new`). */
  leadState?: string;
  /** Marketing consent flag, where the surface collects it. */
  marketingConsent?: boolean | null;
}

/** Look up an existing lead by its dedupe key (last 10 phone digits). */
export async function findLeadByPhone(
  client: FunnelDbClient,
  phoneNormalized: string,
): Promise<FunnelLeadRow | null> {
  const { data, error } = await client
    .from("funnel_leads")
    .select("*")
    .eq("phone_normalized", phoneNormalized)
    .maybeSingle();
  if (error) return null;
  return (data as FunnelLeadRow | null) ?? null;
}

/**
 * Create or refresh the lead record of record.
 *
 * Dedupe key is `phone_normalized` (last 10 digits). `created_at` and `status`
 * are intentionally NOT written on update — a repeat capture must not reset the
 * lifecycle status of an already-worked lead.
 */
export async function upsertLead(
  client: FunnelDbClient,
  input: UpsertLeadInput,
): Promise<FunnelLeadRow> {
  const attribution = input.attribution ?? {};
  const firstTouch = input.firstTouch ?? {};

  const payload: Record<string, unknown> = {
    phone_normalized: input.phoneNormalized,
    name: input.name ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    locality: input.locality ?? null,
    area: input.area ?? null,
    source: input.source ?? null,
    service_interest: input.serviceInterest ?? null,
    lead_source: input.leadSource ?? null,
    session_id: input.sessionId ?? null,
    utm_source: attribution.utm_source ?? null,
    utm_medium: attribution.utm_medium ?? null,
    utm_campaign: attribution.utm_campaign ?? null,
    utm_term: attribution.utm_term ?? null,
    utm_content: attribution.utm_content ?? null,
    gclid: attribution.gclid ?? null,
    referrer_host: attribution.referrer_host ?? null,
    first_utm_source: firstTouch.utm_source ?? null,
    first_utm_medium: firstTouch.utm_medium ?? null,
    first_utm_campaign: firstTouch.utm_campaign ?? null,
    updated_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
  };
  if (input.leadState) payload.lead_state = input.leadState;
  if (input.marketingConsent !== undefined) {
    payload.marketing_consent = input.marketingConsent;
  }

  const { data, error } = await client
    .from("funnel_leads")
    .upsert(payload, { onConflict: "phone_normalized" })
    .select("*")
    .single();

  if (error) throw error;
  return data as FunnelLeadRow;
}

export interface LeadProgressUpdate {
  leadState?: string | null;
  priorityTier?: string | null;
  dlStatus?: string | null;
  areaId?: string | null;
  state?: string | null;
  locality?: string | null;
  area?: string | null;
  cratioSyncStatus?: string | null;
}

/**
 * Persist the recomputed lead state / prioritisation tier.
 *
 * Only the fields that are actually being changed are written; `updated_at`
 * and `last_activity_at` are always bumped.
 */
export async function updateLeadProgress(
  client: FunnelDbClient,
  leadId: string,
  update: LeadProgressUpdate,
): Promise<void> {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
  };
  if (update.leadState !== undefined && update.leadState !== null) {
    payload.lead_state = update.leadState;
  }
  if (update.priorityTier !== undefined && update.priorityTier !== null) {
    payload.priority_tier = update.priorityTier;
  }
  if (update.dlStatus !== undefined && update.dlStatus !== null) {
    payload.dl_status = update.dlStatus;
  }
  if (update.areaId !== undefined && update.areaId !== null) {
    payload.area_id = update.areaId;
  }
  if (update.state !== undefined && update.state !== null) {
    payload.state = update.state;
  }
  if (update.locality !== undefined && update.locality !== null) {
    payload.locality = update.locality;
  }
  if (update.area !== undefined && update.area !== null) {
    payload.area = update.area;
  }
  if (update.cratioSyncStatus !== undefined && update.cratioSyncStatus !== null) {
    payload.cratio_sync_status = update.cratioSyncStatus;
  }

  const { error } = await client.from("funnel_leads").update(payload).eq("id", leadId);
  if (error) {
    console.error("funnel: update_lead_progress_failed", error?.message ?? error);
  }
}

// ---------------------------------------------------------------------------
// Durable rate limiting
// ---------------------------------------------------------------------------

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  remaining: number;
}

/**
 * Consume one unit from a durable, cross-instance rate-limit bucket.
 *
 * The bucket lives in `funnel_rate_limits` (Phase 0 delta M3). The counter is
 * a read-modify-write, so under heavy concurrency it can under-count by a
 * small amount — it is a safety valve, not a billing control. The per-isolate
 * in-memory limiter in `funnelEvents.ts` is the fast path.
 *
 * `bucketKey` MUST already be a non-reversible digest. Never pass a raw IP,
 * phone number or e-mail.
 */
export async function consumeRateLimit(
  client: FunnelDbClient,
  args: {
    bucketKey: string;
    limit: number;
    windowMs: number;
    now?: number;
  },
): Promise<RateLimitResult> {
  const now = args.now ?? Date.now();
  const nowIso = new Date(now).toISOString();

  const { data: existing, error: selectError } = await client
    .from("funnel_rate_limits")
    .select("bucket_key, window_start, count")
    .eq("bucket_key", args.bucketKey)
    .maybeSingle();

  if (selectError) {
    console.error("funnel: rate_limit_select_failed", selectError?.message ?? selectError);
    // Fail OPEN on a read error: the in-memory limiter still applies.
    return { allowed: true, count: 0, remaining: args.limit };
  }

  if (!existing) {
    const { error: insertError } = await client.from("funnel_rate_limits").insert({
      bucket_key: args.bucketKey,
      window_start: nowIso,
      count: 1,
      updated_at: nowIso,
    });
    if (insertError && !isUniqueViolation(insertError)) {
      console.error("funnel: rate_limit_insert_failed", insertError?.message ?? insertError);
      return { allowed: true, count: 0, remaining: args.limit };
    }
    // A concurrent insert won the race — fall through to the update path on
    // the next request; this one still counts as 1.
    return {
      allowed: 1 <= args.limit,
      count: 1,
      remaining: Math.max(0, args.limit - 1),
    };
  }

  const windowStartMs = Date.parse(String(existing.window_start));
  const windowExpired =
    !Number.isFinite(windowStartMs) || now - windowStartMs >= args.windowMs;

  if (windowExpired) {
    const { error } = await client
      .from("funnel_rate_limits")
      .update({ window_start: nowIso, count: 1, updated_at: nowIso })
      .eq("bucket_key", args.bucketKey);
    if (error) {
      console.error("funnel: rate_limit_reset_failed", error?.message ?? error);
      return { allowed: true, count: 0, remaining: args.limit };
    }
    return { allowed: 1 <= args.limit, count: 1, remaining: Math.max(0, args.limit - 1) };
  }

  const next = (Number(existing.count) || 0) + 1;
  const { error } = await client
    .from("funnel_rate_limits")
    .update({ count: next, updated_at: nowIso })
    .eq("bucket_key", args.bucketKey);
  if (error) {
    console.error("funnel: rate_limit_update_failed", error?.message ?? error);
    return { allowed: true, count: 0, remaining: args.limit };
  }

  return {
    allowed: next <= args.limit,
    count: next,
    remaining: Math.max(0, args.limit - next),
  };
}

// ---------------------------------------------------------------------------
// In-memory rate limiting (defense in depth, per edge isolate)
// ---------------------------------------------------------------------------

interface RateBucket {
  hits: number[];
}

const buckets = new Map<string, RateBucket>();

/** Drop buckets that have not been touched for a while (keeps memory flat). */
function pruneBuckets(now: number): void {
  for (const [key, bucket] of buckets) {
    const last = bucket.hits[bucket.hits.length - 1];
    if (last !== undefined && now - last > 2 * 60 * 60 * 1000) {
      buckets.delete(key);
    }
  }
}

export interface MemoryRateLimitResult {
  allowed: boolean;
  count: number;
  remaining: number;
}

/**
 * Consume one unit from a named in-memory bucket.
 *
 * In-memory and therefore per-isolate: it is a cheap burst guard, not the
 * authoritative limit. Durable limits are counted in the database.
 */
export function hitRateLimit(
  key: string,
  max: number,
  windowMs: number,
  now: number = Date.now(),
): MemoryRateLimitResult {
  pruneBuckets(now);
  const bucket = buckets.get(key) ?? { hits: [] };
  const cutoff = now - windowMs;
  bucket.hits = bucket.hits.filter((t) => t > cutoff);

  if (bucket.hits.length >= max) {
    buckets.set(key, bucket);
    return { allowed: false, count: bucket.hits.length, remaining: 0 };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);
  return {
    allowed: true,
    count: bucket.hits.length,
    remaining: Math.max(0, max - bucket.hits.length),
  };
}

/** Inspect a bucket without consuming from it. */
export function peekRateLimit(
  key: string,
  windowMs: number,
  now: number = Date.now(),
): number {
  const bucket = buckets.get(key);
  if (!bucket) return 0;
  const cutoff = now - windowMs;
  return bucket.hits.filter((t) => t > cutoff).length;
}

/** Test helper — forget every in-memory bucket. */
export function resetRateLimits(): void {
  buckets.clear();
}
