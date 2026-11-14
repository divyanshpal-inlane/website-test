// Funnel -> Operations routing.
//
// A paid + confirmed funnel booking is already stored in booking / payment /
// enrollment / ll_applications / Schedule. This module only decides WHICH service
// lines that purchase created and records them (ops_workstream), who should own
// them, and what is blocking them (ops_exception). It never creates a learner,
// lesson, payment or LL application, and it never infers a service from the
// customer's qualification answers - only from what was purchased.
//
// planRouting() is pure (unit-tested). routeBooking() is the idempotent
// executor: every write is insert-if-absent against a unique key, so a retry (or
// a replayed confirm-booking call) can never duplicate or overwrite work that
// Operations has already touched.

export type OpsKind = "class" | "licence" | "migration";

export interface OpsRoutingConfig {
  /** Initial owner queue per service line. Null/blank => no owner can be assigned. */
  queues: Record<OpsKind, string | null>;
  /**
   * Service codes tracked as a separate `migration` line instead of the licence
   * line. EMPTY by default: address change is a service on the LL application
   * (ll_applications.services, e.g. dl_address_change_other_state), exactly as
   * the LL board models it, so it stays on the licence line.
   */
  migrationCodes: string[];
  /** Days until the first action is due, per line. Null => no due date is invented. */
  firstActionDueDays: Record<OpsKind, number | null>;
}

// No roster is hard-coded and no SLA is invented: until Operations configures
// app_settings.ops_routing, every line is created UNOWNED with an open
// `owner_unassigned` exception so it stays visible (decision pending: roster).
export const DEFAULT_OPS_ROUTING_CONFIG: OpsRoutingConfig = {
  queues: { class: null, licence: null, migration: null },
  migrationCodes: [],
  firstActionDueDays: { class: null, licence: null, migration: null },
};

const KINDS: OpsKind[] = ["class", "licence", "migration"];

export function readOpsRoutingConfig(value: unknown): OpsRoutingConfig {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const queuesIn = (v.queues && typeof v.queues === "object" ? v.queues : {}) as Record<string, unknown>;
  const dueIn = (v.first_action_due_days && typeof v.first_action_due_days === "object"
    ? v.first_action_due_days
    : {}) as Record<string, unknown>;
  const queues = {} as Record<OpsKind, string | null>;
  const due = {} as Record<OpsKind, number | null>;
  for (const k of KINDS) {
    const q = queuesIn[k];
    queues[k] = typeof q === "string" && q.trim() ? q.trim() : null;
    const d = dueIn[k];
    due[k] = typeof d === "number" && Number.isFinite(d) && d >= 0 ? Math.floor(d) : null;
  }
  const mc = Array.isArray(v.migration_codes)
    ? v.migration_codes.filter((c): c is string => typeof c === "string" && c.trim() !== "").map((c) => c.trim())
    : [...DEFAULT_OPS_ROUTING_CONFIG.migrationCodes];
  return { queues, migrationCodes: mc, firstActionDueDays: due };
}

export interface RoutingInput {
  booking: { id: string; learner_id: string | null; case_type: string | null; course_id: string | null; status: string };
  /** Courses.total_lessons of the purchased course, or null when there is no course / the value is missing. */
  courseTotalLessons: number | null;
  /** booking.addon_ids resolved to booking_addons.code. */
  addonCodes: string[];
  /** Schedule rows of this booking in tentative|booked. */
  heldLessonCount: number;
  /** How many Learner rows share the booking learner's phone (>1 = ambiguous identity). */
  learnersWithSamePhone: number;
  enrollmentId: string | null;
  llApplicationId: string | null;
  now: Date;
}

export interface PlannedWorkstream {
  kind: OpsKind;
  serviceCodes: string[];
  totalUnits: number | null;
  ownerQueue: string | null;
  nextAction: string;
  nextActionDueAt: string | null;
  enrollmentId: string | null;
  llApplicationId: string | null;
}

export interface PlannedException {
  code: string;
  kind: OpsKind | null;
  severity: "info" | "warning" | "critical";
  ownerQueue: string | null;
  detail: Record<string, unknown>;
}

