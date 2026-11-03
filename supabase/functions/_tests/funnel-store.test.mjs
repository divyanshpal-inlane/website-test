// Unit tests for _shared/funnelStore.ts — no DB/network.
//
// The store is exercised against a mock Supabase client that records every
// chained operation, so each test asserts on the exact SQL-ish shape the
// module produces (table, filters, payload) rather than on a live database.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SESSION_ATTRIBUTION_KEYS,
  LEAD_ATTRIBUTION_KEYS,
  UNIQUE_VIOLATION,
  isUniqueViolation,
  cleanText,
  sanitizeAttribution,
  sanitizeSessionAttribution,
  sanitizeLeadAttribution,
  resolveSession,
  linkSessionToLead,
  recordEvent,
  backstitchLeadEvents,
  countSessionEventsSince,
  countSessionCapturesSince,
  findLeadByPhone,
  upsertLead,
  updateLeadProgress,
  consumeRateLimit,
  hitRateLimit,
  peekRateLimit,
  resetRateLimits,
} from "../_shared/funnelStore.ts";

// ── Mock client ─────────────────────────────────────────────────────────────

/**
 * A minimal chainable Supabase-client double.
 *
 * `tableHandlers[table](ops)` receives the recorded operations and returns
 * `{ data, error }` (or `{ count, error }` for a head-only select).
 */
function createMockClient(tableHandlers = {}) {
  const recorded = [];
  const client = {
    from(table) {
      const ops = [];
      const builder = {
        insert: (value) => (ops.push({ op: "insert", value }), builder),
        upsert: (value, options) =>
          (ops.push({ op: "upsert", value, options }), builder),
        update: (value) => (ops.push({ op: "update", value }), builder),
        select: (columns, options) =>
          (ops.push({ op: "select", columns, options }), builder),
        eq: (column, value) => (ops.push({ op: "eq", column, value }), builder),
        neq: (column, value) => (ops.push({ op: "neq", column, value }), builder),
        gte: (column, value) => (ops.push({ op: "gte", column, value }), builder),
        lt: (column, value) => (ops.push({ op: "lt", column, value }), builder),
        is: (column, value) => (ops.push({ op: "is", column, value }), builder),
        not: (column, operator, value) =>
          (ops.push({ op: "not", column, operator, value }), builder),
        in: (column, value) => (ops.push({ op: "in", column, value }), builder),
        order: (column, options) =>
          (ops.push({ op: "order", column, options }), builder),
        limit: (count) => (ops.push({ op: "limit", count }), builder),
        maybeSingle: () => resolve(),
        single: () => resolve(),
        then: (onFulfilled, onRejected) => resolve().then(onFulfilled, onRejected),
      };
      function resolve() {
        const handler = tableHandlers[table];
        const result = handler ? handler(ops) : { data: null, error: null };
        recorded.push({ table, ops });
        return Promise.resolve(result ?? { data: null, error: null });
      }
      return builder;
    },
  };
  return { client, recorded };
}

const SESSION_ROW = {
  id: "session-1",
  client_session_id: "3f333df6-90a4-4fda-8dd3-9485d27cee36",
  lead_id: null,
  created_at: "2026-10-21T10:00:00.000Z",
  last_seen_at: "2026-10-21T10:00:00.000Z",
  first_utm_source: "google",
  first_utm_medium: "cpc",
  first_utm_campaign: null,
  first_referrer_host: "www.google.com",
  first_page_path: "/book",
};

const LEAD_ROW = {
  id: "lead-1",
  phone_normalized: "9876543210",
  status: "new",
  lead_state: "captured",
};

const uniqueError = { code: UNIQUE_VIOLATION, message: "duplicate key value violates unique constraint" };

// ── Small helpers ───────────────────────────────────────────────────────────
test("isUniqueViolation recognises the Postgres unique-violation code", () => {
  assert.ok(isUniqueViolation({ code: "23505" }));
  assert.ok(isUniqueViolation({ message: "duplicate key value violates unique constraint" }));
  assert.ok(!isUniqueViolation({ code: "23503", message: "foreign key violation" }));
  assert.ok(!isUniqueViolation(null));
  assert.ok(!isUniqueViolation("23505"));
});

