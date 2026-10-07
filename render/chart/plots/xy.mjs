// Plots that live on an x/y pair: the matplotlib plot, step, fill_between,
// stackplot, scatter, errorbar and stem family.
//
// Every function here takes the same context — the plot rectangle and the two
// mapping functions the caller has already resolved — and returns the marks
// plus the legend entries it wants. None of them know how the axes were
// sized, and none of them read attributes the caller has not passed on.

import { esc } from "../../escape.mjs";
import {
  dashClass,
  markerShape,
  markerSvg,
  paint,
  swatchBox,
  swatchLine,
} from "../channels.mjs";
import { n } from "../frame.mjs";
import { textWidth } from "../text.mjs";

// Matches .chart-point-label in the stylesheet; the label has to be measured
// here to be kept inside the plot.
const LABEL_SIZE = 14;
const LABEL_GAP = 8;

// The order the stylesheet defines dash-1 … dash-6 in, so an author who
// writes {dash=dotted} gets the pattern that name promises rather than
// whatever position their series happens to sit in.
const DASH_ORDER = [
  "solid",
  "dashed",
  "dotted",
  "dashdot",
  "longdash",
  "dashdotdot",
];

function dashFor(series, index) {
  const named = DASH_ORDER.indexOf(series.dash);
  return named === -1 ? dashClass(index) : `dash-${named + 1}`;
}

// {dash=none} is a pattern that draws nothing, so the series keeps its markers
// and an area keeps its fill without an outline around it.
function strokes(series) {
  return series.dash !== "none";
}

// A {guide} cell drops a dotted perpendicular to each axis, which is how a
// figure points at one reading — where a forecast first crosses a threshold —
// without an annotation layer.
function guideLines(list, guides = [], plot = null) {
  if (!plot) return "";
  return list
    .filter((point) => point && guides[point.index])
    .map(
      (point) =>
        `<line class="chart-guide" x1="${n(plot.left)}" y1="${point.y}" x2="${point.x}" y2="${point.y}"/>` +
        `<line class="chart-guide" x1="${point.x}" y1="${point.y}" x2="${point.x}" y2="${n(plot.top + plot.height)}"/>`,
    )
    .join("");
}

function fillFor(base, series, index, prefix) {
  return paint(
    base,
    series.shade ? series.shade - 1 : index,
    series.fill || "shade",
    prefix,
  );
}

// A point is null wherever the source cell held no usable number, which is
// how a gap survives all the way from the Markdown to the drawn line.
function points(context, series) {
  return series.values.map((value, index) =>
    value === null || value === undefined
      ? null
      : {
          x: n(context.mapX(series, index)),
          y: n(context.mapY(series, value)),
          index,
        },
  );
}

// Runs of consecutive points become separate subpaths, so a gap lifts the pen
// instead of drawing a straight line across missing data.
function linePath(list) {
  let path = "";
  let pen = false;
  for (const point of list) {
    if (!point) {
      pen = false;
      continue;
    }
    path += `${path ? " " : ""}${pen ? "L" : "M"}${point.x},${point.y}`;
    pen = true;
  }
  return path;
}

function stepPath(list, where) {
  const parts = [];
  let previous = null;
  for (const point of list) {
    if (!point) {
      previous = null;
      continue;
    }
    if (!previous) {
      parts.push(`M${point.x},${point.y}`);
    } else if (where === "pre") {
      parts.push(`L${previous.x},${point.y}`, `L${point.x},${point.y}`);
    } else if (where === "mid") {
      const middle = n((previous.x + point.x) / 2);
      parts.push(
        `L${middle},${previous.y}`,
        `L${middle},${point.y}`,
        `L${point.x},${point.y}`,
      );
    } else {
      parts.push(`L${point.x},${previous.y}`, `L${point.x},${point.y}`);
    }
    previous = point;
  }
  return parts.join(" ");
}

// A band is drawn out along its top edge and back along its bottom one, so
// the same routine serves fill_between and every layer of a stackplot.
function bandPath(top, bottom) {
  // The floor is indexed by source cell, so the two edges are filtered
  // together. Pairing a filtered top against an unfiltered floor is what
  // sends a band that starts late back along the wrong values.
  const pairs = top
    .map((point, index) => [point, bottom[index]])
    .filter(([point]) => point);
  if (pairs.length < 2) return "";
  const back = pairs
    .map(([point, floor]) => `L${point.x},${floor}`)
    .reverse()
    .join(" ");
  return `${linePath(pairs.map(([point]) => point))} ${back} Z`;
}

