import assert from "node:assert/strict";
import { test } from "node:test";

import { bar, barh, brokenBarh, hist, histogram } from "../render/chart/plots/bar.mjs";

// One hundred units per category band, ten per data unit.
const CTX = {
  plot: { left: 0, top: 0, width: 200, height: 100 },
  band: 100,
  cat: (index) => index * 100 + 50,
  val: (value) => 100 - value * 10,
  edge: (value) => value * 2,
  prefix: "c1",
  attrs: {},
};
const FLAT = { ...CTX, val: (value) => value * 10 };

function series(values, extra = {}) {
  return {
    name: "가",
    values,
    dash: "",
    marker: "",
    fill: "",
    shade: 0,
    axis: "left",
    errorLow: null,
    errorHigh: null,
    labels: [],
    ...extra,
  };
}

test("a lone series fills most of its band and stands on the baseline", () => {
  const { marks } = bar(CTX, [series([1, 2])]);
  assert.ok(marks.includes('x="10" y="90" width="80" height="10"'));
  assert.ok(marks.includes('x="110" y="80" width="80" height="20"'));
});

test("two series share the band side by side", () => {
  const { marks } = bar(CTX, [series([1]), series([1], { name: "나" })]);
  assert.ok(marks.includes('x="10" y="90" width="40" height="10"'));
  assert.ok(marks.includes('x="50" y="90" width="40" height="10"'));
});

test("stacked bars keep the full band and pile up", () => {
  const { marks } = bar({ ...CTX, attrs: { stacked: "" } }, [
    series([1]),
    series([2], { name: "나" }),
  ]);
  assert.ok(marks.includes('x="10" y="90" width="80" height="10"'));
  assert.ok(marks.includes('x="10" y="70" width="80" height="20"'));
});

test("a negative value hangs below the baseline instead of inverting", () => {
  const { marks } = bar(CTX, [series([-2])]);
  assert.ok(marks.includes('y="100" width="80" height="20"'));
});

test("a gap in the data draws no bar at all", () => {
  const { marks } = bar(CTX, [series([null, 1])]);
  assert.equal(marks.match(/<rect/g).length, 1);
});

test("barh lays the same bars along the other axis", () => {
  const { marks } = barh(FLAT, [series([1])]);
  assert.ok(marks.includes('x="0" y="10" width="10" height="80"'));
});

test("each bar series contributes a legend entry", () => {
  const { legend } = bar(CTX, [series([1]), series([2], { name: "나" })]);
  assert.deepEqual(
    legend.map((entry) => entry.name),
    ["가", "나"],
  );
});

test("a histogram spreads equal bins across the sample range", () => {
  const { edges, counts } = histogram([1, 2, 3, 4], { bins: 2 });
  assert.deepEqual(edges, [1, 2.5, 4]);
  assert.deepEqual(counts, [2, 2]);
});

test("the topmost sample lands in the last bin, not past it", () => {
  const { counts } = histogram([0, 10], { bins: 2 });
  assert.deepEqual(counts, [1, 1]);
});

test("an explicit low:high:count wins over the sample range", () => {
  const { edges } = histogram([1, 2], { bins: "0:10:2" });
  assert.deepEqual(edges, [0, 5, 10]);
});

test("a density histogram integrates to one", () => {
  const { counts } = histogram([1, 2, 3, 4], { bins: 2, density: true });
  const width = 1.5;
  const total = counts.reduce((sum, value) => sum + value * width, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `integrated to ${total}`);
});

test("a cumulative histogram never decreases", () => {
  const { counts } = histogram([1, 2, 3, 4], { bins: 4, cumulative: true });
  assert.deepEqual(counts, [1, 2, 3, 4]);
});

test("an empty sample set yields no bins rather than an error", () => {
  assert.deepEqual(histogram([], { bins: 4 }).counts, []);
});

test("hist draws one bar per non-empty bin", () => {
  const { marks } = hist({ ...CTX, edges: [0, 1, 2] }, [
    { name: "가", counts: [2, 0], shade: 0, fill: "" },
  ]);
  assert.equal(marks.match(/<rect/g).length, 1);
});

test("broken_barh draws one bar per interval on its own lane", () => {
  const { marks } = brokenBarh(CTX, [
    { name: "배포", spans: [{ start: 0, width: 3 }, { start: 5, width: 2 }], shade: 0, fill: "" },
  ]);
  assert.equal(marks.match(/<rect/g).length, 2);
  assert.ok(marks.includes('x="0"'));
  assert.ok(marks.includes('width="6"'));
});

test("no bar plot emits NaN when the data is entirely missing", () => {
  assert.ok(!bar(CTX, [series([null])]).marks.includes("NaN"));
  assert.ok(!barh(FLAT, [series([null])]).marks.includes("NaN"));
  assert.ok(!hist({ ...CTX, edges: [] }, []).marks.includes("NaN"));
  assert.ok(!brokenBarh(CTX, []).marks.includes("NaN"));
});
