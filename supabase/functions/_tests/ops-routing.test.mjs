// Unit tests for _shared/opsRouting.ts - planner (pure) + idempotent executor
// against an in-memory fake of the supabase-js query builder. No DB / network.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_OPS_ROUTING_CONFIG,
  planRouting,
  readOpsRoutingConfig,
  routeBooking,
} from "../_shared/opsRouting.ts";

const NOW = new Date("2026-11-04T10:00:00Z");
const CFG_OWNED = readOpsRoutingConfig({
  queues: { class: "class_ops", licence: "ll_rto", migration: "ll_rto" },
  first_action_due_days: { class: 1, licence: 1 },
});

const input = (over = {}) => ({
  booking: { id: "b1", learner_id: "l1", case_type: "course_rto", course_id: "c1", status: "confirmed" },
  courseTotalLessons: 4,
  addonCodes: [],
  heldLessonCount: 4,
  learnersWithSamePhone: 1,
  enrollmentId: "e1",
  llApplicationId: null,
  now: NOW,
  ...over,
});
const kinds = (p) => p.workstreams.map((w) => w.kind).sort();
const codes = (p) => p.exceptions.map((e) => e.code).sort();

// ---------------------------------------------------------------- planner
test("class-only purchase -> class line only, lesson count from the course (not 10)", () => {
  const p = planRouting(input(), CFG_OWNED);
  assert.deepEqual(kinds(p), ["class"]);
  assert.equal(p.workstreams[0].totalUnits, 4);
  assert.equal(p.workstreams[0].enrollmentId, "e1");
  assert.equal(p.workstreams[0].ownerQueue, "class_ops");
});

test("rto_only purchase -> licence line only, no class line", () => {
  const p = planRouting(
    input({ booking: { id: "b1", learner_id: "l1", case_type: "rto_only", course_id: null, status: "payment_completed" }, courseTotalLessons: null, addonCodes: ["rto_2w_ll_dl"], llApplicationId: "ll1", heldLessonCount: 0 }),
    CFG_OWNED,
  );
  assert.deepEqual(kinds(p), ["licence"]);
  assert.deepEqual(p.workstreams[0].serviceCodes, ["rto_2w_ll_dl"]);
  assert.equal(p.workstreams[0].llApplicationId, "ll1");
});

test("combined purchase -> independent class and licence lines", () => {
  const p = planRouting(input({ addonCodes: ["rto_4w_ll_dl"], llApplicationId: "ll1" }), CFG_OWNED);
  assert.deepEqual(kinds(p), ["class", "licence"]);
  assert.equal(p.workstreams.find((w) => w.kind === "class").llApplicationId, null);
  assert.equal(p.workstreams.find((w) => w.kind === "licence").enrollmentId, null);
});

test("no rto_ addon -> no licence line, even though the customer has no licence", () => {
  const p = planRouting(input({ addonCodes: [] }), CFG_OWNED);
  assert.ok(!kinds(p).includes("licence"));
  assert.ok(!kinds(p).includes("migration"));
});

test("non-rto addons never create a licence line", () => {
  const p = planRouting(input({ addonCodes: ["some_other_addon"] }), CFG_OWNED);
  assert.deepEqual(kinds(p), ["class"]);
});

test("address-change service stays on the licence line, linked to the LL application (as the LL board models it)", () => {
  const p = planRouting(input({ addonCodes: ["rto_dl_address_change"], llApplicationId: "ll1" }), CFG_OWNED);
  assert.deepEqual(kinds(p), ["class", "licence"]);
  const l = p.workstreams.find((w) => w.kind === "licence");
  assert.deepEqual(l.serviceCodes, ["rto_dl_address_change"]);
  assert.equal(l.llApplicationId, "ll1");
  assert.ok(!codes(p).includes("migration_routing_unconfirmed"));
});

test("licence + address-change services share ONE licence line", () => {
  const p = planRouting(input({ addonCodes: ["rto_2w_dl", "rto_dl_address_change"] }), CFG_OWNED);
  assert.deepEqual(kinds(p), ["class", "licence"]);
  assert.deepEqual(p.workstreams.find((w) => w.kind === "licence").serviceCodes, ["rto_2w_dl", "rto_dl_address_change"]);
});

test("a separate migration line is still possible, but only when configured", () => {
  const cfg = readOpsRoutingConfig({ queues: { licence: "q", migration: "m" }, migration_codes: ["rto_dl_address_change"] });
  const p = planRouting(input({ addonCodes: ["rto_2w_dl", "rto_dl_address_change"], llApplicationId: "ll1" }), cfg);
  assert.deepEqual(kinds(p), ["class", "licence", "migration"]);
  assert.equal(p.workstreams.find((w) => w.kind === "migration").llApplicationId, "ll1");
});
test("unpaid / unconfirmed booking is not routable", () => {
  for (const status of ["created", "conflict", "failed", "abandoned"]) {
    const p = planRouting(input({ booking: { id: "b1", learner_id: "l1", case_type: "course_rto", course_id: "c1", status } }), CFG_OWNED);
    assert.equal(p.routable, false, status);
    assert.equal(p.workstreams.length, 0);
  }
});

