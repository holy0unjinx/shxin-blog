// Assembles one chart: read the fence, choose the axes, draw the marks.
//
// Sizing is the awkward part. The plot rectangle depends on the margins, the
// margins depend on how wide the tick labels are, and the tick labels depend
// on the scales, which need the plot rectangle. The loop below breaks that by
// measuring twice: once against seed margins, once against the labels the
// first pass produced. Two passes settle because the second set of labels
// comes from a rectangle already close to the final one.

import { esc } from "../escape.mjs";
import { numberCaption } from "../numbering.mjs";
import { splitCaption } from "../table.mjs";
import { hatchDefs } from "./channels.mjs";
import {
  EDGE,
  axisX,
  axisY,
  gridLines,
  legendBlock,
  legendRowCount,
  measureMargins,
  n,
  xLabelOverhang,
} from "./frame.mjs";
import { BUILDERS } from "./axes.mjs";
import { hoverLayer } from "./hover.mjs";
import { parseFence } from "./parse.mjs";
import { lineHeight } from "./text.mjs";
import { bar, barh, brokenBarh, hist } from "./plots/bar.mjs";
import { box, ecdf, violin } from "./plots/stat.mjs";
import {
  area,
  errorbar,
  line,
  scatter,
  stackplot,
  stem,
  step,
} from "./plots/xy.mjs";

const WIDTH = 720;
const FONT = 14;
const DEFAULT_ASPECT = 4 / 3;

// Which reading each type uses, which routine draws it, and the two habits a
// type may have: standing on a zero baseline, and running sideways.
const PLOTS = {
  line: { family: "series", draw: line },
  step: { family: "series", draw: step },
  area: { family: "series", draw: area, zero: true },
  stackplot: { family: "series", draw: stackplot, zero: true, stack: true },
  scatter: { family: "series", draw: scatter },
  errorbar: { family: "series", draw: errorbar },
  stem: { family: "series", draw: stem, zero: true },
  bar: { family: "bars", draw: bar, zero: true },
  barh: { family: "bars", draw: barh, zero: true, horizontal: true },
  hist: { family: "hist", draw: hist, zero: true },
  broken_barh: { family: "spans", draw: brokenBarh },
  box: { family: "samples", draw: box },
  violin: { family: "samples", draw: violin, kde: true },
  ecdf: { family: "ecdf", draw: ecdf },
};

// The grid is the data itself for these readings, so it is worth repeating as
// a table for a screen reader. A list of raw samples is not.
const TABULAR = new Set(["series", "bars", "spans"]);

function aspectOf(value) {
  const ratio = String(value ?? "").match(/^([\d.]+)\s*\/\s*([\d.]+)$/);
  if (ratio) {
    const computed = Number(ratio[1]) / Number(ratio[2]);
    return computed > 0 ? computed : DEFAULT_ASPECT;
  }
  const plain = Number(value);
  return plain > 0 ? plain : DEFAULT_ASPECT;
}

