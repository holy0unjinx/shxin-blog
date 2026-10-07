import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { renderChart } from "../render/chart/index.mjs";
import { inline } from "../render/index.mjs";

const stylesheet = readFileSync(new URL("../style.css", import.meta.url), "utf8");

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

function emittedClasses() {
  const found = new Set();
  for (const [type, body] of Object.entries(CASES)) {
    const html = renderChart(
      `chart {type=${type}, fill=hatch}`,
      `: 캡션 | 곁들임\n${body}\n: 주석`,
      inline,
      1,
    );
    for (const [, list] of html.matchAll(/class="([^"]+)"/g))
      for (const name of list.split(/\s+/)) found.add(name);
  }
  return found;
}

test("every class the chart renderer emits is defined in the stylesheet", () => {
  const missing = [...emittedClasses()].filter(
    (name) => !stylesheet.includes(`.${name}`),
  );
  assert.deepEqual(missing, []);
});

test("the chart palette is built from the existing ink variables", () => {
  const block = stylesheet.slice(stylesheet.indexOf("/* 그래프"));
  assert.ok(block.includes("var(--ink)"));
  assert.ok(!/#[0-9a-fA-F]{3,6}/.test(block), "a chart rule hard-codes a colour");
});

test("shades are ink at reduced opacity rather than fixed greys", () => {
  assert.ok(/\.shade-6\b[^}]*opacity/s.test(stylesheet));
});

test("the chart scrolls rather than shrinking its text away on a narrow screen", () => {
  assert.ok(/\.chart-wrap\b[^}]*overflow/s.test(stylesheet));
  assert.ok(/\.chart-svg\b[^}]*min-width/s.test(stylesheet));
});