test("cleanText trims, drops empties and bounds the length", () => {
  assert.equal(cleanText("  hello  "), "hello");
  assert.equal(cleanText(""), undefined);
  assert.equal(cleanText("   "), undefined);
  assert.equal(cleanText(42), undefined);
  assert.equal(cleanText(null), undefined);
  assert.equal(cleanText("abcdef", 3), "abc");
});

test("sanitizeAttribution keeps only the allowlisted keys", () => {
  const allowed = new Set(["utm_source", "utm_medium"]);
  const out = sanitizeAttribution(
    {
      utm_source: "google",
      " UTM_MEDIUM ": "cpc",
      email: "leak@b.com",
      phone: "9000000000",
      utm_term: "t",
    },
    allowed,
  );
  assert.deepEqual(out, { utm_source: "google", utm_medium: "cpc" });
});

test("sanitizeAttribution tolerates junk input", () => {
  const allowed = new Set(["utm_source"]);
  assert.deepEqual(sanitizeAttribution(null, allowed), {});
  assert.deepEqual(sanitizeAttribution("x", allowed), {});
  assert.deepEqual(sanitizeAttribution([1], allowed), {});
});

test("the session + lead attribution allowlists are disjoint and complete", () => {
  assert.deepEqual([...SESSION_ATTRIBUTION_KEYS], [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "referrer_host",
  ]);
  for (const key of SESSION_ATTRIBUTION_KEYS) {
    assert.ok(LEAD_ATTRIBUTION_KEYS.includes(key), `${key} must be a lead key too`);
  }
  assert.ok(LEAD_ATTRIBUTION_KEYS.includes("gclid"));
});

test("sanitizeSessionAttribution / sanitizeLeadAttribution apply their own allowlist", () => {
  assert.deepEqual(
    sanitizeSessionAttribution({ utm_source: "google", gclid: "G1" }),
    { utm_source: "google" },
  );
  assert.deepEqual(
    sanitizeLeadAttribution({ utm_source: "google", gclid: "G1" }),
    { utm_source: "google", gclid: "G1" },
  );
});

// ── resolveSession ──────────────────────────────────────────────────────────
test("resolveSession creates the session row on the first call", async () => {
  const { client, recorded } = createMockClient({
    lead_sessions: () => ({ data: SESSION_ROW, error: null }),
  });
  const result = await resolveSession(client, {
    clientSessionId: SESSION_ROW.client_session_id,
    attribution: { utm_source: "google", utm_medium: "cpc", referrer_host: "www.google.com" },
    pagePath: "/book",
  });
  assert.equal(result.created, true);
  assert.equal(result.session.id, "session-1");
  assert.equal(recorded[0].table, "lead_sessions");
  assert.equal(recorded[0].ops[0].op, "insert");
  assert.equal(recorded[0].ops[0].value.client_session_id, SESSION_ROW.client_session_id);
  assert.equal(recorded[0].ops[0].value.first_utm_source, "google");
  assert.equal(recorded[0].ops[0].value.first_referrer_host, "www.google.com");
  assert.equal(recorded[0].ops[0].value.first_page_path, "/book");
});

test("resolveSession reuses the existing row when the client session is known", async () => {
  const { client, recorded } = createMockClient({
    lead_sessions: (ops) =>
      ops[0].op === "insert"
        ? { data: null, error: uniqueError }
        : { data: SESSION_ROW, error: null },
  });
  const result = await resolveSession(client, {
    clientSessionId: SESSION_ROW.client_session_id,
  });
  assert.equal(result.created, false);
  assert.equal(result.session.id, "session-1");
  assert.equal(recorded[1].ops[0].op, "select");
  assert.deepEqual(recorded[1].ops[1], {
    op: "eq",
    column: "client_session_id",
    value: SESSION_ROW.client_session_id,
  });
});

