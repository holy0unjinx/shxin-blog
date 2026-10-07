import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EDGE,
  axisX,
  axisY,
  gridLines,
  legendBlock,
  legendRowCount,
  measureMargins,
  thinLabels,
} from "../render/chart/frame.mjs";
import { categoryScale, linearScale } from "../render/chart/scale.mjs";

const BASE = {
  yLabels: ["0", "5", "10"],
  xLabels: ["2023", "2024"],
  xLabel: "",
  yLabel: "",
  fontSize: 13,
};

test("a wider y tick label pushes the left margin out", () => {
  const narrow = measureMargins(BASE).left;
  const wide = measureMargins({ ...BASE, yLabels: ["100000"] }).left;
  assert.ok(wide > narrow);
});

test("an axis name reserves one more line of margin", () => {
  const without = measureMargins(BASE);
  const withNames = measureMargins({ ...BASE, xLabel: "연도", yLabel: "값" });
  assert.ok(withNames.left > without.left);
  assert.ok(withNames.bottom > without.bottom);
});

test("a right hand axis reserves margin only when it has ticks", () => {
  assert.equal(measureMargins(BASE).right, EDGE);
  assert.ok(measureMargins({ ...BASE, y2Labels: ["1000"] }).right > EDGE);
});

test("legend rows add height at the bottom", () => {
  const plain = measureMargins(BASE).bottom;
  const withLegend = measureMargins({ ...BASE, legendRows: 2 }).bottom;
  assert.ok(withLegend > plain);
});

test("rotated x labels reserve height by their length", () => {
  const flat = measureMargins({ ...BASE, xLabels: ["아주 긴 분기 이름"] });
  const tilted = measureMargins({
    ...BASE,
    xLabels: ["아주 긴 분기 이름"],
    rotate: 45,
  });
  assert.ok(tilted.bottom > flat.bottom);
});

test("labels that fit are all kept", () => {
  assert.deepEqual(thinLabels(["1", "2", "3"], 300, 13), [true, true, true]);
});

test("labels that would collide are thinned but keep the first", () => {
  const labels = Array.from({ length: 40 }, (_, i) => `항목 ${i}`);
  const shown = thinLabels(labels, 200, 13);
  assert.equal(shown[0], true);
  assert.ok(shown.filter(Boolean).length < labels.length);
});

test("thinning never drops every label", () => {
  const labels = Array.from({ length: 500 }, (_, i) => `아주 긴 이름 ${i}`);
  assert.ok(thinLabels(labels, 100, 13).filter(Boolean).length >= 1);
});

test("the x axis draws one tick and one label per shown category", () => {
  const scale = categoryScale({ labels: ["가", "나", "다"], size: 300 });
  const svg = axisX({ scale, labels: ["가", "나", "다"], plot: { left: 40, top: 10, width: 300, height: 200 }, fontSize: 13 });
  assert.equal(svg.match(/<text/g).length, 3);
  assert.ok(svg.includes(">가</text>"));
});

test("the y axis labels every tick it is given", () => {
  const scale = linearScale({ min: 0, max: 10, size: 200, pad: 0 });
  const svg = axisY({ scale, plot: { left: 40, top: 10, width: 300, height: 200 }, fontSize: 13 });
  assert.equal(svg.match(/<text/g).length, scale.ticks.length);
});

test("the y axis on the right anchors its text on the other side", () => {
  const scale = linearScale({ min: 0, max: 10, size: 200, pad: 0 });
  const right = axisY({ scale, plot: { left: 40, top: 10, width: 300, height: 200 }, fontSize: 13, side: "right" });
  assert.ok(right.includes('text-anchor="start"'));
});

test("grid lines are drawn once per tick and can be switched off", () => {
  const scale = linearScale({ min: 0, max: 10, size: 200, pad: 0 });
  const plot = { left: 40, top: 10, width: 300, height: 200 };
  assert.equal(
    gridLines({ scale, plot, axis: "y" }).match(/<line/g).length,
    scale.ticks.length,
  );
  assert.equal(gridLines({ scale, plot, axis: "y", show: false }), "");
});

test("the legend draws one swatch and one name per series", () => {
  const svg = legendBlock({
    items: [
      { name: "국내", swatch: '<line class="dash-1"/>' },
      { name: "해외", swatch: '<line class="dash-2"/>' },
    ],
    width: 720,
    top: 400,
    fontSize: 13,
  });
  assert.equal(svg.match(/<text/g).length, 2);
  assert.ok(svg.includes(">국내</text>"));
  assert.ok(svg.includes(">해외</text>"));
});

test("legend text is escaped rather than trusted", () => {
  const svg = legendBlock({
    items: [{ name: "<script>", swatch: "" }],
    width: 720,
    top: 0,
    fontSize: 13,
  });
  assert.ok(!svg.includes("<script>"));
  assert.ok(svg.includes("&lt;script&gt;"));
});

test("legend rows wrap once the entries no longer fit on one line", () => {
  const one = [{ name: "가", swatch: "" }];
  const many = Array.from({ length: 12 }, (_, i) => ({
    name: `아주 긴 계열 이름 ${i}`,
    swatch: "",
  }));
  assert.equal(legendRowCount(one, 720, 13), 1);
  assert.ok(legendRowCount(many, 720, 13) > 1);
});

test("an empty legend takes no rows", () => {
  assert.equal(legendRowCount([], 720, 13), 0);
});
