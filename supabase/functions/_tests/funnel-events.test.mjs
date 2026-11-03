// Unit tests for _shared/funnelEvents.ts — no DB/network.
//
// The orchestration layer owns the trust boundary (a browser may report a
// client-allowed event but never a lead id / state / tier) and the "never
// break the caller" rule. It is exercised against a mock Supabase client.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sha256Hex,
  ipBucketKey,
  phoneBucketKey,
  sessionBucketKey,
  deriveHashedClientEventId,
  deriveCoordinateClientEventId,
  extractClientIp,
  readAttribution,
  emitFunnelEvent,
  emitServerEvent,
  syncLeadProgress,
  deriveLeadSignals,
  handleClientEvent,
  captureLead,
} from "../_shared/funnelEvents.ts";
import { SCHEMA_VERSION } from "../_shared/funnelTaxonomy.ts";
import { resetRateLimits } from "../_shared/funnelStore.ts";

// ── Mock client ─────────────────────────────────────────────────────────────

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

/** Rows recorded on one table, in order. */
function rowsFor(recorded, table) {
  return recorded.filter((r) => r.table === table).map((r) => r.ops[0]);
}

const SESSION_ROW = {
  id: "session-1",
  client_session_id: "3f333df6-90a4-4fda-8dd3-9485d27cee36",
  lead_id: null,
  created_at: "2026-10-21T10:00:00.000Z",
  last_seen_at: "2026-10-21T10:00:00.000Z",
  first_utm_source: null,
  first_utm_medium: null,
  first_utm_campaign: null,
  first_referrer_host: null,
  first_page_path: null,
};

const LEAD_ROW = {
  id: "lead-1",
  phone_normalized: "9876543210",
  lead_state: "new",
  priority_tier: null,
};

const uniqueError = { code: "23505", message: "duplicate key value violates unique constraint" };

// ── Hashing ─────────────────────────────────────────────────────────────────
test("sha256Hex is a stable 64-char hex digest", async () => {
  const digest = await sha256Hex("hello");
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal(digest, await sha256Hex("hello"));
  assert.notEqual(digest, await sha256Hex("hello2"));
});

test("the rate-limit bucket keys are digests, never the raw value", async () => {
  const ip = await ipBucketKey("203.0.113.9");
  const phone = await phoneBucketKey("9876543210");
  const session = await sessionBucketKey("3f333df6-90a4-4fda-8dd3-9485d27cee36");
  assert.ok(ip.startsWith("ip:"));
  assert.ok(phone.startsWith("phone:"));
  assert.ok(session.startsWith("session:"));
  assert.ok(!ip.includes("203.0.113.9"));
  assert.ok(!phone.includes("9876543210"));
  assert.ok(!session.includes("3f333df6"));
});

// ── Idempotency keys ────────────────────────────────────────────────────────
test("deriveHashedClientEventId is deterministic and hides the raw parts", async () => {
  const a = await deriveHashedClientEventId("slot", "course-1", "2026-10-21", "06:00");
  const b = await deriveHashedClientEventId("slot", "course-1", "2026-10-21", "06:00");
  const c = await deriveHashedClientEventId("slot", "course-1", "2026-10-21", "07:00");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.ok(a.startsWith("slot:"));
  assert.ok(!a.includes("course-1"));
  assert.ok(!a.includes("2026-10-21"));
});

test("deriveHashedClientEventId tolerates null / undefined parts", async () => {
  const a = await deriveHashedClientEventId("x", null, undefined, 1);
  const b = await deriveHashedClientEventId("x", "", "", "1");
  assert.equal(a, b);
});

test("deriveCoordinateClientEventId rounds to 4 decimals and never leaks the point", async () => {
  const a = await deriveCoordinateClientEventId("loc", 12.97161, 77.59461);
  const b = await deriveCoordinateClientEventId("loc", 12.97161234, 77.59461456);
  const c = await deriveCoordinateClientEventId("loc", 12.9, 77.6);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.ok(!a.includes("12.97"));
});

test("deriveCoordinateClientEventId handles negative / zero coordinates", async () => {
  const a = await deriveCoordinateClientEventId("loc", 0, 0);
  const b = await deriveCoordinateClientEventId("loc", -33.8688, 151.2093);
  assert.ok(a.startsWith("loc:"));
  assert.notEqual(a, b);
});

