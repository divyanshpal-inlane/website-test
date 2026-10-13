// Unit tests for _shared/embed.ts — pure, no DB/network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { toOneRow } from "../_shared/embed.ts";

test("toOneRow: null -> null", () => {
  assert.equal(toOneRow(null), null);
});

test("toOneRow: undefined -> null", () => {
  assert.equal(toOneRow(undefined), null);
});

test("toOneRow: empty array -> null", () => {
  assert.equal(toOneRow([]), null);
});

test("toOneRow: single-element array -> element", () => {
  const row = { id: "l1", name: "A" };
  assert.equal(toOneRow([row]), row);
});

test("toOneRow: multi-element array -> first element", () => {
  const row = { id: "l1", name: "A" };
  assert.equal(toOneRow([row, { id: "l2" }]), row);
});

test("toOneRow: to-one object -> object (the PostgREST many-to-one shape)", () => {
  const row = { id: "l1", name: "A" };
  assert.equal(toOneRow(row), row);
});

test("toOneRow: object with numeric keys is NOT treated as an array", () => {
  const row = { 0: "fake", id: "l1" };
  assert.equal(toOneRow(row), row);
});

test("toOneRow: preserves falsy-but-present rows", () => {
  assert.equal(toOneRow(0), 0);
  assert.equal(toOneRow(""), "");
});