test("resolveSession throws on a non-unique insert error", async () => {
  const { client } = createMockClient({
    lead_sessions: () => ({ data: null, error: { code: "42501", message: "permission denied" } }),
  });
  await assert.rejects(() => resolveSession(client, { clientSessionId: "abc" }));
});

test("resolveSession throws when the session row cannot be found", async () => {
  const { client } = createMockClient({
    lead_sessions: (ops) =>
      ops[0].op === "insert"
        ? { data: null, error: uniqueError }
        : { data: null, error: null },
  });
  await assert.rejects(
    () => resolveSession(client, { clientSessionId: "abc" }),
    /lead_session_not_found/,
  );
});

// ── linkSessionToLead ───────────────────────────────────────────────────────
test("linkSessionToLead only links a session whose lead_id is still null", async () => {
  const { client, recorded } = createMockClient({
    lead_sessions: () => ({ data: null, error: null }),
  });
  const ok = await linkSessionToLead(client, "session-1", "lead-1");
  assert.equal(ok, true);
  const ops = recorded[0].ops;
  assert.equal(ops[0].op, "update");
  assert.equal(ops[0].value.lead_id, "lead-1");
  assert.deepEqual(ops[1], { op: "eq", column: "id", value: "session-1" });
  assert.deepEqual(ops[2], { op: "is", column: "lead_id", value: null });
});

test("linkSessionToLead never throws on a write failure", async () => {
  const { client } = createMockClient({
    lead_sessions: () => ({ data: null, error: { code: "42501", message: "permission denied" } }),
  });
  assert.equal(await linkSessionToLead(client, "session-1", "lead-1"), false);
});

// ── recordEvent ─────────────────────────────────────────────────────────────
test("recordEvent writes the full event payload", async () => {
  const { client, recorded } = createMockClient({
    lead_events: () => ({ data: { id: "event-1" }, error: null }),
  });
  const result = await recordEvent(client, {
    sessionId: "session-1",
    leadId: null,
    eventName: "home_viewed",
    occurredAt: "2026-10-21T10:00:00.000Z",
    pagePath: "/book",
    properties: { page_type: "booking_flow" },
    correlationId: "corr-1",
    clientEventId: "c:abc",
    utmSource: "google",
    utmMedium: "cpc",
    utmCampaign: "brands",
    deviceType: "mobile",
  });
  assert.equal(result.inserted, true);
  assert.equal(result.eventId, "event-1");
  const payload = recorded[0].ops[0].value;
  assert.equal(payload.session_id, "session-1");
  assert.equal(payload.lead_id, null);
  assert.equal(payload.event_name, "home_viewed");
  assert.equal(payload.occurred_at, "2026-10-21T10:00:00.000Z");
  assert.equal(payload.page_path, "/book");
  assert.deepEqual(payload.properties, { page_type: "booking_flow" });
  assert.equal(payload.correlation_id, "corr-1");
  assert.equal(payload.client_event_id, "c:abc");
  assert.equal(payload.utm_source, "google");
  assert.equal(payload.device_type, "mobile");
});

test("recordEvent defaults occurred_at to now and the attribution to null", async () => {
  const { client, recorded } = createMockClient({
    lead_events: () => ({ data: { id: "event-1" }, error: null }),
  });
  await recordEvent(client, {
    sessionId: "session-1",
    leadId: null,
    eventName: "home_viewed",
    pagePath: null,
    properties: {},
    correlationId: null,
    clientEventId: "c:abc",
  });
  const payload = recorded[0].ops[0].value;
  assert.ok(Date.parse(payload.occurred_at) > 0);
  assert.equal(payload.utm_source, null);
  assert.equal(payload.device_type, null);
});

test("recordEvent treats a unique violation as a duplicate, not an error", async () => {
  const { client } = createMockClient({
    lead_events: () => ({ data: null, error: uniqueError }),
  });
  const result = await recordEvent(client, {
    sessionId: "session-1",
    leadId: null,
    eventName: "home_viewed",
    pagePath: null,
    properties: {},
    correlationId: null,
    clientEventId: "c:abc",
  });
  assert.deepEqual(result, { inserted: false, eventId: null });
});

