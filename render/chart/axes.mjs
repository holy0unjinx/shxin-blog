// Choosing the axes for one chart.
//
// Each reading needs a different pair of scales — a band against values, two
// values, counts against bin edges — so each gets its own builder. They all
// return the same shape: the scales, the tick labels they imply, and the
// context the plot routine expects, with positions already absolute.

import {
  categoryScale,
  formatTick,
  linearScale,
  logScale,
} from "./scale.mjs";
import { readSamples, readSeries, readSpans } from "./parse.mjs";
import { histogram } from "./plots/bar.mjs";
import { silverman } from "./plots/stat.mjs";

const whole = (numbers) =>
  numbers.every((value) => value === null || Number.isInteger(value));

function limitsOf(value) {
  const match = String(value ?? "").match(/^(-?[\d.e+-]+):(-?[\d.e+-]+)$/);
  if (!match) return null;
  const low = Number(match[1]);
  const high = Number(match[2]);
  return Number.isFinite(low) && Number.isFinite(high) && low < high
    ? [low, high]
    : null;
}

function extent(numbers) {
  const usable = numbers.filter((value) => Number.isFinite(value));
  return usable.length
    ? { min: Math.min(...usable), max: Math.max(...usable) }
    : null;
}

// One place decides between a linear and a log axis, so {x-scale=log} and
// {y-scale=log} behave the same way on every plot type.
function valueScale({
  span,
  size,
  attrs,
  key,
  zero,
  ticks,
  integral = false,
  fit = false,
}) {
  const limits = limitsOf(attrs[`${key}-lim`]);
  if (attrs[`${key}-scale`] === "log")
    return logScale({ min: span.min, max: span.max, size, limits });
  return linearScale({
    min: span.min,
    max: span.max,
    size,
    zero,
    ticks,
    limits,
    integral,
    fit,
  });
}

// Everything the axes need to know, gathered per reading. `axis` values are
// scales; `labels` are what the tick labels will say; `draw` receives the
// context the plot routine expects.
function buildSeries(spec, plot, kind) {
  const { x, series } = readSeries(spec);
  if (!series.length) return null;

  // An error bar reaches past its own point, so the axis has to be sized
  // against the ends of the whiskers rather than against the values.
  const reachOf = (list) =>
    list.flatMap((one) =>
      one.values.flatMap((value, i) =>
        value === null
          ? []
          : [
              value - (one.errorLow?.[i] ?? 0),
              value + (one.errorHigh?.[i] ?? 0),
            ],
      ),
    );
  const reach = reachOf(series);
  if (kind.stack) {
    const totals = [];
    for (const one of series)
      one.values.forEach((value, i) => {
        totals[i] = (totals[i] || 0) + (value || 0);
      });
    reach.push(...totals);
  }
  const span = extent(reach);
  if (!span) return null;

  const attrs = spec.attrs;
  const rightOnly = series.every((one) => one.axis === "right");
  const left = series.filter((one) => one.axis !== "right");
  const right = series.filter((one) => one.axis === "right");

  // A stack reaches as high as its totals, not as high as its tallest single
  // value, so the stacked reading has to drive the axis or the top layer is
  // drawn off the figure.
  const leftSpan = kind.stack
    ? span
    : extent(reachOf(rightOnly ? series : left)) || span;
  const yScale = valueScale({
    span: leftSpan,
    size: plot.height,
    attrs,
    key: "y",
    zero: kind.zero,
    ticks: Math.max(2, Math.round(plot.height / 44)),
    integral: whole(reachOf(rightOnly ? series : left)),
  });
  const y2Scale = right.length && !rightOnly
    ? valueScale({
        span: extent(reachOf(right)) || span,
        size: plot.height,
        attrs,
        key: "y2",
        zero: kind.zero,
        ticks: Math.max(2, Math.round(plot.height / 44)),
      })
    : null;

  const ownX = series.flatMap((one) => one.x || []);
  const xSpan = extent([...(x.kind === "linear" ? x.values : []), ...ownX]);
  const xScale =
    x.kind === "category"
      ? categoryScale({ labels: x.labels, size: plot.width })
      : valueScale({
          span: xSpan,
          size: plot.width,
          attrs,
          key: "x",
          zero: false,
          ticks: Math.max(2, Math.round(plot.width / 70)),
          integral: whole([...x.values, ...ownX]),
          fit: true,
        });

  const at = (one, index) =>
    one.x
      ? xScale.map(one.x[index])
      : xScale.map(x.kind === "category" ? index : x.values[index]);

  // How wide one column of the hover layer is: a band on a category axis, and
  // the closest gap between two readings on a value axis, so neighbouring
  // targets never overlap.
  const centres = x.values.map((_, index) => xScale.map(x.values[index]));
  const gaps = centres
    .slice(1)
    .map((centre, index) => Math.abs(centre - centres[index]));
  const band = xScale.band || (gaps.length ? Math.min(...gaps) : plot.width);

  return {
    xScale,
    yScale,
    y2Scale,
    xLabels:
      x.kind === "category" ? x.labels : xScale.ticks.map(formatTick),
    yLabels: yScale.ticks.map(formatTick),
    y2Labels: y2Scale ? y2Scale.ticks.map(formatTick) : [],
    xName: x.label,
    data: series,
    // A series carrying its own x has no shared column to gather values in,
    // so that reading offers no hover targets.
    columns: series.some((one) => one.x)
      ? null
      : {
          labels: x.labels,
          band,
          at: (index) =>
            plot.left + xScale.map(x.kind === "category" ? index : x.values[index]),
          vertical: true,
        },
    mapValue: (one, value) =>
      plot.top +
      plot.height -
      (one.axis === "right" && y2Scale ? y2Scale : yScale).map(value),
    context: {
      plot,
      attrs,
      mapX: (one, index) => plot.left + at(one, index),
      mapY: (one, value) =>
        plot.top +
        plot.height -
        (one.axis === "right" && y2Scale ? y2Scale : yScale).map(value),
    },
  };
}

