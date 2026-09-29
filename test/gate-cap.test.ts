import assert from "node:assert/strict";
import { test } from "node:test";
import { CAP_SHARE_ENV, DEFAULT_SHARE, gateCap, shareOf } from "../shared/gate-cap.ts";

test("the default share is half the machine's processors, and the setting is named in one place", () => {
  assert.equal(DEFAULT_SHARE, 0.5);
  assert.equal(CAP_SHARE_ENV, "MWP_GATE_SHARE");
  assert.equal(gateCap(8, {}), 4);
  assert.equal(gateCap(16, {}), 8);
});

test("the cap rounds down and never falls below one gate", () => {
  assert.equal(gateCap(7, {}), 3);
  assert.equal(gateCap(2, {}), 1);
  assert.equal(gateCap(1, {}), 1);
  assert.equal(gateCap(0, {}), 1);
  assert.equal(gateCap(8, { [CAP_SHARE_ENV]: "0.01" }), 1);
});

test("the setting adjusts the share; a value that is not a share in (0, 1] falls back to the default (T4)", () => {
  assert.equal(shareOf({ [CAP_SHARE_ENV]: "0.25" }), 0.25);
  assert.equal(gateCap(8, { [CAP_SHARE_ENV]: "0.25" }), 2);
  assert.equal(gateCap(8, { [CAP_SHARE_ENV]: "1" }), 8);
  for (const bad of ["", "abc", "0", "-0.5", "1.5", "NaN", "Infinity", "0.5x"]) {
    assert.equal(shareOf({ [CAP_SHARE_ENV]: bad }), DEFAULT_SHARE, `"${bad}" falls back`);
  }
  assert.equal(shareOf({}), DEFAULT_SHARE);
});

test("a processor count that is not a positive whole number still gives a usable cap", () => {
  assert.equal(gateCap(Number.NaN, {}), 1);
  assert.equal(gateCap(-4, {}), 1);
});
