// Unit tests for _shared/funnelTaxonomy.ts — pure, no DB/network.
//
// The taxonomy is the contract of the whole Phase 0 instrumentation: the
// canonical PRD section 4 event names, the per-event property allowlist, the
// PII denylist, the lead-state machine and the prioritisation tiers.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FUNNEL_EVENTS,
  LIFECYCLE_EVENTS,
  ALL_EVENT_NAMES,
  SERVER_ONLY_EVENT_NAMES,
  CLIENT_EVENT_NAMES,
  SCHEMA_VERSION,
  LATER_PHASE_EVENT_NAMES,
  FUNNEL_FORMS,
  LEAD_STATES,
  PRIORITY_TIERS,
  EVENT_PROPERTY_KEYS,
  PII_PROPERTY_KEYS,
  MAX_PROPERTY_KEYS,
  MAX_OCCURRED_AT_AGE_MS,
  MAX_OCCURRED_AT_SKEW_MS,
  isKnownFunnelEvent,
  isClientEvent,
  isServerOnlyEvent,
  allowedPropertyKeys,
  sanitizeProperties,
  sanitizePagePath,
  sanitizeReferrerHost,
  deriveSurface,
  normalizePropertyKey,
  coercePropertyValue,
  computePriorityTier,
  mergePriorityTier,
  isPriorityTier,
  isLeadState,
  nextLeadState,
  normalizeForm,
  normalizeDlStatus,
  normalizeOccurredAt,
  classifyDevice,
  isUuid,
  phoneToLast10,
  deriveCaptureClientEventId,
  normalizeClientEventId,
} from "../_shared/funnelTaxonomy.ts";

// ── Taxonomy shape ──────────────────────────────────────────────────────────
test("FUNNEL_EVENTS holds the 21 canonical PRD section 4 event names", () => {
  assert.equal(FUNNEL_EVENTS.length, 21);
  assert.deepEqual(
    [...FUNNEL_EVENTS],
    [
      "home_viewed",
      "location_entered",
      "dl_status_selected",
      "course_list_viewed",
      "price_unlock_attempted",
      "lead_sheet_dismissed",
      "lead_captured",
      "expert_contact_requested",
      "slots_viewed",
      "slot_selected",
      "course_selected",
      "plan_page_viewed",
      "payment_option_selected",
      "payment_initiated",
      "payment_success",
      "payment_failed",
      "booking_confirmed",
      "supply_gap_logged",
      "priority_hold_initiated",
      "priority_hold_paid",
      "priority_hold_declined",
    ],
  );
});

test("client + server-only partitions the taxonomy exactly", () => {
  // The accepted universe is the PRD §4 contract PLUS the additive lifecycle
  // events. Every name must be exactly one of client-emittable / server-only.
  assert.equal(ALL_EVENT_NAMES.length, FUNNEL_EVENTS.length + LIFECYCLE_EVENTS.length);
  assert.equal(CLIENT_EVENT_NAMES.length + SERVER_ONLY_EVENT_NAMES.length, ALL_EVENT_NAMES.length);
  for (const name of SERVER_ONLY_EVENT_NAMES) {
    assert.ok(!CLIENT_EVENT_NAMES.includes(name), `${name} must not be client-emittable`);
    assert.ok(isServerOnlyEvent(name));
    assert.ok(!isClientEvent(name));
  }
  for (const name of CLIENT_EVENT_NAMES) {
    assert.ok(!isServerOnlyEvent(name), `${name} must not be server-only`);
    assert.ok(isClientEvent(name));
  }
});

test("lifecycle events are additive and keep the PRD §4 contract intact", () => {
  assert.deepEqual(
    [...LIFECYCLE_EVENTS],
    ["funnel_session_started", "serviceability_check_started", "lead_capture_started"],
  );
  // The PRD list itself must NOT grow.
  assert.equal(FUNNEL_EVENTS.length, 21);
  for (const name of LIFECYCLE_EVENTS) {
    assert.ok(!FUNNEL_EVENTS.includes(name));
    assert.ok(isKnownFunnelEvent(name));
    assert.ok(Array.isArray(EVENT_PROPERTY_KEYS[name]));
  }
  // Derived server-side: a browser can never forge a session start or the
  // opening of a serviceability check.
  assert.ok(isServerOnlyEvent("funnel_session_started"));
  assert.ok(isServerOnlyEvent("serviceability_check_started"));
  assert.ok(!isClientEvent("funnel_session_started"));
  assert.ok(!isClientEvent("serviceability_check_started"));
  // The lead-form open is a genuine client observation.
  assert.ok(isClientEvent("lead_capture_started"));
  assert.ok(!isServerOnlyEvent("lead_capture_started"));
  assert.ok(!isKnownFunnelEvent("funnel_session_ended"));
});