function buildBars(spec, plot, kind) {
  const { x, series } = readSeries(spec);
  if (!series.length) return null;
  const totals = [];
  for (const one of series)
    one.values.forEach((value, i) => {
      totals[i] = (totals[i] || 0) + (value || 0);
    });
  const span = extent(
    "stacked" in spec.attrs ? totals : series.flatMap((one) => one.values),
  );
  if (!span) return null;

  const horizontal = Boolean(kind.horizontal);
  const catSize = horizontal ? plot.height : plot.width;
  const valSize = horizontal ? plot.width : plot.height;
  const cats = categoryScale({ labels: x.labels, size: catSize });
  const values = valueScale({
    span,
    size: valSize,
    attrs: spec.attrs,
    key: horizontal ? "x" : "y",
    zero: true,
    ticks: Math.max(2, Math.round(valSize / (horizontal ? 70 : 44))),
    integral: whole(series.flatMap((one) => one.values)),
  });
  const valueLabels = values.ticks.map(formatTick);

  return {
    xScale: horizontal ? values : cats,
    yScale: horizontal ? cats : values,
    y2Scale: null,
    xLabels: horizontal ? valueLabels : x.labels,
    yLabels: horizontal ? x.labels : valueLabels,
    xName: horizontal ? "" : x.label,
    yName: horizontal ? x.label : "",
    flipY: !horizontal,
    data: series,
    columns: {
      labels: x.labels,
      band: cats.band,
      at: (index) =>
        horizontal ? plot.top + cats.map(index) : plot.left + cats.map(index),
      vertical: !horizontal,
    },
    mapValue: (_one, value) =>
      horizontal
        ? plot.left + values.map(value)
        : plot.top + plot.height - values.map(value),
    context: {
      plot,
      attrs: spec.attrs,
      band: cats.band,
      cat: (index) =>
        horizontal ? plot.top + cats.map(index) : plot.left + cats.map(index),
      val: (value) =>
        horizontal
          ? plot.left + values.map(value)
          : plot.top + plot.height - values.map(value),
    },
  };
}

function buildHist(spec, plot) {
  const groups = readSamples(spec).filter((group) => group.values.length);
  if (!groups.length) return null;
  const all = groups.flatMap((group) => group.values);
  const span = extent(all);
  if (!span) return null;
  const count = Math.max(
    1,
    Number.parseInt(spec.attrs.bins ?? "", 10) || 10,
  );
  const explicit = String(spec.attrs.bins ?? "").includes(":")
    ? spec.attrs.bins
    : `${span.min}:${span.max === span.min ? span.min + 1 : span.max}:${count}`;
  const options = {
    bins: explicit,
    density: "density" in spec.attrs,
    cumulative: "cumulative" in spec.attrs,
  };
  const binned = groups.map((group) => ({
    ...group,
    counts: histogram(group.values, options).counts,
  }));
  const edges = histogram(all, options).edges;

  const xScale = valueScale({
    span: { min: edges[0], max: edges.at(-1) },
    size: plot.width,
    attrs: spec.attrs,
    key: "x",
    zero: false,
    ticks: Math.max(2, Math.round(plot.width / 70)),
  });
  const yScale = valueScale({
    span: extent(binned.flatMap((group) => group.counts)),
    size: plot.height,
    attrs: spec.attrs,
    key: "y",
    zero: true,
    ticks: Math.max(2, Math.round(plot.height / 44)),
    integral: !options.density,
  });

  return {
    xScale,
    yScale,
    y2Scale: null,
    xLabels: xScale.ticks.map(formatTick),
    yLabels: yScale.ticks.map(formatTick),
    data: binned,
    context: {
      plot,
      attrs: spec.attrs,
      edges,
      edge: (value) => plot.left + xScale.map(value),
      val: (value) => plot.top + plot.height - yScale.map(value),
    },
  };
}

