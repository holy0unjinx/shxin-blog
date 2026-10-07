import assert from "node:assert/strict";
import test from "node:test";

import { renderDiagram } from "../render/diagram/index.mjs";
import { layerNodes } from "../render/diagram/flow.mjs";
import {
  parseFence,
  parseFlow,
  parseSequence,
  parseTree,
  readNode,
} from "../render/diagram/parse.mjs";
import { borderPoint, measureNode, wrap } from "../render/diagram/shapes.mjs";
import { createNumbering } from "../render/numbering.mjs";
import { renderDocument, renderMarkdown } from "../render/index.mjs";

test("a node wears its shape as brackets", () => {
  assert.deepEqual(readNode("검사"), { id: "검사", text: "검사", shape: "box" });
  assert.equal(readNode("[상자]").shape, "box");
  assert.equal(readNode("(둥근)").shape, "round");
  assert.equal(readNode("<판단>").shape, "decision");
  assert.equal(readNode("((원))").shape, "circle");
  assert.equal(readNode("((원))").text, "원");
});

test("the fence splits into type, captions and lines", () => {
  const spec = parseFence("diagram {type=flow}", ": 위\na -> b\n: 아래");
  assert.equal(spec.type, "flow");
  assert.equal(spec.captionAbove, "위");
  assert.equal(spec.captionBelow, "아래");
  assert.deepEqual(spec.lines, ["a -> b"]);
});

test("four arrows are told apart by pattern and head", () => {
  const { edges } = parseFlow(["a -> b", "b --> c", "c -- d", "d ->> e"]);
  assert.deepEqual(
    edges.map(({ dash, head }) => `${dash}/${head}`),
    ["solid/filled", "dashed/filled", "solid/none", "solid/open"],
  );
});

test("a label follows the colon and never a bracket", () => {
  const { edges } = parseFlow(["검사 -> <거절: 아님>: 무효"]);
  assert.equal(edges[0].label, "무효");
  assert.equal(edges[0].to, "거절: 아님");
});

test("a chain names every edge in it and labels the last", () => {
  const { edges } = parseFlow(["a -> b -> c: 끝"]);
  assert.deepEqual(
    edges.map(({ from, to, label }) => [from, to, label]),
    [
      ["a", "b", ""],
      ["b", "c", "끝"],
    ],
  );
});

test("the first mention of a node fixes its shape", () => {
  const { nodes } = parseFlow(["a -> (b)", "(b) -> a"]);
  assert.equal(nodes.find((node) => node.id === "b").shape, "round");
});

test("a node with no edges is still a node", () => {
  const { nodes, edges } = parseFlow(["[혼자]"]);
  assert.equal(nodes.length, 1);
  assert.equal(edges.length, 0);
});

test("layers come from the longest path, not the first one found", () => {
  const graph = parseFlow(["a -> b", "b -> c", "a -> c"]);
  const layer = layerNodes(graph.nodes, graph.edges);
  assert.equal(layer.get("a"), 0);
  assert.equal(layer.get("b"), 1);
  assert.equal(layer.get("c"), 2);
});

test("a cycle does not make the layering run away", () => {
  const graph = parseFlow(["a -> b", "b -> c", "c -> a"]);
  const layer = layerNodes(graph.nodes, graph.edges);
  assert.ok(Math.max(...layer.values()) < graph.nodes.length);
});

test("participants take the order they first speak in", () => {
  const { actors } = parseSequence(["b -> a: x", "c -> a: y"]);
  assert.deepEqual(
    actors.map((actor) => actor.id),
    ["b", "a", "c"],
  );
});

test("a declared participant comes before one that only speaks", () => {
  const { actors } = parseSequence(["participant a", "b -> a: x"]);
  assert.deepEqual(
    actors.map((actor) => actor.id),
    ["a", "b"],
  );
});

test("a note is attached to one participant", () => {
  const { steps } = parseSequence(["a -> b: x", "note b: 준비"]);
  assert.deepEqual(steps[1], { kind: "note", actor: "b", label: "준비" });
});

test("an outline becomes a tree, and its own indent sets the root", () => {
  const { roots } = parseTree(["    루트", "      자식", "        손자"]);
  assert.equal(roots.length, 1);
  assert.equal(roots[0].children[0].children[0].text, "손자");
});

test("a tab counts as one level", () => {
  const { roots } = parseTree(["루트", "\t자식"]);
  assert.equal(roots[0].children.length, 1);
});

