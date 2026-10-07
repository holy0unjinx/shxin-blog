// Fence body -> chart spec.
//
// A chart is written as a pipe grid, the same grid a table is written in, so
// the splitters come from the table renderer rather than being written twice.
// This module knows nothing about SVG: it turns text into numbers and hands
// them on.
//
// Four readings share one grid, and each plot type declares which one it uses:
//
//   A. series x x   first row is the x axis, every later row is a series
//   B. own x        a {role=x} row supplies x to the series that follow it
//   C. samples      every row is a set of raw samples, first row included
//   D. spans        every row is a lane of "start:width" intervals

import { flag, integer, pick, readAttrs } from "../attrs.mjs";
import { grid } from "../data.mjs";
import { cells, isTableRule, splitRow, TABLE_CAPTION } from "../table.mjs";

export const TYPES = new Set([
  "line",
  "step",
  "area",
  "stackplot",
  "scatter",
  "errorbar",
  "stem",
  "bar",
  "barh",
  "hist",
  "broken_barh",
  "box",
  "violin",
  "ecdf",
]);

export const DASH = new Set([
  // As in matplotlib, "none" is a line pattern too: it draws no line, which
  // leaves a series its markers, or an area its fill with no outline.
  "none",
  "solid",
  "dashed",
  "dotted",
  "dashdot",
  "longdash",
  "dashdotdot",
]);

export const MARKER = new Set([
  "none",
  "circle",
  "triangle",
  "square",
  "diamond",
  "plus",
  "cross",
  "triangle-down",
  "star",
]);

const FILL = new Set(["shade", "hatch", "none"]);
const AXIS = new Set(["left", "right"]);
const ROLE = new Set(["value", "x", "error", "error-low", "error-high"]);

// Keys a cell may carry. Braces at the end of a cell are attributes only when
// every key inside is one of these, so text that merely ends in braces stays
// literal — the same rule the table renderer uses.
const SERIES_KEYS = [
  "dash",
  "marker",
  "shade",
  "fill",
  "fill-to",
  "axis",
  "role",
  "width",
];
const CELL_KEYS = new Set([...SERIES_KEYS, "label", "guide"]);

const LEADING_ATTRS = /^\{([^}]*)\}\s*/;
const TRAILING_ATTRS = /\s*\{([^}]*)\}$/;
const SPAN = /^(-?[\d.,]+)\s*:\s*(-?[\d.,]+)$/;

/** A cell value as a number, or null when the cell holds no usable number. */
export function toNumber(text) {
  const cleaned = String(text ?? "").replace(/[\s,]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function readCell(text) {
  const lead = text.match(LEADING_ATTRS);
  let body = lead ? text.slice(lead[0].length) : text;
  const attrs = lead ? readAttrs(lead[1]) : {};

  const tail = body.match(TRAILING_ATTRS);
  const tailAttrs = tail ? readAttrs(tail[1]) : {};
  const tailKeys = Object.keys(tailAttrs);
  if (tailKeys.length > 0 && tailKeys.every((key) => CELL_KEYS.has(key))) {
    body = body.slice(0, tail.index);
    Object.assign(attrs, tailAttrs);
  }
  return { text: body.trim(), attrs };
}

/**
 * Splits a fence into its type, its figure attributes, its two captions and
 * its data rows. Table separators and stray prose are dropped, so a grid
 * pasted straight out of a table still parses.
 */
export function parseFence(lang, body, options = {}) {
  const brace = String(lang).match(/\{([^}]*)\}/);
  const attrs = brace ? readAttrs(brace[1]) : {};
  const rows = [];
  let captionAbove = "";
  let captionBelow = "";

  let source = String(body);
  // {src=data/subs.csv} points at a file instead of carrying the grid inline.
  // A grid written in the fence wins: a file that goes missing must not leave
  // a figure quietly empty when the numbers were there all along.
  if (attrs.src && !source.split(/\r?\n/).some((line) => line.includes("|"))) {
    const text = options.resolve?.(attrs.src);
    const loaded =
      typeof text === "string"
        ? grid(attrs.src, text, {
            rows: attrs["row-range"] || "",
            columns: attrs.columns || "",
          })
        : null;
    if (loaded)
      source += `\n${loaded.map((row) => `| ${row.join(" | ")} |`).join("\n")}`;
  }

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const caption = trimmed.match(TABLE_CAPTION);
    if (caption) {
      if (rows.length) captionBelow = caption[1];
      else captionAbove = caption[1];
      continue;
    }
    if (!trimmed.includes("|") || isTableRule(line)) continue;
    const { body: rowBody, attrs: rowAttrs } = splitRow(line);
    rows.push({ cells: cells(rowBody).map(readCell), attrs: rowAttrs });
  }

  return {
    type: pick(attrs, "type", TYPES),
    attrs,
    captionAbove,
    captionBelow,
    rows,
  };
}

