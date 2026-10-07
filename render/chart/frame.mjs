// Everything around the data: margins, axes, grid lines and the legend.
//
// SVG has no automatic layout, so the plot area has to be sized before a
// single mark is drawn, and sizing it needs the tick labels that the scales
// only produce once they know their size. The caller resolves that by
// measuring with provisional scales and then rebuilding them; this module
// supplies the measurements and the marks, never the loop.

import { esc } from "../escape.mjs";
import { formatTick } from "./scale.mjs";
import { lineHeight, textWidth } from "./text.mjs";

const TICK = 5;
const GAP = 4;
// 그림 가장자리에 늘 남겨 두는 여백. 글자 폭은 text.mjs가 문자마다 추정한
// 값이라 실제 렌더와 몇 단위 어긋난다. 그 오차가 뷰박스를 넘으면 브라우저에
// 따라 빈 스크롤이 생기므로, 오차가 떨어질 자리를 미리 비워 둔다.
export const EDGE = 10;
const SWATCH = 26;

// Two decimals is finer than any display can resolve at this size and keeps
// the emitted path data short and stable enough to assert on.
export function n(value) {
  return Number(Number(value).toFixed(2));
}

function widest(labels, fontSize) {
  return Math.max(0, ...labels.map((label) => textWidth(label, fontSize)));
}

/**
 * How much room the axes, their names and the legend need around the plot.
 * Rotated x labels are measured along their own length and projected back
 * onto the vertical, which is what actually consumes height.
 */
export function measureMargins({
  yLabels = [],
  xLabels = [],
  y2Labels = [],
  xLabel = "",
  yLabel = "",
  y2Label = "",
  legendRows = 0,
  fontSize = 13,
  rotate = 0,
  xOverhang = [0, 0],
}) {
  const line = lineHeight(fontSize);
  const xHeight = rotate
    ? widest(xLabels, fontSize) * Math.sin((rotate * Math.PI) / 180) + fontSize
    : line;
  return {
    left: Math.max(
      widest(yLabels, fontSize) + TICK + GAP + (yLabel ? line : 0) + EDGE,
      xOverhang[0],
    ),
    right: Math.max(
      y2Labels.length
        ? widest(y2Labels, fontSize) + TICK + GAP + (y2Label ? line : 0) + EDGE
        : EDGE,
      xOverhang[1],
    ),
    // The topmost y tick label is centred on the top of the plot, so half of
    // it hangs above the plot rectangle and needs room of its own.
    top: Math.max(EDGE, fontSize / 2 + 1),
    bottom:
      xHeight + TICK + GAP + (xLabel ? line : 0) + legendRows * line + EDGE,
  };
}

/**
 * How far the printed x tick labels reach past the left and right edges of the
 * plot, in pixels. A fitted axis puts its first and last label directly over
 * the corners, so half of each hangs outside; the margins have to cover that
 * or the label is cut off by the figure.
 */
export function xLabelOverhang({ scale, labels = [], plot, fontSize = 13, rotate = 0 }) {
  // A rotated label is anchored at its end, under its own tick, and slants
  // into the bottom margin rather than sideways past the corner.
  if (rotate) return [0, 0];
  const printed = scale.ticks.map((tick, index) =>
    String(labels[index] ?? formatTick(tick)),
  );
  const visible = thinLabels(printed, plot.width, fontSize);
  let left = 0;
  let right = 0;
  scale.ticks.forEach((tick, index) => {
    if (!visible[index]) return;
    const half = textWidth(printed[index], fontSize) / 2;
    const x = plot.left + scale.map(tick);
    left = Math.max(left, plot.left - (x - half));
    right = Math.max(right, x + half - (plot.left + plot.width));
  });
  return [left, right];
}

/**
 * Which x labels to print. Every label is measured, and when they cannot all
 * fit side by side only every k-th survives. The first is always kept, so a
 * thinned axis still starts where the data starts.
 */
export function thinLabels(labels, size, fontSize) {
  if (!labels.length) return [];
  const slot = size / labels.length;
  const needed = widest(labels, fontSize) + GAP * 2;
  const step = Math.max(1, Math.ceil(needed / slot));
  return labels.map((_, index) => index % step === 0);
}

