// Diagram fence -> a shape the layouts can read.
//
// Three grammars share this file because they share their pieces: a node is
// written the same way in all three, an arrow is written the same way, and a
// label always follows a colon.
//
//   flow      시작 -> 검사;  검사 -> 발급: 유효
//   sequence  클라이언트 -> 서버: ClientHello
//   tree      indented outline
//
// Nothing here draws. It turns text into nodes and edges and hands them on.

import { readAttrs } from "../attrs.mjs";
import { TABLE_CAPTION } from "../table.mjs";

export const TYPES = new Set(["flow", "sequence", "tree"]);

// A node wears its shape as brackets. The text inside is both the label and
// the identity, so an author never declares a node before using it.
const SHAPES = [
  [/^\(\((.*)\)\)$/, "circle"],
  [/^\[(.*)\]$/, "box"],
  [/^\((.*)\)$/, "round"],
  [/^<(.*)>$/, "decision"],
];

export function readNode(raw) {
  const text = String(raw).trim();
  for (const [pattern, shape] of SHAPES) {
    const match = text.match(pattern);
    if (match) return { id: match[1].trim(), text: match[1].trim(), shape };
  }
  return { id: text, text, shape: "box" };
}

// Four arrows, told apart by line pattern and head rather than by colour:
// solid, dashed, plain (no head) and open head.
const ARROWS = new Map([
  ["-->>", { dash: "dashed", head: "open" }],
  ["->>", { dash: "solid", head: "open" }],
  ["-->", { dash: "dashed", head: "filled" }],
  ["->", { dash: "solid", head: "filled" }],
  ["--", { dash: "solid", head: "none" }],
]);

const ARROW = /(-->>|->>|-->|->|--)/;

// A label follows the first colon that is not inside a node's brackets. An
// arrow is stepped over rather than read as brackets — "->" ends in a ">",
// and counting that as a closing bracket would put the scan one level below
// where it started.
const ARROW_AT = /^(?:-->>|->>|-->|->|--)/;

function splitLabel(text) {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const arrow = text.slice(i).match(ARROW_AT);
    if (arrow) {
      i += arrow[0].length - 1;
      continue;
    }
    const char = text[i];
    if (char === "(" || char === "[" || char === "<") depth++;
    else if (char === ")" || char === "]" || char === ">") depth = Math.max(0, depth - 1);
    else if (char === ":" && depth === 0)
      return { body: text.slice(0, i).trim(), label: text.slice(i + 1).trim() };
  }
  return { body: text.trim(), label: "" };
}

/**
 * Splits a fence into its type, its attributes, its captions and its lines.
 * The captions read exactly as a table's and a chart's do.
 */
export function parseFence(lang, body) {
  const brace = String(lang).match(/\{([^}]*)\}/);
  const attrs = brace ? readAttrs(brace[1]) : {};
  const lines = [];
  let captionAbove = "";
  let captionBelow = "";
  for (const line of String(body).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;
    const caption = trimmed.match(TABLE_CAPTION);
    if (caption) {
      if (lines.length) captionBelow = caption[1];
      else captionAbove = caption[1];
      continue;
    }
    lines.push(line.replace(/\s+$/, ""));
  }
  return { type: attrs.type || "", attrs, captionAbove, captionBelow, lines };
}

/**
 * flow: a list of edges, and whatever nodes they mention.
 *
 * A node with no edge at all is written on its own line, which is how a
 * diagram of one box is drawn.
 */
export function parseFlow(lines) {
  const nodes = new Map();
  const edges = [];
  const claim = (raw) => {
    const node = readNode(raw);
    if (!node.id) return null;
    // 처음 나온 자리가 모양을 정한다. 뒤에서 이름만 부른 것이 앞의 모양을
    // 지우지 않게 하려는 것이다.
    if (!nodes.has(node.id)) nodes.set(node.id, node);
    else if (node.shape !== "box") nodes.set(node.id, node);
    return nodes.get(node.id);
  };

  for (const line of lines) {
    const { body, label } = splitLabel(line);
    if (!ARROW.test(body)) {
      claim(body);
      continue;
    }
    // A chain "a -> b -> c" is read as the two edges it names.
    const parts = body.split(ARROW);
    for (let i = 0; i + 2 < parts.length + 1; i += 2) {
      const from = claim(parts[i]);
      const arrow = ARROWS.get((parts[i + 1] || "").trim());
      const to = parts[i + 2] === undefined ? null : claim(parts[i + 2]);
      if (!from || !to || !arrow) continue;
      edges.push({
        from: from.id,
        to: to.id,
        // 한 사슬에 여러 화살이 있으면 라벨은 마지막 화살에만 붙는다.
        label: i + 3 >= parts.length ? label : "",
        ...arrow,
      });
    }
  }
  return { nodes: [...nodes.values()], edges };
}

/**
 * sequence: participants in the order they first speak, plus the messages
 * between them.
 */
export function parseSequence(lines) {
  const actors = new Map();
  const steps = [];
  const claim = (raw) => {
    const node = readNode(raw);
    if (!node.id) return null;
    if (!actors.has(node.id)) actors.set(node.id, node);
    return actors.get(node.id);
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const declared = trimmed.match(/^participant\s+(.+)$/i);
    if (declared) {
      claim(declared[1]);
      continue;
    }
    const note = trimmed.match(/^note\s+([^:]+):\s*(.*)$/i);
    if (note) {
      const actor = claim(note[1]);
      if (actor) steps.push({ kind: "note", actor: actor.id, label: note[2].trim() });
      continue;
    }
    const { body, label } = splitLabel(trimmed);
    if (!ARROW.test(body)) continue;
    const [rawFrom, arrow, rawTo] = body.split(ARROW);
    const from = claim(rawFrom);
    const to = claim(rawTo);
    const style = ARROWS.get((arrow || "").trim());
    if (!from || !to || !style) continue;
    steps.push({ kind: "message", from: from.id, to: to.id, label, ...style });
  }
  return { actors: [...actors.values()], steps };
}

/**
 * tree: an indented outline. Two spaces or one tab is one level, and the
 * shallowest line in the fence sets the root's depth so a pasted outline does
 * not need its leading blanks trimmed.
 */
export function parseTree(lines) {
  const rows = lines
    .map((line) => {
      const match = line.match(/^([ \t]*)(.*)$/);
      const indent = match[1].replace(/\t/g, "  ").length;
      return { indent, raw: match[2].trim() };
    })
    .filter((row) => row.raw);
  if (!rows.length) return { roots: [] };

  const base = Math.min(...rows.map((row) => row.indent));
  const roots = [];
  const stack = [];
  for (const row of rows) {
    const node = { ...readNode(row.raw), children: [] };
    const depth = Math.floor((row.indent - base) / 2);
    while (stack.length > depth) stack.pop();
    if (!stack.length) {
      roots.push(node);
      stack.push(node);
      continue;
    }
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  return { roots };
}
