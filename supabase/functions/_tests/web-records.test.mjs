import { test } from "node:test";
import assert from "node:assert/strict";
import {
  licenceRequirementsFromAddons,
  mergeLearnerFlags,
  phoneVariants,
  pickLearnerMatch,
  pipelineOpenedNote,
  pipelineServiceAddedNote,
  rtoOnlyEnrollmentRow,
} from "../_shared/webRecords.ts";

test("phone variants cover the three stored formats", () => {
  assert.deepEqual(phoneVariants("9000000091"), ["9000000091", "919000000091", "+919000000091"]);
  assert.deepEqual(phoneVariants("+91 90000 00091"), ["9000000091", "919000000091", "+919000000091"]);
  assert.deepEqual(phoneVariants("123"), []);
});

test("learner match prefers the canonical format, else the newest row, never invents one", () => {
  const rows = [
    { id: "a", phone: "919000000091", created_at: "2025-01-01" },
    { id: "b", phone: "9000000091", created_at: "2024-01-01" },
    { id: "c", phone: "+919000000091", created_at: "2026-01-01" },
  ];
  assert.equal(pickLearnerMatch(rows, "9000000091").id, "b");
  assert.equal(pickLearnerMatch(rows.filter((r) => r.id !== "b"), "9000000091").id, "c");
  assert.equal(pickLearnerMatch([], "9000000091"), null);
});

test("an existing learner's true licence flags are never switched off by a later purchase", () => {
  const out = mergeLearnerFlags(
    { has_a_DL: true, LL_received: true, address_change_required: true, two_wheeler_license_state: "active_dl" },
    { has_a_DL: false, LL_received: false, address_change_required: false, two_wheeler_license_state: null },
  );
  assert.equal(out.has_a_DL, true);
  assert.equal(out.LL_received, true);
  assert.equal(out.address_change_required, true);
  assert.ok(!("two_wheeler_license_state" in out), "a null answer does not erase a stored one");
});

test("a new learner takes the incoming flags unchanged", () => {
  assert.deepEqual(mergeLearnerFlags(null, { has_a_DL: false, LL_received: true }), { has_a_DL: false, LL_received: true });
  assert.equal(mergeLearnerFlags({ has_a_DL: false }, { has_a_DL: true }).has_a_DL, true);
});

test("licence requirements come from the purchased add-ons only", () => {
  assert.equal(licenceRequirementsFromAddons([]), null);
  assert.equal(licenceRequirementsFromAddons(["extra_thing"]), null);
  assert.deepEqual(licenceRequirementsFromAddons(["rto_2w_ll_dl"]), {
    vehicle_type: "two_wheeler",
    two_wheeler_requirement: "ll_and_dl",
    four_wheeler_requirement: "not_required",
    rto_address_change_required: false,
  });
  assert.equal(licenceRequirementsFromAddons(["rto_2w_dl"]).two_wheeler_requirement, "dl");
  assert.deepEqual(licenceRequirementsFromAddons(["rto_4w_ll_dl"]), {
    vehicle_type: "four_wheeler",
    two_wheeler_requirement: "not_required",
    four_wheeler_requirement: "ll_and_dl",
    rto_address_change_required: false,
  });
  const addr = licenceRequirementsFromAddons(["rto_dl_address_change"]);
  assert.equal(addr.rto_address_change_required, true);
  assert.equal(addr.vehicle_type, null);
});

test("both vehicles bought -> no single vehicle type; needs are combined, not guessed", () => {
  const r = licenceRequirementsFromAddons(["rto_2w_dl", "rto_4w_ll_dl"]);
  assert.equal(r.vehicle_type, null);
  assert.equal(r.two_wheeler_requirement, "dl");
  assert.equal(r.four_wheeler_requirement, "ll_and_dl");
  assert.equal(licenceRequirementsFromAddons(["rto_2w_dl", "rto_2w_ll_dl"]).two_wheeler_requirement, "ll_and_dl");
});

test("an rto_only purchase becomes a licence-service enrollment exactly like Sales' Licence service tab", () => {
  const row = rtoOnlyEnrollmentRow({ learnerId: "L", amount: 3499.4, installment1: 3499, installment2: 0, codes: ["rto_2w_ll_dl"] });
  assert.equal(row.case_type, "rto_only");
  assert.equal(row.course_id, null);
  assert.equal(row.amount, 3499);
  assert.equal(row.payment_status, "pending");
  assert.deepEqual(row.unlocked_lessons, []);
  assert.equal(row.acquired_via_funnel, true);
  assert.equal(row.vehicle_type, "two_wheeler");
  assert.equal(row.two_wheeler_requirement, "ll_and_dl");
});

test("pipeline notes name the website purchase / the added service", () => {
  assert.match(pipelineOpenedNote(["rto_2w_dl"]), /website purchase/);
  assert.match(pipelineServiceAddedNote(["dl_address_change_other_state"]), /dl_address_change_other_state/);
});