/** Tick marks and labels along the bottom edge of the plot. */
export function axisX({
  scale,
  labels,
  plot,
  fontSize = 13,
  rotate = 0,
  show = null,
}) {
  const baseline = plot.top + plot.height;
  const visible = show || thinLabels(labels, plot.width, fontSize);
  const line = `<line class="chart-axis-line" x1="${n(plot.left)}" y1="${n(baseline)}" x2="${n(plot.left + plot.width)}" y2="${n(baseline)}"/>`;
  const marks = scale.ticks
    .map((tick, index) => {
      if (!visible[index]) return "";
      const x = n(plot.left + scale.map(tick));
      const label = esc(labels[index] ?? formatTick(tick));
      const text = rotate
        ? `<text class="chart-tick-label" text-anchor="end" transform="translate(${x} ${n(baseline + TICK + fontSize)}) rotate(-${rotate})">${label}</text>`
        : `<text class="chart-tick-label" x="${x}" y="${n(baseline + TICK + fontSize)}" text-anchor="middle">${label}</text>`;
      return `<line class="chart-tick" x1="${x}" y1="${n(baseline)}" x2="${x}" y2="${n(baseline + TICK)}"/>${text}`;
    })
    .join("");
  return line + marks;
}

/** Tick marks and labels along one vertical edge of the plot. */
export function axisY({ scale, plot, fontSize = 13, side = "left", labels = null }) {
  const right = side === "right";
  const edge = right ? plot.left + plot.width : plot.left;
  const direction = right ? 1 : -1;
  const anchor = right ? "start" : "end";
  const line = `<line class="chart-axis-line" x1="${n(edge)}" y1="${n(plot.top)}" x2="${n(edge)}" y2="${n(plot.top + plot.height)}"/>`;
  const marks = scale.ticks
    .map((tick, index) => {
      const y = n(plot.top + plot.height - scale.map(tick));
      const label = esc(labels ? labels[index] : formatTick(tick));
      return (
        `<line class="chart-tick" x1="${n(edge)}" y1="${y}" x2="${n(edge + TICK * direction)}" y2="${y}"/>` +
        `<text class="chart-tick-label" x="${n(edge + (TICK + GAP) * direction)}" y="${y}" text-anchor="${anchor}" dominant-baseline="middle">${label}</text>`
      );
    })
    .join("");
  return line + marks;
}

/** One faint line per tick, across the plot area. */
export function gridLines({ scale, plot, axis, show = true }) {
  if (!show) return "";
  return scale.ticks
    .map((tick) => {
      if (axis === "y") {
        const y = n(plot.top + plot.height - scale.map(tick));
        return `<line class="chart-grid-line" x1="${n(plot.left)}" y1="${y}" x2="${n(plot.left + plot.width)}" y2="${y}"/>`;
      }
      const x = n(plot.left + scale.map(tick));
      return `<line class="chart-grid-line" x1="${x}" y1="${n(plot.top)}" x2="${x}" y2="${n(plot.top + plot.height)}"/>`;
    })
    .join("");
}

function itemWidth(item, fontSize) {
  return SWATCH + GAP + textWidth(item.name, fontSize) + GAP * 4;
}

// Entries are packed greedily, one row at a time. A single entry wider than
// the figure still gets its own row rather than vanishing.
function packLegend(items, width, fontSize) {
  const rows = [];
  let row = [];
  let used = 0;
  for (const item of items) {
    const size = itemWidth(item, fontSize);
    if (row.length && used + size > width) {
      rows.push(row);
      row = [];
      used = 0;
    }
    row.push({ item, size });
    used += size;
  }
  if (row.length) rows.push(row);
  return rows;
}

export function legendRowCount(items, width, fontSize) {
  if (!items.length) return 0;
  return packLegend(items, width, fontSize).length;
}

/**
 * The legend, centred under the plot, one row per line that fits.
 * `width` is the room the rows may use and `left` is where that room starts,
 * so the caller can inset it from the figure edge.
 */
export function legendBlock({ items, width, top, fontSize = 13, left = 0 }) {
  if (!items.length) return "";
  const line = lineHeight(fontSize);
  return packLegend(items, width, fontSize)
    .map((row, rowIndex) => {
      const total = row.reduce((sum, entry) => sum + entry.size, 0);
      let x = left + (width - total) / 2;
      const y = top + line * (rowIndex + 0.5);
      return row
        .map(({ item, size }) => {
          const group =
            `<g transform="translate(${n(x)} ${n(y)})">${item.swatch}` +
            `<text class="chart-legend-label" x="${SWATCH + GAP}" y="0" dominant-baseline="middle">${esc(item.name)}</text></g>`;
          x += size;
          return group;
        })
        .join("");
    })
    .join("");
}