export interface RoutingPlan {
  routable: boolean;
  workstreams: PlannedWorkstream[];
  exceptions: PlannedException[];
}

const PAID_STATES = new Set(["payment_completed", "confirmed"]);

function dueAt(now: Date, days: number | null): string | null {
  if (days == null) return null;
  return new Date(now.getTime() + days * 86400000).toISOString();
}

export function planRouting(input: RoutingInput, config: OpsRoutingConfig): RoutingPlan {
  const { booking } = input;
  // Never route a purchase that has not been paid. The funnel only confirms
  // after a completed payment row; this is a second, independent guard.
  if (!PAID_STATES.has(booking.status)) {
    return { routable: false, workstreams: [], exceptions: [] };
  }

  const workstreams: PlannedWorkstream[] = [];
  const exceptions: PlannedException[] = [];
  const queue = (k: OpsKind) => config.queues[k];

  const rtoCodes = input.addonCodes.filter((c) => c.startsWith("rto_"));
  const migrationCodes = rtoCodes.filter((c) => config.migrationCodes.includes(c));
  const licenceCodes = rtoCodes.filter((c) => !config.migrationCodes.includes(c));

  // --- class line: only when a course (hence classes) was purchased ----------
  const hasClasses = booking.case_type !== "rto_only" && !!booking.course_id;
  if (hasClasses) {
    const total = input.courseTotalLessons;
    let nextAction = "schedule_classes";
    if (total == null || total <= 0) {
      exceptions.push({
        code: "class_count_unknown",
        kind: "class",
        severity: "critical",
        ownerQueue: queue("class"),
        detail: { reason: "Courses.total_lessons missing for purchased course" },
      });
    } else if (input.heldLessonCount >= total) {
      // Held lessons are TENTATIVE until Operations approves them (review-booking).
      nextAction = "review_tentative_schedule";
    } else {
      exceptions.push({
        code: input.heldLessonCount === 0 ? "no_complete_schedule" : "partial_schedule",
        kind: "class",
        severity: "warning",
        ownerQueue: queue("class"),
        detail: { held: input.heldLessonCount, purchased: total },
      });
    }
    workstreams.push({
      kind: "class",
      serviceCodes: [],
      totalUnits: total != null && total > 0 ? total : null,
      ownerQueue: queue("class"),
      nextAction,
      nextActionDueAt: dueAt(input.now, config.firstActionDueDays.class),
      enrollmentId: input.enrollmentId,
      llApplicationId: null,
    });
  }

  // --- licence line: only for purchased rto_ services ------------------------
  if (licenceCodes.length > 0) {
    workstreams.push({
      kind: "licence",
      serviceCodes: licenceCodes,
      totalUnits: null,
      ownerQueue: queue("licence"),
      nextAction: "collect_documents",
      nextActionDueAt: dueAt(input.now, config.firstActionDueDays.licence),
      enrollmentId: null,
      llApplicationId: input.llApplicationId,
    });
  }

  // --- optional separate migration line (only when configured) ---------------
  if (migrationCodes.length > 0) {
    workstreams.push({
      kind: "migration",
      serviceCodes: migrationCodes,
      totalUnits: null,
      ownerQueue: queue("migration"),
      nextAction: "confirm_migration_route",
      nextActionDueAt: dueAt(input.now, config.firstActionDueDays.migration),
      enrollmentId: null,
      llApplicationId: input.llApplicationId,
    });
  }

  // --- ownership: never leave a line silently unowned ------------------------
  for (const w of workstreams) {
    if (!w.ownerQueue) {
      exceptions.push({
        code: `owner_unassigned_${w.kind}`,
        kind: w.kind,
        severity: "warning",
        ownerQueue: null,
        detail: { reason: "no owner queue configured in app_settings.ops_routing" },
      });
    }
  }

  // --- identity: never merge on a weak match ---------------------------------
  if (input.learnersWithSamePhone > 1) {
    exceptions.push({
      code: "customer_match_ambiguous",
      kind: null,
      severity: "warning",
      ownerQueue: null,
      detail: { learners_with_same_phone: input.learnersWithSamePhone },
    });
  }

  return { routable: true, workstreams, exceptions };
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

export interface RoutingResult {
  ok: boolean;
  routed: boolean;
  workstreamsCreated: OpsKind[];
  workstreamsExisting: OpsKind[];
  exceptionsOpened: string[];
  error?: string;
}

// deno-lint-ignore no-explicit-any
type Client = any;

function must<T extends { error: unknown }>(res: T, what: string): T {
  if (res.error) {
    const e = res.error as { message?: string };
    throw new Error(`${what}: ${e.message ?? String(res.error)}`);
  }
  return res;
}

/**
 * Create the operational workstreams for a paid booking. Safe to call any
 * number of times: all inserts are insert-if-absent on a unique key.
 * Never throws; a failure is returned (and recorded when the tables exist) so a
 * routing problem can never fail a customer's confirmation.
 */
export async function routeBooking(
  client: Client,
  bookingId: string,
  correlationId: string | null = null,
  now: Date = new Date(),
): Promise<RoutingResult> {
  const result: RoutingResult = {
    ok: false,
    routed: false,
    workstreamsCreated: [],
    workstreamsExisting: [],
    exceptionsOpened: [],
  };
  try {
    const { data: booking } = must(
      await client
        .from("booking")
        .select("id, learner_id, case_type, course_id, status, addon_ids")
        .eq("id", bookingId)
        .maybeSingle(),
      "load booking",
    );
    if (!booking) throw new Error("booking not found");

    const learnerId = booking.learner_id ? String(booking.learner_id) : null;

    const addonIds: string[] = Array.isArray(booking.addon_ids) ? booking.addon_ids.map(String) : [];
    let addonCodes: string[] = [];
    if (addonIds.length > 0) {
      const { data } = must(
        await client.from("booking_addons").select("code").in("id", addonIds),
        "load addons",
      );
      addonCodes = (data ?? []).map((r: { code: string }) => String(r.code));
    }

    let courseTotalLessons: number | null = null;
    if (booking.course_id) {
      const { data } = must(
        await client.from("Courses").select("total_lessons").eq("id", booking.course_id).maybeSingle(),
        "load course",
      );
      courseTotalLessons = data?.total_lessons == null ? null : Number(data.total_lessons);
    }

    const { count: heldCount } = must(
      await client
        .from("Schedule")
        .select("id", { count: "exact", head: true })
        .eq("booking_id", bookingId)
        .in("status", ["tentative", "booked"]),
      "count held lessons",
    );

    let learnersWithSamePhone = 1;
    if (learnerId) {
      const { data: l } = must(
        await client.from("Learner").select("phone").eq("id", learnerId).maybeSingle(),
        "load learner",
      );
      if (l?.phone) {
        const { count } = must(
          await client.from("Learner").select("id", { count: "exact", head: true }).eq("phone", l.phone),
          "count learners by phone",
        );
        learnersWithSamePhone = count ?? 1;
      }
    }

    let enrollmentId: string | null = null;
    if (learnerId && booking.course_id) {
      const { data } = must(
        await client
          .from("enrollment")
          .select("id")
          .eq("learner_id", learnerId)
          .eq("course_id", booking.course_id)
          .eq("acquired_via_funnel", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        "load enrollment",
      );
      enrollmentId = data?.id ? String(data.id) : null;
    }

    let llApplicationId: string | null = null;
    if (learnerId) {
      const { data } = must(
        await client
          .from("ll_applications")
          .select("id")
          .eq("learner_id", learnerId)
          .eq("acquired_via_funnel", true)
          .not("status", "in", "(dl_delivered,closed)")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        "load ll application",
      );
      llApplicationId = data?.id ? String(data.id) : null;
    }

    const { data: cfgRow } = await client
      .from("app_settings")
      .select("value")
      .eq("key", "ops_routing")
      .maybeSingle();
    const config = readOpsRoutingConfig(cfgRow?.value);

    const plan = planRouting(
      {
        booking: {
          id: String(booking.id),
          learner_id: learnerId,
          case_type: booking.case_type ?? null,
          course_id: booking.course_id ? String(booking.course_id) : null,
          status: String(booking.status),
        },
        courseTotalLessons,
        addonCodes,
        heldLessonCount: heldCount ?? 0,
        learnersWithSamePhone,
        enrollmentId,
        llApplicationId,
        now,
      },
      config,
    );

    if (!plan.routable) {
      result.ok = true;
      return result;
    }

    const wsIds = new Map<OpsKind, string>();
    for (const w of plan.workstreams) {
      const ins = await client
        .from("ops_workstream")
        .upsert(
          {
            booking_id: bookingId,
            learner_id: learnerId,
            kind: w.kind,
            status: "active",
            service_codes: w.serviceCodes,
            total_units: w.totalUnits,
            enrollment_id: w.enrollmentId,
            ll_application_id: w.llApplicationId,
            owner_queue: w.ownerQueue,
            owner_assigned_at: w.ownerQueue ? now.toISOString() : null,
            next_action: w.nextAction,
            next_action_due_at: w.nextActionDueAt,
          },
          { onConflict: "booking_id,kind", ignoreDuplicates: true },
        )
        .select("id");
      must(ins, `create ${w.kind} workstream`);
      if (ins.data && ins.data.length > 0) {
        wsIds.set(w.kind, String(ins.data[0].id));
        result.workstreamsCreated.push(w.kind);
      } else {
        result.workstreamsExisting.push(w.kind);
        const { data: ex } = must(
          await client.from("ops_workstream").select("id").eq("booking_id", bookingId).eq("kind", w.kind).maybeSingle(),
          `load existing ${w.kind} workstream`,
        );
        if (ex?.id) wsIds.set(w.kind, String(ex.id));
      }
    }

    for (const e of plan.exceptions) {
      const ins = await client
        .from("ops_exception")
        .upsert(
          {
            booking_id: bookingId,
            workstream_id: e.kind ? wsIds.get(e.kind) ?? null : null,
            learner_id: learnerId,
            code: e.code,
            severity: e.severity,
            detail: e.detail,
            owner_queue: e.ownerQueue,
          },
          { onConflict: "booking_id,code", ignoreDuplicates: true },
        )
        .select("id");
      must(ins, `open exception ${e.code}`);
      if (ins.data && ins.data.length > 0) result.exceptionsOpened.push(e.code);
    }

    const events: Array<Record<string, unknown>> = [];
    for (const kind of result.workstreamsCreated) {
      events.push({
        booking_id: bookingId,
        workstream_id: wsIds.get(kind) ?? null,
        learner_id: learnerId,
        event_type: `${kind}_workstream_created`,
        correlation_id: correlationId,
        dedupe_key: `${bookingId}:${kind}_workstream_created`,
        metadata: { kind },
      });
    }
    if (result.workstreamsCreated.length > 0) {
      events.push({
        booking_id: bookingId,
        learner_id: learnerId,
        event_type: "request_routed",
        correlation_id: correlationId,
        dedupe_key: `${bookingId}:request_routed`,
        metadata: { created: result.workstreamsCreated, exceptions: result.exceptionsOpened },
      });
    }
    if (events.length > 0) {
      must(
        await client.from("ops_event").upsert(events, { onConflict: "dedupe_key", ignoreDuplicates: true }),
        "record routing events",
      );
    }

    // A retry that gets this far supersedes an earlier recorded failure.
    must(
      await client
        .from("ops_exception")
        .update({ status: "resolved", resolved_at: now.toISOString(), resolved_by: "system", resolution_note: "routing retry succeeded" })
        .eq("booking_id", bookingId)
        .eq("code", "routing_failed")
        .eq("status", "open"),
      "resolve routing_failed",
    );

    result.ok = true;
    result.routed = true;
    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    console.error("opsRouting: routing failed", { bookingId, error: result.error });
    try {
      await client.from("ops_exception").upsert(
        {
          booking_id: bookingId,
          code: "routing_failed",
          severity: "critical",
          detail: { error: result.error?.slice(0, 300) },
        },
        { onConflict: "booking_id,code", ignoreDuplicates: true },
      );
    } catch {
      // The ops tables may not exist yet (migration pending) - nothing more to do.
    }
    return result;
  }
}
