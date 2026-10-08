// ---------------------------------------------------------------------------
// Plan-edit engine (pre-booking "change slot" on the page-2 schedule preview).
//
// Safety model (matches the POST-booking change_booking_slot RPC):
//  - Edits are locked to the instructor who owns the current plan (the
//    customer never sees instructor identity).
//  - The plan's OWN lessons are fed back into the free-grid as sentinel
//    blocks (ownerBookingId === PLAN_EDIT_OWN). Because free-grid building
//    compares ownerBookingId to excludeBookingId, other lessons of the SAME
//    plan are pure-overlap (no travel gap) while every OTHER booking still
//    occupies [start-gap, end+gap].
//  - Lesson 1 edits REPLAN the whole course from the new first slot on the
//    same instructor (keeps "your pick is lesson 1" + consecutive rule).
//  - Later lessons are swapped in place and the full resulting plan must pass
//    validateConsecutiveRule (max 2/day, back-to-back only).
//  - create-booking re-validates the final edited plan against fresh live
//    occupancy and requires ONE instructor who can host ALL its slots, so the
//    reserve_booking_slots RPC (advisory lock + exclusion constraint) is the
//    concurrency/double-booking backstop.
// ---------------------------------------------------------------------------

import {
  areaEligibleInstructors,
  buildInstructorFreeGrid,
  candidateStartMinutes,
  instructorBookingLoad,
  planLessonsForInstructor,
  pickBestInstructor,
  validateConsecutiveRule,
  type AvailabilityInput,
  type CoursePlan,
  type CoursePlanLesson,
  type InstructorLike,
  type ScheduleBlock,
} from "./availability.ts";
import {
  dateToWeekdayLower,
  minutesToTime,
  timeToMinutes,
} from "./validation.ts";

/** Sentinel owner used for a plan's OWN lessons during free-grid building. */
export const PLAN_EDIT_OWN = "__plan-edit-own__";

export interface PlanEditSlot {
  date: string; // yyyy-mm-dd
  day: string; // monday...
  start: string; // HH:MM (candidate grid start)
  end: string; // HH:MM
}

export interface PlanEditCandidates {
  lesson: number;
  instructorId: string | null; // kept null-safe; never surfaced to the user
  slots: PlanEditSlot[];
}

export type PlanEditResult =
  | { ok: true; instructorId: string; totalLessons: number; lessons: CoursePlanLesson[] }
  | { ok: false; error: string };

function planLessons(plan: CoursePlan): CoursePlanLesson[] {
  return plan.ok && Array.isArray(plan.lessons) ? plan.lessons : [];
}

function slotDurationMinutes(input: AvailabilityInput): number {
  return Math.floor(input.slotConfig.slotDurationMinutes || 60);
}

/** Blocks for the plan's OWN lessons (pure overlap, fresh -> never expired). */
function ownBlocksFromPlan(
  plan: CoursePlan,
  opts: {
    exceptLesson?: number;
    extra?: { date: string; start: string; end: string } | null;
  },
): ScheduleBlock[] {
  const now = new Date().toISOString();
  const instructorId = String(plan.instructorId ?? "");
  const blocks: ScheduleBlock[] = [];
  for (const l of planLessons(plan)) {
    if (l.lesson === opts.exceptLesson) continue;
    const start = timeToMinutes(l.start_time);
    const end = timeToMinutes(l.end_time);
    if (start < 0 || end <= start) continue;
    blocks.push({
      instructorId,
      date: l.date,
      startMinute: start,
      endMinute: end,
      status: "pending_payment",
      bookingCreatedAt: now,
      ownerBookingId: PLAN_EDIT_OWN,
    });
  }
  if (opts.extra) {
    const start = timeToMinutes(opts.extra.start);
    const end = opts.extra.end ? timeToMinutes(opts.extra.end) : start + 60;
    if (start >= 0 && end > start) {
      blocks.push({
        instructorId,
        date: opts.extra.date,
        startMinute: start,
        endMinute: end,
        status: "pending_payment",
        bookingCreatedAt: now,
        ownerBookingId: PLAN_EDIT_OWN,
      });
    }
  }
  return blocks;
}

/**
 * Free-grid for ONE instructor: live external occupancy (with travel gap) plus
 * the plan's own lessons as plain overlap. excludeBookingId is the sentinel so
 * own blocks are never gap-buffered.
 */