test("the funnel commit point (lead_captured) is server-only", () => {
  assert.ok(SERVER_ONLY_EVENT_NAMES.includes("lead_captured"));
  assert.ok(!CLIENT_EVENT_NAMES.includes("lead_captured"));
});

test("payment + booking events are server-only", () => {
  for (const name of [
    "payment_initiated",
    "payment_success",
    "payment_failed",
    "booking_confirmed",
  ]) {
    assert.ok(SERVER_ONLY_EVENT_NAMES.includes(name), `${name} must be server-only`);
  }
});

test("the Phase 5 / Phase 6 events are flagged as later-phase", () => {
  assert.deepEqual(
    [...LATER_PHASE_EVENT_NAMES].sort(),
    [
      "price_unlock_attempted",
      "priority_hold_declined",
      "priority_hold_initiated",
      "priority_hold_paid",
      "supply_gap_logged",
    ],
  );
  for (const name of LATER_PHASE_EVENT_NAMES) {
    assert.ok(FUNNEL_EVENTS.includes(name));
  }
});

test("every event has a property allowlist entry and every form is known", () => {
  for (const name of ALL_EVENT_NAMES) {
    assert.ok(Array.isArray(EVENT_PROPERTY_KEYS[name]), `${name} needs an allowlist`);
  }
  assert.ok(FUNNEL_FORMS.includes("booking_flow"));
  assert.ok(FUNNEL_FORMS.includes("homepage_popup"));
});

// ── Event classification ────────────────────────────────────────────────────
test("isKnownFunnelEvent rejects invented names", () => {
  assert.ok(isKnownFunnelEvent("home_viewed"));
  assert.ok(!isKnownFunnelEvent("homepage_viewed"));
  assert.ok(!isKnownFunnelEvent("lead_capture"));
  assert.ok(!isKnownFunnelEvent(""));
  assert.ok(!isKnownFunnelEvent(null));
  assert.ok(!isKnownFunnelEvent(42));
});

// ── Property allowlist / PII denylist ───────────────────────────────────────
test("sanitizeProperties keeps only allowlisted keys", () => {
  const { properties, dropped } = sanitizeProperties("home_viewed", {
    page_type: "booking_flow",
    not_allowed: "x",
  });
  assert.deepEqual(properties, { page_type: "booking_flow" });
  assert.deepEqual(dropped, ["not_allowed"]);
});

test("sanitizeProperties drops PII keys even when allowlisted by mistake", () => {
  // `name` is not in the home_viewed allowlist AND is on the PII denylist.
  const { properties, dropped } = sanitizeProperties("home_viewed", {
    page_type: "x",
    name: "Ramu",
    phone: "9000000000",
    email: "a@b.com",
  });
  assert.deepEqual(properties, { page_type: "x" });
  assert.deepEqual(dropped.sort(), ["email", "name", "phone"]);
});

test("sanitizeProperties never stores an object, array or null", () => {
  const { properties } = sanitizeProperties("course_list_viewed", {
    course_count: 4,
    course_ids: ["a", "b"],
    dl_status: null,
  });
  assert.deepEqual(properties, { course_count: 4 });
});

test("sanitizeProperties truncates long strings", () => {
  const { properties } = sanitizeProperties("home_viewed", {
    page_type: "x".repeat(500),
  });
  assert.equal(properties.page_type.length, 200);
});

test("sanitizeProperties caps the number of keys", () => {
  const input = {};
  for (let i = 0; i < MAX_PROPERTY_KEYS + 5; i += 1) input[`k${i}`] = "v";
  // k* is not allowlisted for home_viewed, so nothing survives — the point is
  // that the function never throws and never exceeds the cap.
  const { properties } = sanitizeProperties("home_viewed", input);
  assert.ok(Object.keys(properties).length <= MAX_PROPERTY_KEYS);
});

test("sanitizeProperties normalises keys (trim / lowercase / non-alnum)", () => {
  const { properties } = sanitizeProperties("home_viewed", {
    "  Page-Type  ": "booking_flow",
  });
  assert.deepEqual(properties, { page_type: "booking_flow" });
});