function stripMarkup(text) {
  return String(text)
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*?([^*]+)\*\*?/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function dataTable(rows) {
  const body = rows
    .map(
      (row) =>
        `<tr>${row.cells.map((cell) => `<td>${esc(cell.text)}</td>`).join("")}</tr>`,
    )
    .join("");
  // 접힌 채로 실려 온다. 스크린 리더는 접힘과 상관없이 표를 읽고, 수치를
  // 확인하려는 독자는 열어서 본다. 표를 감싸는 div가 따로 있는 것은 overflow가
  // 표 박스에는 걸리지 않아서다(블록·플렉스·그리드 컨테이너에만 걸린다).
  // 그것이 없으면 넓은 표의 남은 폭이 문서의 가로 스크롤이 된다.
  return (
    `<details class="chart-data-sheet">` +
    `<summary>Data</summary>` +
    `<div class="table-wrap">` +
    `<table class="chart-data"><tbody>${body}</tbody></table>` +
    `</div>` +
    `</details>`
  );
}

/**
 * Renders one ```chart fence.
 * Returns the figure markup, or null when the fence names no type this
 * renderer knows or carries no usable numbers — the caller then falls back to
 * showing the author their own source.
 */
export function renderChart(lang, code, inline, index = 0, options = {}) {
  const spec = parseFence(lang, code, options);
  const kind = PLOTS[spec.type];
  if (!kind) return null;

  const prefix = `chart${index}`;
  const height = Math.round(WIDTH / aspectOf(spec.attrs.aspect));
  const rotate = Number(spec.attrs["x-tick-rotate"]) || 0;
  const build = BUILDERS[kind.family];

  let margins = { left: 56, right: EDGE, top: EDGE, bottom: 46 };
  const rectangle = () => ({
    left: margins.left,
    top: margins.top,
    width: WIDTH - margins.left - margins.right,
    height: height - margins.top - margins.bottom,
  });

  // The plot routines paint with pattern ids that have to be unique per
  // figure, so every context gets the prefix as it is built.
  const buildAt = (rect) => {
    const built = build(spec, rect, kind);
    if (built) built.context.prefix = prefix;
    return built;
  };

  let plot = rectangle();
  let axes = buildAt(plot);
  if (!axes) return null;
  let drawn = kind.draw(axes.context, axes.data);
  let legendRows = 0;

  for (let pass = 0; pass < 2; pass++) {
    const showLegend =
      spec.attrs.legend !== "no" && drawn.legend.length > 1;
    legendRows = showLegend
      ? legendRowCount(drawn.legend, WIDTH - EDGE * 2, FONT)
      : 0;
    margins = measureMargins({
      yLabels: axes.yLabels,
      xLabels: axes.xLabels,
      y2Labels: axes.y2Labels || [],
      xLabel: spec.attrs["x-label"] || axes.xName || "",
      yLabel: spec.attrs["y-label"] || axes.yName || "",
      y2Label: axes.y2Scale ? spec.attrs["y2-label"] || "" : "",
      legendRows,
      fontSize: FONT,
      rotate,
      xOverhang: xLabelOverhang({
        scale: axes.xScale,
        labels: axes.xLabels,
        plot,
        fontSize: FONT,
        rotate,
      }),
    });
    plot = rectangle();
    axes = buildAt(plot);
    drawn = kind.draw(axes.context, axes.data);
  }

  const showLegend = spec.attrs.legend !== "no" && drawn.legend.length > 1;
  const showGrid = spec.attrs.grid !== "no";
  const xName = spec.attrs["x-label"] || axes.xName || "";
  const yName = spec.attrs["y-label"] || axes.yName || "";
  const y2Name = axes.y2Scale ? spec.attrs["y2-label"] || "" : "";
  const textLine = lineHeight(FONT);

  // Grid lines follow whichever axis carries values; a band axis has nothing
  // continuous to rule against.
  const grid =
    gridLines({
      scale: axes.yScale,
      plot,
      axis: "y",
      show: showGrid && !axes.yScale.band,
    }) +
    gridLines({
      scale: axes.xScale,
      plot,
      axis: "x",
      show: showGrid && !axes.xScale.band,
    });

  const axisMarks =
    axisX({
      scale: axes.xScale,
      labels: axes.xLabels,
      plot,
      fontSize: FONT,
      rotate,
    }) +
    axisY({ scale: axes.yScale, plot, fontSize: FONT, labels: axes.yLabels }) +
    (axes.y2Scale
      ? axisY({
          scale: axes.y2Scale,
          plot,
          fontSize: FONT,
          side: "right",
          labels: axes.y2Labels,
        })
      : "") +
    (xName
      ? `<text class="chart-axis-name" x="${n(plot.left + plot.width / 2)}" y="${n(height - legendRows * textLine - EDGE)}" text-anchor="middle">${esc(xName)}</text>`
      : "") +
    (yName
      ? `<text class="chart-axis-name" transform="translate(${n(EDGE + FONT / 2)} ${n(plot.top + plot.height / 2)}) rotate(-90)" text-anchor="middle">${esc(yName)}</text>`
      : "") +
    (y2Name
      ? `<text class="chart-axis-name" transform="translate(${n(WIDTH - EDGE - FONT / 2)} ${n(plot.top + plot.height / 2)}) rotate(90)" text-anchor="middle">${esc(y2Name)}</text>`
      : "");

  const legend = showLegend
    ? `<g class="chart-legend">${legendBlock({
        items: drawn.legend,
        width: WIDTH - EDGE * 2,
        left: EDGE,
        top: height - legendRows * textLine - EDGE + 2,
        fontSize: FONT,
      })}</g>`
    : "";

  // The reading a pointer asks for, drawn last so it lies over everything.
  // It is markup the page pays for whether or not anyone hovers, so a figure
  // that does not want it can say so.
  const hover =
    spec.attrs.hover === "no"
      ? ""
      : hoverLayer({
          columns: axes.columns,
          series: axes.data,
          plot,
          mapValue: axes.mapValue,
        });

  // The six hatch patterns are only worth their markup when something on the
  // figure actually paints with one.
  const usesHatch =
    drawn.marks.includes(`url(#${prefix}-hatch`) ||
    drawn.legend.some((item) => item.swatch.includes(`url(#${prefix}-hatch`));

  // The number comes off the caption before it is split, so the label is gone
  // by the time the words are read.
  const numbered = numberCaption(options.numbering, "fig", spec.captionAbove);
  const { main, aside } = splitCaption(numbered.text);
  const title =
    stripMarkup(main) ||
    `${spec.type} chart of ${drawn.legend.map((item) => item.name).join(", ")}`;

  const caption =
    numbered.prefix || numbered.text
      ? `<figcaption class="chart-caption"><div class="caption-row">` +
        `<span class="caption-text">` +
        `${numbered.prefix ? `<span class="caption-number">${esc(numbered.prefix)}</span> ` : ""}` +
        `${inline(main)}</span>` +
        `${aside ? `<span class="caption-aside">${inline(aside)}</span>` : ""}` +
        `</div></figcaption>`
      : "";

  const wantsTable =
    spec.attrs.table === undefined
      ? TABULAR.has(kind.family)
      : spec.attrs.table !== "no";

  return (
    `<figure class="chart"${numbered.id ? ` id="${esc(numbered.id)}"` : ""}>${caption}` +
    `<div class="chart-wrap">` +
    `<svg class="chart-svg" viewBox="0 0 ${WIDTH} ${height}" role="img" ` +
    `aria-labelledby="${prefix}-title" preserveAspectRatio="xMidYMid meet">` +
    `<title id="${prefix}-title">${esc(title)}</title>` +
    `${usesHatch ? `<defs>${hatchDefs(prefix)}</defs>` : ""}` +
    `<g class="chart-grid">${grid}</g>` +
    `<g class="chart-plot">${drawn.marks}</g>` +
    `<g class="chart-axis">${axisMarks}</g>` +
    `${legend}${hover}</svg></div>` +
    `${wantsTable ? dataTable(spec.rows) : ""}` +
    `${spec.captionBelow ? `<p class="chart-note">${inline(spec.captionBelow)}</p>` : ""}` +
    `</figure>`
  );
}