// Turning the grid on its side lets an author keep one column per series,
// which is how data usually arrives. A series then takes its attributes from
// the header cell that names it, since that is where they are written.
function orient(spec) {
  if (spec.attrs.orient !== "columns") return spec.rows;
  const width = Math.max(0, ...spec.rows.map((row) => row.cells.length));
  const blank = { text: "", attrs: {} };
  const rows = [];
  for (let column = 0; column < width; column++)
    rows.push({
      cells: spec.rows.map((row) => row.cells[column] || blank),
      attrs: spec.rows[0]?.cells[column]?.attrs || {},
    });
  return rows;
}

// A series takes its own attributes first and the figure's next, the same
// cell > row > column cascade the table renderer uses one level up.
function seriesStyle(attrs, figure = {}) {
  const either = (key, allowed, fallback = "") =>
    pick(attrs, key, allowed, fallback) || pick(figure, key, allowed, fallback);
  return {
    dash: either("dash", DASH),
    marker: either("marker", MARKER),
    fill: either("fill", FILL),
    // Free text rather than a set: it names another series, and a name the
    // grid never uses simply finds nothing and falls back to the baseline.
    fillTo: attrs["fill-to"] ?? figure["fill-to"] ?? "",
    axis: either("axis", AXIS, "left") || "left",
    shade: clamp(integer(attrs, "shade", integer(figure, "shade", 0)), 0, 6),
    width: toNumber(attrs.width),
  };
}

/**
 * Reading A and B. The first row is the x axis; every later row is a series
 * unless its {role} says it carries error bars or its own x values instead.
 */
export function readSeries(spec) {
  const rows = orient(spec);
  const [header, ...rest] = rows;
  const heads = header ? header.cells.slice(1) : [];
  const values = heads.map((cell) => toNumber(cell.text));
  const numeric = heads.length > 0 && values.every((value) => value !== null);

  const x = {
    kind: numeric ? "linear" : "category",
    label: header ? header.cells[0]?.text || "" : "",
    labels: heads.map((cell) => cell.text),
    values: numeric ? values : heads.map((_, index) => index),
  };

  const series = [];
  let ownX = null;
  for (const row of rest) {
    const numbers = row.cells.slice(1).map((cell) => toNumber(cell.text));
    const role = pick(row.attrs, "role", ROLE, "value") || "value";
    const last = series.at(-1);

    if (role === "x") {
      ownX = numbers;
      continue;
    }
    if (role !== "value" && last) {
      if (role !== "error-high") last.errorLow = numbers;
      if (role !== "error-low") last.errorHigh = numbers;
      continue;
    }
    series.push({
      name: row.cells[0]?.text || "",
      values: numbers,
      labels: row.cells.slice(1).map((cell) => cell.attrs.label || ""),
      guides: row.cells
        .slice(1)
        .map((cell) => flag(cell.attrs, "guide") === true),
      x: ownX,
      errorLow: null,
      errorHigh: null,
      ...seriesStyle(row.attrs, spec.attrs),
    });
  }
  return { x, series };
}

/**
 * Reading C. Sample data has no shared x, so there is no header row: every
 * row is one group of raw observations named by its first cell.
 */
export function readSamples(spec) {
  return orient(spec).map((row) => ({
    name: row.cells[0]?.text || "",
    values: row.cells
      .slice(1)
      .map((cell) => toNumber(cell.text))
      .filter((value) => value !== null),
    ...seriesStyle(row.attrs, spec.attrs),
  }));
}

/** Reading D. Each row is a lane of "start:width" intervals. */
export function readSpans(spec) {
  return orient(spec).map((row) => ({
    name: row.cells[0]?.text || "",
    spans: row.cells
      .slice(1)
      .map((cell) => cell.text.match(SPAN))
      .filter(Boolean)
      .map((match) => ({
        start: toNumber(match[1]),
        width: toNumber(match[2]),
      }))
      .filter((span) => span.start !== null && span.width !== null),
    ...seriesStyle(row.attrs, spec.attrs),
  }));
}