test("sanitizeProperties returns nothing for an unknown event or non-object", () => {
  assert.deepEqual(sanitizeProperties("nope", { page_type: "x" }).properties, {});
  assert.deepEqual(sanitizeProperties("home_viewed", null).properties, {});
  assert.deepEqual(sanitizeProperties("home_viewed", [1, 2]).properties, {});
});

test("sanitizeProperties keeps booleans and finite numbers", () => {
  const { properties } = sanitizeProperties("location_entered", {
    serviceable: true,
    area_id: "a1",
  });
  assert.deepEqual(properties, { serviceable: true, area_id: "a1" });
});

test("allowedPropertyKeys always includes the common keys", () => {
  const keys = allowedPropertyKeys("home_viewed");
  assert.ok(keys.has("form"));
  assert.ok(keys.has("page_type"));
  assert.ok(keys.has("referrer_host"));
});

test("the PII denylist covers the obvious identifiers", () => {
  for (const key of ["email", "phone", "name", "address", "latitude", "longitude"]) {
    assert.ok(PII_PROPERTY_KEYS.includes(key), `${key} must be denied`);
  }
});

// ── Page path / referrer sanitising ─────────────────────────────────────────
test("sanitizePagePath strips the query string and hash", () => {
  assert.equal(sanitizePagePath("/book?email=a@b.com&phone=9000000000"), "/book");
  assert.equal(sanitizePagePath("/book#anchor"), "/book");
  assert.equal(sanitizePagePath("  /book  "), "/book");
});

test("sanitizePagePath rejects non-paths and empty values", () => {
  assert.equal(sanitizePagePath("https://example.com/book"), null);
  assert.equal(sanitizePagePath(""), null);
  assert.equal(sanitizePagePath(null), null);
});

test("sanitizeReferrerHost keeps the host only", () => {
  assert.equal(sanitizeReferrerHost("https://www.google.com/search?q=lane"), "www.google.com");
  assert.equal(sanitizeReferrerHost("https://example.com:8443/path"), "example.com");
  assert.equal(sanitizeReferrerHost("EXAMPLE.COM"), "example.com");
  assert.equal(sanitizeReferrerHost("not a host"), null);
  assert.equal(sanitizeReferrerHost(""), null);
});

// ── Server-derived envelope metadata ────────────────────────────────────────
test("deriveSurface labels each product surface from the page path", () => {
  assert.equal(deriveSurface("/"), "marketing_home");
  assert.equal(deriveSurface("/book"), "booking_flow");
  assert.equal(deriveSurface("/book/schedule"), "booking_flow");
  assert.equal(deriveSurface("/courses"), "courses");
  assert.equal(deriveSurface("/rto"), "rto");
  assert.equal(deriveSurface("/signup"), "auth");
  assert.equal(deriveSurface("/thank-you"), "thank_you");
  assert.equal(deriveSurface("/checkout"), "checkout");
  assert.equal(deriveSurface("/mygate"), "mygate");
  assert.equal(deriveSurface("/somewhere-else"), "other");
  assert.equal(deriveSurface(null), "unknown");
  assert.equal(deriveSurface(""), "unknown");
  // The label is derived AFTER sanitisation, so a query string can never leak
  // into it.
  assert.equal(deriveSurface(sanitizePagePath("/book?phone=9000000000")), "booking_flow");
});

test("SCHEMA_VERSION is a positive integer", () => {
  assert.equal(typeof SCHEMA_VERSION, "number");
  assert.ok(Number.isInteger(SCHEMA_VERSION) && SCHEMA_VERSION >= 1);
});

// ── Key / value coercion ────────────────────────────────────────────────────
test("normalizePropertyKey lowercases and strips illegal characters", () => {
  assert.equal(normalizePropertyKey(" Page-Type "), "page_type");
  assert.equal(normalizePropertyKey("a b.c"), "a_b_c");
  assert.equal(normalizePropertyKey(""), null);
  assert.equal(normalizePropertyKey(null), null);
});

test("coercePropertyValue drops non-primitives", () => {
  assert.equal(coercePropertyValue("  hi  "), "hi");
  assert.equal(coercePropertyValue(7), 7);
  assert.equal(coercePropertyValue(false), false);
  assert.equal(coercePropertyValue({ a: 1 }), undefined);
  assert.equal(coercePropertyValue([1]), undefined);
  assert.equal(coercePropertyValue(Number.NaN), undefined);
});

// ── Lead states ─────────────────────────────────────────────────────────────
test("lead states match the PRD section 4 vocabulary", () => {
  assert.deepEqual(
    [...LEAD_STATES],
    [
      "new",
      "captured",
      "slot_engaged",
      "payment_attempted",
      "converted",
      "dropped",
      "supply_blocked",
      "priority_hold",
    ],
  );
  assert.ok(isLeadState("captured"));
  assert.ok(!isLeadState("CAPTURED"));
});

