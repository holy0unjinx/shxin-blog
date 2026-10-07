// Plots built from rectangles: bar, barh, hist and broken_barh.
//
// A bar chart is the same drawing whichever way round it runs, so both
// directions share one routine and differ only in which axis the caller's two
// mapping functions stand for. `cat` walks the category axis, `val` walks the
// value axis, and `horizontal` says which is which on screen.

import { paint, swatchBox } from "../channels.mjs";
import { n } from "../frame.mjs";

const BAR_SPAN = 0.8;
const RANGE = /^(-?[\d.]+):(-?[\d.]+):(\d+)$/;

function fillOf(one, index, prefix) {
  return paint(
    "chart-bar",
    one.shade ? one.shade - 1 : index,
    one.fill || "shade",
    prefix,
  );
}

function rect(horizontal, along, across, size, thickness, fill) {
  return horizontal
    ? `<rect${fill} x="${n(along)}" y="${n(across)}" width="${n(size)}" height="${n(thickness)}"/>`
    : `<rect${fill} x="${n(across)}" y="${n(along)}" width="${n(thickness)}" height="${n(size)}"/>`;
}

function bars(context, series, horizontal) {
  const stacked = "stacked" in context.attrs;
  const span = context.band * (Number(context.attrs["bar-width"]) || BAR_SPAN);
  const slots = stacked ? 1 : Math.max(1, series.length);
  const thickness = span / slots;
  const baseline = context.val(0);
  const running = [];
  const marks = [];
  const legend = [];

  series.forEach((one, index) => {
    const body = one.values
      .map((value, i) => {
        if (value === null || value === undefined) return "";
        const start = context.cat(i) - span / 2 + (stacked ? 0 : index * thickness);
        let from = baseline;
        let to = context.val(value);
        if (stacked) {
          const bottom = running[i] || 0;
          running[i] = bottom + value;
          from = context.val(bottom);
          to = context.val(running[i]);
        }
        const low = Math.min(from, to);
        return rect(
          horizontal,
          low,
          start,
          Math.abs(to - from),
          thickness,
          fillOf(one, index, context.prefix),
        );
      })
      .join("");
    marks.push(body ? `<g class="chart-series">${body}</g>` : "");
    legend.push({
      name: one.name,
      swatch: swatchBox(
        one.shade ? one.shade - 1 : index,
        one.fill || "shade",
        context.prefix,
      ),
    });
  });
  return { marks: marks.join(""), legend };
}

export function bar(context, series) {
  return bars(context, series, false);
}

export function barh(context, series) {
  return bars(context, series, true);
}

/**
 * Equal-width bins over the sample range, or over an explicit
 * "low:high:count". The topmost sample belongs to the last bin rather than to
 * a bin past the end, which is where a naive floor would put it.
 */
export function histogram(values, { bins, density = false, cumulative = false }) {
  if (!values.length) return { edges: [], counts: [] };
  const explicit = String(bins ?? "").match(RANGE);
  let low = Math.min(...values);
  let high = Math.max(...values);
  let count = Math.max(1, Number.parseInt(bins ?? "", 10) || 10);
  if (explicit) {
    low = Number(explicit[1]);
    high = Number(explicit[2]);
    count = Math.max(1, Number(explicit[3]));
  } else if (low === high) {
    low -= 0.5;
    high += 0.5;
  }

  const width = (high - low) / count;
  const edges = [];
  for (let i = 0; i <= count; i++) edges.push(low + i * width);

  const counts = new Array(count).fill(0);
  for (const value of values) {
    if (value < low || value > high) continue;
    const slot = Math.min(count - 1, Math.floor((value - low) / width));
    counts[slot]++;
  }

  let out = counts;
  if (density) out = out.map((value) => value / (values.length * width));
  if (cumulative)
    out = out.map(
      (
        (sum) => (value) =>
          (sum += value)
      )(0),
    );
  return { edges, counts: out };
}

/** Bars standing on the bin edges the caller has already computed. */
export function hist(context, groups) {
  const marks = [];
  const legend = [];
  const baseline = context.val(0);
  groups.forEach((group, index) => {
    const body = group.counts
      .map((count, i) => {
        if (!count) return "";
        const from = context.edge(context.edges[i]);
        const to = context.edge(context.edges[i + 1]);
        const top = context.val(count);
        return rect(
          false,
          Math.min(baseline, top),
          from,
          Math.abs(top - baseline),
          to - from,
          fillOf(group, index, context.prefix),
        );
      })
      .join("");
    marks.push(body ? `<g class="chart-series">${body}</g>` : "");
    legend.push({
      name: group.name,
      swatch: swatchBox(
        group.shade ? group.shade - 1 : index,
        group.fill || "shade",
        context.prefix,
      ),
    });
  });
  return { marks: marks.join(""), legend };
}

/** One lane per row, one bar per interval on that lane. */
export function brokenBarh(context, lanes) {
  const thickness =
    context.band * (Number(context.attrs["lane-height"]) || BAR_SPAN);
  const marks = [];
  const legend = [];
  lanes.forEach((lane, index) => {
    const body = lane.spans
      .map((span) => {
        const from = context.edge(span.start);
        const to = context.edge(span.start + span.width);
        return rect(
          true,
          Math.min(from, to),
          context.cat(index) - thickness / 2,
          Math.abs(to - from),
          thickness,
          fillOf(lane, index, context.prefix),
        );
      })
      .join("");
    marks.push(body ? `<g class="chart-series">${body}</g>` : "");
    legend.push({
      name: lane.name,
      swatch: swatchBox(
        lane.shade ? lane.shade - 1 : index,
        lane.fill || "shade",
        context.prefix,
      ),
    });
  });
  return { marks: marks.join(""), legend };
}