function freeGridForInstructor(
  input: AvailabilityInput,
  instructorId: string,
  ownBlocks: ScheduleBlock[],
): Map<string, number[]> | null {
  const instructor = (input.instructors || []).find((i) => i.id === instructorId) ?? null;
  if (!instructor) return null;
  const duration = slotDurationMinutes(input);
  const grid = buildInstructorFreeGrid(
    {
      ...input,
      instructors: [instructor],
      blocks: [...(input.blocks || []), ...ownBlocks],
      excludeBookingId: PLAN_EDIT_OWN,
      femalePreference: false,
      femaleMode: "off",
    },
    [instructor],
    duration,
  );
  return grid.get(instructorId) ?? null;
}

function inWindow(input: AvailabilityInput, date: string): boolean {
  return Array.isArray(input.dates) && input.dates.includes(date);
}

/**
 * Free alternative times for ONE lesson of the current plan.
 * - lesson 1: recompute the full course from each candidate start on the same
 *   instructor (only starts that can still complete the whole course).
 * - lesson N>1: swap in place and keep the consecutive rule.
 */
export function computePlanEditCandidates(
  input: AvailabilityInput,
  plan: CoursePlan,
  lesson: number,
): PlanEditCandidates {
  const lessons = planLessons(plan);
  if (!plan.ok || !plan.instructorId || lessons.length === 0 || lessons.length !== plan.totalLessons) {
    return { lesson, instructorId: null, slots: [] };
  }
  if (!Number.isInteger(lesson) || lesson < 1 || lesson > plan.totalLessons) {
    return { lesson, instructorId: plan.instructorId, slots: [] };
  }
  const duration = slotDurationMinutes(input);
  const dates = Array.isArray(input.dates) ? input.dates : [];
  const slots: PlanEditSlot[] = [];
  const current = lessons.find((l) => l.lesson === lesson);

  if (lesson === 1) {
    const first = lessons[0];
    const own = ownBlocksFromPlan(plan, {
      exceptLesson: 1,
      extra: first ? { date: first.date, start: first.start_time, end: first.end_time } : null,
    });
    const free = freeGridForInstructor(input, plan.instructorId, own);
    if (!free) return { lesson, instructorId: plan.instructorId, slots };
    for (const date of dates) {
      for (const m of free.get(date) || []) {
        if (planLessonsForInstructor(free, dates, date, m, plan.totalLessons, duration)) {
          slots.push({
            date,
            day: dateToWeekdayLower(date),
            start: minutesToTime(m),
            end: minutesToTime(m + duration),
          });
        }
      }
    }
  } else {
    const own = ownBlocksFromPlan(plan, {
      exceptLesson: lesson,
      extra: current ? { date: current.date, start: current.start_time, end: current.end_time } : null,
    });
    const free = freeGridForInstructor(input, plan.instructorId, own);
    if (!free) return { lesson, instructorId: plan.instructorId, slots };
    for (const date of dates) {
      for (const m of free.get(date) || []) {
        const replaced = lessons.map((l) =>
          l.lesson === lesson
            ? { date, start_time: minutesToTime(m), end_time: minutesToTime(m + duration) }
            : { date: l.date, start_time: l.start_time, end_time: l.end_time },
        );
        if (validateConsecutiveRule(replaced) === null) {
          slots.push({
            date,
            day: dateToWeekdayLower(date),
            start: minutesToTime(m),
            end: minutesToTime(m + duration),
          });
        }
      }
    }
  }
  return { lesson, instructorId: plan.instructorId, slots };
}

/**
 * Apply an edit and return the FULL updated plan (still one instructor).
 * Re-checks live availability + grid window + consecutive rule.
 */