test("payment_completed (rto_only before confirm) is routable", () => {
  assert.equal(planRouting(input({ booking: { id: "b1", learner_id: "l1", case_type: "rto_only", course_id: null, status: "payment_completed" }, addonCodes: ["rto_2w_dl"] }), CFG_OWNED).routable, true);
});

test("full held schedule -> review step, still tentative, no schedule exception", () => {
  const p = planRouting(input({ heldLessonCount: 4 }), CFG_OWNED);
  assert.equal(p.workstreams[0].nextAction, "review_tentative_schedule");
  assert.deepEqual(codes(p), []);
});

test("no held lessons -> no_complete_schedule exception, never reported as scheduled", () => {
  const p = planRouting(input({ heldLessonCount: 0 }), CFG_OWNED);
  assert.equal(p.workstreams[0].nextAction, "schedule_classes");
  assert.deepEqual(codes(p), ["no_complete_schedule"]);
});

test("partial held lessons -> partial_schedule exception (not a complete course)", () => {
  const p = planRouting(input({ heldLessonCount: 2 }), CFG_OWNED);
  assert.deepEqual(codes(p), ["partial_schedule"]);
  assert.deepEqual(p.exceptions[0].detail, { held: 2, purchased: 4 });
});

test("missing course lesson count -> critical exception and no invented total", () => {
  const p = planRouting(input({ courseTotalLessons: null }), CFG_OWNED);
  assert.equal(p.workstreams[0].totalUnits, null);
  assert.ok(codes(p).includes("class_count_unknown"));
});

test("no owner configured -> every line is created unowned with an owner_unassigned exception", () => {
  const p = planRouting(input({ addonCodes: ["rto_2w_dl"] }), DEFAULT_OPS_ROUTING_CONFIG);
  assert.ok(p.workstreams.every((w) => w.ownerQueue === null));
  assert.ok(codes(p).includes("owner_unassigned_class"));
  assert.ok(codes(p).includes("owner_unassigned_licence"));
});

test("owner configured -> no ownership exception", () => {
  const p = planRouting(input({ addonCodes: ["rto_2w_dl"] }), CFG_OWNED);
  assert.ok(!codes(p).some((c) => c.startsWith("owner_unassigned")));
});

test("due dates are only set when configured (none invented)", () => {
  const none = planRouting(input(), DEFAULT_OPS_ROUTING_CONFIG);
  assert.equal(none.workstreams[0].nextActionDueAt, null);
  const set = planRouting(input(), CFG_OWNED);
  assert.equal(set.workstreams[0].nextActionDueAt, "2026-11-05T10:00:00.000Z");
});

test("ambiguous customer identity -> review exception, no merge", () => {
  const p = planRouting(input({ learnersWithSamePhone: 2 }), CFG_OWNED);
  assert.ok(codes(p).includes("customer_match_ambiguous"));
});

test("config reader tolerates garbage and keeps safe defaults", () => {
  for (const bad of [null, undefined, 5, "x", [], { queues: 3, first_action_due_days: "y", migration_codes: "z" }]) {
    const c = readOpsRoutingConfig(bad);
    assert.deepEqual(c.queues, { class: null, licence: null, migration: null });
    assert.deepEqual(c.firstActionDueDays, { class: null, licence: null, migration: null });
    assert.deepEqual(c.migrationCodes, []);
  }
  assert.deepEqual(readOpsRoutingConfig({ first_action_due_days: { class: -1, licence: "x" } }).firstActionDueDays.class, null);
});

// ------------------------------------------------------- fake supabase client
const UNIQUE = { ops_workstream: ["booking_id", "kind"], ops_exception: ["booking_id", "code"], ops_event: ["dedupe_key"] };

