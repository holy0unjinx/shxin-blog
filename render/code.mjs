// Code fences.
//
//   ```js {file=server.mjs, lines, hl=3-5;9, #lst:serve}
//
// The language keeps its old place at the front of the info string; everything
// after it is read as attributes, the same {key=value} shape a table and a
// chart use.
//
// Line numbers and highlighted lines are drawn *beside* the code rather than
// woven into it. Two reasons: highlight.js replaces the whole content of the
// <code> element, so anything wrapped around a line there would be thrown
// away; and a reader who selects the block gets the code alone, with no line
// numbers pasted into the middle of it.

import { readAttrs } from "./attrs.mjs";
import { esc } from "./escape.mjs";
import { numberCaption, takeLabel } from "./numbering.mjs";

// "3", "3-5", "3-5;9" — semicolons separate, because readAttrs already treats
// a comma as the end of one attribute.
export function parseRanges(value) {
  const ranges = [];
  for (const part of String(value || "").split(/[;+]/)) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) continue;
    const from = Number(match[1]);
    const to = match[2] ? Number(match[2]) : from;
    if (from < 1 || to < from) continue;
    ranges.push([from, to]);
  }
  return ranges;
}

// A diff fence marks its own lines, so the bands come from the content rather
// than from an attribute. "+++" and "---" are file headers, not changes.
function diffRanges(lines) {
  const added = [];
  const removed = [];
  lines.forEach((line, index) => {
    const number = index + 1;
    if (/^\+(?!\+\+)/.test(line)) added.push([number, number]);
    else if (/^-(?!--)/.test(line)) removed.push([number, number]);
  });
  return { added, removed };
}

// Neighbouring single lines become one band so a run of five added lines is
// one box instead of five boxes with hairlines between them.
function merge(ranges) {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [from, to] of sorted) {
    const last = merged[merged.length - 1];
    if (last && from <= last[1] + 1) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  return merged;
}

// One absolutely placed box per band, positioned in line units. The stylesheet
// turns --from and --span into a top offset and a height, so nothing here
// needs to know the line height.
function bands(ranges, className) {
  return merge(ranges)
    .map(
      ([from, to]) =>
        `<span class="${className}" style="--from:${from - 1};--span:${to - from + 1}"></span>`,
    )
    .join("");
}

function gutter(count, from) {
  const numbers = [];
  for (let i = 0; i < count; i++) numbers.push(from + i);
  // aria-hidden: the numbers are a way of pointing at a line in prose, not
  // part of the code, and a screen reader reading them between every line
  // would make the block unlistenable.
  return `<pre class="code-gutter" aria-hidden="true">${numbers.join("\n")}</pre>`;
}

/**
 * Renders one fence.
 *
 * `info` is everything after the opening backticks. `resolve` reads a file for
 * `{src=…}` and may be absent, in which case a fence that asks for one falls
 * back to whatever it carries inline.
 */
// 펜스에 적는 이름은 짧다(`js`). 툴바에 서는 이름은 사람이 부르는 이름이다
// ("JavaScript") — 라벨 한 칸을 아끼자고 읽는 쪽에 약자를 풀게 할 이유가 없다.
// 여기 없는 이름은 글쓴이가 적은 그대로 나간다.
const LANGUAGE_NAMES = new Map(
  Object.entries({
    bash: "Bash",
    c: "C",
    cjs: "JavaScript",
    cpp: "C++",
    cs: "C#",
    css: "CSS",
    dart: "Dart",
    diff: "Diff",
    dockerfile: "Dockerfile",
    go: "Go",
    graphql: "GraphQL",
    haskell: "Haskell",
    hs: "Haskell",
    html: "HTML",
    ini: "INI",
    java: "Java",
    javascript: "JavaScript",
    js: "JavaScript",
    json: "JSON",
    jsx: "JSX",
    kt: "Kotlin",
    kotlin: "Kotlin",
    latex: "LaTeX",
    lua: "Lua",
    makefile: "Makefile",
    markdown: "Markdown",
    md: "Markdown",
    mjs: "JavaScript",
    nginx: "nginx",
    perl: "Perl",
    php: "PHP",
    py: "Python",
    python: "Python",
    r: "R",
    rb: "Ruby",
    ruby: "Ruby",
    rs: "Rust",
    rust: "Rust",
    scala: "Scala",
    scss: "SCSS",
    sh: "Shell",
    shell: "Shell",
    sql: "SQL",
    swift: "Swift",
    tex: "TeX",
    text: "Text",
    toml: "TOML",
    ts: "TypeScript",
    tsx: "TSX",
    typescript: "TypeScript",
    xml: "XML",
    yaml: "YAML",
    yml: "YAML",
    zsh: "Zsh",
  }),
);