test("recordEvent re-throws a genuine write error", async () => {
  const { client } = createMockClient({
    lead_events: () => ({ data: null, error: { code: "42501", message: "permission denied" } }),
  });
  await assert.rejects(() =>
    recordEvent(client, {
      sessionId: "session-1",
      leadId: null,
      eventName: "home_viewed",
      pagePath: null,
      properties: {},
      correlationId: null,
      clientEventId: "c:abc",
    }),
  );
});

// ── backstitchLeadEvents ────────────────────────────────────────────────────
test("backstitchLeadEvents only re-points the events without a lead", async () => {
  const { client, recorded } = createMockClient({
    lead_events: () => ({ data: [{ id: "e1" }, { id: "e2" }], error: null }),
  });
  const count = await backstitchLeadEvents(client, "session-1", "lead-1");
  assert.equal(count, 2);
  const ops = recorded[0].ops;
  assert.equal(ops[0].op, "update");
  assert.deepEqual(ops[0].value, { lead_id: "lead-1" });
  assert.deepEqual(ops[1], { op: "eq", column: "session_id", value: "session-1" });
  assert.deepEqual(ops[2], { op: "is", column: "lead_id", value: null });
});

test("backstitchLeadEvents swallows a write error and reports 0", async () => {
  const { client } = createMockClient({
    lead_events: () => ({ data: null, error: { code: "42501", message: "permission denied" } }),
  });
  assert.equal(await backstitchLeadEvents(client, "session-1", "lead-1"), 0);
});

// ── counters ────────────────────────────────────────────────────────────────
test("countSessionEventsSince counts the events of one session since a timestamp", async () => {
  const { client, recorded } = createMockClient({
    lead_events: () => ({ count: 7, error: null }),
  });
  const count = await countSessionEventsSince(client, "session-1", "2026-10-21T10:00:00.000Z");
  assert.equal(count, 7);
  const ops = recorded[0].ops;
  assert.deepEqual(ops[0], {
    op: "select",
    columns: "id",
    options: { count: "exact", head: true },
  });
  assert.deepEqual(ops[1], { op: "eq", column: "session_id", value: "session-1" });
  assert.deepEqual(ops[2], {
    op: "gte",
    column: "occurred_at",
    value: "2026-10-21T10:00:00.000Z",
  });
});

test("countSessionCapturesSince additionally filters on lead_captured", async () => {
  const { client, recorded } = createMockClient({
    lead_events: () => ({ count: 1, error: null }),
  });
  assert.equal(
    await countSessionCapturesSince(client, "session-1", "2026-10-21T10:00:00.000Z"),
    1,
  );
  const ops = recorded[0].ops;
  assert.deepEqual(ops[2], { op: "eq", column: "event_name", value: "lead_captured" });
});

test("the counters return 0 on a query error", async () => {
  const { client } = createMockClient({
    lead_events: () => ({ count: null, error: { code: "42501", message: "denied" } }),
  });
  assert.equal(await countSessionEventsSince(client, "s", "2026-10-21T10:00:00.000Z"), 0);
  assert.equal(await countSessionCapturesSince(client, "s", "2026-10-21T10:00:00.000Z"), 0);
});

// ── lead writes ─────────────────────────────────────────────────────────────
test("findLeadByPhone returns the lead row for the dedupe key", async () => {
  const { client, recorded } = createMockClient({
    funnel_leads: () => ({ data: LEAD_ROW, error: null }),
  });
  const lead = await findLeadByPhone(client, "9876543210");
  assert.equal(lead.id, "lead-1");
  assert.deepEqual(recorded[0].ops[1], {
    op: "eq",
    column: "phone_normalized",
    value: "9876543210",
  });
});

test("findLeadByPhone returns null when the lead is unknown", async () => {
  const { client } = createMockClient({
    funnel_leads: () => ({ data: null, error: null }),
  });
  assert.equal(await findLeadByPhone(client, "9876543210"), null);
});

