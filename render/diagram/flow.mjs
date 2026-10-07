// flow: a layered graph.
//
// Layers come from the longest path to a node, which is the usual reading of
// a flow chart: a box sits below everything that must happen before it. Edges
// that point back up a layer are routed around the outside so the downward
// reading stays intact.

import {
  arrowHead,
  borderPoint,
  drawNode,
  edgeLabel,
  measureNode,
  polyline,
} from "./shapes.mjs";

const LAYER_GAP = 60;
const NODE_GAP = 30;

/**
 * Longest-path layering.
 *
 * A node sits one layer below everything that must happen before it, which is
 * how a flow chart is read. A cycle has no longest path, so the walk marks
 * the edge that closes one as a back edge and layers the rest; the drawing
 * then takes that edge around the outside.
 */
export function layerNodes(nodes, edges) {
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  edges.forEach((edge, index) => outgoing.get(edge.from)?.push({ to: edge.to, index }));

  // 0 not seen, 1 on the current walk, 2 finished.
  const state = new Map();
  const back = new Set();
  const finished = [];
  const walk = (id) => {
    state.set(id, 1);
    for (const { to, index } of outgoing.get(id) || []) {
      const seen = state.get(to) || 0;
      if (seen === 1) {
        back.add(index);
        continue;
      }
      if (seen === 0) walk(to);
    }
    state.set(id, 2);
    finished.push(id);
  };
  for (const node of nodes) if (!state.get(node.id)) walk(node.id);

  // finished is a reverse topological order of the graph without its back
  // edges, so one pass over it in reverse settles every layer.
  const layer = new Map(nodes.map((node) => [node.id, 0]));
  for (const id of finished.reverse())
    for (const { to, index } of outgoing.get(id) || []) {
      if (back.has(index)) continue;
      layer.set(to, Math.max(layer.get(to) || 0, (layer.get(id) || 0) + 1));
    }
  return layer;
}

export function layoutFlow({ nodes, edges }, { dir = "down" } = {}) {
  if (!nodes.length) return null;
  const measured = nodes.map((node) => measureNode(node));
  const layer = layerNodes(measured, edges);
  const vertical = dir !== "right";

  const rows = new Map();
  for (const node of measured) {
    const index = layer.get(node.id) || 0;
    if (!rows.has(index)) rows.set(index, []);
    rows.get(index).push(node);
  }
  const order = [...rows.keys()].sort((a, b) => a - b);

  // Along the layer axis every layer is as deep as its deepest node; across
  // it, the widest layer sets the figure's measure and the others are centred
  // in it.
  const depth = (node) => (vertical ? node.height : node.width);
  const breadth = (node) => (vertical ? node.width : node.height);
  const spans = order.map((index) =>
    rows.get(index).reduce((sum, node) => sum + breadth(node), 0) +
    NODE_GAP * (rows.get(index).length - 1),
  );
  const widest = Math.max(...spans);

  let along = 0;
  order.forEach((index, position) => {
    const row = rows.get(index);
    const deepest = Math.max(...row.map(depth));
    let across = (widest - spans[position]) / 2;
    for (const node of row) {
      const centreAcross = across + breadth(node) / 2;
      const centreAlong = along + deepest / 2;
      node.x = vertical ? centreAcross : centreAlong;
      node.y = vertical ? centreAlong : centreAcross;
      across += breadth(node) + NODE_GAP;
    }
    along += deepest + LAYER_GAP;
  });

  const width = vertical ? widest : along - LAYER_GAP;
  const height = vertical ? along - LAYER_GAP : widest;
  const byId = new Map(measured.map((node) => [node.id, node]));
  return { nodes: measured, byId, edges, layer, width, height, vertical };
}