export const languageName = (language) =>
  LANGUAGE_NAMES.get(String(language).toLowerCase()) || String(language);

export function renderCodeBlock(info, body, { numbering, resolve } = {}) {
  const raw = String(info || "").trim();
  const [first, ...words] = raw.split(/\s+/);
  // The attributes share one brace group here, so the wrapping braces come off
  // before anything reads what is inside them.
  const attrText = words.join(" ").replace(/^\s*\{|\}\s*$/g, " ");
  const { kind, label, numbered, rest } = takeLabel(attrText);
  const attrs = readAttrs(rest);

  const language = (first || "").toLowerCase() || "text";
  let code = String(body).replace(/^\n+|\n+$/g, "");
  let missing = "";
  if (attrs.src) {
    const loaded = resolve?.(attrs.src);
    if (typeof loaded === "string") code = loaded.replace(/\s+$/, "");
    // A fence that names a file it cannot read keeps whatever it had inline,
    // and says so to the linter rather than going quietly empty.
    else missing = attrs.src;
  }

  const lines = code.split("\n");
  const from = Number.parseInt(attrs.from ?? "", 10);
  const start = Number.isInteger(from) && from > 0 ? from : 1;
  // {from=10} implies line numbers: naming a starting number and then not
  // printing one would say nothing.
  const wantsLines = attrs.lines !== undefined || Number.isInteger(from);
  const showLines = wantsLines && attrs.lines !== "no";

  // Ranges are written the way the author counts, so a block starting at 10
  // has {hl=12} pointing at its third line.
  const shift = (ranges) =>
    ranges
      .map(([a, b]) => [a - start + 1, b - start + 1])
      .filter(([a, b]) => b >= 1 && a <= lines.length)
      .map(([a, b]) => [Math.max(1, a), Math.min(lines.length, b)]);

  const highlighted = shift(parseRanges(attrs.hl));
  const diff = language === "diff" ? diffRanges(lines) : { added: [], removed: [] };
  const layers =
    bands(highlighted, "code-mark") +
    bands(diff.added, "code-add") +
    bands(diff.removed, "code-del");

  // A listing is numbered only when it was labelled: most code blocks are read
  // where they sit and are never referred to by number, and a number nobody
  // calls is furniture.
  const numberedBlock =
    label && numbered
      ? numberCaption(numbering, kind || "lst", `#${kind || "lst"}:${label}`, {
          force: true,
        })
      : { id: "", prefix: "", text: "", entry: null };
  const id = numberedBlock.id ? ` id="${esc(numberedBlock.id)}"` : "";

  // 툴바는 왼쪽에 언어, 오른쪽에 파일명과 Copy다. 번호는 찍지 않는다 —
  // 코드는 대개 놓인 자리에서 읽히고, 부를 일이 있는 블록은 이름표가 앵커를
  // 가지므로 본문의 "[@lst:서버]"가 그대로 그 자리로 데려간다.
  const file = attrs.file || attrs.src || "";
  const toolbar =
    `<figcaption class="code-toolbar">` +
    `<span class="code-lang">${esc(languageName(language))}</span>` +
    `<span class="code-tools">` +
    `${file ? `<span class="code-file">${esc(file)}</span>` : ""}` +
    `<button type="button" class="copy-code">Copy</button></span>` +
    `</figcaption>`;

  const html =
    `<figure class="code-block"${id}>${toolbar}` +
    `<div class="code-body${showLines ? " has-lines" : ""}">` +
    `${showLines ? gutter(lines.length, start) : ""}` +
    `<div class="code-scroll">${layers ? `<div class="code-layers" aria-hidden="true">${layers}</div>` : ""}` +
    `<pre><code class="language-${esc(language)}">${esc(code)}</code></pre></div></div></figure>`;

  return { html, missing, language };
}
