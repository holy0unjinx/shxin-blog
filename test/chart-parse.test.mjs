import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseFence,
  readSamples,
  readSeries,
  readSpans,
  toNumber,
} from "../render/chart/parse.mjs";

const GRID = `: 그림 1. 연도별 증가 | n=120
| 연도 | 2023 | 2024 | 2025 |
| 국내 |  1.2 |  3.4 |  5.6 | {marker=circle}
| 해외 |  0.8 |  2.1 |  4.9 | {dash=dashed}
: 자료: 내부 배포`;

test("the fence line yields the type and the figure attributes", () => {
  const spec = parseFence("chart {type=line, x-label=연도}", GRID);
  assert.equal(spec.type, "line");
  assert.equal(spec.attrs["x-label"], "연도");
});

test("captions above and below the grid are kept apart", () => {
  const spec = parseFence("chart {type=line}", GRID);
  assert.equal(spec.captionAbove, "그림 1. 연도별 증가 | n=120");
  assert.equal(spec.captionBelow, "자료: 내부 배포");
});

test("the grid keeps one row per data line and drops the captions", () => {
  const spec = parseFence("chart {type=line}", GRID);
  assert.equal(spec.rows.length, 3);
  assert.deepEqual(
    spec.rows[1].cells.map((cell) => cell.text),
    ["국내", "1.2", "3.4", "5.6"],
  );
});

test("row attributes after the last pipe reach the series", () => {
  const spec = parseFence("chart {type=line}", GRID);
  assert.equal(spec.rows[1].attrs.marker, "circle");
  assert.equal(spec.rows[2].attrs.dash, "dashed");
});

test("a pasted table separator is ignored rather than read as data", () => {
  const spec = parseFence(
    "chart {type=bar}",
    "| 연도 | 2023 |\n| :--- | ---: |\n| 국내 | 1.2 |",
  );
  assert.equal(spec.rows.length, 2);
  assert.deepEqual(
    spec.rows[1].cells.map((cell) => cell.text),
    ["국내", "1.2"],
  );
});

test("an unknown type is reported rather than guessed", () => {
  assert.equal(parseFence("chart {type=피자}", GRID).type, "");
  assert.equal(parseFence("chart", GRID).type, "");
});

test("numbers tolerate padding and thousand separators", () => {
  assert.equal(toNumber(" 1,234 "), 1234);
  assert.equal(toNumber("-3.5"), -3.5);
  assert.equal(toNumber(""), null);
  assert.equal(toNumber("미정"), null);
});

test("reading A takes the first row as the x axis and the rest as series", () => {
  const spec = parseFence("chart {type=line}", GRID);
  const { x, series } = readSeries(spec);
  assert.equal(x.kind, "linear");
  assert.deepEqual(x.values, [2023, 2024, 2025]);
  assert.equal(x.label, "연도");
  assert.deepEqual(
    series.map((one) => one.name),
    ["국내", "해외"],
  );
  assert.deepEqual(series[0].values, [1.2, 3.4, 5.6]);
});

test("a non-numeric x row becomes a category axis", () => {
  const spec = parseFence(
    "chart {type=bar}",
    "| 분기 | 1분기 | 2분기 |\n| 매출 | 10 | 20 |",
  );
  const { x } = readSeries(spec);
  assert.equal(x.kind, "category");
  assert.deepEqual(x.labels, ["1분기", "2분기"]);
});

test("a cell may ask for guide lines down to the two axes", () => {
  const spec = parseFence(
    "chart {type=line}",
    "| x | 1 | 2 |\n| y | 4 | 5 {guide} |",
  );
  const { series } = readSeries(spec);
  assert.deepEqual(series[0].values, [4, 5]);
  assert.deepEqual(series[0].guides, [false, true]);
});

test("a blank or unreadable cell becomes a gap, not a zero", () => {
  const spec = parseFence(
    "chart {type=line}",
    "| x | 1 | 2 | 3 |\n| y | 4 |  | 미정 |",
  );
  const { series } = readSeries(spec);
  assert.deepEqual(series[0].values, [4, null, null]);
});

test("orient=columns reads each column as a series", () => {
  const spec = parseFence(
    "chart {type=line, orient=columns}",
    "| 연도 | 국내 | 해외 |\n| 2023 | 1.2 | 0.8 |\n| 2024 | 3.4 | 2.1 |",
  );
  const { x, series } = readSeries(spec);
  assert.deepEqual(x.values, [2023, 2024]);
  assert.deepEqual(
    series.map((one) => one.name),
    ["국내", "해외"],
  );
  assert.deepEqual(series[0].values, [1.2, 3.4]);
});

