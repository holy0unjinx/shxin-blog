// sequence: participants across the top, time running down.
//
// A lifeline is a dashed rule under each participant, and every message is a
// horizontal arrow between two of them. The order the messages are written in
// is the order they happen, so nothing has to be numbered.

import { esc } from "../escape.mjs";
import { lineHeight, textWidth } from "../chart/text.mjs";
import {
  arrowHead,
  drawNode,
  edgeLabel,
  FONT,
  measureNode,
  n,
  polyline,
} from "./shapes.mjs";

const STEP = 42;
const ACTOR_GAP = 34;
const HEAD_GAP = 26;
const SELF_WIDTH = 34;

export function layoutSequence({ actors, steps }, options = {}) {
  if (actors.length < 1 || !steps.length) return null;
  const measured = actors.map((actor) => measureNode(actor, { maxWidth: 130 }));
  const headHeight = Math.max(...measured.map((actor) => actor.height));

  // A message needs room for its own label between the two lifelines it
  // spans, so the gap between neighbours grows to whatever the widest label
  // written across it needs.
  const gaps = new Array(Math.max(0, measured.length - 1)).fill(ACTOR_GAP);
  const indexOf = new Map(measured.map((actor, index) => [actor.id, index]));
  for (const step of steps) {
    if (step.kind !== "message" || !step.label) continue;
    const from = indexOf.get(step.from);
    const to = indexOf.get(step.to);
    if (from === undefined || to === undefined) continue;
    const [low, high] = [Math.min(from, to), Math.max(from, to)];
    if (low === high) continue;
    const needed = textWidth(step.label, 12) + 24;
    const spanned = high - low;
    const own =
      measured.slice(low, high + 1).reduce((sum, actor) => sum + actor.width, 0) -
      (measured[low].width + measured[high].width) / 2;
    const shortfall = needed - own;
    if (shortfall <= 0) continue;
    const share = shortfall / spanned;
    for (let i = low; i < high; i++) gaps[i] = Math.max(gaps[i], ACTOR_GAP + share);
  }

  let x = 0;
  measured.forEach((actor, index) => {
    actor.x = x + actor.width / 2;
    actor.y = headHeight / 2;
    x += actor.width + (gaps[index] || 0);
  });

  const top = headHeight + HEAD_GAP;
  const placed = steps.map((step, index) => ({ ...step, y: top + index * STEP }));
  const width =
    measured[measured.length - 1].x + measured[measured.length - 1].width / 2;
  const selfMost = placed.some(
    (step) => step.kind === "message" && step.from === step.to,
  );
  return {
    actors: measured,
    byId: new Map(measured.map((actor) => [actor.id, actor])),
    steps: placed,
    width: width + (selfMost ? SELF_WIDTH + 8 : 0),
    height: top + placed.length * STEP,
    lifelineTop: headHeight / 2,
    options,
  };
}

export function drawSequence(plan) {
  const lifelines = plan.actors
    .map(
      (actor) =>
        `<path class="diagram-lifeline" d="M${n(actor.x)} ${n(plan.lifelineTop + actor.height / 2)} ` +
        `L${n(actor.x)} ${n(plan.height)}" stroke-dasharray="4 5"/>`,
    )
    .join("");

  const marks = [];
  const labels = [];
  for (const step of plan.steps) {
    if (step.kind === "note") {
      const actor = plan.byId.get(step.actor);
      if (!actor) continue;
      const width = textWidth(step.label, 12) + 20;
      const height = lineHeight(12) + 10;
      marks.push(
        `<rect class="diagram-note" x="${n(actor.x + 10)}" y="${n(step.y - height / 2)}" ` +
          `width="${n(width)}" height="${n(height)}"/>` +
          `<text class="diagram-edge-text" x="${n(actor.x + 20)}" y="${n(step.y)}" ` +
          `dominant-baseline="central">${esc(step.label)}</text>`,
      );
      continue;
    }
    const from = plan.byId.get(step.from);
    const to = plan.byId.get(step.to);
    if (!from || !to) continue;
    if (from === to) {
      const points = [
        { x: from.x, y: step.y - 8 },
        { x: from.x + SELF_WIDTH, y: step.y - 8 },
        { x: from.x + SELF_WIDTH, y: step.y + 8 },
        { x: from.x + 3, y: step.y + 8 },
      ];
      marks.push(polyline(points, step.dash));
      marks.push(arrowHead(points[2], points[3], step.head));
      labels.push(
        edgeLabel(step.label, from.x + SELF_WIDTH + 8, step.y, { anchor: "start" }),
      );
      continue;
    }
    const forward = to.x > from.x;
    const start = { x: from.x + (forward ? 2 : -2), y: step.y };
    const end = { x: to.x + (forward ? -3 : 3), y: step.y };
    marks.push(polyline([start, end], step.dash));
    marks.push(arrowHead(start, end, step.head));
    // The label sits above the line rather than on it: a sequence diagram is
    // read as a stack of rows, and a patch cut into every row would leave the
    // lifelines dotted with holes.
    labels.push(
      edgeLabel(step.label, (start.x + end.x) / 2, step.y - FONT * 0.75, {
        anchor: "middle",
      }),
    );
  }

  return {
    marks: lifelines + marks.join(""),
    labels: labels.join(""),
    nodes: plan.actors.map(drawNode).join(""),
  };
}

export function describeSequence({ steps }) {
  return steps.map((step) =>
    step.kind === "note"
      ? `${step.actor}: ${step.label}`
      : `${step.from} → ${step.to}${step.label ? `: ${step.label}` : ""}`,
  );
}