// ── Request helpers ─────────────────────────────────────────────────────────
test("extractClientIp prefers cf-connecting-ip, then x-real-ip, then x-forwarded-for", () => {
  const headers = (map) => ({ get: (name) => map[name] ?? null });
  assert.equal(
    extractClientIp({
      headers: headers({
        "cf-connecting-ip": "1.1.1.1",
        "x-real-ip": "2.2.2.2",
        "x-forwarded-for": "3.3.3.3, 4.4.4.4",
      }),
    }),
    "1.1.1.1",
  );
  assert.equal(
    extractClientIp({ headers: headers({ "x-real-ip": "2.2.2.2", "x-forwarded-for": "3.3.3.3" }) }),
    "2.2.2.2",
  );
  assert.equal(
    extractClientIp({ headers: headers({ "x-forwarded-for": "3.3.3.3, 4.4.4.4" }) }),
    "3.3.3.3",
  );
  assert.equal(extractClientIp({ headers: headers({}) }), null);
});

test("readAttribution keeps only the allowlisted attribution keys", () => {
  const out = readAttribution({
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "x",
    utm_term: "t",
    utm_content: "c",
    gclid: "G1",
    referrer_host: "www.google.com",
    email: "leak@b.com",
    phone: "9000000000",
  });
  assert.deepEqual(Object.keys(out).sort(), [
    "gclid",
    "referrer_host",
    "utm_campaign",
    "utm_content",
    "utm_medium",
    "utm_source",
    "utm_term",
  ]);
});

test("readAttribution drops non-strings, empties and over-long values", () => {
  const out = readAttribution({
    utm_source: "  google  ",
    utm_medium: 42,
    utm_campaign: "   ",
    gclid: "x".repeat(201),
  });
  assert.deepEqual(out, { utm_source: "google" });
});

test("readAttribution tolerates junk input", () => {
  assert.deepEqual(readAttribution(null), {});
  assert.deepEqual(readAttribution("x"), {});
  assert.deepEqual(readAttribution([1]), {});
});

// ── emitFunnelEvent ─────────────────────────────────────────────────────────
test("emitFunnelEvent sanitises the properties before writing", async () => {
  const { client, recorded } = createMockClient({
    lead_events: () => ({ data: { id: "event-1" }, error: null }),
  });
  const result = await emitFunnelEvent(client, {
    eventName: "home_viewed",
    sessionId: "session-1",
    clientEventId: "c:abc",
    pagePath: "/book?email=a@b.com",
    properties: { page_type: "booking_flow", email: "leak@b.com", nope: "x" },
  });
  assert.deepEqual(result, { recorded: true, duplicate: false });
  const payload = rowsFor(recorded, "lead_events")[0].value;
  // `schema_version` and `surface` are injected server-side AFTER the
  // allowlist/PII filter — they are never client-supplied.
  assert.deepEqual(payload.properties, {
    page_type: "booking_flow",
    schema_version: SCHEMA_VERSION,
    surface: "booking_flow",
  });
  assert.equal(payload.page_path, "/book");
});

test("emitFunnelEvent drops a non-uuid correlation id", async () => {
  const { client, recorded } = createMockClient({
    lead_events: () => ({ data: { id: "event-1" }, error: null }),
  });
  await emitFunnelEvent(client, {
    eventName: "home_viewed",
    sessionId: "session-1",
    clientEventId: "c:abc",
    correlationId: "not-a-uuid",
  });
  assert.equal(rowsFor(recorded, "lead_events")[0].value.correlation_id, null);
});

test("emitFunnelEvent reports a duplicate instead of failing", async () => {
  const { client } = createMockClient({
    lead_events: () => ({ data: null, error: uniqueError }),
  });
  const result = await emitFunnelEvent(client, {
    eventName: "home_viewed",
    sessionId: "session-1",
    clientEventId: "c:abc",
  });
  assert.deepEqual(result, { recorded: false, duplicate: true });
});

test("emitFunnelEvent NEVER throws", async () => {
  const { client } = createMockClient({
    lead_events: () => ({ data: null, error: { code: "42501", message: "denied" } }),
  });
  const result = await emitFunnelEvent(client, {
    eventName: "home_viewed",
    sessionId: "session-1",
    clientEventId: "c:abc",
  });
  assert.equal(result.recorded, false);
  assert.ok(result.error);
});

