// Website purchase -> the SAME records a Sales-sold purchase leaves.
//
// Ops decision (2026-11-06): a website purchase must join the normal request
// stream, not run beside it. These pure helpers mirror what Learner Management
// (`create-learner-and-enrollment`) writes, so the funnel's rows look the same
// to Learner Management, Payment Tracker, the payment page and the LL -> DL
// pipeline. They are unit-tested; the edge functions only call them.

/** Phone formats that exist side by side in the Learner table (Ops handover). */
export function phoneVariants(last10: string): string[] {
  const d = String(last10 ?? "").replace(/\D/g, "").slice(-10);
  if (d.length !== 10) return [];
  return [d, `91${d}`, `+91${d}`];
}

export interface LearnerMatchRow {
  id: string;
  phone: string | null;
  created_at?: string | null;
}

/**
 * Choose the existing learner a website purchase attaches to when the same
 * number is stored in more than one format (or on more than one learner).
 * Prefers the row stored in the funnel's own canonical format, otherwise the
 * most recently created. Never invents a row; returns null for no match.
 */
export function pickLearnerMatch(rows: LearnerMatchRow[], canonicalPhone: string): LearnerMatchRow | null {
  if (!rows.length) return null;
  const byNewest = [...rows].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  return byNewest.find((r) => r.phone === canonicalPhone) ?? byNewest[0];
}

export interface LearnerFlags {
  has_a_DL?: boolean | null;
  LL_received?: boolean | null;
  address_change_required?: boolean | null;
  has_two_wheeler_license?: boolean | null;
  two_wheeler_license_state?: string | null;
  two_wheeler_licence_in_ka?: boolean | null;
  [k: string]: unknown;
}

/**
 * Licence flags for an EXISTING learner who buys again on the website: a flag
 * that is already true is never switched off by a later purchase (an existing
 * customer's record must not get worse because of a new booking). A stored
 * two-wheeler state / Karnataka answer is only replaced by a non-null answer.
 */
export function mergeLearnerFlags(existing: LearnerFlags | null, incoming: LearnerFlags): LearnerFlags {
  if (!existing) return { ...incoming };
  const out: LearnerFlags = { ...incoming };
  for (const k of ["has_a_DL", "LL_received", "address_change_required", "has_two_wheeler_license"] as const) {
    if (existing[k] === true) out[k] = true;
  }
  for (const k of ["two_wheeler_license_state", "two_wheeler_licence_in_ka"] as const) {
    if (incoming[k] == null && existing[k] != null) delete out[k];
  }
  return out;
}

export type LicenceNeed = "ll" | "dl" | "ll_and_dl" | "not_required";

export interface LicenceRequirements {
  vehicle_type: "two_wheeler" | "four_wheeler" | null;
  two_wheeler_requirement: LicenceNeed;
  four_wheeler_requirement: LicenceNeed;
  rto_address_change_required: boolean;
}

function widen(a: LicenceNeed, b: LicenceNeed): LicenceNeed {
  if (a === "not_required") return b;
  if (b === "not_required") return a;
  if (a === b) return a;
  return "ll_and_dl";
}

/**
 * The licence-requirement fields Learner Management stores on the enrollment
 * (read by the payment page, licence label and services history), derived from
 * the purchased RTO add-ons - never from the customer's qualification answers.
 * Returns null when no RTO add-on was bought (nothing to record).
 */
export function licenceRequirementsFromAddons(codes: string[]): LicenceRequirements | null {
  const rto = codes.filter((c) => c.startsWith("rto_"));
  if (rto.length === 0) return null;
  let two: LicenceNeed = "not_required";
  let four: LicenceNeed = "not_required";
  let address = false;
  for (const c of rto) {
    if (c === "rto_2w_ll_dl") two = widen(two, "ll_and_dl");
    else if (c === "rto_2w_dl") two = widen(two, "dl");
    else if (c === "rto_4w_ll_dl") four = widen(four, "ll_and_dl");
    else if (c === "rto_dl_address_change") address = true;
  }
  const vehicle =
    two !== "not_required" && four === "not_required"
      ? "two_wheeler"
      : four !== "not_required" && two === "not_required"
        ? "four_wheeler"
        : null;
  return {
    vehicle_type: vehicle,
    two_wheeler_requirement: two,
    four_wheeler_requirement: four,
    rto_address_change_required: address,
  };
}

/** Enrollment columns for a licence-service (rto_only) purchase, as Sales' "Licence service" tab writes them. */
export function rtoOnlyEnrollmentRow(args: {
  learnerId: string;
  amount: number;
  installment1: number;
  installment2: number;
  codes: string[];
}) {
  const req = licenceRequirementsFromAddons(args.codes);
  return {
    learner_id: args.learnerId,
    course_id: null,
    amount: Math.round(args.amount),
    payment_status: "pending",
    status: "pending",
    installment_mode: "full",
    installment1_amount: args.installment1,
    installment2_amount: args.installment2,
    unlocked_lessons: [] as number[],
    progress: {},
    case_type: "rto_only",
    acquired_via_funnel: true,
    ...(req ?? {}),
  };
}

/** Pipeline event note, in the style the hosted app writes for its own automatic journeys. */
export function pipelineOpenedNote(codes: string[]): string {
  return `Journey opened automatically on website purchase (${codes.join(", ") || "RTO service"})`;
}

export function pipelineServiceAddedNote(added: string[]): string {
  return `New service added by a website purchase: ${added.join(", ")}`;
}

/** Whether a booking's learner should be told thanks the way a Sales payment-link customer is. */
export const THANK_YOU_MESSAGE_TYPE = "WEBAPP_THANK_YOU_FOR_PAYMENT_GENERIC";
