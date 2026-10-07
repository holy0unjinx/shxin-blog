import assert from "node:assert/strict";
import { test } from "node:test";

import {
  box,
  boxStats,
  ecdf,
  gaussianKde,
  quantile,
  silverman,
  violin,
} from "../render/chart/plots/stat.mjs";

const CTX = {
  plot: { left: 0, top: 0, width: 200, height: 100 },
  band: 100,
  cat: (index) => index * 100 + 50,
  val: (value) => 100 - value * 10,
  edge: (value) => value * 10,
  prefix: "c1",
  attrs: {},
};

const group = (values, name = "가") => ({
  name,
  values,
  shade: 0,
  fill: "",
  marker: "",
});

test("quantiles interpolate between the two neighbouring samples", () => {
  const sorted = [1, 2, 3, 4, 5];
  assert.equal(quantile(sorted, 0.25), 2);
  assert.equal(quantile(sorted, 0.5), 3);
  assert.equal(quantile(sorted, 0.75), 4);
  assert.equal(quantile([1, 2], 0.5), 1.5);
});

test("box statistics put the whiskers on the outermost sample inside the fence", () => {
  const stats = boxStats([1, 2, 3, 4, 5], 1.5);
  assert.equal(stats.q1, 2);
  assert.equal(stats.median, 3);
  assert.equal(stats.q3, 4);
  assert.equal(stats.low, 1);
  assert.equal(stats.high, 5);
  assert.deepEqual(stats.outliers, []);
});

test("a sample beyond the fence becomes an outlier, not a whisker", () => {
  const stats = boxStats([1, 2, 3, 4, 100], 1.5);
  assert.equal(stats.high, 4);
  assert.deepEqual(stats.outliers, [100]);
});

test("a single sample still yields a usable summary", () => {
  const stats = boxStats([7], 1.5);
  assert.equal(stats.median, 7);
  assert.equal(stats.low, 7);
  assert.equal(stats.high, 7);
});

test("the Silverman bandwidth grows with the spread of the data", () => {
  const tight = silverman([1, 1.1, 0.9, 1.05, 0.95]);
  const loose = silverman([1, 11, -9, 5, -5]);
  assert.ok(loose > tight);
  assert.ok(tight > 0);
});

test("a kernel density estimate peaks where the data is", () => {
  const density = gaussianKde([0, 0, 0], 1);
  assert.ok(density(0) > density(3));
});

test("a kernel density estimate integrates to about one", () => {
  const density = gaussianKde([-1, 0, 1], 0.5);
  let total = 0;
  for (let x = -8; x <= 8; x += 0.01) total += density(x) * 0.01;
  assert.ok(Math.abs(total - 1) < 0.01, `integrated to ${total}`);
});

test("a box spans the quartiles and marks the median", () => {
  const { marks } = box(CTX, [group([1, 2, 3, 4, 5])]);
  assert.ok(marks.includes('x="25" y="60" width="50" height="20"'));
  assert.ok(marks.includes('x1="25" y1="70" x2="75" y2="70"'));
});

test("box whiskers reach the fence ends", () => {
  const { marks } = box(CTX, [group([1, 2, 3, 4, 5])]);
  assert.ok(marks.includes('y2="90"'));
  assert.ok(marks.includes('y2="50"'));
});

test("outliers are drawn as individual marks", () => {
  const { marks } = box(CTX, [group([1, 2, 3, 4, 100])]);
  assert.equal(marks.match(/<circle/g).length, 1);
});

test("outliers can be switched off", () => {
  const { marks } = box({ ...CTX, attrs: { outliers: "no" } }, [
    group([1, 2, 3, 4, 100]),
  ]);
  assert.equal(marks.match(/<circle/g), null);
});

test("a horizontal box turns the same summary on its side", () => {
  const { marks } = box({ ...CTX, attrs: { horizontal: "" } }, [
    group([1, 2, 3, 4, 5]),
  ]);
  assert.ok(marks.includes('x="60" y="25" width="20" height="50"'));
});

test("a violin is a closed outline centred on its category", () => {
  const { marks } = violin(CTX, [group([1, 2, 3, 4, 5])]);
  assert.ok(marks.includes("<path"));
  assert.ok(marks.trim().endsWith("</g>"));
  assert.ok(marks.includes("Z"));
});

test("a violin never spills outside its own band", () => {
  const { marks } = violin(CTX, [group([1, 2, 3, 4, 5])]);
  const xs = [...marks.matchAll(/[ML](-?[\d.]+),/g)].map((m) => Number(m[1]));
  assert.ok(Math.min(...xs) >= 0);
  assert.ok(Math.max(...xs) <= 100);
});

test("an ecdf rises to one at the largest sample", () => {
  const { marks } = ecdf(CTX, [group([1, 2, 3, 4])]);
  assert.ok(marks.includes("L40,90"));
});

test("a complementary ecdf falls to zero instead", () => {
  const { marks } = ecdf({ ...CTX, attrs: { complementary: "" } }, [
    group([1, 2, 3, 4]),
  ]);
  assert.ok(marks.includes("L40,100"));
});

test("every statistical plot survives an empty group without emitting NaN", () => {
  for (const plot of [box, violin, ecdf]) {
    const { marks } = plot(CTX, [group([])]);
    assert.ok(!marks.includes("NaN"), plot.name);
  }
});

test("a horizontal violin runs along the value axis, not across it", () => {
  const { marks } = violin({ ...CTX, attrs: { horizontal: "" } }, [
    group([1, 2, 3, 4, 5]),
  ]);
  // Vertically the outline is centred on the category at x=50; horizontally
  // that centring has to move to y, leaving x free to follow the values.
  const ys = [...marks.matchAll(/[ML]-?[\d.]+,(-?[\d.]+)/g)].map((m) =>
    Number(m[1]),
  );
  assert.ok(Math.min(...ys) >= 10, `outline reached y=${Math.min(...ys)}`);
  assert.ok(Math.max(...ys) <= 90, `outline reached y=${Math.max(...ys)}`);
});