test("two roots stay two roots", () => {
  const { roots } = parseTree(["하나", "둘"]);
  assert.equal(roots.length, 2);
});

test("text wraps at the measure rather than stretching the box", () => {
  assert.deepEqual(wrap("하나 둘 셋 넷 다섯", 60), ["하나 둘", "셋 넷", "다섯"]);
});

test("a decision is wider than the words it holds", () => {
  const box = measureNode({ id: "a", text: "유효", shape: "box" });
  const diamond = measureNode({ id: "a", text: "유효", shape: "decision" });
  assert.ok(diamond.width > box.width);
  assert.ok(diamond.height > box.height);
});

test("a circle is as tall as it is wide", () => {
  const circle = measureNode({ id: "a", text: "끝", shape: "circle" });
  assert.equal(circle.width, circle.height);
});

test("an arrow lands on the outline, not inside it", () => {
  const node = { x: 100, y: 100, width: 40, height: 20, shape: "box" };
  assert.deepEqual(borderPoint(node, { x: 200, y: 100 }), { x: 120, y: 100 });
  assert.deepEqual(borderPoint(node, { x: 100, y: 200 }), { x: 100, y: 110 });
});

test("a flow diagram is one figure with a reading beside it", () => {
  const html = renderDiagram("diagram {type=flow}", "시작 -> (끝): 라벨");
  assert.match(html, /<figure class="diagram">/);
  assert.match(html, /<svg class="diagram-svg" viewBox="0 0 /);
  assert.match(html, /role="img"/);
  assert.match(html, /<ul class="diagram-reading"><li>시작 → 끝 \(라벨\)<\/li><\/ul>/);
});

test("a sequence diagram draws a lifeline for every participant", () => {
  const html = renderDiagram("diagram {type=sequence}", "a -> b: x");
  assert.equal((html.match(/class="diagram-lifeline"/g) || []).length, 2);
});

test("a self message loops instead of vanishing", () => {
  const html = renderDiagram("diagram {type=sequence}", "a -> a: 서명");
  assert.match(html, /서명/);
  assert.match(html, /class="diagram-edge"/);
});

test("a tree draws an elbow to every child", () => {
  const html = renderDiagram("diagram {type=tree}", "루트\n  하나\n  둘");
  assert.equal((html.match(/class="diagram-edge"/g) || []).length, 2);
});

test("an unknown type declines so the fence can fall back", () => {
  assert.equal(renderDiagram("diagram {type=nope}", "a -> b"), null);
  assert.equal(renderDiagram("diagram", "a -> b"), null);
  assert.equal(renderDiagram("diagram {type=flow}", ""), null);
});

test("a diagram takes a figure number and answers to its label", () => {
  const numbering = createNumbering();
  const html = renderDiagram(
    "diagram {type=flow}",
    ": {#fig:issue} 발급 절차\n시작 -> 끝",
    0,
    { numbering },
  );
  assert.match(html, /<figure class="diagram" id="fig-issue">/);
  assert.match(
    numbering.assign(html),
    /<span class="caption-number">그림 1\.<\/span> 발급 절차/,
  );
});

test("a diagram fence in an article is drawn, not printed", () => {
  const html = renderMarkdown(
    "```diagram {type=flow}\n: {#fig:a} 절차\n시작 -> 끝\n```\n\n[@fig:a]",
  );
  assert.match(html, /<figure class="diagram" id="fig-a">/);
  assert.match(html, /<a class="xref" href="#fig-a">그림 1<\/a>/);
});

test("an unreadable diagram fence falls back to a code block", () => {
  const { html, unreadable } = renderDocument("```diagram {type=nope}\na -> b\n```");
  assert.match(html, /<figure class="code-block">/);
  assert.deepEqual(unreadable, ["diagram"]);
});

test("charts and diagrams share one figure series", () => {
  const html = renderMarkdown(
    '![x](/a.png "그림")\n\n```diagram {type=flow}\n: 절차\n시작 -> 끝\n```',
  );
  assert.match(html, /그림 1\./);
  assert.match(html, /그림 2\./);
});

test("two diagrams on one page do not collide over an id", () => {
  const html = renderMarkdown(
    "```diagram {type=flow}\na -> b\n```\n\n```diagram {type=flow}\nc -> d\n```",
  );
  const ids = [...html.matchAll(/id="(diagram\d+-title)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, 2);
});
