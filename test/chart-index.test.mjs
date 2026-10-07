import assert from "node:assert/strict";
import { test } from "node:test";

import { renderChart } from "../render/chart/index.mjs";
import { inline } from "../render/index.mjs";

const LINE = `: 그림 1. 연도별 증가 | n=120
| 연도 | 2023 | 2024 | 2025 |
| 국내 |  1.2 |  3.4 |  5.6 |
| 해외 |  0.8 |  2.1 |  4.9 |
: 자료: 내부 배포`;

const draw = (lang, body, index = 1) => renderChart(lang, body, inline, index);

test("an unknown type refuses to render so the caller can fall back", () => {
  assert.equal(draw("chart {type=피자}", LINE), null);
  assert.equal(draw("chart", LINE), null);
});

test("a grid with no numbers refuses to render", () => {
  assert.equal(draw("chart {type=line}", "| a | b |\n| c | d |"), null);
  assert.equal(draw("chart {type=line}", ""), null);
});

test("a line chart becomes a figure holding one svg", () => {
  const html = draw("chart {type=line}", LINE);
  assert.ok(html.startsWith('<figure class="chart"'));
  assert.equal(html.match(/<svg/g).length, 1);
  assert.ok(html.includes("</figure>"));
});

test("the caption above becomes the figure caption and keeps its aside", () => {
  const html = draw("chart {type=line}", LINE);
  assert.ok(html.includes("그림 1. 연도별 증가"));
  assert.ok(html.includes('class="caption-aside">n=120<'));
});

test("the caption below becomes a note under the figure", () => {
  const html = draw("chart {type=line}", LINE);
  assert.ok(html.includes('<p class="chart-note">자료: 내부 배포</p>'));
});

test("caption text is rendered as Markdown, like a table caption", () => {
  const html = draw("chart {type=line}", `: **굵게**\n| x | 1 |\n| y | 2 |`);
  assert.ok(html.includes("<strong>굵게</strong>"));
});

test("the svg is labelled for a screen reader", () => {
  const html = draw("chart {type=line}", LINE);
  assert.ok(html.includes('role="img"'));
  assert.ok(html.includes('<title id="chart1-title">'));
  assert.ok(html.includes('aria-labelledby="chart1-title"'));
});

test("a grid-shaped chart also emits the data as a table", () => {
  const html = draw("chart {type=line}", LINE);
  // 접힌 채로 실려 온다. 스크린 리더는 접힘과 상관없이 읽고, 수치를 보려는
  // 독자는 열어서 본다. 표는 스스로를 자르지 못하므로(overflow가 표 박스에
  // 안 걸린다) 감싸는 div가 넘치는 폭을 맡는다.
  assert.ok(html.includes('<details class="chart-data-sheet">'));
  assert.ok(html.includes("<summary>Data</summary>"));
  assert.ok(
    html.includes('<div class="table-wrap"><table class="chart-data">'),
  );
  assert.ok(html.includes("<td>1.2</td>"));
});

test("the hidden table can be switched off", () => {
  const html = draw("chart {type=line, table=no}", LINE);
  assert.ok(!html.includes("chart-data"));
});

test("sample-shaped charts leave the hidden table off by default", () => {
  const html = draw("chart {type=box}", "| 표본 | 1 | 2 | 3 | 4 |");
  assert.ok(!html.includes("chart-data"));
});

test("two charts in one document get separate pattern namespaces", () => {
  const first = draw("chart {type=area, fill=hatch}", LINE, 1);
  const second = draw("chart {type=area, fill=hatch}", LINE, 7);
  assert.ok(first.includes("chart1-hatch-1"));
  assert.ok(second.includes("chart7-hatch-1"));
  assert.ok(!second.includes("chart1-"));
});

test("axis names are drawn when given", () => {
  const html = draw("chart {type=line, x-label=연도, y-label=가입자}", LINE);
  assert.ok(html.includes(">연도</text>"));
  assert.ok(html.includes(">가입자</text>"));
});

test("the x axis falls back to the name in the first cell", () => {
  const html = draw("chart {type=line}", LINE);
  assert.ok(html.includes(">연도</text>"));
});

test("aspect controls the height of the drawing", () => {
  const wide = draw("chart {type=line, aspect=4}", LINE);
  const tall = draw("chart {type=line, aspect=1}", LINE);
  const height = (html) => Number(html.match(/viewBox="0 0 720 ([\d.]+)"/)[1]);
  assert.ok(height(tall) > height(wide));
  assert.equal(height(wide), 180);
});

test("a legend appears once there is more than one series", () => {
  assert.ok(draw("chart {type=line}", LINE).includes("chart-legend-label"));
  const single = draw("chart {type=line}", "| x | 1 | 2 |\n| y | 3 | 4 |");
  assert.ok(!single.includes("chart-legend-label"));
});

test("legend=no removes the legend even with several series", () => {
  assert.ok(
    !draw("chart {type=line, legend=no}", LINE).includes("chart-legend-label"),
  );
});

test("grid lines can be switched off", () => {
  assert.ok(draw("chart {type=line}", LINE).includes("chart-grid-line"));
  assert.ok(
    !draw("chart {type=line, grid=no}", LINE).includes("chart-grid-line"),
  );
});

test("y-lim pins the axis instead of fitting the data", () => {
  const html = draw("chart {type=line, y-lim=0:100}", LINE);
  assert.ok(html.includes(">100</text>"));
});