function markerGroup(list, shape, size = 7) {
  const marks = list
    .filter(Boolean)
    .map((point) => markerSvg(shape, point.x, point.y, size))
    .join("");
  return marks ? `<g class="chart-marker">${marks}</g>` : "";
}

// A {label} written on a single cell annotates that one point, which is how
// an author calls out a peak without labelling the whole series.
function pointLabels(list, labels = [], plot = null) {
  const marks = list
    .filter((point) => point && labels[point.index])
    .map((point) => {
      const label = labels[point.index];
      let x = point.x;
      let y = point.y - LABEL_GAP;
      if (plot) {
        // A centred label on the first or last point of a fitted axis would
        // hang half its width off the figure, so it slides back inside the
        // plot; a label on a high point flips under its marker rather than
        // climbing out of the top of the drawing.
        const half = textWidth(label, LABEL_SIZE) / 2;
        x = Math.min(
          Math.max(x, plot.left + half),
          plot.left + plot.width - half,
        );
        if (y - LABEL_SIZE < plot.top) y = point.y + LABEL_GAP + LABEL_SIZE / 2;
      }
      return `<text class="chart-point-label" x="${n(x)}" y="${n(y)}" text-anchor="middle">${esc(label)}</text>`;
    })
    .join("");
  return marks;
}

function group(body) {
  return body ? `<g class="chart-series">${body}</g>` : "";
}

function lineLike(context, series, pathOf) {
  const marks = [];
  const legend = [];
  series.forEach((one, index) => {
    const list = points(context, one);
    const path = strokes(one) ? pathOf(list, one, index) : "";
    const shape = one.marker && one.marker !== "none" ? one.marker : "";
    marks.push(
      group(
        guideLines(list, one.guides, context.plot) +
          (path
            ? `<path class="chart-line ${dashFor(one, index)}" d="${path}"/>`
            : "") +
          (shape ? markerGroup(list, shape) : "") +
          pointLabels(list, one.labels, context.plot),
      ),
    );
    legend.push({
      name: one.name,
      swatch: swatchLine(index, shape, dashFor(one, index), strokes(one)),
    });
  });
  return { marks: marks.join(""), legend };
}

export function line(context, series) {
  return lineLike(context, series, (list) => linePath(list));
}

export function step(context, series) {
  const where = context.attrs.where || "post";
  return lineLike(context, series, (list) => stepPath(list, where));
}

/**
 * fill_between. Each series is filled down to the baseline, or to another
 * series named by {fill-to}, which is then not filled itself.
 *
 * {fill-to} is read per series, so one figure can carry several bands nested
 * inside one another; written on the fence instead it names one floor for
 * every series, which is the older single-band spelling.
 */
export function area(context, series) {
  const figureTarget = context.attrs["fill-to"] || "";
  const named = (name) => String(name || "").trim().toLowerCase();
  const floorOf = (one) => {
    const target = named(one.fillTo || figureTarget);
    if (!target) return null;
    return (
      series.find((other) => other !== one && named(other.name) === target) ||
      null
    );
  };
  // A series someone else stands on is that band's floor and nothing more, so
  // it is not also painted as a band of its own down to the baseline.
  const floors = new Set(series.map(floorOf).filter(Boolean));
  const marks = [];
  const legend = [];
  series.forEach((one, index) => {
    if (floors.has(one)) return;
    const other = floorOf(one);
    const list = points(context, one);
    const bottom = list.map((point, i) => {
      if (!point) return 0;
      const against = other ? other.values[i] : 0;
      return n(context.mapY(one, against === null ? 0 : against));
    });
    const path = bandPath(list, bottom);
    const edge = strokes(one) ? linePath(list) : "";
    const shape = one.marker && one.marker !== "none" ? one.marker : "";
    marks.push(
      group(
        (path
          ? `<path${fillFor("chart-area", one, index, context.prefix)} d="${path}"/>`
          : "") +
          (edge
            ? `<path class="chart-area-edge ${dashFor(one, index)}" d="${edge}"/>`
            : "") +
          guideLines(list, one.guides, context.plot) +
          (shape ? markerGroup(list, shape) : "") +
          pointLabels(list, one.labels, context.plot),
      ),
    );
    // A series with nothing painted under its edge reads as a line, so it is
    // one in the legend as well; an empty swatch box would say less.
    legend.push({
      name: one.name,
      swatch:
        one.fill === "none"
          ? swatchLine(index, shape, dashFor(one, index), strokes(one))
          : swatchBox(
              one.shade ? one.shade - 1 : index,
              one.fill || "shade",
              context.prefix,
            ),
    });
  });
  return { marks: marks.join(""), legend };
}

