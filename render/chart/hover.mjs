// The hover layer: one invisible target per column, and one tip that the
// stylesheet reveals while that target is under the pointer.
//
// There is no script on the page, so the tip cannot follow the pointer or be
// built on demand. Every tip is drawn at build time, placed once beside the
// column it belongs to, and left at zero opacity until CSS turns it on. That
// costs a little markup and buys the reading back on a static figure.

import { esc } from "../escape.mjs";
import { n } from "./frame.mjs";
import { formatTick } from "./scale.mjs";
import { textWidth } from "./text.mjs";

const SIZE = 13;
const LINE = 16;
const PAD = 8;
const OFFSET = 10;

function clamp(value, low, high) {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

// The lines one tip prints: the column first, then a name and a value for
// every series that has a number there.
function tipLines(label, series, index) {
  const rows = series
    .map((one) => [one.name, one.values?.[index]])
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([name, value]) =>
      name ? `${name} ${formatTick(value)}` : formatTick(value),
    );
  return rows.length ? [String(label ?? ""), ...rows] : [];
}

function tipBox(lines, { plot, along, across, vertical }) {
  const width = Math.max(...lines.map((line) => textWidth(line, SIZE))) + PAD * 2;
  const height = PAD * 2 + SIZE + LINE * (lines.length - 1);
  const right = plot.left + plot.width;
  const bottom = plot.top + plot.height;

  if (vertical) {
    // Beside the column, and above the highest point in it, so the tip does
    // not cover the reading it is describing.
    const x =
      along + OFFSET + width <= right ? along + OFFSET : along - OFFSET - width;
    const wanted = across - OFFSET - height;
    const y = wanted >= plot.top ? wanted : across + OFFSET;
    return {
      x: clamp(x, plot.left, right - width),
      y: clamp(y, plot.top, bottom - height),
      width,
      height,
    };
  }
  const x = across + OFFSET + width <= right ? across + OFFSET : across - OFFSET - width;
  return {
    x: clamp(x, plot.left, right - width),
    y: clamp(along - height / 2, plot.top, bottom - height),
    width,
    height,
  };
}

/**
 * The whole layer, or an empty string for a reading that has no columns to
 * hover — raw samples have no shared x to gather values at.
 *
 * `columns` describes where the columns sit and what they are called;
 * `mapValue` puts a value on the axis it is drawn against, which is what
 * decides where the tip can sit without covering its own data.
 */
export function hoverLayer({ columns, series, plot, mapValue }) {
  if (!columns || !series?.length) return "";
  const { labels = [], band = 0, at, vertical = true } = columns;
  const right = plot.left + plot.width;
  const bottom = plot.top + plot.height;

  const spots = labels
    .map((label, index) => {
      const lines = tipLines(label, series, index);
      if (!lines.length) return "";

      const centre = at(index);
      const half = band / 2;
      const hit = vertical
        ? {
            x: clamp(centre - half, plot.left, right),
            y: plot.top,
            width: Math.min(centre + half, right) - clamp(centre - half, plot.left, right),
            height: plot.height,
          }
        : {
            x: plot.left,
            y: clamp(centre - half, plot.top, bottom),
            width: plot.width,
            height: Math.min(centre + half, bottom) - clamp(centre - half, plot.top, bottom),
          };

      // The end of the column the tip has to keep clear of: the highest point
      // on an upright reading, the furthest reach on a sideways one.
      // Each series is measured against the axis it is drawn on, so a right
      // axis series does not drag the tip somewhere the reader is not looking.
      const reach = series
        .filter((one) => {
          const value = one.values?.[index];
          return value !== null && value !== undefined;
        })
        .map((one) => mapValue(one, one.values[index]));
      const across = reach.length
        ? vertical
          ? Math.min(...reach)
          : Math.max(...reach)
        : vertical
          ? plot.top
          : plot.left;

      const box = tipBox(lines, { plot, along: centre, across, vertical });
      const text = lines
        .map(
          (line, row) =>
            `<text class="chart-tip-line" x="${n(box.x + PAD)}" y="${n(box.y + PAD + SIZE + LINE * row)}">${esc(line)}</text>`,
        )
        .join("");

      return (
        `<g>` +
        `<rect class="chart-hit" x="${n(hit.x)}" y="${n(hit.y)}" width="${n(hit.width)}" height="${n(hit.height)}"/>` +
        `<g class="chart-tip">` +
        `<rect class="chart-tip-box" x="${n(box.x)}" y="${n(box.y)}" width="${n(box.width)}" height="${n(box.height)}"/>` +
        `${text}</g></g>`
      );
    })
    .join("");

  return spots ? `<g class="chart-hover">${spots}</g>` : "";
}
