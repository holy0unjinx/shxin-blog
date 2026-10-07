import assert from "node:assert/strict";
import { test } from "node:test";

import {
  categoryScale,
  formatTick,
  linearScale,
  logScale,
  niceTicks,
} from "../render/chart/scale.mjs";

test("nice ticks land on a 1-2-5 step and cover the data", () => {
  assert.deepEqual(niceTicks(0, 7, 5), [0, 2, 4, 6, 8]);
  assert.deepEqual(niceTicks(0, 10, 5), [0, 2, 4, 6, 8, 10]);
  assert.deepEqual(niceTicks(0, 30, 3), [0, 10, 20, 30]);
});

test("nice ticks stay free of floating point noise", () => {
  assert.deepEqual(niceTicks(0, 1, 5), [0, 0.2, 0.4, 0.6, 0.8, 1]);
});

test("nice ticks span negative to positive through zero", () => {
  assert.deepEqual(niceTicks(-3, 3, 4), [-4, -2, 0, 2, 4]);
});

test("nice ticks work far from unity", () => {
  assert.deepEqual(niceTicks(0, 0.0007, 2), [0, 0.0005, 0.001]);
});

test("a linear scale maps its padded domain onto the available size", () => {
  const scale = linearScale({ min: 0, max: 10, size: 100, pad: 0 });
  assert.deepEqual(scale.domain, [0, 10]);
  assert.equal(scale.map(0), 0);
  assert.equal(scale.map(5), 50);
  assert.equal(scale.map(10), 100);
});

test("a linear scale pads the domain out to the next tick", () => {
  const scale = linearScale({ min: 1, max: 9, size: 100 });
  assert.ok(scale.domain[0] <= 1);
  assert.ok(scale.domain[1] >= 9);
  assert.equal(scale.domain[0], scale.ticks[0]);
  assert.equal(scale.domain[1], scale.ticks.at(-1));
});

test("zero anchoring keeps the baseline in the domain", () => {
  const scale = linearScale({ min: 4, max: 9, size: 100, zero: true });
  assert.equal(scale.domain[0], 0);
});

test("a single data value still yields a usable domain", () => {
  const scale = linearScale({ min: 5, max: 5, size: 100 });
  assert.ok(scale.domain[0] < scale.domain[1]);
  assert.ok(Number.isFinite(scale.map(5)));
});

test("an all-zero series still yields a usable domain", () => {
  const scale = linearScale({ min: 0, max: 0, size: 100 });
  assert.ok(scale.domain[0] < scale.domain[1]);
  assert.ok(Number.isFinite(scale.map(0)));
});

test("a log scale puts each decade at an equal distance", () => {
  const scale = logScale({ min: 1, max: 1000, size: 90 });
  assert.deepEqual(scale.ticks, [1, 10, 100, 1000]);
  assert.equal(scale.map(1), 0);
  assert.equal(scale.map(10), 30);
  assert.equal(scale.map(1000), 90);
});

test("a log scale drops values at or below zero from its domain", () => {
  const scale = logScale({ min: -5, max: 100, size: 100 });
  assert.ok(scale.domain[0] > 0);
});

test("a category scale centres each band", () => {
  const scale = categoryScale({ labels: ["a", "b", "c", "d"], size: 80 });
  assert.equal(scale.band, 20);
  assert.equal(scale.map(0), 10);
  assert.equal(scale.map(3), 70);
});

test("tick labels drop float noise and trailing zeroes", () => {
  assert.equal(formatTick(0.30000000000000004), "0.3");
  assert.equal(formatTick(2), "2");
  assert.equal(formatTick(-1.5), "-1.5");
  assert.equal(formatTick(1000), "1000");
});

test("tick labels switch to exponent form when the plain form is unreadable", () => {
  assert.equal(formatTick(1000000), "1e6");
  assert.equal(formatTick(0.0000001), "1e-7");
});

test("integral data never gets a fractional tick", () => {
  const scale = linearScale({ min: 2023, max: 2025, size: 660, integral: true });
  assert.ok(
    scale.ticks.every((tick) => Number.isInteger(tick)),
    scale.ticks.join(", "),
  );
});

test("integral only raises the step, it never coarsens a wide range", () => {
  const plain = linearScale({ min: 0, max: 1000, size: 660 });
  const integral = linearScale({ min: 0, max: 1000, size: 660, integral: true });
  assert.deepEqual(integral.ticks, plain.ticks);
});