// ── emitServerEvent ─────────────────────────────────────────────────────────
test("emitServerEvent stitches the event into the browser session", async () => {
  const { client, recorded } = createMockClient({
    lead_sessions: () => ({ data: SESSION_ROW, error: null }),
    lead_events: () => ({ data: { id: "event-1" }, error: null }),
  });
  const result = await emitServerEvent(client, {
    eventName: "location_entered",
    clientSessionId: SESSION_ROW.client_session_id,
    clientEventId: "loc:abc",
    properties: { area_id: "a1", serviceable: true },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
  });
  assert.equal(result.recorded, true);
  const sessionInsert = rowsFor(recorded, "lead_sessions")[0].value;
  assert.equal(sessionInsert.client_session_id, SESSION_ROW.client_session_id);
  // A brand-new session writes its own lifecycle row first; select the
  // stitched event explicitly instead of relying on insert ordering.
  const eventPayload = rowsFor(recorded, "lead_events").find(
    (r) => r.op === "insert" && r.value.event_name === "location_entered",
  ).value;
  assert.equal(eventPayload.session_id, "session-1");
  assert.equal(eventPayload.device_type, "mobile");
});

test("emitServerEvent creates a synthetic session when the caller has none", async () => {
  const { client, recorded } = createMockClient({
    lead_sessions: () => ({ data: SESSION_ROW, error: null }),
    lead_events: () => ({ data: { id: "event-1" }, error: null }),
  });
  await emitServerEvent(client, {
    eventName: "location_entered",
    clientEventId: "loc:abc",
  });
  const sessionInsert = rowsFor(recorded, "lead_sessions")[0].value;
  assert.match(
    sessionInsert.client_session_id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  );
});

test("emitServerEvent emits exactly one session-start lifecycle row for a new session", async () => {
  const { client, recorded } = createMockClient({
    lead_sessions: () => ({ data: SESSION_ROW, error: null }),
    lead_events: () => ({ data: { id: "event-1" }, error: null }),
  });
  await emitServerEvent(client, {
    eventName: "location_entered",
    clientSessionId: SESSION_ROW.client_session_id,
    clientEventId: "loc:abc",
  });
  const starts = rowsFor(recorded, "lead_events").filter(
    (r) => r.op === "insert" && r.value.event_name === "funnel_session_started",
  );
  assert.equal(starts.length, 1);
  assert.equal(starts[0].value.session_id, "session-1");
  assert.equal(starts[0].value.lead_id, null);
});

test("emitServerEvent skips the session-start row when the session already exists", async () => {
  const { client, recorded } = createMockClient({
    // The insert loses the unique race, so resolveSession falls back to the
    // existing row and reports created:false.
    lead_sessions: (ops) =>
      ops[0].op === "insert"
        ? { data: null, error: uniqueError }
        : { data: SESSION_ROW, error: null },
    lead_events: () => ({ data: { id: "event-1" }, error: null }),
  });
  await emitServerEvent(client, {
    eventName: "location_entered",
    clientSessionId: SESSION_ROW.client_session_id,
    clientEventId: "loc:abc",
  });
  const starts = rowsFor(recorded, "lead_events").filter(
    (r) => r.op === "insert" && r.value.event_name === "funnel_session_started",
  );
  assert.equal(starts.length, 0);
});

test("a session created by a server emit backfills first_page_path on the next page-aware event", async () => {
  const { client, recorded } = createMockClient({
    lead_sessions: (ops) =>
      ops[0].op === "insert"
        ? { data: null, error: uniqueError }
        : { data: SESSION_ROW, error: null },
    lead_events: () => ({ data: { id: "event-1" }, error: null }),
  });
  await emitServerEvent(client, {
    eventName: "slots_viewed",
    clientSessionId: SESSION_ROW.client_session_id,
    clientEventId: "slots:abc",
    pagePath: "/book/schedule",
  });
  const touch = rowsFor(recorded, "lead_sessions").find((r) => r.op === "update").value;
  assert.equal(touch.first_page_path, "/book/schedule");
  assert.ok(touch.last_seen_at);
});