test("nextLeadState walks the PRD lifecycle", () => {
  assert.equal(nextLeadState("new", "lead_captured"), "captured");
  assert.equal(nextLeadState("captured", "slot_selected"), "slot_engaged");
  assert.equal(nextLeadState("captured", "slots_viewed"), "slot_engaged");
  assert.equal(nextLeadState("slot_engaged", "payment_initiated"), "payment_attempted");
  assert.equal(nextLeadState("payment_attempted", "payment_success"), "converted");
  assert.equal(nextLeadState("payment_attempted", "booking_confirmed"), "converted");
});

test("nextLeadState keeps a pre-capture slot view from inventing a state", () => {
  assert.equal(nextLeadState("new", "slot_selected"), null);
  assert.equal(nextLeadState("new", "slots_viewed"), null);
});

test("nextLeadState never moves a converted or dropped lead", () => {
  assert.equal(nextLeadState("converted", "payment_initiated"), null);
  assert.equal(nextLeadState("dropped", "payment_initiated"), null);
});

test("nextLeadState ignores events that do not move the lead", () => {
  assert.equal(nextLeadState("captured", "home_viewed"), null);
  assert.equal(nextLeadState("captured", "course_selected"), null);
});

test("nextLeadState handles the off-path states", () => {
  assert.equal(nextLeadState("captured", "supply_gap_logged"), "supply_blocked");
  assert.equal(nextLeadState("captured", "priority_hold_initiated"), "priority_hold");
});

// ── Prioritisation tiers ────────────────────────────────────────────────────
test("priority tiers match the PRD section 4 vocabulary", () => {
  assert.deepEqual([...PRIORITY_TIERS], ["P0", "P1", "P2", "P3", "S", "X"]);
  assert.ok(isPriorityTier("P0"));
  assert.ok(!isPriorityTier("P4"));
});

test("out-of-area wins over every other tier", () => {
  assert.equal(
    computePriorityTier({ outOfArea: true, expertRequested: true, paymentAttempted: true }),
    "X",
  );
});

test("supply-blocked outranks the P ladder", () => {
  assert.equal(
    computePriorityTier({ supplyBlocked: true, expertRequested: true, captured: true }),
    "S",
  );
});

test("P0 covers an expert request and an unfinished payment", () => {
  assert.equal(computePriorityTier({ expertRequested: true }), "P0");
  assert.equal(computePriorityTier({ paymentAttempted: true }), "P0");
  assert.equal(
    computePriorityTier({ paymentAttempted: true, paymentSucceeded: true }),
    null,
  );
});

test("P1 needs the plan page AND a selected slot", () => {
  assert.equal(computePriorityTier({ planReached: true, slotSelected: true }), "P1");
  assert.equal(computePriorityTier({ planReached: true }), null);
});

test("P2 is captured + prices viewed without a slot", () => {
  assert.equal(computePriorityTier({ captured: true, pricesViewed: true }), "P2");
  // A slot without the plan page is not enough for P1 — P1 needs BOTH.
  assert.equal(
    computePriorityTier({ captured: true, pricesViewed: true, slotSelected: true }),
    null,
  );
  assert.equal(
    computePriorityTier({
      captured: true,
      pricesViewed: true,
      slotSelected: true,
      planReached: true,
    }),
    "P1",
  );
});

test("P3 is captured without prices viewed", () => {
  assert.equal(computePriorityTier({ captured: true }), "P3");
});

test("no signals -> no tier", () => {
  assert.equal(computePriorityTier({}), null);
});

test("mergePriorityTier is upward-only", () => {
  assert.equal(mergePriorityTier("P3", "P1"), "P1");
  assert.equal(mergePriorityTier("P1", "P3"), "P1");
  // A genuine P-tier replaces X / S (they are queues, not lower rungs).
  assert.equal(mergePriorityTier("X", "P0"), "P0");
  assert.equal(mergePriorityTier("S", "P2"), "P2");
  assert.equal(mergePriorityTier("X", "P3"), "P3");
  assert.equal(mergePriorityTier("S", "P3"), "P3");
  assert.equal(mergePriorityTier(null, "P2"), "P2");
  assert.equal(mergePriorityTier("P2", null), "P2");
  assert.equal(mergePriorityTier(null, null), null);
  assert.equal(mergePriorityTier("bogus", "P2"), "P2");
});

