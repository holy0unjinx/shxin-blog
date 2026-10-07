// Mathematical environments, and the callout boxes that share their machinery.
import assert from "node:assert/strict";
import test from "node:test";

import { renderDocument, renderMarkdown } from "../render/index.mjs";

test("a theorem is named, numbered and anchored", () => {
  const html = renderMarkdown("> [!THEOREM] {#thm:pyth} 피타고라스\n> 직각삼각형에서.");
  assert.match(html, /<section class="environment environment-thm" id="thm-pyth">/);
  assert.match(html, /<span class="environment-name">정리 1<\/span>/);
  assert.match(html, /<span class="environment-note">\(피타고라스\)<\/span>/);
  assert.match(html, /<div class="environment-body"><p>직각삼각형에서\.<\/p><\/div>/);
});

test("each kind of environment counts on its own", () => {
  const html = renderMarkdown(
    "> [!THEOREM]\n> a\n\n> [!DEFINITION]\n> b\n\n> [!THEOREM]\n> c",
  );
  assert.match(html, /정리 1/);
  assert.match(html, /정의 1/);
  assert.match(html, /정리 2/);
});

test("a proof carries no number and ends with a tombstone", () => {
  const html = renderMarkdown("> [!PROOF]\n> 자명하다.");
  assert.match(html, /environment-proof/);
  assert.match(html, /<span class="environment-name">증명<\/span>/);
  assert.match(html, /<span class="qed" aria-label="증명 끝">∎<\/span>/);
  assert.doesNotMatch(html, /증명 1/);
});

test("an environment body is read as blocks, so a proof can hold real work", () => {
  const html = renderMarkdown(
    "> [!PROOF]\n> 첫 단계.\n>\n> $$a^2 = b$$\n>\n> - 하나\n> - 둘",
  );
  assert.match(html, /<p>첫 단계\.<\/p>/);
  assert.match(html, /<div class="math math-display">a\^2 = b<\/div>/);
  assert.match(html, /<ul><li>하나<\/li><li>둘<\/li><\/ul>/);
});

test("a code fence inside an environment stays a code fence", () => {
  const html = renderMarkdown("> [!EXAMPLE]\n> ```js\n> const a = 1;\n> ```");
  assert.match(html, /environment-ex/);
  assert.match(html, /<code class="language-js">const a = 1;<\/code>/);
});

test("a theorem can be called by name from the body", () => {
  const html = renderMarkdown("[@thm:pyth]\n\n> [!THEOREM] {#thm:pyth} 이름\n> x");
  assert.match(html, /<a class="xref" href="#thm-pyth">정리 1<\/a>/);
});

test("a label may name a series other than the environment's own", () => {
  const html = renderMarkdown("> [!THEOREM] {#lem:a} 이름\n> x");
  assert.match(html, /<span class="environment-name">보조정리 1<\/span>/);
});

test("an environment with no name of its own prints only its number", () => {
  const html = renderMarkdown("> [!REMARK]\n> x");
  assert.match(html, /<span class="environment-name">참고 1<\/span>/);
  assert.doesNotMatch(html, /environment-note/);
});

test("an unknown label is still a plain quote", () => {
  assert.equal(renderMarkdown("> [!NOPE]\n> x"), "<blockquote>[!NOPE] x</blockquote>");
});

test("a callout body is read as blocks too", () => {
  const html = renderMarkdown("> [!WARNING] 조심\n> 이유.\n>\n> - 하나");
  assert.match(html, /<div class="callout callout-warning">/);
  assert.match(html, /<p class="callout-title">조심<\/p>/);
  assert.match(html, /<ul><li>하나<\/li><\/ul>/);
});

test("a plain quote keeps the shape it always had", () => {
  assert.equal(renderMarkdown("> 인용\n> 이어짐"), "<blockquote>인용 이어짐</blockquote>");
});

test("a quote nested in a callout is still a quote", () => {
  const html = renderMarkdown("> [!NOTE] 제목\n> > 안쪽 인용");
  assert.match(html, /<div class="callout callout-note">.*<blockquote>안쪽 인용<\/blockquote>/s);
});

test("a details box collapses its block body", () => {
  const html = renderMarkdown("> [!DETAILS] 더\n> - 하나");
  assert.match(html, /<details class="callout callout-details"><summary>더<\/summary><ul>/);
});

test("environments and figures do not share a series", () => {
  const { numbering } = renderDocument(
    '> [!THEOREM] {#thm:a}\n> a\n\n![x](/a.png "{#fig:b} 그림")',
  );
  assert.deepEqual(
    numbering.entries().map((entry) => [entry.kind, numbering.numberOf(entry)]),
    [
      ["thm", 1],
      ["fig", 1],
    ],
  );
});

test("a hard break inside a theorem still breaks the line", () => {
  assert.match(renderMarkdown("> [!THEOREM]\n> 첫 줄\\\n> 둘째 줄"), /<br>/);
});
