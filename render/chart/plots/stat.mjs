// Plots that summarise a distribution rather than plot it point by point:
// box, violin and ecdf. Each takes groups of raw samples — reading C — so the
// summarising happens here rather than in the author's spreadsheet.

import { markerSvg, paint, swatchBox } from "../channels.mjs";
import { n } from "../frame.mjs";

const BOX_SPAN = 0.5;
const VIOLIN_SPAN = 0.8;
const GRID = 48;

/** The p-quantile with linear interpolation between neighbouring samples. */
export function quantile(sorted, p) {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const rest = position - lower;
  const next = sorted[lower + 1];
  return next === undefined
    ? sorted[lower]
    : sorted[lower] + rest * (next - sorted[lower]);
}

/**
 * The five-number summary plus outliers. Whiskers stop at the outermost
 * sample still inside 1.5 interquartile ranges, which is where matplotlib
 * puts them; anything past that is drawn as its own point.
 */
export function boxStats(values, whisker = 1.5) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const q1 = quantile(sorted, 0.25);
  const median = quantile(sorted, 0.5);
  const q3 = quantile(sorted, 0.75);
  const fence = (q3 - q1) * whisker;
  const inside = sorted.filter(
    (value) => value >= q1 - fence && value <= q3 + fence,
  );
  return {
    q1,
    median,
    q3,
    low: inside.length ? inside[0] : sorted[0],
    high: inside.length ? inside.at(-1) : sorted.at(-1),
    outliers: sorted.filter(
      (value) => value < q1 - fence || value > q3 + fence,
    ),
  };
}

/** Silverman's rule of thumb, guarded so a constant sample still has a width. */
export function silverman(values) {
  const count = values.length;
  if (count < 2) return 1;
  const mean = values.reduce((sum, value) => sum + value, 0) / count;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (count - 1);
  const sorted = [...values].sort((a, b) => a - b);
  const spread = quantile(sorted, 0.75) - quantile(sorted, 0.25);
  const scale = Math.min(
    Math.sqrt(variance),
    spread > 0 ? spread / 1.34 : Infinity,
  );
  return 0.9 * (Number.isFinite(scale) && scale > 0 ? scale : 1) * count ** -0.2;
}

const NORMAL = 1 / Math.sqrt(2 * Math.PI);

/** A Gaussian kernel density estimate as a function of x. */
export function gaussianKde(values, bandwidth) {
  const width = bandwidth > 0 ? bandwidth : 1;
  return (x) =>
    values.reduce(
      (sum, value) =>
        sum + NORMAL * Math.exp(-(((x - value) / width) ** 2) / 2),
      0,
    ) /
    (values.length * width);
}

function fillOf(base, group, index, prefix) {
  return paint(
    base,
    group.shade ? group.shade - 1 : index,
    group.fill || "shade",
    prefix,
  );
}

function legendOf(groups, prefix) {
  return groups.map((group, index) => ({
    name: group.name,
    swatch: swatchBox(
      group.shade ? group.shade - 1 : index,
      group.fill || "shade",
      prefix,
    ),
  }));
}

// Along the value axis, across the category axis. Which of the two is x on
// screen is the only thing `horizontal` changes.
function place(horizontal, along, across) {
  return horizontal ? `${n(along)},${n(across)}` : `${n(across)},${n(along)}`;
}

function boxRect(horizontal, along, across, size, thickness, fill) {
  return horizontal
    ? `<rect${fill} x="${n(along)}" y="${n(across)}" width="${n(size)}" height="${n(thickness)}"/>`
    : `<rect${fill} x="${n(across)}" y="${n(along)}" width="${n(thickness)}" height="${n(size)}"/>`;
}

function segment(horizontal, along1, across1, along2, across2, className) {
  const [x1, y1] = horizontal ? [along1, across1] : [across1, along1];
  const [x2, y2] = horizontal ? [along2, across2] : [across2, along2];
  return `<line class="${className}" x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}"/>`;
}

