import assert from "node:assert/strict";
import { test } from "node:test";

import { hoverLayer } from "../render/chart/hover.mjs";

const PLOT = { left: 40, top: 10, width: 200, height: 100 };

// Two columns fifty units apart, values mapped ten units per unit of data.
const COLUMNS = {
  labels: ["2016", "2017"],
  band: 50,
  at: (index) => 65 + index * 50,
  vertical: true,
};

const SERIES = [
  { name: "국내", values: [1, 2] },
  { name: "해외", values: [3, null] },
];

const mapValue = (_series, value) => 110 - value * 10;

function layer(extra = {}) {
  return hoverLayer({
    columns: COLUMNS,
    series: SERIES,
    plot: PLOT,
    mapValue,
    ...extra,
  });
}

test("a family that offers no columns gets no hover layer", () => {
  assert.equal(hoverLayer({ columns: null, series: SERIES, plot: PLOT }), "");
});

test("each column gets one hit area spanning the plot", () => {
  const hits = layer().match(/<rect class="chart-hit"[^>]*>/g);
  assert.equal(hits.length, 2);
  assert.ok(hits[0].includes('x="40" y="10"'), hits[0]);
  assert.ok(hits[0].includes('height="100"'), hits[0]);
});

test("a tip reads the column label and every value in it", () => {
  const marks = layer();
  const lines = [...marks.matchAll(/class="chart-tip-line"[^>]*>([^<]*)</g)].map(
    (match) => match[1],
  );
  assert.deepEqual(lines, ["2016", "국내 1", "해외 3", "2017", "국내 2"]);
});

test("a tip stays inside the plot", () => {
  const marks = layer();
  for (const [, x, y, w, h] of marks.matchAll(
    /<rect class="chart-tip-box" x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/g,
  )) {
    assert.ok(Number(x) >= PLOT.left, `box at x=${x}`);
    assert.ok(Number(x) + Number(w) <= PLOT.left + PLOT.width, `box ends at ${Number(x) + Number(w)}`);
    assert.ok(Number(y) >= PLOT.top, `box at y=${y}`);
    assert.ok(Number(y) + Number(h) <= PLOT.top + PLOT.height, `box ends at ${Number(y) + Number(h)}`);
  }
});

test("a column with nothing in it gets no tip at all", () => {
  const marks = hoverLayer({
    columns: COLUMNS,
    series: [{ name: "국내", values: [null, 2] }],
    plot: PLOT,
    mapValue,
  });
  assert.equal((marks.match(/chart-tip-box/g) || []).length, 1);
  assert.equal((marks.match(/chart-hit/g) || []).length, 1);
});

test("a sideways reading lays its hit areas in rows", () => {
  const marks = hoverLayer({
    columns: { ...COLUMNS, vertical: false },
    series: SERIES,
    plot: PLOT,
    mapValue: (_series, value) => 40 + value * 10,
  });
  const hit = marks.match(/<rect class="chart-hit"[^>]*>/)[0];
  assert.ok(hit.includes('x="40"'), hit);
  assert.ok(hit.includes('width="200"'), hit);
  assert.ok(hit.includes('height="50"'), hit);
});

test("tip text is escaped, not trusted", () => {
  const marks = hoverLayer({
    columns: { ...COLUMNS, labels: ["<b>", "2017"] },
    series: [{ name: "<i>", values: [1, 2] }],
    plot: PLOT,
    mapValue,
  });
  assert.ok(!marks.includes("<b>"), marks);
  assert.ok(!marks.includes("<i>"), marks);
});
