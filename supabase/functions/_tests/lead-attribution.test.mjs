// Unit tests for _shared/leadAttribution.ts — pure, no DB/network.
//
// This module reproduces the LEGACY browser-side lead payloads byte-for-byte
// so that a lead looks identical in Cratio / the lead sheet whether it was
// captured by the old client code path or by the new `capture-lead` function.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PAID_MEDIUMS,
  FORM_TYPE_BY_SOURCE,
  buildLeadSource,
  buildLeadSheetPayload,
  buildCratioPayload,
  buildFullPhone,
  buildRtoLeadPayload,
  buildMyGateCategory,
  buildMyGateSheetPayload,
  sanitizeLeadUtms,
  sanitizeLeadFirstTouch,
} from "../_shared/leadAttribution.ts";

// ── buildLeadSource (ported from inlane-web/src/utils/utmTracking.js) ───────
test("buildLeadSource: a gclid means Paid Search regardless of the utms", () => {
  assert.equal(
    buildLeadSource({ gclid: "abc123", utm_source: "google", utm_medium: "organic" }, "popup"),
    "Paid Search",
  );
});

test("buildLeadSource: a paid medium means Paid Search", () => {
  for (const medium of PAID_MEDIUMS) {
    assert.equal(
      buildLeadSource({ utm_source: "google", utm_medium: medium }, "popup"),
      "Paid Search",
    );
  }
  // The medium comparison is case-insensitive.
  assert.equal(
    buildLeadSource({ utm_source: "google", utm_medium: "CPC" }, "popup"),
    "Paid Search",
  );
});

test("buildLeadSource: a direct / website / empty source collapses to the popup variant", () => {
  assert.equal(buildLeadSource({}, "popup"), "Website-Popup-Direct");
  assert.equal(buildLeadSource({}, "landing"), "Website-Direct");
  assert.equal(buildLeadSource({ utm_source: "website" }, "popup"), "Website-Popup-Direct");
  assert.equal(buildLeadSource({ utm_source: "website" }, "rto"), "Website-Direct");
  assert.equal(buildLeadSource({ utm_source: "direct" }, "popup"), "Website-Popup-Direct");
});

test("buildLeadSource: a named source becomes Website-<source> (popup gets the Popup segment)", () => {
  assert.equal(buildLeadSource({ utm_source: "facebook" }, "popup"), "Website-Popup-facebook");
  assert.equal(buildLeadSource({ utm_source: "facebook" }, "landing"), "Website-facebook");
  assert.equal(buildLeadSource({ utm_source: "facebook" }, "rto"), "Website-facebook");
});

test("buildLeadSource: the source is lowercased", () => {
  assert.equal(buildLeadSource({ utm_source: "FACEBOOK" }, "landing"), "Website-facebook");
});

test("buildLeadSource never produces a Website-website duplication", () => {
  const source = buildLeadSource({ utm_source: "website" }, "popup");
  assert.ok(!source.includes("website-website"));
});

// ── FORM_TYPE_BY_SOURCE ─────────────────────────────────────────────────────
test("FORM_TYPE_BY_SOURCE maps every canonical funnel form onto a legacy form type", () => {
  assert.equal(FORM_TYPE_BY_SOURCE.homepage_popup, "popup");
  assert.equal(FORM_TYPE_BY_SOURCE.signup_page, "landing");
  assert.equal(FORM_TYPE_BY_SOURCE.signup_page_2, "landing");
  assert.equal(FORM_TYPE_BY_SOURCE.rto_modal, "rto");
  assert.equal(FORM_TYPE_BY_SOURCE.talk_to_expert, "popup");
  assert.equal(FORM_TYPE_BY_SOURCE.booking_flow, "landing");
});

// ── buildLeadSheetPayload ───────────────────────────────────────────────────
test("buildLeadSheetPayload mirrors the legacy sheet payload", () => {
  const payload = buildLeadSheetPayload({
    email: "a@b.com",
    name: "Ramu",
    phone: "919876543210",
    license: "yes",
    city: "Bengaluru",
    area: "HSR Layout",
    adName: "Search-Generic",
    leadSource: "Website-Popup-Direct",
  });
  assert.deepEqual(payload, {
    email: "a@b.com",
    name: "Ramu",
    phone: "919876543210",
    license: "yes",
    locality: "Bengaluru, HSR Layout",
    adName: "Search-Generic",
    leadSource: "Website-Popup-Direct",
  });
});

test("buildLeadSheetPayload coerces the licence flag to yes / no", () => {
  assert.equal(
    buildLeadSheetPayload({ phone: "1", license: "no", adName: "x", leadSource: "y" }).license,
    "no",
  );
  assert.equal(
    buildLeadSheetPayload({ phone: "1", license: null, adName: "x", leadSource: "y" }).license,
    "no",
  );
  assert.equal(
    buildLeadSheetPayload({ phone: "1", license: "maybe", adName: "x", leadSource: "y" }).license,
    "no",
  );
});

