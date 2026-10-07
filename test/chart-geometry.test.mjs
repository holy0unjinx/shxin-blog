import assert from "node:assert/strict";
import { test } from "node:test";

import { renderChart } from "../render/chart/index.mjs";
import { inline } from "../render/index.mjs";
import { textWidth } from "../render/chart/text.mjs";

const SAMPLES = "| 대조군 | 1 | 2 | 3 | 4 | 5 |\n| 실험군 | 2 | 3 | 4 | 5 | 9 |";
const GRID = "| x | 1 | 2 | 3 |\n| 가 | 4 | 5 | 6 |\n| 나 | 2 | 3 | 1 |";
const CASES = {
  line: GRID,
  step: GRID,
  area: GRID,
  stackplot: GRID,
  scatter: GRID,
  errorbar: "| x | 1 | 2 |\n| 가 | 4 | 5 |\n| 오차 | 1 | 1 | {role=error}",
  stem: GRID,
  bar: GRID,
  barh: GRID,
  hist: SAMPLES,
  broken_barh: "| 배포 | 0:3 | 5:2 |\n| 점검 | 4:1 |",
  box: SAMPLES,
  violin: SAMPLES,
  ecdf: SAMPLES,
};

// Only the drawn data is checked. Tick labels and axis names live in the
// margins by design, so they are excluded rather than asserted on.
function plotMarks(html) {
  const start = html.indexOf('<g class="chart-plot">');
  return html.slice(start, html.indexOf('<g class="chart-axis">', start));
}

function coordinates(marks) {
  const xs = [];
  const ys = [];
  for (const [, x, y] of marks.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)) {
    xs.push(Number(x));
    ys.push(Number(y));
  }
  for (const [, x, y, w, h] of marks.matchAll(
    /<rect[^>]*x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/g,
  )) {
    xs.push(Number(x), Number(x) + Number(w));
    ys.push(Number(y), Number(y) + Number(h));
  }
  for (const [, x1, y1, x2, y2] of marks.matchAll(
    /<line[^>]*x1="(-?[\d.]+)" y1="(-?[\d.]+)" x2="(-?[\d.]+)" y2="(-?[\d.]+)"/g,
  )) {
    xs.push(Number(x1), Number(x2));
    ys.push(Number(y1), Number(y2));
  }
  for (const [, cx, cy, r] of marks.matchAll(
    /<circle cx="(-?[\d.]+)" cy="(-?[\d.]+)" r="([\d.]+)"/g,
  )) {
    xs.push(Number(cx) - Number(r), Number(cx) + Number(r));
    ys.push(Number(cy) - Number(r), Number(cy) + Number(r));
  }
  return { xs, ys };
}

test("no plot draws its data outside the figure", () => {
  for (const [type, body] of Object.entries(CASES)) {
    const html = renderChart(`chart {type=${type}}`, body, inline, 1);
    const height = Number(html.match(/viewBox="0 0 720 ([\d.]+)"/)[1]);
    const { xs, ys } = coordinates(plotMarks(html));
    assert.ok(xs.length > 0, `${type} drew nothing`);
    assert.ok(Math.min(...xs) >= 0, `${type} drew left of the figure`);
    assert.ok(Math.max(...xs) <= 720, `${type} drew right of the figure`);
    assert.ok(Math.min(...ys) >= 0, `${type} drew above the figure`);
    assert.ok(
      Math.max(...ys) <= height,
      `${type} drew below the figure`,
    );
  }
});

// The left edge of the plot rectangle, read back off the drawing: the y axis
// is the vertical rule (x1 === x2) furthest to the left.
function plotLeft(html) {
  const axis = html.slice(html.indexOf('<g class="chart-axis">'));
  const edges = [];
  for (const [, x1, , x2] of axis.matchAll(
    /<line class="chart-axis-line" x1="(-?[\d.]+)" y1="(-?[\d.]+)" x2="(-?[\d.]+)"/g,
  ))
    if (x1 === x2) edges.push(Number(x1));
  return Math.min(...edges);
}

test("no plot draws its data on top of the axis labels", () => {
  for (const [type, body] of Object.entries(CASES)) {
    const html = renderChart(`chart {type=${type}}`, body, inline, 1);
    const { xs } = coordinates(plotMarks(html));
    // A fitted x axis puts the first datum on the axis line itself, so half a
    // marker sits over the tick marks by design. What may never happen is a
    // mark reaching past them into the y tick labels, which start one tick
    // (5px) plus one gap (4px) to the left of the axis.
    const limit = plotLeft(html) - 9;
    assert.ok(
      Math.min(...xs) >= limit,
      `${type} reached x=${Math.min(...xs)}, past ${limit}`,
    );
  }
});

test("a long category axis thins its labels instead of overprinting them", () => {
  const many = Array.from({ length: 60 }, (_, i) => `분기 ${i}`).join(" | ");
  const values = Array.from({ length: 60 }, (_, i) => i).join(" | ");
  const html = renderChart(
    "chart {type=line}",
    `| 구간 | ${many} |\n| 값 | ${values} |`,
    inline,
    1,
  );
  const labels = html.match(/class="chart-tick-label"/g).length;
  assert.ok(labels < 60, `printed ${labels} labels`);
  assert.ok(labels > 2, `printed only ${labels} labels`);
});

// Text is measured the same way the renderer measured it when it chose the
// margins, so a label that spills past the viewBox is a margin bug, not a
// rounding difference. Transformed labels (the rotated axis names, the
// legend) are laid out in their own coordinate system and are left out.
function textExtents(svg) {
  const boxes = [];
  for (const [, tag, label] of svg.matchAll(/<text ([^>]*)>([^<]*)</g)) {
    const attr = (name) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];
    if (attr("transform") || attr("x") === undefined) continue;
    // The legend sits in a translated group of its own, so its x and y say
    // nothing about where the text lands on the figure.
    if ((attr("class") || "").includes("legend")) continue;
    const size = (attr("class") || "").includes("point-label") ? 12 : 13;
    const width = textWidth(label, size);
    const anchor = attr("text-anchor");
    const x = Number(attr("x"));
    const y = Number(attr("y"));
    const left =
      anchor === "middle" ? x - width / 2 : anchor === "end" ? x - width : x;
    // A middle baseline centres the glyphs on y; the default baseline puts
    // them above it.
    const top = attr("dominant-baseline") === "middle" ? y - size / 2 : y - size;
    boxes.push({ label, left, right: left + width, top });
  }
  return boxes;
}

test("no label is painted outside the drawing", () => {
  for (const [type, body] of Object.entries(CASES)) {
    const html = renderChart(
      `chart {type=${type}, x-label=가로, y-label=세로}`,
      body,
      inline,
      1,
    );
    for (const box of textExtents(html)) {
      assert.ok(box.left >= 0, `${type}: "${box.label}" starts at ${box.left}`);
      assert.ok(box.right <= 720, `${type}: "${box.label}" ends at ${box.right}`);
      assert.ok(box.top >= 0, `${type}: "${box.label}" tops at ${box.top}`);
    }
  }
});

test("a point label stays inside the drawing", () => {
  const html = renderChart(
    "chart {type=line}",
    "| x | 1 | 2 | 3 |\n| y | 4 | 5 | 99 {label=정점} |",
    inline,
    1,
  );
  for (const box of textExtents(html)) {
    assert.ok(box.top >= 0, `"${box.label}" tops at ${box.top}`);
    assert.ok(box.right <= 720, `"${box.label}" ends at ${box.right}`);
  }
});
