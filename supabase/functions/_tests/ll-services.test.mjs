// Unit tests for _shared/llServices.ts - funnel add-on codes -> LL board service keys.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FUNNEL_CODE_TO_LL_KEYS, addedServices, llServicesFor } from "../_shared/llServices.ts";

test("raw funnel codes are kept (audit/analytics unchanged) and board keys are added", () => {
  assert.deepEqual(llServicesFor(["rto_2w_dl"]), ["rto_2w_dl", "dl", "dl_2w"]);
  assert.deepEqual(llServicesFor(["rto_2w_ll_dl"]), ["rto_2w_ll_dl", "ll", "dl", "ll_2w", "dl_2w"]);
  assert.deepEqual(llServicesFor(["rto_4w_ll_dl"]), ["rto_4w_ll_dl", "ll", "dl", "ll_4w", "dl_4w"]);
});

test("address change maps to the board's DL address change (other state -> KA) service", () => {
  assert.deepEqual(llServicesFor(["rto_dl_address_change"]), ["rto_dl_address_change", "dl_address_change_other_state"]);
});

test("multiple services are de-duplicated", () => {
  assert.deepEqual(llServicesFor(["rto_2w_ll_dl", "rto_4w_ll_dl"]), [
    "rto_2w_ll_dl", "rto_4w_ll_dl", "ll", "dl", "ll_2w", "dl_2w", "ll_4w", "dl_4w",
  ]);
});

test("merging into an existing application keeps its services and adds only what is new", () => {
  const merged = llServicesFor(["rto_dl_address_change"], ["ll", "dl"]);
  assert.deepEqual(merged, ["ll", "dl", "rto_dl_address_change", "dl_address_change_other_state"]);
  assert.deepEqual(llServicesFor(["rto_2w_dl"], ["dl", "rto_2w_dl", "dl_2w"]), ["dl", "rto_2w_dl", "dl_2w"]);
});

test("an unknown code is preserved without inventing a board key", () => {
  assert.deepEqual(llServicesFor(["rto_future_thing"]), ["rto_future_thing"]);
});

test("no codes -> nothing is invented (not even Classes)", () => {
  assert.deepEqual(llServicesFor([]), []);
  assert.deepEqual(llServicesFor([], ["ll"]), ["ll"]);
  assert.deepEqual(llServicesFor([], [], { includeClasses: true }), []);
});

test("course + RTO purchase also ticks Classes; an RTO-only purchase does not", () => {
  assert.deepEqual(llServicesFor(["rto_dl_address_change"], [], { includeClasses: true }), [
    "rto_dl_address_change", "dl_address_change_other_state", "classes",
  ]);
  assert.deepEqual(llServicesFor(["rto_2w_dl"], [], { includeClasses: false }), ["rto_2w_dl", "dl", "dl_2w"]);
});

test("addedServices reports only the genuinely new services (used for the 'service added' note)", () => {
  assert.deepEqual(addedServices(["ll", "dl"], ["ll", "dl", "dl_address_change_other_state"]), ["dl_address_change_other_state"]);
  assert.deepEqual(addedServices(["ll"], ["ll"]), []);
});

test("every mapped board key is one the LL board defines (webapp LL_SERVICES, incl. the new vehicle-specific ticks)", () => {
  const BOARD_KEYS = new Set([
    "ll", "classes", "dl", "dl_renewal", "address_change_ka", "name_correction", "backlog", "duplicate_dl", "idp",
    "dl_address_change_other_state", "ll_2w", "dl_2w", "ll_4w", "dl_4w",
  ]);
  for (const keys of Object.values(FUNNEL_CODE_TO_LL_KEYS)) for (const k of keys) assert.ok(BOARD_KEYS.has(k), k);
});
