import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeBookingAmounts,
  splitInstallment,
  getHalfPaymentLessons,
  rupeesToPaise,
} from "../_shared/pricing.ts";

test("rupeesToPaise avoids float drift", () => {
  assert.equal(rupeesToPaise(0.1), 10);
  assert.equal(rupeesToPaise("400"), 40000);
  assert.equal(rupeesToPaise(-5), 0);
});

test("splitInstallment: even totals split into two equal halves (paise)", () => {
  assert.equal(splitInstallment(60000, "first_half").installment1, 300);
  assert.equal(splitInstallment(60000, "first_half").installment2, 300);
});

test("splitInstallment: odd totals keep paise in one half", () => {
  const a = splitInstallment(15000, "first_half");
  assert.equal(a.installment1, 75);
  assert.equal(a.installment2, 75);
});

test("splitInstallment: full mode uses a single installment", () => {
  const a = splitInstallment(60000, "full");
  assert.equal(a.installment1, 600);
  assert.equal(a.installment2, 0);
  assert.equal(a.installmentMode, "full");
});

test("computeBookingAmounts: base price, no add-ons or discount", () => {
  const r = computeBookingAmounts(500, []);
  assert.equal(r.base, 500);
  assert.equal(r.addons, 0);
  assert.equal(r.discount, 0);
  assert.equal(r.total, 500);
});

test("computeBookingAmounts: sums add-ons", () => {
  assert.equal(computeBookingAmounts(600, [400]).total, 1000);
});

test("computeBookingAmounts: clamps discount to the payable total", () => {
  const r = computeBookingAmounts(1000, [500], 2000);
  assert.equal(r.discount, 1500);
  assert.equal(r.total, 0);
});

test("getHalfPaymentLessons mirrors web-app: <=2h => [1]", () => {
  assert.deepEqual(getHalfPaymentLessons(2), [1]);
  assert.deepEqual(getHalfPaymentLessons(1), [1]);
});

test("getHalfPaymentLessons mirrors web-app: longer courses unlock 1..total-2", () => {
  assert.deepEqual(getHalfPaymentLessons(3), [1]);
  assert.deepEqual(getHalfPaymentLessons(4), [1, 2]);
  assert.deepEqual(getHalfPaymentLessons(6), [1, 2, 3, 4]);
});