test("an existing first_page_path is never overwritten", async () => {
  const { client, recorded } = createMockClient({
    lead_sessions: (ops) =>
      ops[0].op === "insert"
        ? { data: null, error: uniqueError }
        : { data: { ...SESSION_ROW, first_page_path: "/" }, error: null },
    lead_events: () => ({ data: { id: "event-1" }, error: null }),
  });
  await emitServerEvent(client, {
    eventName: "slots_viewed",
    clientSessionId: SESSION_ROW.client_session_id,
    clientEventId: "slots:abc",
    pagePath: "/book/schedule",
  });
  const touch = rowsFor(recorded, "lead_sessions").find((r) => r.op === "update").value;
  assert.equal("first_page_path" in touch, false);
});

test("emitServerEvent falls back to the session's lead link", async () => {
  const { client, recorded } = createMockClient({
    lead_sessions: () => ({ data: { ...SESSION_ROW, lead_id: "lead-9" }, error: null }),
    lead_events: () => ({ data: { id: "event-1" }, error: null }),
  });
  await emitServerEvent(client, {
    eventName: "slot_selected",
    clientSessionId: SESSION_ROW.client_session_id,
    clientEventId: "slot:abc",
  });
  const slotEvent = rowsFor(recorded, "lead_events").find(
    (r) => r.op === "insert" && r.value.event_name === "slot_selected",
  ).value;
  assert.equal(slotEvent.lead_id, "lead-9");
});

test("emitServerEvent NEVER throws", async () => {
  const { client } = createMockClient({
    lead_sessions: () => ({ data: null, error: { code: "42501", message: "denied" } }),
  });
  const result = await emitServerEvent(client, {
    eventName: "location_entered",
    clientSessionId: SESSION_ROW.client_session_id,
    clientEventId: "loc:abc",
  });
  assert.equal(result.recorded, false);
  assert.ok(result.error);
});

// ── deriveLeadSignals ───────────────────────────────────────────────────────
test("deriveLeadSignals maps the recorded events onto the tier signals", async () => {
  const { client } = createMockClient({
    lead_events: () => ({
      data: [
        {
          event_name: "lead_captured",
          properties: { dl_status: "has_dl" },
        },
        { event_name: "course_list_viewed", properties: {} },
        { event_name: "plan_page_viewed", properties: {} },
        { event_name: "slot_selected", properties: {} },
      ],
      error: null,
    }),
  });
  const signals = await deriveLeadSignals(client, "lead-1");
  assert.equal(signals.captured, true);
  assert.equal(signals.pricesViewed, true);
  assert.equal(signals.planReached, true);
  assert.equal(signals.slotSelected, true);
  assert.equal(signals.paymentAttempted, false);
  assert.equal(signals.dlStatus, "has_dl");
});

test("deriveLeadSignals treats a successful payment as attempted + succeeded", async () => {
  const { client } = createMockClient({
    lead_events: () => ({
      data: [
        { event_name: "payment_initiated", properties: {} },
        { event_name: "payment_success", properties: {} },
      ],
      error: null,
    }),
  });
  const signals = await deriveLeadSignals(client, "lead-1");
  assert.equal(signals.paymentAttempted, true);
  assert.equal(signals.paymentSucceeded, true);
});

test("deriveLeadSignals detects an out-of-area lead", async () => {
  const { client } = createMockClient({
    lead_events: () => ({
      data: [
        { event_name: "location_entered", properties: { blocked_reason: "out_of_area" } },
      ],
      error: null,
    }),
  });
  const signals = await deriveLeadSignals(client, "lead-1");
  assert.equal(signals.outOfArea, true);
});

test("deriveLeadSignals returns all-false signals when the lead has no events", async () => {
  const { client } = createMockClient({
    lead_events: () => ({ data: [], error: null }),
  });
  const signals = await deriveLeadSignals(client, "lead-1");
  assert.equal(signals.captured, false);
  assert.equal(signals.pricesViewed, false);
  assert.equal(signals.outOfArea, false);
});