test("a log y scale labels decades", () => {
  const html = draw(
    "chart {type=line, y-scale=log}",
    "| x | 1 | 2 | 3 |\n| y | 1 | 100 | 10000 |",
  );
  assert.ok(html.includes(">10000</text>") || html.includes(">1e4</text>"));
});

test("series names reach the accessible summary escaped, not raw", () => {
  const html = draw(
    "chart {type=line}",
    "| x | 1 | 2 |\n| <script> | 3 | 4 |\n| b | 1 | 2 |",
  );
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("every supported type renders clean markup from a plausible grid", () => {
  const samples = "| 대조군 | 1 | 2 | 3 | 4 | 5 |\n| 실험군 | 2 | 3 | 4 | 5 | 9 |";
  const grid = "| x | 1 | 2 | 3 |\n| 가 | 4 | 5 | 6 |\n| 나 | 2 | 3 | 1 |";
  const cases = {
    line: grid,
    step: grid,
    area: grid,
    stackplot: grid,
    scatter: grid,
    errorbar: "| x | 1 | 2 |\n| 가 | 4 | 5 |\n| 오차 | 1 | 1 | {role=error}",
    stem: grid,
    bar: grid,
    barh: grid,
    hist: samples,
    broken_barh: "| 배포 | 0:3 | 5:2 |\n| 점검 | 4:1 |",
    box: samples,
    violin: samples,
    ecdf: samples,
  };
  for (const [type, body] of Object.entries(cases))
    for (const extra of ["", ", fill=hatch", ", legend=no, grid=no"]) {
      const html = draw(`chart {type=${type}${extra}}`, body);
      assert.ok(html, `${type}${extra} produced nothing`);
      for (const bad of ["NaN", "undefined", "Infinity", "null"])
        assert.ok(!html.includes(bad), `${type}${extra} emitted ${bad}`);
      assert.ok(html.includes("</svg>"), `${type}${extra} produced no svg`);
    }
});

test("a year axis is labelled in years, not in halves of one", () => {
  const html = draw("chart {type=line}", LINE);
  const labels = [...html.matchAll(/class="chart-tick-label"[^>]*>([^<]+)</g)].map(
    (match) => match[1],
  );
  assert.ok(!labels.includes("2023.5"), labels.join(", "));
});

test("hatch patterns are only defined when a series actually uses them", () => {
  assert.ok(!draw("chart {type=area}", LINE).includes("<pattern"));
  assert.ok(draw("chart {type=area, fill=hatch}", LINE).includes("<pattern"));
});

const TWO_AXES =
  "| 시각 | 0 | 4 | 8 |\n| 요청 | 3 | 2 | 8 |\n| 오류율 | 0.4 | 0.3 | 1.2 | {axis=right}";

test("a right hand axis can be named like the left one", () => {
  const html = draw(
    "chart {type=line, y-label=요청, y2-label=오류율(%)}",
    TWO_AXES,
  );
  assert.ok(html.includes(">오류율(%)</text>"));
});

test("naming the right axis reserves room for it", () => {
  const named = draw("chart {type=line, y2-label=오류율}", TWO_AXES);
  const plain = draw("chart {type=line}", TWO_AXES);
  // The x axis line ends where the plot area ends, so a wider right margin
  // shows up as a shorter axis.
  const rightEdge = (html) =>
    Number(html.match(/class="chart-axis-line" x1="[\d.]+" y1="[\d.]+" x2="([\d.]+)"/)[1]);
  assert.ok(
    rightEdge(named) < rightEdge(plain),
    `${rightEdge(named)} vs ${rightEdge(plain)}`,
  );
});

test("no element carries two class attributes", () => {
  // A duplicate class attribute is silently dropped by the browser, so the
  // fill class would never apply and every filled shape would fall back to
  // the SVG default of solid black.
  for (const type of ["area", "stackplot", "bar", "barh", "box", "violin"]) {
    const html = draw(`chart {type=${type}}`, LINE);
    for (const tag of html.match(/<[a-z]+[^>]*>/g))
      assert.ok(
        (tag.match(/\bclass=/g) || []).length <= 1,
        `${type}: ${tag}`,
      );
  }
});

test("filled shapes are distinguishable from one another", () => {
  const html = draw("chart {type=stackplot}", LINE);
  const shades = [...html.matchAll(/class="chart-area ([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.equal(shades.length, 2);
  assert.notEqual(shades[0], shades[1]);
});

// Only the labels under the x axis. The y axis is free to round its top tick
// up to a readable number; it is the horizontal padding that put a phantom
// column either side of the data.
function xTickLabels(html) {
  return [...html.matchAll(/<text class="chart-tick-label"([^>]*)>([^<]+)</g)]
    .filter(([, attrs]) => !attrs.includes("dominant-baseline"))
    .map(([, , label]) => label);
}

test("a value axis fits the data instead of reaching past it", () => {
  const html = draw("chart {type=line}", LINE);
  const labels = xTickLabels(html);
  assert.ok(labels.includes("2023"), labels.join(", "));
  assert.ok(!labels.includes("2022"), `padded to ${labels.join(", ")}`);
  assert.ok(!labels.includes("2026"), `padded to ${labels.join(", ")}`);
});

test("a small integer x range gets no phantom columns either", () => {
  const html = draw(
    "chart {type=stem}",
    "| 지연 | 1 | 2 | 3 | 4 | 5 | 6 |\n| 계수 | 9 | 6 | 3 | 1 | -1 | -2 |",
  );
  const labels = xTickLabels(html);
  assert.ok(!labels.includes("0"), labels.join(", "));
  assert.ok(!labels.includes("7"), labels.join(", "));
});
