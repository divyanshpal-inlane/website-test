// Lead attribution + downstream payload builders.
//
// The server is the AUTHORITATIVE forwarder for the CRM (Cratio) and the lead
// sheet (Google Apps Script). This module reproduces, byte-for-byte, the
// payloads the website used to build in the browser, so a lead looks identical
// in the CRM whether it was captured by the old client-side code path or by
// `capture-lead`.
//
// It is a pure module (no Deno imports) so the Node test harness can assert
// payload parity with the legacy client behaviour.
//
// Provenance: mirrored from `inlane-web/src/utils/utmTracking.js`
// (`buildLeadSource`) and `inlane-web/src/components/SignupPopup.jsx` +
// `inlane-web/src/pages/Signup.jsx` (payload shapes).

/**
 * Mediums that count as paid traffic.
 * Must match `deriveLeadSource` in the web-app's `demo-page-forward-lead`
 * edge function so Cratio sees a single mapping rule for paid traffic.
 */
export const PAID_MEDIUMS = ["cpc", "ppc", "paid", "paidsearch", "paid_search"];

/** The form kinds the website distinguishes. */
export type LeadFormType = "popup" | "landing" | "rto";

/** Maps a canonical funnel form id onto the legacy Cratio form type. */
export const FORM_TYPE_BY_SOURCE: Record<string, LeadFormType> = {
  homepage_popup: "popup",
  signup_page: "landing",
  signup_page_2: "landing",
  rto_modal: "rto",
  talk_to_expert: "popup",
  booking_flow: "landing",
};

/** The attribution bag a client may send. */
export interface LeadUtms {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  gclid?: string;
}

/** First-touch attribution (mirrors the client's `first_*` fields). */
export interface LeadFirstTouch {
  first_utm_source?: string;
  first_utm_medium?: string;
  first_utm_campaign?: string;
  first_utm_term?: string;
  first_utm_content?: string;
  first_gclid?: string;
  first_captured_at?: string;
}

/**
 * Build a consistent `lead_source` string for Cratio.
 * Avoids "Website-website" style duplication.
 *
 * Ported verbatim from `inlane-web/src/utils/utmTracking.js`.
 */
export function buildLeadSource(utms: LeadUtms, formType: LeadFormType): string {
  if (
    utms.gclid ||
    PAID_MEDIUMS.includes((utms.utm_medium || "").toLowerCase())
  ) {
    return "Paid Search";
  }
  const src = (utms.utm_source || "direct").toLowerCase();
  if (src === "website" || src === "direct" || src === "") {
    return formType === "popup" ? "Website-Popup-Direct" : "Website-Direct";
  }
  return formType === "popup" ? `Website-Popup-${src}` : `Website-${src}`;
}

/**
 * Build the full phone number used in the downstream payloads.
 *
 * The legacy website sent `${countryCode}${phone}` where `countryCode` was the
 * raw country `<select>` value — "+91" — so the delivered phone was
 * "+919876543210". A leading "+" is therefore preserved when the client sends
 * one; a digits-only country code ("91") stays digits-only.
 */
export function buildFullPhone(
  countryCode: string | null | undefined,
  phone10: string,
): string {
  const raw = (countryCode ?? "").trim();
  const cc = raw.replace(/\D/g, "") || "91";
  const prefix = raw.startsWith("+") ? "+" : "";
  const local = (phone10 ?? "").replace(/\D/g, "");
  return `${prefix}${cc}${local}`;
}

/** The payload the lead sheet (Google Apps Script) expects. */
export interface LeadSheetPayload {
  email: string;
  name: string;
  phone: string;
  license: string;
  locality: string;
  adName: string;
  leadSource: string;
  /** Only present when the form collects an explicit consent checkbox. */
  marketingConsent?: string;
  /** Only present for lift/QR activation leads. */
  liftActivation?: string;
  /** Only present for lift/QR activation leads. */
  society?: string;
}

/**
 * The RTO form has its own CRM payload shape: it never asks for a licence,
 * it carries the service + free-text interest, and it is routed to a named
 * owner. Mirrors `inlane-web/src/components/RTOLeadModal.jsx`.
 */
export interface RtoLeadPayload {
  email: string;
  name: string;
  phone: string;
  locality: string;
  adName: string;
  leadSource: string;
  service: string;
  serviceInterest: string;
  leadOwner: string;
}

/** Any flat string record that can be spread into a downstream payload. */
export type LeadBasePayload = Record<string, string>;

/** The payload the CRM (Cratio) expects. */
export interface CratioPayload extends LeadBasePayload {
  timestamp: string;
  [key: string]: string;
}

export interface LeadPayloadInput {
  email?: string | null;
  name?: string | null;
  /** Full phone number including the country code, digits only. */
  phone: string;
  /** "yes" | "no" — does the customer hold a driving licence. */
  license?: string | null;
  city?: string | null;
  area?: string | null;
  /** The ad/creative name shown in the CRM. */
  adName: string;
  leadSource: string;
  /** Only sent when the form collects an explicit consent checkbox. */
  marketingConsent?: boolean | null;
  /** Lift/QR activation source token (`?src=`). */
  liftActivation?: string | null;
  /** Lift/QR activation society (`?society=`). */
  society?: string | null;
}

