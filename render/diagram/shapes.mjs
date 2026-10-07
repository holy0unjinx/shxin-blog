// The pieces every diagram is drawn from: a node's box, an arrow head, a
// polyline, a label with the paper showing through behind it.
//
// No colour. A node is an outline on the page, an arrow is told from its
// neighbour by line pattern and head, and a label sits on a knocked-out patch
// of paper rather than on a coloured chip.

import { esc } from "../escape.mjs";
import { lineHeight, textWidth } from "../chart/text.mjs";

export const FONT = 14;
// A dash pattern in user units. Kept here so a diagram and a chart do not
// drift apart in how a dashed line looks.
export const DASHES = new Map([
  ["solid", ""],
  ["dashed", "6 4"],
]);

export const n = (value) =>
  Number.isFinite(value) ? String(Math.round(value * 100) / 100) : "0";

// Node text wraps at a sensible measure rather than stretching one box across
// the figure. Words break on blanks; a long unbroken run is left alone, since
// cutting inside a word costs more than a wide box.
export function wrap(text, maxWidth, fontSize = FONT) {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && textWidth(candidate, fontSize) > maxWidth) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * The box a node needs, given its text.
 *
 * A decision is a diamond, which only holds its label if it is wider than the
 * text; a circle is sized by the longer of the two axes for the same reason.
 */
export function measureNode(node, { maxWidth = 168, fontSize = FONT } = {}) {
  const lines = wrap(node.text, maxWidth, fontSize);
  const textW = Math.max(...lines.map((line) => textWidth(line, fontSize)));
  const textH = lines.length * lineHeight(fontSize);
  const padX = node.shape === "decision" ? 26 : 14;
  const padY = node.shape === "decision" ? 18 : 10;
  let width = Math.ceil(textW + padX * 2);
  let height = Math.ceil(textH + padY * 2);
  if (node.shape === "decision") {
    width = Math.ceil(width * 1.35);
    height = Math.ceil(height * 1.5);
  }
  if (node.shape === "circle") {
    const side = Math.max(width, height);
    width = side;
    height = side;
  }
  return { ...node, lines, width, height: Math.max(height, 34) };
}

export function nodeShape(node) {
  const { x, y, width, height, shape } = node;
  const half = { x: width / 2, y: height / 2 };
  if (shape === "circle")
    return `<ellipse class="diagram-node-shape" cx="${n(x)}" cy="${n(y)}" rx="${n(half.x)}" ry="${n(half.y)}"/>`;
  if (shape === "decision") {
    const points = [
      [x, y - half.y],
      [x + half.x, y],
      [x, y + half.y],
      [x - half.x, y],
    ]
      .map(([px, py]) => `${n(px)},${n(py)}`)
      .join(" ");
    return `<polygon class="diagram-node-shape" points="${points}"/>`;
  }
  const radius = shape === "round" ? Math.min(12, height / 2) : 0;
  return (
    `<rect class="diagram-node-shape" x="${n(x - half.x)}" y="${n(y - half.y)}" ` +
    `width="${n(width)}" height="${n(height)}"${radius ? ` rx="${n(radius)}"` : ""}/>`
  );
}

export function nodeLabel(node, { fontSize = FONT, className = "diagram-node-text" } = {}) {
  const step = lineHeight(fontSize);
  const top = node.y - ((node.lines.length - 1) * step) / 2;
  return node.lines
    .map(
      (line, index) =>
        `<text class="${className}" x="${n(node.x)}" y="${n(top + index * step)}" ` +
        `text-anchor="middle" dominant-baseline="central">${esc(line)}</text>`,
    )
    .join("");
}

export function drawNode(node) {
  return `<g class="diagram-node">${nodeShape(node)}${nodeLabel(node)}</g>`;
}

// An arrow head is a small filled triangle, or an open pair of strokes when
// the arrow is drawn with an open head. Both are built from the direction the
// line arrives in, so no marker element and no marker id is needed.
export function arrowHead(from, to, head) {
  if (head === "none") return "";
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const size = 8;
  const spread = 0.42;
  const left = {
    x: to.x - size * Math.cos(angle - spread),
    y: to.y - size * Math.sin(angle - spread),
  };
  const right = {
    x: to.x - size * Math.cos(angle + spread),
    y: to.y - size * Math.sin(angle + spread),
  };
  if (head === "open")
    return (
      `<path class="diagram-head-open" d="M${n(left.x)} ${n(left.y)} L${n(to.x)} ${n(to.y)} ` +
      `L${n(right.x)} ${n(right.y)}"/>`
    );
  return (
    `<polygon class="diagram-head" points="${n(to.x)},${n(to.y)} ` +
    `${n(left.x)},${n(left.y)} ${n(right.x)},${n(right.y)}"/>`
  );
}

export function polyline(points, dash) {
  const pattern = DASHES.get(dash) || "";
  const d = points
    .map((point, index) => `${index ? "L" : "M"}${n(point.x)} ${n(point.y)}`)
    .join(" ");
  return `<path class="diagram-edge" d="${d}"${pattern ? ` stroke-dasharray="${pattern}"` : ""}/>`;
}

/**
 * An edge label. The patch behind it is the paper colour, so a label that
 * lands on a line stays readable without a box drawn around it.
 */
export function edgeLabel(text, x, y, { anchor = "middle", fontSize = 12 } = {}) {
  if (!text) return "";
  const width = textWidth(text, fontSize) + 8;
  const height = fontSize + 6;
  const left =
    anchor === "start" ? x - 4 : anchor === "end" ? x - width + 4 : x - width / 2;
  return (
    `<rect class="diagram-label-patch" x="${n(left)}" y="${n(y - height / 2)}" ` +
    `width="${n(width)}" height="${n(height)}"/>` +
    `<text class="diagram-edge-text" x="${n(x)}" y="${n(y)}" text-anchor="${anchor}" ` +
    `dominant-baseline="central">${esc(text)}</text>`
  );
}

// Where a straight line from `from` to `to` leaves `from`'s outline. A
// rectangle is clipped on its sides, an ellipse on its rim, and a diamond is
// close enough to its rectangle for the arrow to land where a reader expects.
export function borderPoint(node, toward) {
  const dx = toward.x - node.x;
  const dy = toward.y - node.y;
  if (!dx && !dy) return { x: node.x, y: node.y };
  const half = { x: node.width / 2, y: node.height / 2 };
  if (node.shape === "circle") {
    const scale = 1 / Math.hypot(dx / half.x, dy / half.y);
    return { x: node.x + dx * scale, y: node.y + dy * scale };
  }
  const scale = Math.min(
    dx ? half.x / Math.abs(dx) : Infinity,
    dy ? half.y / Math.abs(dy) : Infinity,
  );
  return { x: node.x + dx * scale, y: node.y + dy * scale };
}