test("buildLeadSheetPayload defaults the missing name / email to an empty string", () => {
  const payload = buildLeadSheetPayload({
    phone: "919876543210",
    adName: "x",
    leadSource: "y",
  });
  assert.equal(payload.email, "");
  assert.equal(payload.name, "");
  assert.equal(payload.locality, ", ");
});

// ── optional sheet keys (signup page: consent + lift activation) ─────────────
test("buildLeadSheetPayload omits the optional keys when they are not supplied", () => {
  const payload = buildLeadSheetPayload({
    phone: "919876543210",
    adName: "x",
    leadSource: "y",
  });
  assert.equal("marketingConsent" in payload, false);
  assert.equal("liftActivation" in payload, false);
  assert.equal("society" in payload, false);
});

test("buildLeadSheetPayload renders the consent flag as yes / no", () => {
  assert.equal(
    buildLeadSheetPayload({ phone: "1", adName: "x", leadSource: "y", marketingConsent: true })
      .marketingConsent,
    "yes",
  );
  assert.equal(
    buildLeadSheetPayload({ phone: "1", adName: "x", leadSource: "y", marketingConsent: false })
      .marketingConsent,
    "no",
  );
});

test("buildLeadSheetPayload carries the lift activation token and society", () => {
  const payload = buildLeadSheetPayload({
    phone: "919876543210",
    adName: "Signup Form",
    leadSource: "y",
    liftActivation: "lift_activation",
    society: "Prestige Sunrise",
  });
  assert.equal(payload.liftActivation, "lift_activation");
  assert.equal(payload.society, "Prestige Sunrise");
});

// ── buildRtoLeadPayload ─────────────────────────────────────────────────────
test("buildRtoLeadPayload mirrors the legacy RTO CRM payload", () => {
  const payload = buildRtoLeadPayload({
    email: "a@b.com",
    name: "Ramu",
    phone: "+919876543210",
    locality: "HSR Layout, Bengaluru",
    adName: "RTO Lead Form",
    leadSource: "Website-google",
    service: "RTO for 2W",
    serviceInterest: "Need help with licence",
    leadOwner: "Christopher Rosewan",
  });
  assert.deepEqual(payload, {
    email: "a@b.com",
    name: "Ramu",
    phone: "+919876543210",
    locality: "HSR Layout, Bengaluru",
    adName: "RTO Lead Form",
    leadSource: "Website-google",
    service: "RTO for 2W",
    serviceInterest: "Need help with licence",
    leadOwner: "Christopher Rosewan",
  });
});

test("buildRtoLeadPayload never sends a licence key (the RTO form has none)", () => {
  const payload = buildRtoLeadPayload({
    phone: "+919876543210",
    adName: "RTO Lead Form",
    leadSource: "y",
  });
  assert.equal("license" in payload, false);
});

test("buildRtoLeadPayload defaults the optional strings to empty strings", () => {
  const payload = buildRtoLeadPayload({
    phone: "+919876543210",
    adName: "RTO Lead Form",
    leadSource: "y",
  });
  assert.equal(payload.email, "");
  assert.equal(payload.name, "");
  assert.equal(payload.locality, "");
  assert.equal(payload.service, "");
  assert.equal(payload.serviceInterest, "");
  assert.equal(payload.leadOwner, "");
});

// ── buildMyGateCategory / buildMyGateSheetPayload ────────────────────────────
test("buildMyGateCategory routes an rto_service campaign to the licence tab", () => {
  assert.equal(
    buildMyGateCategory({ utm_content: "rto_service" }),
    "Get my licence",
  );
  assert.equal(
    buildMyGateCategory({ utm_content: "driving" }),
    "Learn to drive",
  );
  assert.equal(buildMyGateCategory({}), "Learn to drive");
});

test("buildMyGateSheetPayload mirrors the legacy MyGate sheet payload", () => {
  const sheet = buildLeadSheetPayload({
    email: "a@b.com",
    name: "Ramu",
    phone: "919876543210",
    license: "no",
    city: "Bengaluru",
    area: "HSR",
    adName: "Signup Form",
    leadSource: "Website-Direct",
  });
  const payload = buildMyGateSheetPayload(
    "Learn to drive",
    sheet,
    "2026-10-21T10:05:00.000Z",
  );
  assert.equal(payload.category, "Learn to drive");
  assert.equal(payload.submitted_at, "2026-10-21T10:05:00.000Z");
  assert.equal(payload.email, "a@b.com");
  assert.equal(payload.phone, "919876543210");
  assert.equal(payload.adName, "Signup Form");
});