test("findLeadByPhone returns null on a query error", async () => {
  const { client } = createMockClient({
    funnel_leads: () => ({ data: null, error: { code: "42501", message: "denied" } }),
  });
  assert.equal(await findLeadByPhone(client, "9876543210"), null);
});

test("upsertLead upserts on the phone dedupe key and never resets the lifecycle", async () => {
  const { client, recorded } = createMockClient({
    funnel_leads: () => ({ data: LEAD_ROW, error: null }),
  });
  await upsertLead(client, {
    phoneNormalized: "9876543210",
    name: "Ramu",
    email: "a@b.com",
    phone: "919876543210",
    locality: "Bengaluru",
    area: "HSR Layout",
    source: "booking_flow",
    serviceInterest: "Driving Masterclass",
    leadSource: "Website-Direct",
    sessionId: "session-1",
    attribution: { utm_source: "google", utm_medium: "cpc", gclid: "G1" },
    firstTouch: { utm_source: "facebook", utm_medium: "organic" },
    leadState: "captured",
    marketingConsent: true,
  });
  const ops = recorded[0].ops;
  assert.equal(ops[0].op, "upsert");
  assert.deepEqual(ops[0].options, { onConflict: "phone_normalized" });
  const payload = ops[0].value;
  assert.equal(payload.phone_normalized, "9876543210");
  assert.equal(payload.utm_source, "google");
  assert.equal(payload.gclid, "G1");
  assert.equal(payload.first_utm_source, "facebook");
  assert.equal(payload.lead_state, "captured");
  assert.equal(payload.marketing_consent, true);
  // A repeat capture must not reset the lifecycle of an already-worked lead.
  assert.equal("status" in payload, false);
  assert.equal("created_at" in payload, false);
});

test("upsertLead omits lead_state / marketing_consent when they are not supplied", async () => {
  const { client, recorded } = createMockClient({
    funnel_leads: () => ({ data: LEAD_ROW, error: null }),
  });
  await upsertLead(client, {
    phoneNormalized: "9876543210",
    name: null,
    email: null,
    phone: null,
    locality: null,
    area: null,
    source: null,
    serviceInterest: null,
    leadSource: null,
    sessionId: null,
    attribution: {},
    firstTouch: {},
  });
  const payload = recorded[0].ops[0].value;
  assert.equal("lead_state" in payload, false);
  assert.equal("marketing_consent" in payload, false);
  assert.equal(payload.utm_source, null);
});

test("updateLeadProgress writes only the fields that changed", async () => {
  const { client, recorded } = createMockClient({
    funnel_leads: () => ({ data: null, error: null }),
  });
  await updateLeadProgress(client, "lead-1", {
    leadState: "slot_engaged",
    priorityTier: "P1",
    dlStatus: null,
    cratioSyncStatus: "failed",
  });
  const payload = recorded[0].ops[0].value;
  assert.equal(payload.lead_state, "slot_engaged");
  assert.equal(payload.priority_tier, "P1");
  assert.equal(payload.cratio_sync_status, "failed");
  assert.equal("dl_status" in payload, false);
  assert.ok(Date.parse(payload.updated_at) > 0);
  assert.ok(Date.parse(payload.last_activity_at) > 0);
});

test("updateLeadProgress never throws on a write error", async () => {
  const { client } = createMockClient({
    funnel_leads: () => ({ data: null, error: { code: "42501", message: "denied" } }),
  });
  await updateLeadProgress(client, "lead-1", { leadState: "captured" });
});

