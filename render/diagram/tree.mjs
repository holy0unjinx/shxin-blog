// tree: an indented outline, drawn as one.
//
// Every subtree is measured before anything is placed, so a parent can sit
// centred over its children instead of over the first of them. Connectors are
// elbows rather than diagonals: a diagonal through a deep tree crosses its
// own siblings.

import {
  drawNode,
  measureNode,
  n,
} from "./shapes.mjs";

const SIBLING_GAP = 26;
const LEVEL_GAP = 46;

function measureTree(node) {
  const measured = measureNode(node, { maxWidth: 150 });
  const children = (node.children || []).map(measureTree);
  const spread =
    children.reduce((sum, child) => sum + child.span, 0) +
    SIBLING_GAP * Math.max(0, children.length - 1);
  return {
    ...measured,
    children,
    span: Math.max(measured.width, spread),
    depth:
      1 + (children.length ? Math.max(...children.map((child) => child.depth)) : 0),
  };
}

function place(node, left, top, rows) {
  const height = rows[node.level ?? 0];
  node.x = left + node.span / 2;
  node.y = top + node.height / 2;
  let childLeft =
    left + (node.span - (node.children.reduce((sum, child) => sum + child.span, 0) +
      SIBLING_GAP * Math.max(0, node.children.length - 1))) / 2;
  const childTop = top + height + LEVEL_GAP;
  for (const child of node.children) {
    child.level = (node.level ?? 0) + 1;
    place(child, childLeft, childTop, rows);
    childLeft += child.span + SIBLING_GAP;
  }
  return node;
}

// Each level is as deep as its deepest node, so a two-line label does not
// push only its own branch down.
function rowHeights(roots) {
  const heights = [];
  const walk = (node, level) => {
    heights[level] = Math.max(heights[level] || 0, node.height);
    for (const child of node.children) walk(child, level + 1);
  };
  for (const root of roots) walk(root, 0);
  return heights;
}

export function layoutTree({ roots }) {
  if (!roots.length) return null;
  const measured = roots.map(measureTree);
  const rows = rowHeights(measured);
  let left = 0;
  const placed = measured.map((root) => {
    root.level = 0;
    const node = place(root, left, 0, rows);
    left += root.span + SIBLING_GAP * 2;
    return node;
  });
  const flat = [];
  const collect = (node) => {
    flat.push(node);
    for (const child of node.children) collect(child);
  };
  for (const root of placed) collect(root);
  const width = Math.max(...flat.map((node) => node.x + node.width / 2));
  const height = Math.max(...flat.map((node) => node.y + node.height / 2));
  return { roots: placed, nodes: flat, width, height };
}

export function drawTree(plan) {
  const marks = [];
  const walk = (node) => {
    for (const child of node.children) {
      const startY = node.y + node.height / 2;
      const endY = child.y - child.height / 2;
      const middle = (startY + endY) / 2;
      marks.push(
        `<path class="diagram-edge" d="M${n(node.x)} ${n(startY)} L${n(node.x)} ${n(middle)} ` +
          `L${n(child.x)} ${n(middle)} L${n(child.x)} ${n(endY)}"/>`,
      );
      walk(child);
    }
  };
  for (const root of plan.roots) walk(root);
  return {
    marks: marks.join(""),
    labels: "",
    nodes: plan.nodes.map(drawNode).join(""),
  };
}

export function describeTree({ roots }) {
  const lines = [];
  const walk = (node, depth) => {
    lines.push(`${"  ".repeat(depth)}${node.text}`);
    for (const child of node.children || []) walk(child, depth + 1);
  };
  for (const root of roots) walk(root, 0);
  return lines;
}