test("orient=columns carries the header cell attributes onto the series", () => {
  const spec = parseFence(
    "chart {type=line, orient=columns}",
    "| 연도 | {dash=dotted} 국내 |\n| 2023 | 1.2 |",
  );
  const { series } = readSeries(spec);
  assert.equal(series[0].name, "국내");
  assert.equal(series[0].dash, "dotted");
});

test("a role=error row binds to the series above it", () => {
  const spec = parseFence(
    "chart {type=errorbar}",
    "| x | 1 | 2 |\n| 측정 | 10 | 20 |\n| 오차 | 1 | 2 | {role=error}",
  );
  const { series } = readSeries(spec);
  assert.equal(series.length, 1);
  assert.deepEqual(series[0].errorLow, [1, 2]);
  assert.deepEqual(series[0].errorHigh, [1, 2]);
});

test("asymmetric error rows fill only their own side", () => {
  const spec = parseFence(
    "chart {type=errorbar}",
    "| x | 1 |\n| 측정 | 10 |\n| 아래 | 1 | {role=error-low}\n| 위 | 3 | {role=error-high}",
  );
  const { series } = readSeries(spec);
  assert.deepEqual(series[0].errorLow, [1]);
  assert.deepEqual(series[0].errorHigh, [3]);
});

test("a role=x row supplies its own x values to the series that follow", () => {
  const spec = parseFence(
    "chart {type=scatter}",
    "| x | 1 | 2 |\n| 첫째 | 10 | 20 |\n| t | 5 | 6 | {role=x}\n| 둘째 | 30 | 40 |",
  );
  const { series } = readSeries(spec);
  assert.equal(series[0].x, null);
  assert.deepEqual(series[1].x, [5, 6]);
});

test("reading C treats every row as a sample set, first row included", () => {
  const samples = readSamples(
    parseFence("chart {type=hist}", "| 대조군 | 1 | 2 | 3 |\n| 실험군 | 4 | 5 |"),
  );
  assert.deepEqual(
    samples.map((group) => group.name),
    ["대조군", "실험군"],
  );
  assert.deepEqual(samples[0].values, [1, 2, 3]);
  assert.deepEqual(samples[1].values, [4, 5]);
});

test("reading C drops unreadable samples instead of leaving gaps", () => {
  const samples = readSamples(
    parseFence("chart {type=box}", "| 표본 | 1 |  | 3 | 미정 |"),
  );
  assert.deepEqual(samples[0].values, [1, 3]);
});

test("reading D takes start:width pairs per lane", () => {
  const lanes = readSpans(
    parseFence("chart {type=broken_barh}", "| 배포 | 0:3 | 5:2 |\n| 점검 | 4:1 |"),
  );
  assert.equal(lanes[0].name, "배포");
  assert.deepEqual(lanes[0].spans, [
    { start: 0, width: 3 },
    { start: 5, width: 2 },
  ]);
  assert.deepEqual(lanes[1].spans, [{ start: 4, width: 1 }]);
});

test("reading D ignores a malformed interval", () => {
  const lanes = readSpans(
    parseFence("chart {type=broken_barh}", "| 배포 | 0:3 | 잘못 | 5 |"),
  );
  assert.deepEqual(lanes[0].spans, [{ start: 0, width: 3 }]);
});

test("an unknown series attribute value falls back instead of passing through", () => {
  const spec = parseFence(
    "chart {type=line}",
    "| x | 1 |\n| y | 2 | {dash=네온, marker=피자}",
  );
  const { series } = readSeries(spec);
  assert.equal(series[0].dash, "");
  assert.equal(series[0].marker, "");
});

test("a figure attribute is inherited by every series that does not override it", () => {
  const spec = parseFence(
    "chart {type=area, fill=hatch, marker=square}",
    "| x | 1 |\n| 가 | 2 |\n| 나 | 3 | {fill=shade}",
  );
  const { series } = readSeries(spec);
  assert.equal(series[0].fill, "hatch");
  assert.equal(series[0].marker, "square");
  assert.equal(series[1].fill, "shade");
});

test("sample groups inherit figure attributes the same way", () => {
  const groups = readSamples(
    parseFence("chart {type=box, fill=hatch}", "| 표본 | 1 | 2 |"),
  );
  assert.equal(groups[0].fill, "hatch");
});