// ── Forms / dl status / device ──────────────────────────────────────────────
test("normalizeForm accepts the canonical forms only", () => {
  assert.equal(normalizeForm("booking_flow"), "booking_flow");
  assert.equal(normalizeForm("  HOMEPAGE_POPUP "), "homepage_popup");
  assert.equal(normalizeForm(null), null);
  assert.equal(normalizeForm(7), null);
  assert.equal(normalizeForm("   "), null);
});

test("normalizeForm passes through an unknown but bounded form name", () => {
  // Forward compatibility: a new form on a newer client must not be dropped
  // (and the value is length-bounded + sanitised before it is stored).
  assert.equal(normalizeForm("new_form_v2"), "new_form_v2");
  assert.equal(normalizeForm("x".repeat(200)), null);
});

test("normalizeDlStatus accepts the coarse vocabulary", () => {
  assert.equal(normalizeDlStatus("has_dl"), "has_dl");
  assert.equal(normalizeDlStatus("two_wheeler_ll_only"), "two_wheeler_ll_only");
  assert.equal(normalizeDlStatus("two_wheeler_active_dl"), "two_wheeler_active_dl");
  assert.equal(normalizeDlStatus("no_dl"), "no_dl");
  assert.equal(normalizeDlStatus("unknown"), "unknown");
  assert.equal(normalizeDlStatus("yes"), null);
});

test("classifyDevice is coarse and never fingerprinting", () => {
  assert.equal(classifyDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), "mobile");
  assert.equal(classifyDevice("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"), "tablet");
  assert.equal(classifyDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "desktop");
  assert.equal(classifyDevice(null), "desktop");
});

// ── Identifiers ─────────────────────────────────────────────────────────────
test("isUuid accepts a canonical uuid", () => {
  assert.ok(isUuid("3f333df6-90a4-4fda-8dd3-9485d27cee36"));
  assert.ok(!isUuid("3f333df6-90a4-4fda-8dd3"));
  assert.ok(!isUuid(""));
  assert.ok(!isUuid(null));
});

test("phoneToLast10 normalises the dedupe key", () => {
  assert.equal(phoneToLast10("+91 98765 43210"), "9876543210");
  assert.equal(phoneToLast10("919876543210"), "9876543210");
  assert.equal(phoneToLast10("12345"), null);
  assert.equal(phoneToLast10(null), null);
});

test("deriveCaptureClientEventId is stable per lead", () => {
  assert.equal(deriveCaptureClientEventId("lead-1"), "capture:lead-1");
  assert.equal(deriveCaptureClientEventId("lead-1"), deriveCaptureClientEventId("lead-1"));
});

test("normalizeClientEventId rejects unusable values", () => {
  assert.equal(normalizeClientEventId("c:abc"), "c:abc");
  assert.equal(normalizeClientEventId("  c:abc  "), "c:abc");
  assert.equal(normalizeClientEventId(""), null);
  assert.equal(normalizeClientEventId(null), null);
  assert.equal(normalizeClientEventId(12), null);
});

// ── Timestamps ──────────────────────────────────────────────────────────────
test("normalizeOccurredAt keeps a sane client timestamp", () => {
  const now = Date.parse("2026-10-21T10:00:00.000Z");
  assert.equal(
    normalizeOccurredAt("2026-10-21T09:59:00.000Z", now),
    "2026-10-21T09:59:00.000Z",
  );
});

test("normalizeOccurredAt clamps an absurd future timestamp", () => {
  const now = Date.parse("2026-10-21T10:00:00.000Z");
  const far = new Date(now + 60 * 60 * 1000).toISOString();
  assert.equal(normalizeOccurredAt(far, now), new Date(now + MAX_OCCURRED_AT_SKEW_MS).toISOString());
});

test("normalizeOccurredAt clamps an absurd past timestamp", () => {
  const now = Date.parse("2026-10-21T10:00:00.000Z");
  const old = new Date(now - MAX_OCCURRED_AT_AGE_MS - 60 * 60 * 1000).toISOString();
  assert.equal(normalizeOccurredAt(old, now), new Date(now - MAX_OCCURRED_AT_AGE_MS).toISOString());
});

test("normalizeOccurredAt falls back to now for garbage", () => {
  const now = Date.parse("2026-10-21T10:00:00.000Z");
  assert.equal(normalizeOccurredAt("not-a-date", now), "2026-10-21T10:00:00.000Z");
  assert.equal(normalizeOccurredAt(undefined, now), "2026-10-21T10:00:00.000Z");
});