// ── buildCratioPayload ──────────────────────────────────────────────────────
test("buildCratioPayload flattens the utms + first touch + sheet payload + timestamp", () => {
  const sheet = buildLeadSheetPayload({
    email: "a@b.com",
    name: "Ramu",
    phone: "919876543210",
    license: "yes",
    city: "Bengaluru",
    area: "HSR",
    adName: "Ad",
    leadSource: "Website-Popup-google",
  });
  const payload = buildCratioPayload(
    { utm_source: "google", utm_medium: "cpc", utm_campaign: "brands", gclid: "G1" },
    { first_utm_source: "google", first_captured_at: "2026-10-21T10:00:00.000Z" },
    sheet,
    "2026-10-21T10:05:00.000Z",
  );
  assert.equal(payload.utm_source, "google");
  assert.equal(payload.utm_medium, "cpc");
  assert.equal(payload.utm_campaign, "brands");
  assert.equal(payload.gclid, "G1");
  assert.equal(payload.first_utm_source, "google");
  assert.equal(payload.first_captured_at, "2026-10-21T10:00:00.000Z");
  assert.equal(payload.email, "a@b.com");
  assert.equal(payload.name, "Ramu");
  assert.equal(payload.phone, "919876543210");
  assert.equal(payload.license, "yes");
  assert.equal(payload.locality, "Bengaluru, HSR");
  assert.equal(payload.adName, "Ad");
  assert.equal(payload.leadSource, "Website-Popup-google");
  assert.equal(payload.timestamp, "2026-10-21T10:05:00.000Z");
});

test("buildCratioPayload fills the missing utm keys with empty strings (no undefined)", () => {
  const sheet = buildLeadSheetPayload({ phone: "1", adName: "x", leadSource: "y" });
  const payload = buildCratioPayload({}, {}, sheet, "2026-10-21T10:05:00.000Z");
  for (const key of [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "gclid",
    "first_utm_source",
    "first_utm_medium",
    "first_utm_campaign",
    "first_utm_term",
    "first_utm_content",
    "first_gclid",
    "first_captured_at",
  ]) {
    assert.equal(payload[key], "", `${key} must be an empty string, not undefined`);
  }
});

// ── payload parity with the legacy browser code ──────────────────────────────
test("capture-lead reproduces the legacy SignupPopup sheet + CRM payloads exactly", () => {
  // The literal payloads the browser used to build
  // (inlane-web/src/components/SignupPopup.jsx).
  const utmParams = {
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "brands",
    utm_term: "",
    utm_content: "",
    gclid: "G1",
    first_utm_source: "google",
    first_utm_medium: "cpc",
    first_utm_campaign: "brands",
    first_utm_term: "",
    first_utm_content: "",
    first_gclid: "G1",
    first_captured_at: "2026-10-21T09:00:00.000Z",
  };
  const legacySheetPayload = {
    email: "a@b.com",
    name: "Ramu",
    phone: "919876543210",
    license: "yes",
    locality: "Bengaluru, HSR Layout",
    adName: "Popup Signup Form",
    leadSource: "Website-Popup-google",
  };
  const legacyCratioPayload = {
    ...utmParams,
    ...legacySheetPayload,
    timestamp: "2026-10-21T10:05:00.000Z",
  };

  const sheet = buildLeadSheetPayload({
    email: "a@b.com",
    name: "Ramu",
    phone: "919876543210",
    license: "yes",
    city: "Bengaluru",
    area: "HSR Layout",
    adName: "Popup Signup Form",
    leadSource: "Website-Popup-google",
  });
  const cratio = buildCratioPayload(
    {
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "brands",
      utm_content: "",
      gclid: "G1",
    },
    {
      first_utm_source: "google",
      first_utm_medium: "cpc",
      first_utm_campaign: "brands",
      first_gclid: "G1",
      first_captured_at: "2026-10-21T09:00:00.000Z",
    },
    sheet,
    "2026-10-21T10:05:00.000Z",
  );

  assert.deepEqual(sheet, legacySheetPayload);
  assert.deepEqual(cratio, legacyCratioPayload);
});