// ── syncLeadProgress ────────────────────────────────────────────────────────
test("syncLeadProgress advances the state and the tier", async () => {
  const { client, recorded } = createMockClient({
    funnel_leads: (ops) =>
      ops[0].op === "select"
        ? { data: { lead_state: "captured", priority_tier: null }, error: null }
        : { data: null, error: null },
    lead_events: () => ({
      data: [
        { event_name: "lead_captured", properties: {} },
        { event_name: "course_list_viewed", properties: {} },
      ],
      error: null,
    }),
  });
  const outcome = await syncLeadProgress(client, "lead-1", "slot_selected", {});
  assert.equal(outcome.leadState, "slot_engaged");
  assert.equal(outcome.priorityTier, "P2");
  const update = rowsFor(recorded, "funnel_leads").find((r) => r.op === "update");
  assert.equal(update.value.lead_state, "slot_engaged");
  assert.equal(update.value.priority_tier, "P2");
});

test("syncLeadProgress never moves a lead DOWN a tier", async () => {
  const { client, recorded } = createMockClient({
    funnel_leads: (ops) =>
      ops[0].op === "select"
        ? { data: { lead_state: "captured", priority_tier: "P1" }, error: null }
        : { data: null, error: null },
    lead_events: () => ({
      data: [{ event_name: "lead_captured", properties: {} }],
      error: null,
    }),
  });
  const outcome = await syncLeadProgress(client, "lead-1", "home_viewed", {});
  assert.equal(outcome.priorityTier, null);
  const update = rowsFor(recorded, "funnel_leads").find((r) => r.op === "update");
  assert.equal(update, undefined);
});

test("syncLeadProgress NEVER throws", async () => {
  const { client } = createMockClient({
    funnel_leads: () => ({ data: null, error: { code: "42501", message: "denied" } }),
  });
  const outcome = await syncLeadProgress(client, "lead-1", "slot_selected", {});
  assert.equal(outcome.leadState, null);
});

// ── handleClientEvent ───────────────────────────────────────────────────────
const clientOpts = {
  sessionLimit: 60,
  sessionWindowMs: 600000,
  ipLimit: 300,
  ipWindowMs: 600000,
  durableIpLimit: 300,
  durableIpWindowMs: 600000,
  clientIp: null,
};

test("handleClientEvent rejects an unknown event name", async () => {
  resetRateLimits();
  const { client } = createMockClient({});
  const outcome = await handleClientEvent(client, {
    eventName: "totally_made_up",
    clientSessionId: SESSION_ROW.client_session_id,
    clientEventId: "c:abc",
  }, clientOpts);
  assert.equal(outcome.status, 422);
  assert.equal(outcome.body.error.code, "invalid_event");
});

test("handleClientEvent rejects a server-only event with 403", async () => {
  resetRateLimits();
  const { client } = createMockClient({});
  const outcome = await handleClientEvent(client, {
    eventName: "lead_captured",
    clientSessionId: SESSION_ROW.client_session_id,
    clientEventId: "c:abc",
  }, clientOpts);
  assert.equal(outcome.status, 403);
  assert.equal(outcome.body.error.code, "server_only_event");
});

test("handleClientEvent rejects a non-uuid session id", async () => {
  resetRateLimits();
  const { client } = createMockClient({});
  const outcome = await handleClientEvent(client, {
    eventName: "home_viewed",
    clientSessionId: "not-a-uuid",
    clientEventId: "c:abc",
  }, clientOpts);
  assert.equal(outcome.status, 422);
  assert.equal(outcome.body.error.code, "invalid_session");
});

test("handleClientEvent rejects an unusable client event id", async () => {
  resetRateLimits();
  const { client } = createMockClient({});
  const outcome = await handleClientEvent(client, {
    eventName: "home_viewed",
    clientSessionId: SESSION_ROW.client_session_id,
    clientEventId: "   ",
  }, clientOpts);
  assert.equal(outcome.status, 422);
  assert.equal(outcome.body.error.code, "invalid_client_event_id");
});

test("handleClientEvent records a client event", async () => {
  resetRateLimits();
  const { client, recorded } = createMockClient({
    lead_sessions: () => ({ data: SESSION_ROW, error: null }),
    lead_events: () => ({ data: { id: "event-1" }, error: null }),
  });
  const outcome = await handleClientEvent(client, {
    eventName: "course_selected",
    clientSessionId: SESSION_ROW.client_session_id,
    clientEventId: "c:abc",
    properties: { course_id: "12" },
    pagePath: "/book",
  }, clientOpts);
  assert.equal(outcome.status, 200);
  assert.equal(outcome.body.ok, true);
  assert.equal(outcome.body.recorded, true);
  // A brand-new session first writes its own lifecycle row, so target the
  // client's event explicitly rather than assuming ordering.
  const payload = rowsFor(recorded, "lead_events").find(
    (r) => r.op === "insert" && r.value.event_name === "course_selected",
  ).value;
  assert.equal(payload.event_name, "course_selected");
  assert.equal(payload.session_id, "session-1");
});

