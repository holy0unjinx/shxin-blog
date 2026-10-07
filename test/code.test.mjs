import assert from "node:assert/strict";
import test from "node:test";

import { languageName, parseRanges, renderCodeBlock } from "../render/code.mjs";
import { createNumbering } from "../render/numbering.mjs";

test("a plain fence keeps the shape it always had", () => {
  const { html } = renderCodeBlock("js", "const a = 1;\n");
  assert.match(html, /<figure class="code-block">/);
  assert.match(html, /<span class="code-lang">JavaScript<\/span>/);
  assert.match(html, /<code class="language-js">const a = 1;<\/code>/);
  assert.match(html, /class="copy-code"/);
});

test("a fence with no language is text", () => {
  assert.match(renderCodeBlock("", "x").html, /language-text/);
});

test("code is escaped, so a tag in a fence stays a tag on the page", () => {
  assert.match(renderCodeBlock("html", "<b>&</b>").html, /&lt;b&gt;&amp;&lt;\/b&gt;/);
});

test("a file name sits beside the language rather than replacing it", () => {
  const { html } = renderCodeBlock("js {file=server.mjs}", "x");
  assert.match(html, /<span class="code-lang">JavaScript<\/span>/);
  assert.match(html, /<span class="code-file">server\.mjs<\/span>/);
});

test("line numbers run beside the code and outside the copied text", () => {
  const { html } = renderCodeBlock("js {lines}", "a\nb\nc");
  assert.match(html, /<pre class="code-gutter" aria-hidden="true">1\n2\n3<\/pre>/);
  assert.match(html, /class="code-body has-lines"/);
  assert.doesNotMatch(html, /<code[^>]*>[^<]*1/);
});

test("a starting number implies line numbers and shifts them", () => {
  const { html } = renderCodeBlock("js {from=10}", "a\nb");
  assert.match(html, />10\n11</);
});

test("no line numbers unless asked for", () => {
  assert.doesNotMatch(renderCodeBlock("js", "a\nb").html, /code-gutter/);
});

test("ranges are read the way an author writes them", () => {
  assert.deepEqual(parseRanges("3"), [[3, 3]]);
  assert.deepEqual(parseRanges("3-5"), [[3, 5]]);
  assert.deepEqual(parseRanges("3-5;9"), [[3, 5], [9, 9]]);
  assert.deepEqual(parseRanges("5-3"), []);
  assert.deepEqual(parseRanges("nope"), []);
});

test("a highlighted range becomes one band in line units", () => {
  const { html } = renderCodeBlock("js {hl=2-3}", "a\nb\nc\nd");
  assert.match(html, /<span class="code-mark" style="--from:1;--span:2"><\/span>/);
});

test("touching ranges merge into one band", () => {
  const { html } = renderCodeBlock("js {hl=1-2;3}", "a\nb\nc");
  assert.equal((html.match(/code-mark/g) || []).length, 1);
  assert.match(html, /--from:0;--span:3/);
});

test("a range outside the block is dropped instead of drawing off the end", () => {
  const { html } = renderCodeBlock("js {hl=9}", "a\nb");
  assert.doesNotMatch(html, /code-mark/);
});

test("a highlighted range counts from the block's own first number", () => {
  const { html } = renderCodeBlock("js {from=10, hl=11}", "a\nb\nc");
  assert.match(html, /--from:1;--span:1/);
});

test("a diff marks its own added and removed lines", () => {
  const { html } = renderCodeBlock("diff", "--- a\n+++ b\n-old\n+new\n+more\n ctx");
  assert.match(html, /class="code-add" style="--from:3;--span:2"/);
  assert.match(html, /class="code-del" style="--from:2;--span:1"/);
});

test("a labelled listing takes a number and somewhere to land", () => {
  const numbering = createNumbering();
  const { html } = renderCodeBlock("js {#lst:serve}", "x", { numbering });
  assert.match(html, /id="lst-serve"/);
  // 번호는 툴바에 찍지 않는다. 본문의 "[@lst:serve]"가 이 앵커로 데려간다.
  assert.ok(!numbering.assign(html).includes("코드 1"));
});

test("an unlabelled listing claims no number", () => {
  const numbering = createNumbering();
  renderCodeBlock("js", "x", { numbering });
  assert.equal(numbering.entries().length, 0);
});

test("src reads the file and names it in the toolbar", () => {
  const { html, missing } = renderCodeBlock("js {src=lib/a.mjs}", "", {
    resolve: (path) => (path === "lib/a.mjs" ? "export default 1;\n" : null),
  });
  assert.match(html, /export default 1;/);
  assert.match(html, /<span class="code-file">lib\/a\.mjs<\/span>/);
  assert.equal(missing, "");
});

test("an unreadable src keeps the inline body and reports the path", () => {
  const { html, missing } = renderCodeBlock("js {src=gone.mjs}", "fallback", {
    resolve: () => null,
  });
  assert.match(html, /fallback/);
  assert.equal(missing, "gone.mjs");
});

test("the toolbar prints the language people call it, not the fence's shorthand", () => {
  assert.equal(languageName("js"), "JavaScript");
  assert.equal(languageName("YML"), "YAML");
  // 모르는 이름은 글쓴이가 적은 그대로 나간다.
  assert.equal(languageName("brainfuck"), "brainfuck");
});