function makeClient(seed, opts = {}) {
  const db = {};
  for (const [t, rows] of Object.entries(seed)) db[t] = rows.map((r) => ({ ...r }));
  let seq = 0;
  const failTables = new Set(opts.failTables ?? []);
  const tbl = (t) => (db[t] ??= []);

  function builder(table) {
    const st = { op: "select", filters: [], payload: null, up: null, head: false, count: false, ret: false, lim: null };
    const match = (r) =>
      st.filters.every((f) => {
        if (f.k === "eq") return r[f.c] === f.v;
        if (f.k === "in") return f.v.includes(r[f.c]);
        if (f.k === "notin") return !f.v.includes(r[f.c]);
        return true;
      });
    const run = () => {
      if (failTables.has(table) && st.op !== "select") return { data: null, error: { message: `forced failure on ${table}` } };
      const rows = tbl(table);
      if (st.op === "select") {
        let out = rows.filter(match);
        if (st.lim != null) out = out.slice(0, st.lim);
        return { data: st.head ? null : out.map((r) => ({ ...r })), count: st.count ? rows.filter(match).length : null, error: null };
      }
      if (st.op === "update") {
        for (const r of rows.filter(match)) Object.assign(r, st.payload);
        return { data: null, error: null };
      }
      if (st.op === "upsert") {
        const inserted = [];
        const keys = UNIQUE[table] ?? [];
        for (const p of Array.isArray(st.payload) ? st.payload : [st.payload]) {
          const dup = keys.length > 0 && p[keys[0]] !== undefined && rows.some((r) => keys.every((k) => r[k] === p[k]));
          if (dup) continue;
          const row = { id: `${table}-${++seq}`, status: p.status ?? (table === "ops_exception" ? "open" : undefined), ...p };
          rows.push(row);
          inserted.push({ ...row });
        }
        return { data: st.ret ? inserted : null, error: null };
      }
      return { data: null, error: null };
    };
    const api = {
      select(_c, o) { if (st.op === "upsert") st.ret = true; if (o?.head) st.head = true; if (o?.count) st.count = true; return api; },
      eq(c, v) { st.filters.push({ k: "eq", c, v }); return api; },
      in(c, v) { st.filters.push({ k: "in", c, v }); return api; },
      not(c, _op, v) { st.filters.push({ k: "notin", c, v: String(v).replace(/[()]/g, "").split(",") }); return api; },
      order() { return api; },
      limit(n) { st.lim = n; return api; },
      update(p) { st.op = "update"; st.payload = p; return api; },
      upsert(p) { st.op = "upsert"; st.payload = p; return api; },
      maybeSingle: async () => { const r = run(); return { data: r.data?.[0] ?? null, error: r.error }; },
      then: (res, rej) => Promise.resolve(run()).then(res, rej),
    };
    return api;
  }
  return { from: (t) => builder(t), db };
}

const seed = (over = {}) => ({
  booking: [{ id: "b1", learner_id: "l1", case_type: "course_rto", course_id: "c1", status: "confirmed", addon_ids: ["a1"] }],
  booking_addons: [{ id: "a1", code: "rto_2w_dl" }],
  Courses: [{ id: "c1", total_lessons: 4 }],
  Schedule: [1, 2, 3, 4].map((i) => ({ id: i, booking_id: "b1", status: "tentative" })),
  Learner: [{ id: "l1", phone: "9000000001" }],
  enrollment: [{ id: "e1", learner_id: "l1", course_id: "c1", acquired_via_funnel: true }],
  ll_applications: [{ id: "ll1", learner_id: "l1", acquired_via_funnel: true, status: "payment_received" }],
  app_settings: [{ key: "ops_routing", value: { queues: { class: "class_ops", licence: "ll_rto" } } }],
  ...over,
});

// ---------------------------------------------------------------- executor
test("routeBooking creates class + licence workstreams, links existing rows, records events", async () => {
  const c = makeClient(seed());
  const r = await routeBooking(c, "b1", "11111111-1111-4111-8111-111111111111", NOW);
  assert.equal(r.ok, true);
  assert.deepEqual(r.workstreamsCreated.sort(), ["class", "licence"]);
  const cls = c.db.ops_workstream.find((w) => w.kind === "class");
  const lic = c.db.ops_workstream.find((w) => w.kind === "licence");
  assert.equal(cls.enrollment_id, "e1");
  assert.equal(cls.total_units, 4);
  assert.equal(lic.ll_application_id, "ll1");
  assert.equal(cls.owner_queue, "class_ops");
  assert.ok(c.db.ops_event.some((e) => e.event_type === "request_routed"));
  assert.equal((c.db.ops_exception ?? []).length, 0);
  assert.equal(c.db.Learner.length, 1);
  assert.equal(c.db.Schedule.length, 4);
});

test("routing the same booking twice creates nothing new (no duplicate workstream / event / exception)", async () => {
  const c = makeClient(seed({ Schedule: [] }));
  await routeBooking(c, "b1", null, NOW);
  const snap = JSON.stringify([c.db.ops_workstream.length, c.db.ops_event.length, c.db.ops_exception.length]);
  const again = await routeBooking(c, "b1", null, NOW);
  assert.equal(again.ok, true);
  assert.deepEqual(again.workstreamsCreated, []);
  assert.deepEqual(again.workstreamsExisting.sort(), ["class", "licence"]);
  assert.equal(JSON.stringify([c.db.ops_workstream.length, c.db.ops_event.length, c.db.ops_exception.length]), snap);
  assert.ok(c.db.ops_exception.some((e) => e.code === "no_complete_schedule"));
});