/**
 * Build the Google-Sheets payload.
 *
 * Mirrors the legacy client payload exactly:
 *   { email, name, phone: "<cc><phone>", license: "yes"|"no",
 *     locality: "<city>, <area>", adName, leadSource }
 * plus the optional keys the signup page adds
 * (`marketingConsent`, `liftActivation`, `society`).
 */
export function buildLeadSheetPayload(input: LeadPayloadInput): LeadSheetPayload {
  const license = input.license === "yes" ? "yes" : "no";
  const payload: LeadSheetPayload = {
    email: input.email ?? "",
    name: input.name ?? "",
    phone: input.phone ?? "",
    license,
    locality: `${input.city || ""}, ${input.area || ""}`,
    adName: input.adName,
    leadSource: input.leadSource,
  };
  if (input.marketingConsent !== null && input.marketingConsent !== undefined) {
    payload.marketingConsent = input.marketingConsent ? "yes" : "no";
  }
  if (input.liftActivation) payload.liftActivation = input.liftActivation;
  if (input.society) payload.society = input.society;
  return payload;
}

/**
 * Build the RTO CRM payload.
 *
 * Mirrors the legacy client payload exactly:
 *   { email, name, phone: "<cc><phone>", locality, adName, leadSource,
 *     service, serviceInterest, leadOwner }
 *
 * Note: the legacy RTO form sends NO `license` key and NO Google-Sheets post —
 * only the CRM webhook. Callers must therefore use `sheets_target: "none"`.
 */
export function buildRtoLeadPayload(input: {
  email?: string | null;
  name?: string | null;
  phone: string;
  locality?: string | null;
  adName: string;
  leadSource: string;
  service?: string | null;
  serviceInterest?: string | null;
  leadOwner?: string | null;
}): RtoLeadPayload {
  return {
    email: input.email ?? "",
    name: input.name ?? "",
    phone: input.phone ?? "",
    locality: input.locality ?? "",
    adName: input.adName,
    leadSource: input.leadSource,
    service: input.service ?? "",
    serviceInterest: input.serviceInterest ?? "",
    leadOwner: input.leadOwner ?? "",
  };
}

/** The MyGate sheet tabs a lift/QR activation lead can land in. */
export const MYGATE_CATEGORIES = ["Learn to drive", "Get my licence"] as const;

/**
 * Derive the MyGate sheet tab from the last-touch attribution.
 *
 * Mirrors the legacy client rule in `inlane-web/src/pages/Signup.jsx`:
 *   `utm_content === "rto_service" ? "Get my licence" : "Learn to drive"`
 */
export function buildMyGateCategory(utms: LeadUtms): string {
  return utms.utm_content === "rto_service" ? "Get my licence" : "Learn to drive";
}

/**
 * Build the MyGate sheet payload.
 *
 * Mirrors the legacy client payload exactly:
 *   { category, submitted_at: "<iso>", ...leadSheetPayload }
 */
export function buildMyGateSheetPayload(
  category: string,
  sheetPayload: LeadSheetPayload,
  submittedAt: string,
): LeadBasePayload {
  return {
    category,
    submitted_at: submittedAt,
    ...sheetPayload,
  };
}

/**
 * Build the Cratio payload.
 *
 * Mirrors the legacy client payload exactly:
 *   { ...utmParams, ...leadBasePayload, timestamp }
 */
export function buildCratioPayload(
  utms: LeadUtms,
  firstTouch: LeadFirstTouch,
  leadBasePayload: LeadBasePayload,
  timestamp: string,
): CratioPayload {
  const utmParams: Record<string, string> = {
    utm_source: utms.utm_source || "",
    utm_medium: utms.utm_medium || "",
    utm_campaign: utms.utm_campaign || "",
    utm_term: utms.utm_term || "",
    utm_content: utms.utm_content || "",
    gclid: utms.gclid || "",
    first_utm_source: firstTouch.first_utm_source || "",
    first_utm_medium: firstTouch.first_utm_medium || "",
    first_utm_campaign: firstTouch.first_utm_campaign || "",
    first_utm_term: firstTouch.first_utm_term || "",
    first_utm_content: firstTouch.first_utm_content || "",
    first_gclid: firstTouch.first_gclid || "",
    first_captured_at: firstTouch.first_captured_at || "",
  };
  return {
    ...utmParams,
    ...leadBasePayload,
    timestamp,
  };
}

/**
 * Extract the attribution values a client is allowed to send.
 * Unknown keys and non-strings are dropped.
 */
export function sanitizeLeadUtms(input: unknown): LeadUtms {
  const out: Record<string, string> = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  const allowed = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "gclid",
  ];
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const k = key.trim().toLowerCase();
    if (!allowed.includes(k)) continue;
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 200) continue;
    out[k] = trimmed;
  }
  return out as LeadUtms;
}

/** Extract the first-touch attribution a client is allowed to send. */
export function sanitizeLeadFirstTouch(input: unknown): LeadFirstTouch {
  const out: Record<string, string> = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  const allowed = [
    "first_utm_source",
    "first_utm_medium",
    "first_utm_campaign",
    "first_utm_term",
    "first_utm_content",
    "first_gclid",
    "first_captured_at",
  ];
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const k = key.trim().toLowerCase();
    if (!allowed.includes(k)) continue;
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 200) continue;
    out[k] = trimmed;
  }
  return out as LeadFirstTouch;
}