test("capture-lead reproduces the legacy RTO CRM payload exactly", () => {
  // The literal payload the browser used to build
  // (inlane-web/src/components/RTOLeadModal.jsx).
  const utmParams = {
    utm_source: "facebook",
    utm_medium: "paid_social",
    utm_campaign: "rto",
    utm_term: "",
    utm_content: "",
    gclid: "",
    first_utm_source: "facebook",
    first_utm_medium: "paid_social",
    first_utm_campaign: "rto",
    first_utm_term: "",
    first_utm_content: "",
    first_gclid: "",
    first_captured_at: "2026-10-21T09:00:00.000Z",
  };
  const legacyCratioPayload = {
    ...utmParams,
    name: "Ramu",
    email: "a@b.com",
    phone: "+919876543210",
    locality: "HSR Layout",
    service: "RTO for 2W",
    serviceInterest: "Need help",
    adName: "RTO Lead Form",
    leadSource: "Website-facebook",
    leadOwner: "Christopher Rosewan",
    timestamp: "2026-10-21T10:05:00.000Z",
  };

  const rto = buildRtoLeadPayload({
    email: "a@b.com",
    name: "Ramu",
    phone: "+919876543210",
    locality: "HSR Layout",
    adName: "RTO Lead Form",
    leadSource: "Website-facebook",
    service: "RTO for 2W",
    serviceInterest: "Need help",
    leadOwner: "Christopher Rosewan",
  });
  const cratio = buildCratioPayload(
    { utm_source: "facebook", utm_medium: "paid_social", utm_campaign: "rto" },
    {
      first_utm_source: "facebook",
      first_utm_medium: "paid_social",
      first_utm_campaign: "rto",
      first_captured_at: "2026-10-21T09:00:00.000Z",
    },
    rto,
    "2026-10-21T10:05:00.000Z",
  );

  assert.deepEqual(cratio, legacyCratioPayload);
});

// ── sanitizeLeadUtms / sanitizeLeadFirstTouch ───────────────────────────────
test("sanitizeLeadUtms keeps only the known utm keys", () => {
  const out = sanitizeLeadUtms({
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "x",
    utm_term: "t",
    utm_content: "c",
    gclid: "G1",
    email: "leak@b.com",
    phone: "9000000000",
  });
  assert.deepEqual(out, {
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "x",
    utm_term: "t",
    utm_content: "c",
    gclid: "G1",
  });
});

test("sanitizeLeadUtms drops non-strings, empty values and over-long values", () => {
  const out = sanitizeLeadUtms({
    utm_source: "  google  ",
    utm_medium: 42,
    utm_campaign: "   ",
    utm_term: "x".repeat(201),
    utm_content: "ok",
  });
  assert.deepEqual(out, { utm_source: "google", utm_content: "ok" });
});

test("sanitizeLeadUtms tolerates junk input", () => {
  assert.deepEqual(sanitizeLeadUtms(null), {});
  assert.deepEqual(sanitizeLeadUtms("nope"), {});
  assert.deepEqual(sanitizeLeadUtms([1, 2]), {});
});

test("sanitizeLeadFirstTouch keeps only the known first-touch keys", () => {
  const out = sanitizeLeadFirstTouch({
    first_utm_source: "google",
    first_utm_medium: "cpc",
    first_utm_campaign: "x",
    first_utm_term: "t",
    first_utm_content: "c",
    first_gclid: "G1",
    first_captured_at: "2026-10-21T10:00:00.000Z",
    email: "leak@b.com",
  });
  assert.equal(Object.keys(out).length, 7);
  assert.equal(out.first_utm_source, "google");
  assert.equal(out.email, undefined);
});

test("sanitizeLeadFirstTouch tolerates junk input", () => {
  assert.deepEqual(sanitizeLeadFirstTouch(null), {});
  assert.deepEqual(sanitizeLeadFirstTouch([]), {});
});

// --- buildFullPhone (legacy phone-format parity) -------------------------------
test("buildFullPhone preserves the legacy '+91' country code", () => {
  // The legacy website sent `${formData.countryCode}${formData.phone}` with
  // countryCode = "+91" -> "+919876543210".
  assert.equal(buildFullPhone("+91", "9876543210"), "+919876543210");
});

test("buildFullPhone keeps a digits-only country code digits-only", () => {
  assert.equal(buildFullPhone("91", "9876543210"), "919876543210");
});

test("buildFullPhone defaults to 91 when the country code is missing", () => {
  assert.equal(buildFullPhone("", "9876543210"), "919876543210");
  assert.equal(buildFullPhone(null, "9876543210"), "919876543210");
  assert.equal(buildFullPhone(undefined, "9876543210"), "919876543210");
  assert.equal(buildFullPhone("   ", "9876543210"), "919876543210");
});

test("buildFullPhone supports another country code", () => {
  assert.equal(buildFullPhone("+1", "2025550123"), "+12025550123");
  assert.equal(buildFullPhone("44", "2079460018"), "442079460018");
});

test("buildFullPhone strips separators from the local number", () => {
  assert.equal(buildFullPhone("+91", "98765 43210"), "+919876543210");
  assert.equal(buildFullPhone("+91", "+9876543210"), "+919876543210");
});