// An edge between neighbouring layers leaves the source along the layer axis
// and enters the target the same way, with one step across in the middle. An
// edge that goes back up, or sideways within a layer, is taken around the
// outside where it cannot be mistaken for the main flow.
function edgePath(from, to, plan) {
  const { vertical } = plan;
  const forward =
    (plan.layer.get(to.id) || 0) > (plan.layer.get(from.id) || 0);
  if (forward) {
    const start = vertical
      ? { x: from.x, y: from.y + from.height / 2 }
      : { x: from.x + from.width / 2, y: from.y };
    const end = vertical
      ? { x: to.x, y: to.y - to.height / 2 }
      : { x: to.x - to.width / 2, y: to.y };
    const middle = vertical ? (start.y + end.y) / 2 : (start.x + end.x) / 2;
    const straight = vertical
      ? Math.abs(start.x - end.x) < 1
      : Math.abs(start.y - end.y) < 1;
    const points = straight
      ? [start, end]
      : vertical
        ? [start, { x: start.x, y: middle }, { x: end.x, y: middle }, end]
        : [start, { x: middle, y: start.y }, { x: middle, y: end.y }, end];
    return { points, label: vertical ? { x: (start.x + end.x) / 2, y: middle } : { x: middle, y: (start.y + end.y) / 2 } };
  }

  // Around the outside. The detour clears the widest node by a fixed margin
  // so two back edges in one figure do not sit on top of each other.
  const margin = 22;
  if (vertical) {
    const side = Math.max(from.x + from.width / 2, to.x + to.width / 2) + margin;
    const start = { x: from.x + from.width / 2, y: from.y };
    const end = { x: to.x + to.width / 2, y: to.y };
    return {
      points: [start, { x: side, y: start.y }, { x: side, y: end.y }, end],
      label: { x: side, y: (start.y + end.y) / 2 },
      outside: true,
    };
  }
  const side = Math.max(from.y + from.height / 2, to.y + to.height / 2) + margin;
  const start = { x: from.x, y: from.y + from.height / 2 };
  const end = { x: to.x, y: to.y + to.height / 2 };
  return {
    points: [start, { x: start.x, y: side }, { x: end.x, y: side }, end],
    label: { x: (start.x + end.x) / 2, y: side },
    outside: true,
  };
}

export function drawFlow(plan) {
  const marks = [];
  const labels = [];
  for (const edge of plan.edges) {
    const from = plan.byId.get(edge.from);
    const to = plan.byId.get(edge.to);
    if (!from || !to) continue;
    if (from === to) {
      // A self edge is a small loop off the node's right side.
      const start = { x: from.x + from.width / 2, y: from.y - 6 };
      const out = { x: start.x + 26, y: start.y };
      const back = { x: start.x + 26, y: from.y + 6 };
      const end = { x: from.x + from.width / 2, y: from.y + 6 };
      marks.push(polyline([start, out, back, end], edge.dash));
      marks.push(arrowHead(back, end, edge.head));
      labels.push(edgeLabel(edge.label, out.x + 6, from.y, { anchor: "start" }));
      continue;
    }
    const path = edgePath(from, to, plan);
    // The last leg is trimmed to the target's outline, so an arrow lands on a
    // diamond's point rather than inside it.
    const points = [...path.points];
    const last = points[points.length - 1];
    const previous = points[points.length - 2] || last;
    points[points.length - 1] = borderPoint(to, previous);
    marks.push(polyline(points, edge.dash));
    marks.push(arrowHead(previous, points[points.length - 1], edge.head));
    labels.push(
      edgeLabel(edge.label, path.label.x, path.label.y, {
        anchor: path.outside ? "start" : "middle",
      }),
    );
  }
  return {
    marks: marks.join(""),
    labels: labels.join(""),
    nodes: plan.nodes.map(drawNode).join(""),
  };
}

// The reading a screen reader is given, and the text a search index sees.
export function describeFlow({ nodes, edges }) {
  const lines = edges.map(
    (edge) =>
      `${edge.from} ${edge.head === "none" ? "—" : "→"} ${edge.to}${edge.label ? ` (${edge.label})` : ""}`,
  );
  const lonely = nodes
    .filter((node) => !edges.some((edge) => edge.from === node.id || edge.to === node.id))
    .map((node) => node.id);
  return [...lines, ...lonely];
}
