import assert from "node:assert/strict";
import { test } from "node:test";

import {
  area,
  errorbar,
  line,
  scatter,
  stackplot,
  stem,
  step,
} from "../render/chart/plots/xy.mjs";

// Ten user units per data unit, fifty per x step, so every expected
// coordinate below can be read straight off the data.
const CTX = {
  plot: { left: 0, top: 0, width: 200, height: 100 },
  mapX: (_series, index) => index * 50,
  mapY: (_series, value) => 100 - value * 10,
  prefix: "c1",
  attrs: {},
};

function one(values, extra = {}) {
  return [
    {
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
    },
  ];
}

test("a line joins its points in order", () => {
  const { marks } = line(CTX, one([1, 2, 3]));
  assert.ok(marks.includes('d="M0,90 L50,80 L100,70"'));
});

test("a gap breaks the line instead of interpolating across it", () => {
  const { marks } = line(CTX, one([1, 2, null, 4, 5]));
  assert.ok(marks.includes('d="M0,90 L50,80 M150,60 L200,50"'));
});

test("a line series contributes one legend entry carrying its name", () => {
  const { legend } = line(CTX, one([1, 2]));
  assert.equal(legend.length, 1);
  assert.equal(legend[0].name, "가");
});

test("an explicit dash name wins over the cycling default", () => {
  const { marks } = line(CTX, one([1, 2], { dash: "dotted" }));
  assert.ok(marks.includes("dash-3"));
});

test("a line with a marker draws one marker per point", () => {
  const { marks } = line(CTX, one([1, 2, 3], { marker: "square" }));
  assert.equal(marks.match(/<rect/g).length, 3);
});

test("a step holds its value until the next x by default", () => {
  const { marks } = step(CTX, one([1, 2]));
  assert.ok(marks.includes('d="M0,90 L50,90 L50,80"'));
});

test("step where=pre rises before the next x instead of after", () => {
  const { marks } = step({ ...CTX, attrs: { where: "pre" } }, one([1, 2]));
  assert.ok(marks.includes('d="M0,90 L0,80 L50,80"'));
});

test("an area closes down to the baseline", () => {
  const { marks } = area(CTX, one([1, 2]));
  assert.ok(marks.includes('d="M0,90 L50,80 L50,100 L0,100 Z"'));
});

test("an area fills against another series when told to", () => {
  const series = [
    ...one([3, 3]),
    { ...one([1, 1])[0], name: "나" },
  ];
  const { marks } = area({ ...CTX, attrs: { "fill-to": "나" } }, series);
  assert.ok(marks.includes('d="M0,70 L50,70 L50,90 L0,90 Z"'));
});

test("each series may name its own floor, so bands can nest", () => {
  // One {fill-to} on the fence gives every series the same floor, which is
  // one band. A confidence figure usually shows two or three nested inside
  // one another, so the floor is read off the series first.
  const series = [
    { ...one([4, 4])[0], name: "바깥상한", fillTo: "바깥하한" },
    { ...one([0, 0])[0], name: "바깥하한" },
    { ...one([3, 3])[0], name: "안쪽상한", fillTo: "안쪽하한" },
    { ...one([1, 1])[0], name: "안쪽하한" },
  ];
  const { marks, legend } = area(CTX, series);
  assert.ok(marks.includes('d="M0,60 L50,60 L50,100 L0,100 Z"'), marks);
  assert.ok(marks.includes('d="M0,70 L50,70 L50,90 L0,90 Z"'), marks);
  // A floor is not also a band of its own down to the baseline.
  assert.deepEqual(
    legend.map((item) => item.name),
    ["바깥상한", "안쪽상한"],
  );
});

test("an area edge carries the series' line pattern", () => {
  // An area is still a series, so the line channel has to reach its outline;
  // otherwise two areas drawn without a fill are the same solid stroke.
  const { marks } = area(CTX, one([1, 2], { dash: "dashed" }));
  assert.ok(marks.includes('class="chart-area-edge dash-2"'), marks);
});

test("an unfilled area is a line in the legend too", () => {
  // {fill=none} leaves only the outline on the figure, so a swatch box with
  // nothing in it would say less than the line itself.
  const { legend } = area(CTX, one([1, 2], { fill: "none", dash: "dotted" }));
  assert.ok(legend[0].swatch.includes("chart-line dash-3"), legend[0].swatch);
  assert.ok(!legend[0].swatch.includes("<rect"), legend[0].swatch);
});

