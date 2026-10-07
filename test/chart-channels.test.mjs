import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DASH_COUNT,
  SHADE_COUNT,
  dashClass,
  fillAttribute,
  hatchDefs,
  markerShape,
  markerSvg,
  paint,
  swatchBox,
  swatchLine,
} from "../render/chart/channels.mjs";

test("dash classes cycle so a seventh series is still drawn", () => {
  assert.equal(dashClass(0), "dash-1");
  assert.equal(dashClass(5), `dash-${DASH_COUNT}`);
  assert.equal(dashClass(DASH_COUNT), "dash-1");
});

test("shade classes cycle the same way", () => {
  assert.equal(fillAttribute(0, "shade", "c1").className, "shade-1");
  assert.equal(fillAttribute(SHADE_COUNT, "shade", "c1").className, "shade-1");
});

test("marker shapes cycle over every distinct shape", () => {
  const shapes = new Set();
  for (let i = 0; i < 8; i++) shapes.add(markerShape(i));
  assert.equal(shapes.size, 8);
  assert.equal(markerShape(8), markerShape(0));
});

test("a marker is drawn around the point it is given", () => {
  const svg = markerSvg("square", 100, 50, 8);
  assert.ok(svg.includes('x="96"'));
  assert.ok(svg.includes('y="46"'));
});

test("a circle marker uses a circle, not a path", () => {
  assert.ok(markerSvg("circle", 10, 20, 6).startsWith("<circle"));
});

test("an unknown marker name still draws something", () => {
  assert.ok(markerSvg("피자", 10, 20, 6).length > 0);
});

test("hatch pattern ids carry the figure prefix so two charts cannot collide", () => {
  const first = hatchDefs("chart1");
  const second = hatchDefs("chart2");
  assert.ok(first.includes('id="chart1-hatch-1"'));
  assert.ok(second.includes('id="chart2-hatch-1"'));
  assert.ok(!first.includes("chart2"));
});

test("a hatch fill points at the pattern rather than a class", () => {
  assert.equal(
    fillAttribute(0, "hatch", "chart1").attr,
    ' fill="url(#chart1-hatch-1)"',
  );
});

test("fill none leaves the shape unpainted", () => {
  assert.equal(fillAttribute(0, "none", "chart1").attr, ' fill="none"');
});

test("a legend swatch for a line carries the same dash class as the line", () => {
  assert.ok(swatchLine(1, "").includes("dash-2"));
});

test("a legend swatch for a filled series repeats that series' fill", () => {
  assert.ok(swatchBox(0, "shade", "chart1").includes("chart-area-edge shade-1"));
  assert.ok(swatchBox(2, "hatch", "chart1").includes("url(#chart1-hatch-3)"));
});

test("paint merges the shade into a single class attribute", () => {
  assert.equal(paint("chart-bar", 0, "shade", "c1"), ' class="chart-bar shade-1"');
  assert.equal(
    paint("chart-bar", 0, "hatch", "c1"),
    ' class="chart-bar" fill="url(#c1-hatch-1)"',
  );
});