/** Layers stacked on one another, each starting where the last one ended. */
export function stackplot(context, series) {
  const marks = [];
  const legend = [];
  const running = [];
  series.forEach((one, index) => {
    const tops = one.values.map((value, i) => {
      const height = value === null || value === undefined ? 0 : value;
      running[i] = (running[i] || 0) + height;
      return running[i];
    });
    const list = tops.map((total, i) => ({
      x: n(context.mapX(one, i)),
      y: n(context.mapY(one, total)),
      index: i,
    }));
    const bottom = tops.map((total, i) =>
      n(context.mapY(one, total - (one.values[i] || 0))),
    );
    const path = bandPath(list, bottom);
    marks.push(
      group(
        path
          ? `<path${fillFor("chart-area", one, index, context.prefix)} d="${path}"/>`
          : "",
      ),
    );
    legend.push({
      name: one.name,
      swatch: swatchBox(one.shade ? one.shade - 1 : index, one.fill || "shade", context.prefix),
    });
  });
  return { marks: marks.join(""), legend };
}

export function scatter(context, series) {
  const marks = [];
  const legend = [];
  series.forEach((one, index) => {
    const shape = one.marker && one.marker !== "none" ? one.marker : markerShape(index);
    const size = one.width ? one.width : 7;
    const list = points(context, one);
    marks.push(
      group(
        guideLines(list, one.guides, context.plot) +
          markerGroup(list, shape, size) +
          pointLabels(list, one.labels, context.plot),
      ),
    );
    legend.push({ name: one.name, swatch: swatchLine(index, shape) });
  });
  return { marks: marks.join(""), legend };
}

/** Points with a whisker from value-low to value+high, and a cap on each end. */
export function errorbar(context, series) {
  const cap = 4;
  const marks = [];
  const legend = [];
  series.forEach((one, index) => {
    const shape = one.marker && one.marker !== "none" ? one.marker : markerShape(index);
    const list = points(context, one);
    const whiskers = list
      .filter(Boolean)
      .map((point) => {
        const value = one.values[point.index];
        const low = one.errorLow?.[point.index] ?? null;
        const high = one.errorHigh?.[point.index] ?? null;
        if (low === null && high === null) return "";
        const top = n(context.mapY(one, value + (high ?? 0)));
        const bottom = n(context.mapY(one, value - (low ?? 0)));
        return (
          `<line class="chart-error" x1="${point.x}" y1="${bottom}" x2="${point.x}" y2="${top}"/>` +
          `<line class="chart-error" x1="${n(point.x - cap)}" y1="${bottom}" x2="${n(point.x + cap)}" y2="${bottom}"/>` +
          `<line class="chart-error" x1="${n(point.x - cap)}" y1="${top}" x2="${n(point.x + cap)}" y2="${top}"/>`
        );
      })
      .join("");
    marks.push(group(whiskers + markerGroup(list, shape)));
    legend.push({ name: one.name, swatch: swatchLine(index, shape) });
  });
  return { marks: marks.join(""), legend };
}

/** A stalk from the baseline up to each point, with the point marked. */
export function stem(context, series) {
  const marks = [];
  const legend = [];
  series.forEach((one, index) => {
    const base = n(context.mapY(one, 0));
    const list = points(context, one);
    const stalks = list
      .filter(Boolean)
      .map(
        (point) =>
          `<line class="chart-stem ${dashFor(one, index)}" x1="${point.x}" y1="${base}" x2="${point.x}" y2="${point.y}"/>`,
      )
      .join("");
    const shape = one.marker && one.marker !== "none" ? one.marker : markerShape(index);
    marks.push(
      group(
        stalks +
          markerGroup(list, shape) +
          (stalks
            ? `<line class="chart-axis-line" x1="${n(context.plot.left)}" y1="${base}" x2="${n(context.plot.left + context.plot.width)}" y2="${base}"/>`
            : ""),
      ),
    );
    legend.push({ name: one.name, swatch: swatchLine(index, shape) });
  });
  return { marks: marks.join(""), legend };
}