test("handleClientEvent NEVER trusts a client-supplied lead id", async () => {
  resetRateLimits();
  const { client, recorded } = createMockClient({
    lead_sessions: () => ({ data: { ...SESSION_ROW, lead_id: "lead-real" }, error: null }),
    lead_events: () => ({ data: { id: "event-1" }, error: null }),
    funnel_leads: (ops) =>
      ops[0].op === "select"
        ? { data: { lead_state: "captured", priority_tier: null }, error: null }
        : { data: null, error: null },
  });
  await handleClientEvent(client, {
    eventName: "course_selected",
    clientSessionId: SESSION_ROW.client_session_id,
    clientEventId: "c:abc",
    properties: { lead_id: "lead-forged" },
  }, clientOpts);
  const payload = rowsFor(recorded, "lead_events").find(
    (r) => r.op === "insert" && r.value.event_name === "course_selected",
  ).value;
  assert.equal(payload.lead_id, "lead-real");
  assert.equal("lead_id" in payload.properties, false);
});

test("handleClientEvent rate-limits a chatty session", async () => {
  resetRateLimits();
  const { client } = createMockClient({
    lead_sessions: () => ({ data: SESSION_ROW, error: null }),
    lead_events: () => ({ data: { id: "event-1" }, error: null }),
  });
  const opts = { ...clientOpts, sessionLimit: 2 };
  await handleClientEvent(client, {
    eventName: "home_viewed",
    clientSessionId: SESSION_ROW.client_session_id,
    clientEventId: "c:1",
  }, opts);
  await handleClientEvent(client, {
    eventName: "home_viewed",
    clientSessionId: SESSION_ROW.client_session_id,
    clientEventId: "c:2",
  }, opts);
  const third = await handleClientEvent(client, {
    eventName: "home_viewed",
    clientSessionId: SESSION_ROW.client_session_id,
    clientEventId: "c:3",
  }, opts);
  assert.equal(third.status, 429);
  assert.equal(third.body.error.code, "rate_limited");
});

test("handleClientEvent rate-limits a chatty IP against the durable bucket", async () => {
  resetRateLimits();
  let count = 0;
  const { client } = createMockClient({
    lead_sessions: () => ({ data: SESSION_ROW, error: null }),
    lead_events: () => ({ data: { id: "event-1" }, error: null }),
    funnel_rate_limits: (ops) => {
      if (ops[0].op === "select") {
        return {
          data: {
            bucket_key: "ip:x",
            window_start: new Date().toISOString(),
            count,
          },
          error: null,
        };
      }
      if (ops[0].op === "update") count = ops[0].value.count;
      return { data: null, error: null };
    },
  });
  const opts = { ...clientOpts, clientIp: "203.0.113.9", durableIpLimit: 1 };
  const first = await handleClientEvent(client, {
    eventName: "home_viewed",
    clientSessionId: SESSION_ROW.client_session_id,
    clientEventId: "c:1",
  }, opts);
  assert.equal(first.status, 200);
  const second = await handleClientEvent(client, {
    eventName: "home_viewed",
    clientSessionId: "3f333df6-90a4-4fda-8dd3-9485d27cee37",
    clientEventId: "c:2",
  }, opts);
  assert.equal(second.status, 429);
});

// ── captureLead ─────────────────────────────────────────────────────────────
function captureClient(overrides = {}) {
  return createMockClient({
    lead_sessions: (ops) =>
      ops[0].op === "insert"
        ? { data: SESSION_ROW, error: null }
        : { data: null, error: null },
    funnel_leads: (ops) =>
      ops[0].op === "upsert"
        ? { data: LEAD_ROW, error: null }
        : ops[0].op === "select"
          ? { data: { lead_state: "new", priority_tier: null }, error: null }
          : { data: null, error: null },
    lead_events: (ops) =>
      ops[0].op === "insert"
        ? { data: { id: "event-1" }, error: null }
        : { data: [], error: null },
    ...overrides,
  });
}

