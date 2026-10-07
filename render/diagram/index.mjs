// Diagram fence -> SVG, at build time.
//
// A chart draws numbers; a diagram draws structure. Both are drawn here
// rather than in the browser, for the same reasons: the figure is in the page
// when it arrives, it survives a printer, and no script has to run for a
// reader to see it.
//
//   ```diagram {type=flow}
//   : {#fig:issue} 발급 절차
//   시작 -> 검사
//   검사 -> (발급): 유효
//   검사 -> <거절>: 무효
//   ```
//
// Three grammars, one figure shell. When the fence cannot be read the
// renderer declines and the caller falls back to a code block, which is the
// rule a chart already follows.

import { esc } from "../escape.mjs";
import { numberCaption } from "../numbering.mjs";
import { splitCaption } from "../table.mjs";
import { drawFlow, describeFlow, layoutFlow } from "./flow.mjs";
import { parseFence, parseFlow, parseSequence, parseTree, TYPES } from "./parse.mjs";
import { drawSequence, describeSequence, layoutSequence } from "./sequence.mjs";
import { drawTree, describeTree, layoutTree } from "./tree.mjs";
import { n } from "./shapes.mjs";

const PAD = 8;

const KINDS = new Map([
  ["flow", { parse: parseFlow, layout: layoutFlow, draw: drawFlow, describe: describeFlow }],
  [
    "sequence",
    { parse: parseSequence, layout: layoutSequence, draw: drawSequence, describe: describeSequence },
  ],
  ["tree", { parse: parseTree, layout: layoutTree, draw: drawTree, describe: describeTree }],
]);

/**
 * Renders one diagram fence, or returns null when it cannot be read — no type
 * it knows, or nothing in the body it can draw.
 */
export function renderDiagram(lang, body, index = 0, options = {}) {
  const spec = parseFence(lang, body);
  if (!TYPES.has(spec.type)) return null;
  const kind = KINDS.get(spec.type);
  const parsed = kind.parse(spec.lines);
  const plan = kind.layout(parsed, spec.attrs);
  if (!plan) return null;
  const drawn = kind.draw(plan);

  const numbered = numberCaption(options.numbering, "fig", spec.captionAbove);
  const { main, aside } = splitCaption(numbered.text);
  const inline = options.inline || esc;
  const prefix = `diagram${index}`;
  const reading = kind.describe(parsed);
  const title = numbered.text ? numbered.text.replace(/\s*\|.*$/, "") : `${spec.type} diagram`;

  const width = plan.width + PAD * 2;
  const height = plan.height + PAD * 2;

  const caption =
    numbered.prefix || numbered.text
      ? `<figcaption class="chart-caption"><div class="caption-row">` +
        `<span class="caption-text">` +
        `${numbered.prefix ? `<span class="caption-number">${esc(numbered.prefix)}</span> ` : ""}` +
        `${inline(main)}</span>` +
        `${aside ? `<span class="caption-aside">${inline(aside)}</span>` : ""}` +
        `</div></figcaption>`
      : "";

  return (
    `<figure class="diagram"${numbered.id ? ` id="${esc(numbered.id)}"` : ""}>${caption}` +
    `<div class="diagram-wrap">` +
    `<svg class="diagram-svg" viewBox="0 0 ${n(width)} ${n(height)}" role="img" ` +
    `aria-labelledby="${prefix}-title" preserveAspectRatio="xMidYMid meet" ` +
    `style="max-width:${n(width)}px">` +
    `<title id="${prefix}-title">${esc(title)}</title>` +
    `<g transform="translate(${PAD} ${PAD})">` +
    `<g class="diagram-edges">${drawn.marks}</g>` +
    `<g class="diagram-nodes">${drawn.nodes}</g>` +
    `<g class="diagram-labels">${drawn.labels}</g>` +
    `</g></svg></div>` +
    // 그림을 볼 수 없는 쪽에는 같은 내용이 글로 한 번 더 나간다. 검색
    // 색인도 이 글을 읽는다.
    `<ul class="diagram-reading">${reading
      .map((line) => `<li>${esc(line)}</li>`)
      .join("")}</ul>` +
    `${spec.captionBelow ? `<p class="chart-note">${inline(spec.captionBelow)}</p>` : ""}` +
    `</figure>`
  );
}
