import assert from "node:assert/strict";
import test from "node:test";

import { bake, bakeCode, bakeMath, unescape } from "../site/bake.mjs";
import { renderDocument } from "../render/index.mjs";

test("escaping is undone on the way back out", () => {
  assert.equal(unescape("a &lt; b &amp;&amp; c &gt; d"), "a < b && c > d");
  assert.equal(unescape("&quot;q&quot; &#39;s&#39;"), "\"q\" 's'");
  // "&amp;lt;" is a literal "&lt;" and has to survive as one.
  assert.equal(unescape("&amp;lt;"), "&lt;");
});

test("an inline formula is drawn where it stood", async () => {
  const { html, baked, failed } = await bakeMath(
    '<p>x is <span class="math math-inline">x^2</span> here</p>',
  );
  assert.equal(baked, 1);
  assert.deepEqual(failed, []);
  assert.match(html, /<span class="math math-inline math-baked">/);
  assert.match(html, /<span class="katex">/);
  // The source survives inside KaTeX's own annotation, which is what a copy
  // out of the page lands as — so it is the raw element that must be gone.
  assert.doesNotMatch(html, /class="math math-inline">x\^2</);
  assert.match(html, /<annotation encoding="application\/x-tex">x\^2<\/annotation>/);
});

test("a display formula is drawn in display mode", async () => {
  const { html } = await bakeMath('<div class="math math-display">\\int_0^1 x</div>');
  assert.match(html, /katex-display/);
});

test("mathml rides along so a screen reader has something to read", async () => {
  const { html } = await bakeMath('<span class="math math-inline">x</span>');
  assert.match(html, /<math xmlns="http:\/\/www\.w3\.org\/1998\/Math\/MathML"/);
});

test("a formula with escaped source is unescaped before KaTeX sees it", async () => {
  const { html, failed } = await bakeMath(
    '<span class="math math-inline">a &lt; b</span>',
  );
  assert.deepEqual(failed, []);
  assert.match(html, /katex/);
});

test("a formula KaTeX cannot read keeps its source and is reported", async () => {
  const { html, baked, failed } = await bakeMath(
    '<div class="math math-display">\\frac{1}{</div>',
  );
  assert.equal(baked, 0);
  assert.equal(failed.length, 1);
  assert.match(html, /class="math math-display math-raw">\\frac\{1\}\{<\/div>/);
});

test("one bad formula does not take the good ones down with it", async () => {
  const { baked, failed } = await bakeMath(
    '<span class="math math-inline">x</span><span class="math math-inline">\\frac{1}{</span>',
  );
  assert.equal(baked, 1);
  assert.equal(failed.length, 1);
});

test("html with no formula is returned as it was", async () => {
  const { html, baked } = await bakeMath("<p>글</p>");
  assert.equal(html, "<p>글</p>");
  assert.equal(baked, 0);
});

test("code is highlighted into spans", async () => {
  const { html, baked } = await bakeCode(
    '<code class="language-js">const a = 1; // hi</code>',
  );
  assert.equal(baked, 1);
  assert.match(html, /<code class="language-js hljs">/);
  assert.match(html, /<span class="hljs-keyword">const<\/span>/);
  assert.match(html, /<span class="hljs-comment">\/\/ hi<\/span>/);
});

test("a plain fence is left plain", async () => {
  const { html, baked } = await bakeCode('<code class="language-text">x</code>');
  assert.equal(baked, 0);
  assert.equal(html, '<code class="language-text">x</code>');
});

test("an unknown language is left alone and named", async () => {
  const { html, unknown } = await bakeCode('<code class="language-klingon">x</code>');
  assert.match(html, /language-klingon">x</);
  assert.deepEqual(unknown, ["klingon"]);
});

test("our own fence names are not reported as unknown languages", async () => {
  // A chart fence that could not be read falls back to a code block, and
  // renderDocument already says so through `unreadable`.
  const { unknown } = await bakeCode(
    '<code class="language-chart">| a |</code><code class="language-diagram">a</code>',
  );
  assert.deepEqual(unknown, []);
});

test("escaped code round-trips through the highlighter", async () => {
  const { html } = await bakeCode(
    '<code class="language-html">&lt;b&gt;&amp;&lt;/b&gt;</code>',
  );
  assert.match(html, /&lt;/);
  assert.doesNotMatch(html, /(?<!&)<b>/);
});

test("both passes run over one document and report what it still needs", async () => {
  const document = renderDocument("$x$\n\n```js\nconst a = 1;\n```");
  const out = await bake(document.html);
  assert.equal(out.math, true);
  assert.equal(out.code, true);
  assert.match(out.html, /math-baked/);
  assert.match(out.html, /hljs-keyword/);
});

test("a document with neither needs neither", async () => {
  const out = await bake(renderDocument("그냥 글.").html);
  assert.equal(out.math, false);
  assert.equal(out.code, false);
});

test("a document whose only formula failed still needs the stylesheet", async () => {
  // The raw source is shown in KaTeX's absence, but the page is marked as
  // carrying math so the failure is visible rather than silently unstyled.
  const out = await bake(renderDocument("$$\\frac{1}{$$").html);
  assert.equal(out.math, true);
  assert.equal(out.failed.length, 1);
});