// ── Durable rate limiting ───────────────────────────────────────────────────
test("consumeRateLimit creates a bucket on the first hit", async () => {
  const { client, recorded } = createMockClient({
    funnel_rate_limits: (ops) =>
      ops[0].op === "select" ? { data: null, error: null } : { data: null, error: null },
  });
  const result = await consumeRateLimit(client, {
    bucketKey: "ip:abc",
    limit: 5,
    windowMs: 600000,
    now: 1_800_000_000_000,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.count, 1);
  assert.equal(result.remaining, 4);
  assert.equal(recorded[0].ops[0].op, "select");
  assert.equal(recorded[1].ops[0].op, "insert");
  assert.equal(recorded[1].ops[0].value.bucket_key, "ip:abc");
  assert.equal(recorded[1].ops[0].value.count, 1);
});

test("consumeRateLimit increments an existing bucket and denies past the limit", async () => {
  const now = 1_800_000_000_000;
  const state = { count: 2 };
  const { client } = createMockClient({
    funnel_rate_limits: (ops) => {
      if (ops[0].op === "select") {
        return {
          data: {
            bucket_key: "ip:abc",
            window_start: new Date(now - 1000).toISOString(),
            count: state.count,
          },
          error: null,
        };
      }
      if (ops[0].op === "update") state.count = ops[0].value.count;
      return { data: null, error: null };
    },
  });
  const third = await consumeRateLimit(client, { bucketKey: "ip:abc", limit: 3, windowMs: 600000, now });
  assert.equal(third.allowed, true);
  assert.equal(third.count, 3);
  assert.equal(third.remaining, 0);
  const fourth = await consumeRateLimit(client, { bucketKey: "ip:abc", limit: 3, windowMs: 600000, now });
  assert.equal(fourth.allowed, false);
  assert.equal(fourth.count, 4);
  assert.equal(fourth.remaining, 0);
});

test("consumeRateLimit resets an expired window", async () => {
  const now = 1_800_000_000_000;
  const { client, recorded } = createMockClient({
    funnel_rate_limits: (ops) => {
      if (ops[0].op === "select") {
        return {
          data: {
            bucket_key: "ip:abc",
            window_start: new Date(now - 700000).toISOString(),
            count: 99,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
  });
  const result = await consumeRateLimit(client, { bucketKey: "ip:abc", limit: 5, windowMs: 600000, now });
  assert.equal(result.allowed, true);
  assert.equal(result.count, 1);
  assert.equal(recorded[1].ops[0].op, "update");
  assert.equal(recorded[1].ops[0].value.count, 1);
});

test("consumeRateLimit fails OPEN on a read error", async () => {
  const { client } = createMockClient({
    funnel_rate_limits: () => ({ data: null, error: { code: "42501", message: "denied" } }),
  });
  const result = await consumeRateLimit(client, { bucketKey: "ip:abc", limit: 1, windowMs: 600000 });
  assert.equal(result.allowed, true);
});

// ── In-memory rate limiting ─────────────────────────────────────────────────
test("hitRateLimit allows up to the max and then denies", () => {
  resetRateLimits();
  const now = 1_800_000_000_000;
  assert.equal(hitRateLimit("k", 3, 600000, now).allowed, true);
  assert.equal(hitRateLimit("k", 3, 600000, now).allowed, true);
  assert.equal(hitRateLimit("k", 3, 600000, now).allowed, true);
  const denied = hitRateLimit("k", 3, 600000, now);
  assert.equal(denied.allowed, false);
  assert.equal(denied.remaining, 0);
});

test("hitRateLimit slides its window", () => {
  resetRateLimits();
  const now = 1_800_000_000_000;
  hitRateLimit("k", 2, 1000, now);
  hitRateLimit("k", 2, 1000, now);
  assert.equal(hitRateLimit("k", 2, 1000, now).allowed, false);
  // 2 seconds later the old hits have expired.
  assert.equal(hitRateLimit("k", 2, 1000, now + 2000).allowed, true);
});

test("peekRateLimit does not consume from the bucket", () => {
  resetRateLimits();
  const now = 1_800_000_000_000;
  hitRateLimit("k", 5, 600000, now);
  assert.equal(peekRateLimit("k", 600000, now), 1);
  assert.equal(peekRateLimit("k", 600000, now), 1);
  assert.equal(peekRateLimit("unknown", 600000, now), 0);
});

test("resetRateLimits clears every bucket", () => {
  resetRateLimits();
  const now = 1_800_000_000_000;
  hitRateLimit("k", 1, 600000, now);
  assert.equal(peekRateLimit("k", 600000, now), 1);
  resetRateLimits();
  assert.equal(peekRateLimit("k", 600000, now), 0);
});