export function applyPlanEdit(
  input: AvailabilityInput,
  plan: CoursePlan,
  lesson: number,
  date: string,
  start: string,
): PlanEditResult {
  const lessons = planLessons(plan);
  if (!plan.ok || !plan.instructorId || lessons.length === 0 || lessons.length !== plan.totalLessons) {
    return { ok: false, error: "The schedule preview is no longer available. Please pick your first lesson again." };
  }
  if (!Number.isInteger(lesson) || lesson < 1 || lesson > plan.totalLessons) {
    return { ok: false, error: "invalid lesson" };
  }
  const duration = slotDurationMinutes(input);
  const startMinute = timeToMinutes(start);
  if (startMinute < 0 || !candidateStartMinutes(input.slotConfig).includes(startMinute)) {
    return { ok: false, error: "That lesson time is not bookable." };
  }
  if (!inWindow(input, date)) {
    return { ok: false, error: "That date is outside the booking window. Please pick another time." };
  }
  const dates = Array.isArray(input.dates) ? input.dates : [];

  if (lesson === 1) {
    const first = lessons[0];
    const own = ownBlocksFromPlan(plan, {
      exceptLesson: 1,
      extra: first ? { date: first.date, start: first.start_time, end: first.end_time } : null,
    });
    const free = freeGridForInstructor(input, plan.instructorId, own);
    if (!free || !(free.get(date) || []).includes(startMinute)) {
      return { ok: false, error: "That time is no longer free with your trainer." };
    }
    const rebuilt = planLessonsForInstructor(free, dates, date, startMinute, plan.totalLessons, duration);
    if (!rebuilt) {
      return { ok: false, error: "Your trainer can no longer fit the full course starting at that time. Please pick a different time." };
    }
    return { ok: true, instructorId: plan.instructorId, totalLessons: plan.totalLessons, lessons: rebuilt };
  }

  const current = lessons.find((l) => l.lesson === lesson);
  const own = ownBlocksFromPlan(plan, {
    exceptLesson: lesson,
    extra: current ? { date: current.date, start: current.start_time, end: current.end_time } : null,
  });
  const free = freeGridForInstructor(input, plan.instructorId, own);
  if (!free || !(free.get(date) || []).includes(startMinute)) {
    return { ok: false, error: "That time is no longer free with your trainer." };
  }
  const replaced = lessons.map((l) =>
    l.lesson === lesson
      ? { date, start_time: minutesToTime(startMinute), end_time: minutesToTime(startMinute + duration) }
      : { date: l.date, start_time: l.start_time, end_time: l.end_time },
  );
  const rule = validateConsecutiveRule(replaced);
  if (rule) {
    return { ok: false, error: "That change would break the lesson rules (2 lessons a day, back to back only). Please pick another time." };
  }
  const outLessons: CoursePlanLesson[] = replaced.map((r, i) => ({
    lesson: i + 1,
    date: r.date,
    day: dateToWeekdayLower(r.date),
    start_time: r.start_time,
    end_time: r.end_time,
  }));
  return { ok: true, instructorId: plan.instructorId, totalLessons: plan.totalLessons, lessons: outLessons };
}

/**
 * Verify a user-submitted FINAL edited plan: exact lesson count, consecutive
 * rule, every slot on the grid/window, and exactly ONE eligible instructor who
 * is free for ALL slots. Returns that instructor id (null = not bookable).
 */
export function singleInstructorForSlots(
  input: AvailabilityInput,
  slots: Array<{ date?: string; start_time?: string; end_time?: string }>,
  totalLessons: number,
): string | null {
  if (!Array.isArray(slots) || slots.length !== totalLessons) return null;
  const clean = slots.map((s) => ({
    date: String(s.date ?? ""),
    start_time: String(s.start_time ?? ""),
    end_time: String(s.end_time ?? ""),
  }));
  if (validateConsecutiveRule(clean) !== null) return null;

  const eligible = areaEligibleInstructors(input);
  const hosts: InstructorLike[] = [];
  const duration = slotDurationMinutes(input);

  for (const instr of eligible) {
    const free = buildInstructorFreeGrid(
      {
        ...input,
        instructors: [instr],
        blocks: input.blocks || [],
        excludeBookingId: PLAN_EDIT_OWN,
        femalePreference: false,
        femaleMode: "off",
      },
      [instr],
      duration,
    ).get(instr.id);
    if (!free) continue;
    let allFree = true;
    for (const s of clean) {
      const start = timeToMinutes(s.start_time);
      if (start < 0 || !(free.get(s.date) || []).includes(start)) {
        allFree = false;
        break;
      }
    }
    if (allFree) hosts.push(instr);
  }

  if (hosts.length === 0) return null;
  const now = input.now ?? new Date();
  return pickBestInstructor(hosts, {
    learner: input.learner ?? null,
    learnerArea: input.learnerArea,
    loadById: instructorBookingLoad(input.blocks, input.holdMinutes, now),
  });
}