test("a band that starts late is still paired with the right floor", () => {
  // A confidence band that only covers the forecast years is empty at the
  // start. The floor is indexed by the source cell, so dropping the missing
  // points must not shift the two edges against each other.
  const series = [
    ...one([null, null, 3, 3]),
    { ...one([1, 1, 1, 1])[0], name: "나" },
  ];
  const { marks } = area({ ...CTX, attrs: { "fill-to": "나" } }, series);
  assert.ok(marks.includes('d="M100,70 L150,70 L150,90 L100,90 Z"'), marks);
});

test("dash=none leaves the points without a line between them", () => {
  // matplotlib's linestyle="none": the series is its markers and nothing
  // else, which is also how an area gets a fill with no outline.
  const { marks } = line(CTX, one([1, 2], { dash: "none", marker: "circle" }));
  assert.ok(!marks.includes("chart-line"), marks);
  assert.ok(marks.includes("chart-marker"), marks);
});

test("an area with no outline is only its fill", () => {
  const { marks } = area(CTX, one([1, 2], { dash: "none" }));
  assert.ok(!marks.includes("chart-area-edge"), marks);
  assert.ok(marks.includes("chart-area "), marks);
});

test("an area carries markers and cell labels like a line does", () => {
  const { marks } = area(
    CTX,
    one([1, 2], { marker: "circle", labels: ["", "정점"] }),
  );
  assert.ok(marks.includes("chart-marker"), marks);
  assert.ok(marks.includes(">정점</text>"), marks);
});

test("a guided point drops a dotted line to each axis", () => {
  const { marks } = line(CTX, one([1, 2], { guides: [false, true] }));
  const guides = marks.match(/<line class="chart-guide"[^>]*>/g) || [];
  assert.equal(guides.length, 2);
  // The point is at (50, 80); the axes are at x = 0 and y = 100.
  assert.ok(guides[0].includes('x1="0" y1="80" x2="50" y2="80"'), guides[0]);
  assert.ok(guides[1].includes('x1="50" y1="80" x2="50" y2="100"'), guides[1]);
});

test("a stackplot piles each series on the one before it", () => {
  const series = [...one([1, 1]), { ...one([2, 2])[0], name: "나" }];
  const { marks } = stackplot(CTX, series);
  assert.ok(marks.includes('d="M0,90 L50,90 L50,100 L0,100 Z"'));
  assert.ok(marks.includes('d="M0,70 L50,70 L50,90 L0,90 Z"'));
});

test("scatter draws one marker per point and skips the gaps", () => {
  const { marks } = scatter(CTX, one([1, null, 3]));
  assert.equal(marks.match(/<circle/g).length, 2);
});

test("errorbar draws a whisker between the low and high values", () => {
  const { marks } = errorbar(
    CTX,
    one([5], { errorLow: [1], errorHigh: [2] }),
  );
  assert.ok(marks.includes('y1="60"'));
  assert.ok(marks.includes('y2="30"'));
});

test("errorbar without an error row still plots its points", () => {
  const { marks } = errorbar(CTX, one([5]));
  assert.ok(marks.includes("<circle"));
});

test("stem drops a line from the baseline to each point", () => {
  const { marks } = stem(CTX, one([2, 4]));
  assert.ok(marks.includes('x1="0" y1="100" x2="0" y2="80"'));
  assert.ok(marks.includes('x1="50" y1="100" x2="50" y2="60"'));
});

test("no plot ever emits NaN into its markup", () => {
  const broken = one([null, null]);
  for (const plot of [line, step, area, stackplot, scatter, errorbar, stem])
    assert.ok(!plot(CTX, broken).marks.includes("NaN"), plot.name);
});

test("a cell label is drawn beside the point it belongs to", () => {
  const { marks } = line(CTX, one([1, 2, 3], { labels: ["", "정점", ""] }));
  assert.equal(marks.match(/chart-point-label/g).length, 1);
  assert.ok(marks.includes(">정점</text>"));
});

test("a point label is escaped, not trusted", () => {
  const { marks } = line(CTX, one([1], { labels: ["<b>"] }));
  assert.ok(!marks.includes("<b>"));
  assert.ok(marks.includes("&lt;b&gt;"));
});

test("a label on a missing point is dropped with the point", () => {
  const { marks } = line(CTX, one([null, 2], { labels: ["없음", ""] }));
  assert.ok(!marks.includes("없음"));
});