function buildSpans(spec, plot) {
  const lanes = readSpans(spec).filter((lane) => lane.spans.length);
  if (!lanes.length) return null;
  const span = extent(
    lanes.flatMap((lane) =>
      lane.spans.flatMap(({ start, width }) => [start, start + width]),
    ),
  );
  const cats = categoryScale({
    labels: lanes.map((lane) => lane.name),
    size: plot.height,
  });
  const xScale = valueScale({
    span,
    size: plot.width,
    attrs: spec.attrs,
    key: "x",
    zero: false,
    ticks: Math.max(2, Math.round(plot.width / 70)),
    fit: true,
  });
  return {
    xScale,
    yScale: cats,
    y2Scale: null,
    xLabels: xScale.ticks.map(formatTick),
    yLabels: lanes.map((lane) => lane.name),
    data: lanes,
    context: {
      plot,
      attrs: spec.attrs,
      band: cats.band,
      cat: (index) => plot.top + cats.map(index),
      edge: (value) => plot.left + xScale.map(value),
    },
  };
}

function buildSamples(spec, plot, kind) {
  const groups = readSamples(spec).filter((group) => group.values.length);
  if (!groups.length) return null;
  const span = extent(groups.flatMap((group) => group.values));
  // A kernel density estimate has tails past the outermost sample, and the
  // outline is drawn over them, so the axis has to cover them too.
  if (kind.kde) {
    const tail = Math.max(
      ...groups.map(
        (group) => (Number(spec.attrs.bw) || silverman(group.values)) * 2,
      ),
    );
    span.min -= tail;
    span.max += tail;
  }
  const horizontal = "horizontal" in spec.attrs;
  const catSize = horizontal ? plot.height : plot.width;
  const valSize = horizontal ? plot.width : plot.height;
  const cats = categoryScale({
    labels: groups.map((group) => group.name),
    size: catSize,
  });
  const values = valueScale({
    span,
    size: valSize,
    attrs: spec.attrs,
    key: horizontal ? "x" : "y",
    zero: false,
    ticks: Math.max(2, Math.round(valSize / (horizontal ? 70 : 44))),
  });
  const valueLabels = values.ticks.map(formatTick);
  return {
    xScale: horizontal ? values : cats,
    yScale: horizontal ? cats : values,
    y2Scale: null,
    xLabels: horizontal ? valueLabels : cats.labels,
    yLabels: horizontal ? cats.labels : valueLabels,
    data: groups,
    context: {
      plot,
      attrs: spec.attrs,
      band: cats.band,
      cat: (index) =>
        horizontal ? plot.top + cats.map(index) : plot.left + cats.map(index),
      val: (value) =>
        horizontal
          ? plot.left + values.map(value)
          : plot.top + plot.height - values.map(value),
    },
  };
}

function buildEcdf(spec, plot) {
  const groups = readSamples(spec).filter((group) => group.values.length);
  if (!groups.length) return null;
  const span = extent(groups.flatMap((group) => group.values));
  const xScale = valueScale({
    span,
    size: plot.width,
    attrs: spec.attrs,
    key: "x",
    zero: false,
    ticks: Math.max(2, Math.round(plot.width / 70)),
    fit: true,
  });
  const yScale = linearScale({
    min: 0,
    max: 1,
    size: plot.height,
    pad: 0,
    limits: limitsOf(spec.attrs["y-lim"]) || [0, 1],
  });
  return {
    xScale,
    yScale,
    y2Scale: null,
    xLabels: xScale.ticks.map(formatTick),
    yLabels: yScale.ticks.map(formatTick),
    data: groups,
    context: {
      plot,
      attrs: spec.attrs,
      edge: (value) => plot.left + xScale.map(value),
      val: (value) => plot.top + plot.height - yScale.map(value),
    },
  };
}

export const BUILDERS = {
  series: buildSeries,
  bars: buildBars,
  hist: buildHist,
  spans: buildSpans,
  samples: buildSamples,
  ecdf: buildEcdf,
};