test("a retry never overwrites an owner/next action Operations already changed", async () => {
  const c = makeClient(seed());
  await routeBooking(c, "b1", null, NOW);
  const cls = c.db.ops_workstream.find((w) => w.kind === "class");
  cls.owner_ref = "9000000042";
  cls.owner_queue = "custom_queue";
  cls.next_action = "call_customer";
  await routeBooking(c, "b1", null, NOW);
  const after = c.db.ops_workstream.find((w) => w.kind === "class");
  assert.equal(after.owner_ref, "9000000042");
  assert.equal(after.owner_queue, "custom_queue");
  assert.equal(after.next_action, "call_customer");
});

test("unpaid booking: nothing is written", async () => {
  const c = makeClient(seed({ booking: [{ id: "b1", learner_id: "l1", case_type: "course_rto", course_id: "c1", status: "created", addon_ids: [] }] }));
  const r = await routeBooking(c, "b1", null, NOW);
  assert.equal(r.ok, true);
  assert.equal(r.routed, false);
  assert.equal((c.db.ops_workstream ?? []).length, 0);
});

test("class-only booking creates no licence workstream and no LL application is touched", async () => {
  const c = makeClient(seed({ booking: [{ id: "b1", learner_id: "l1", case_type: "classes_only", course_id: "c1", status: "confirmed", addon_ids: [] }] }));
  await routeBooking(c, "b1", null, NOW);
  assert.deepEqual(c.db.ops_workstream.map((w) => w.kind), ["class"]);
  assert.equal(c.db.ll_applications.length, 1);
});

test("rto_only booking (no course, no enrollment) routes a licence line only", async () => {
  const c = makeClient(seed({
    booking: [{ id: "b1", learner_id: "l1", case_type: "rto_only", course_id: null, status: "payment_completed", addon_ids: ["a1"] }],
    enrollment: [],
    Schedule: [],
  }));
  await routeBooking(c, "b1", null, NOW);
  assert.deepEqual(c.db.ops_workstream.map((w) => w.kind), ["licence"]);
});

test("ambiguous phone opens a review exception and does not merge or delete learners", async () => {
  const c = makeClient(seed({ Learner: [{ id: "l1", phone: "9000000001" }, { id: "l2", phone: "9000000001" }] }));
  await routeBooking(c, "b1", null, NOW);
  assert.ok(c.db.ops_exception.some((e) => e.code === "customer_match_ambiguous"));
  assert.equal(c.db.Learner.length, 2);
});

test("no ops_routing config -> unowned lines + owner_unassigned exceptions (request stays visible)", async () => {
  const c = makeClient(seed({ app_settings: [] }));
  await routeBooking(c, "b1", null, NOW);
  assert.ok(c.db.ops_workstream.every((w) => w.owner_queue == null));
  assert.ok(c.db.ops_exception.some((e) => e.code === "owner_unassigned_class"));
});

test("partial failure: error is returned (never thrown), failure is recorded, retry recovers and resolves it", async () => {
  const bad = makeClient(seed(), { failTables: ["ops_workstream"] });
  const r = await routeBooking(bad, "b1", null, NOW);
  assert.equal(r.ok, false);
  assert.match(r.error, /workstream/);
  assert.ok(bad.db.ops_exception.some((e) => e.code === "routing_failed" && e.status === "open"));

  // same store, failure cleared -> retry succeeds and closes routing_failed
  const good = makeClient({ ...Object.fromEntries(Object.entries(bad.db).map(([k, v]) => [k, v])) });
  const retry = await routeBooking(good, "b1", null, NOW);
  assert.equal(retry.ok, true);
  assert.deepEqual(retry.workstreamsCreated.sort(), ["class", "licence"]);
  assert.equal(good.db.ops_exception.find((e) => e.code === "routing_failed").status, "resolved");
});

test("missing booking -> ok:false, no throw", async () => {
  const c = makeClient(seed({ booking: [] }));
  const r = await routeBooking(c, "nope", null, NOW);
  assert.equal(r.ok, false);
  assert.match(r.error, /not found/);
});

test("ops tables absent (migration not applied yet): routing fails soft, never throws", async () => {
  const c = makeClient(seed());
  const orig = c.from;
  c.from = (t) => {
    if (t.startsWith("ops_")) throw new Error(`relation "public.${t}" does not exist`);
    return orig(t);
  };
  const r = await routeBooking(c, "b1", null, NOW);
  assert.equal(r.ok, false);
});