export function box(context, groups) {
  const horizontal = "horizontal" in context.attrs;
  const whisker = Number(context.attrs.whisker) || 1.5;
  const showOutliers = context.attrs.outliers !== "no";
  const thickness = context.band * BOX_SPAN;
  const marks = groups.map((group, index) => {
    const stats = boxStats(group.values, whisker);
    if (!stats) return "";
    const centre = context.cat(index);
    const near = centre - thickness / 2;
    const far = centre + thickness / 2;
    const q1 = context.val(stats.q1);
    const q3 = context.val(stats.q3);
    const body =
      boxRect(
        horizontal,
        Math.min(q1, q3),
        near,
        Math.abs(q3 - q1),
        thickness,
        fillOf("chart-box", group, index, context.prefix),
      ) +
      segment(
        horizontal,
        context.val(stats.median),
        near,
        context.val(stats.median),
        far,
        "chart-median",
      ) +
      segment(horizontal, q1, centre, context.val(stats.low), centre, "chart-whisker") +
      segment(horizontal, q3, centre, context.val(stats.high), centre, "chart-whisker") +
      segment(
        horizontal,
        context.val(stats.low),
        near,
        context.val(stats.low),
        far,
        "chart-whisker",
      ) +
      segment(
        horizontal,
        context.val(stats.high),
        near,
        context.val(stats.high),
        far,
        "chart-whisker",
      );
    const outliers = showOutliers
      ? `<g class="chart-marker">${stats.outliers
          .map((value) => {
            const along = context.val(value);
            const [x, y] = horizontal ? [along, centre] : [centre, along];
            return markerSvg("circle", x, y, 6);
          })
          .join("")}</g>`
      : "";
    return `<g class="chart-series">${body}${outliers}</g>`;
  });
  return { marks: marks.join(""), legend: legendOf(groups, context.prefix) };
}

export function violin(context, groups) {
  const horizontal = "horizontal" in context.attrs;
  const reach = (context.band * VIOLIN_SPAN) / 2;
  const marks = groups.map((group, index) => {
    if (group.values.length < 2) return "";
    const bandwidth = Number(context.attrs.bw) || silverman(group.values);
    const density = gaussianKde(group.values, bandwidth);
    const low = Math.min(...group.values) - bandwidth * 2;
    const high = Math.max(...group.values) + bandwidth * 2;
    const centre = context.cat(index);
    const samples = [];
    for (let i = 0; i <= GRID; i++) {
      const value = low + ((high - low) * i) / GRID;
      samples.push({ value, weight: density(value) });
    }
    const peak = Math.max(...samples.map((sample) => sample.weight)) || 1;
    const side = (sign) =>
      samples.map(
        (sample) =>
          place(
            horizontal,
            context.val(sample.value),
            centre + (sign * reach * sample.weight) / peak,
          ),
      );
    const forward = side(1);
    const backward = side(-1).reverse();
    return (
      `<g class="chart-series"><path${fillOf("chart-violin", group, index, context.prefix)} ` +
      `d="M${forward.join(" L")} L${backward.join(" L")} Z"/></g>`
    );
  });
  return { marks: marks.join(""), legend: legendOf(groups, context.prefix) };
}

/** The empirical distribution as a staircase, one step per sample. */
export function ecdf(context, groups) {
  const complementary = "complementary" in context.attrs;
  const marks = groups.map((group, index) => {
    if (!group.values.length) return "";
    const sorted = [...group.values].sort((a, b) => a - b);
    const points = sorted.map((value, i) => {
      const share = (i + 1) / sorted.length;
      return {
        x: n(context.edge(value)),
        y: n(context.val(complementary ? 1 - share : share)),
      };
    });
    const parts = [`M${points[0].x},${points[0].y}`];
    for (let i = 1; i < points.length; i++)
      parts.push(`L${points[i].x},${points[i - 1].y}`, `L${points[i].x},${points[i].y}`);
    return `<g class="chart-series"><path class="chart-line dash-${(index % 6) + 1}" d="${parts.join(" ")}"/></g>`;
  });
  return { marks: marks.join(""), legend: legendOf(groups, context.prefix) };
}
