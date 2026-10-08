// The single seam between the legacy greedy engine and the advanced beam-search
// scheduler. Pure (no Deno imports) so the Node test harness can exercise it.
//
// WHY A SEPARATE FILE
// `availability.ts` must not import `scheduler.ts` (scheduler already imports
// availability, which would create an ESM cycle), and it must not change because
// 375 existing tests pin its behaviour. So the choice is made HERE, and the two
// call sites (`get-booking-slots`, `create-booking`) import from this module
// instead of calling `computeCoursePlan` directly.
//
// FAIL-OPEN BY DESIGN
// The scheduler is off unless `booking_flow.scheduler.enabled` is literally
// `true` in the DB (see `readSchedulerConfig`). While it is off this delegates
// straight to the legacy engine, so production behaviour is byte-identical to
// today. Any throw from the advanced engine is caught and also falls back to the
// legacy plan: a scheduling experiment must never be able to take booking down.

import { computeCoursePlan, type AvailabilityInput, type CoursePlan, type SlotPointer } from "./availability.ts";
import { scheduleCourse, type SchedulerContext, type SchedulerOutcome } from "./scheduler.ts";
import { readSchedulerConfig, type SchedulerConfig } from "./schedulerConfig.ts";

export interface PlanRequest {
  input: AvailabilityInput;
  pointer: SlotPointer;
  totalLessons: number;
  /** Raw `booking_flow` value. Absent/undefined => legacy engine. */
  bookingFlow?: unknown;
  /** Pre-read scheduler config, to avoid re-parsing per call. */
  schedulerConfig?: SchedulerConfig | null;
  context?: SchedulerContext | null;
}

export interface PlanResult extends CoursePlan {
  /** Which engine produced this plan. */
  engine: "legacy" | "beam";
  algorithmVersion?: string;
  score?: number;
  components?: SchedulerOutcome["components"];
  facts?: SchedulerOutcome["facts"];
  fallbackLevel?: number;
  requiresExecutiveReview?: boolean;
  /** Present when the beam engine could not produce a plan. */
  schedulerError?: string;
  /** §29 audit records, when the caller supplied an audit sink. */
  audit?: Array<Record<string, unknown>>;
}

/**
 * Produce a complete course plan for a fixed first lesson.
 *
 * `instructorId` in the result is INTERNAL ONLY. Customer-facing responses must
 * never include it — `get-booking-slots` already strips it.
 */
export function planCourse(req: PlanRequest): PlanResult {
  const config = req.schedulerConfig ?? readSchedulerConfig(req.bookingFlow);

  if (!config.enabled) {
    return {
      ...computeCoursePlan(req.input, req.pointer, req.totalLessons),
      engine: "legacy",
    };
  }

  try {
    const audit: Array<Record<string, unknown>> = [];
    const userContext = req.context ?? {};
    const outcome = scheduleCourse({
      input: req.input,
      pointer: req.pointer,
      totalLessons: req.totalLessons,
      config,
      context: {
        ...userContext,
        onAudit: (e) => {
          audit.push(e as unknown as Record<string, unknown>);
          userContext.onAudit?.(e);
        },
      },
    });

    if (!outcome.ok) {
      // The advanced engine found nothing. Before failing the customer's
      // booking we re-run the legacy greedy pass: it is strictly more
      // permissive (no travel gate, no beam pruning), so if IT finds a plan we
      // keep the customer bookable rather than regressing to an error.
      const legacy = computeCoursePlan(req.input, req.pointer, req.totalLessons);
      if (legacy.ok) {
        return { ...legacy, engine: "legacy", schedulerError: outcome.error, audit };
      }
      return {
        ok: false,
        totalLessons: req.totalLessons,
        engine: "beam",
        algorithmVersion: config.algorithmVersion,
        requiresExecutiveReview: outcome.requiresExecutiveReview,
        schedulerError: outcome.error,
        audit,
      };
    }

    return {
      ok: true,
      instructorId: outcome.instructorId,
      totalLessons: outcome.totalLessons,
      lessons: outcome.lessons,
      engine: "beam",
      algorithmVersion: config.algorithmVersion,
      score: outcome.score,
      components: outcome.components,
      facts: outcome.facts,
      fallbackLevel: outcome.fallbackLevel,
      audit,
    };
  } catch {
    // Fail OPEN to the legacy engine — never let the scheduler break booking.
    return {
      ...computeCoursePlan(req.input, req.pointer, req.totalLessons),
      engine: "legacy",
    };
  }
}