test("captureLead rejects an unusable phone number", async () => {
  const { client } = captureClient();
  const outcome = await captureLead(client, { phone: "123" });
  assert.equal(outcome.status, 422);
  assert.equal(outcome.body.error.code, "invalid_phone");
});

test("captureLead creates the lead, links the session, back-stitches and records the event", async () => {
  const { client, recorded } = captureClient();
  const outcome = await captureLead(client, {
    phone: "+91 98765 43210",
    name: "Ramu",
    email: "a@b.com",
    locality: "Bengaluru",
    area: "HSR Layout",
    source: "homepage_popup",
    serviceInterest: "Driving Masterclass",
    leadSource: "Website-Popup-Direct",
    clientSessionId: SESSION_ROW.client_session_id,
    attribution: { utm_source: "google", utm_medium: "cpc" },
    pagePath: "/",
  });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.leadId, "lead-1");
  assert.equal(outcome.sessionId, "session-1");
  assert.equal(outcome.duplicate, false);

  // The lead row.
  const upsert = rowsFor(recorded, "funnel_leads").find((r) => r.op === "upsert");
  assert.equal(upsert.value.phone_normalized, "9876543210");
  assert.equal(upsert.value.lead_state, "captured");

  // The session link + the back-stitch.
  const link = rowsFor(recorded, "lead_sessions").find((r) => r.op === "update");
  assert.equal(link.value.lead_id, "lead-1");
  const backstitch = rowsFor(recorded, "lead_events").find((r) => r.op === "update");
  assert.deepEqual(backstitch.value, { lead_id: "lead-1" });

  // The commit point.
  const captured = rowsFor(recorded, "lead_events").find(
    (r) => r.op === "insert" && r.value.event_name === "lead_captured",
  );
  assert.ok(captured, "the lead_captured event must be written");
  assert.equal(captured.value.lead_id, "lead-1");
  assert.equal(captured.value.client_event_id, "capture:lead-1");
  assert.equal(captured.value.properties.form, "homepage_popup");
});

test("captureLead uses a stable idempotency key, so a second capture is a duplicate", async () => {
  const { client, recorded } = createMockClient({
    lead_sessions: (ops) =>
      ops[0].op === "insert" ? { data: SESSION_ROW, error: null } : { data: null, error: null },
    funnel_leads: (ops) =>
      ops[0].op === "upsert"
        ? { data: LEAD_ROW, error: null }
        : ops[0].op === "select"
          ? { data: { lead_state: "new", priority_tier: null }, error: null }
          : { data: null, error: null },
    lead_events: (ops) =>
      ops[0].op === "insert"
        ? { data: null, error: uniqueError }
        : { data: [], error: null },
  });
  const outcome = await captureLead(client, {
    phone: "9876543210",
    source: "homepage_popup",
    clientSessionId: SESSION_ROW.client_session_id,
  });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.duplicate, true);
  const captured = rowsFor(recorded, "lead_events").find(
    (r) => r.op === "insert" && r.value.event_name === "lead_captured",
  );
  assert.equal(captured.value.client_event_id, "capture:lead-1");
});

test("captureLead still records the lead when the session cannot be resolved", async () => {
  const { client, recorded } = createMockClient({
    lead_sessions: () => ({ data: null, error: { code: "42501", message: "denied" } }),
    funnel_leads: (ops) =>
      ops[0].op === "upsert"
        ? { data: LEAD_ROW, error: null }
        : ops[0].op === "select"
          ? { data: { lead_state: "new", priority_tier: null }, error: null }
          : { data: null, error: null },
    lead_events: (ops) =>
      ops[0].op === "insert"
        ? { data: { id: "event-1" }, error: null }
        : { data: [], error: null },
  });
  const outcome = await captureLead(client, { phone: "9876543210", source: "homepage_popup" });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.leadId, "lead-1");
  // The lead row is written even though the session link failed.
  const upsert = rowsFor(recorded, "funnel_leads").find((r) => r.op === "upsert");
  assert.equal(upsert.value.phone_normalized, "9876543210");
});
