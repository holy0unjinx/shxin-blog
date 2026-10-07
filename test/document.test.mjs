// Document-level features: numbering, cross references, data files and the
// fences that read them.
import assert from "node:assert/strict";
import test from "node:test";

import {
  excerpt,
  renderDocument,
  renderMarkdown,
  searchText,
} from "../render/index.mjs";

test("a forward reference resolves once the whole document is read", () => {
  const html = renderMarkdown('[@fig:a]\n\n![alt](/a.png "{#fig:a} 뒤에 있는 그림")');
  assert.match(html, /<a class="xref" href="#fig-a">그림 1<\/a>/);
});

test("a bare reference prints the number alone", () => {
  const html = renderMarkdown('[@#fig:a]\n\n![alt](/a.png "{#fig:a} 그림")');
  assert.match(html, /<a class="xref" href="#fig-a">1<\/a>/);
});

test("a reference nobody defined stays as it was written", () => {
  const { html, numbering } = renderDocument("[@fig:ghost]를 보라");
  assert.match(html, /\[@fig:ghost\]를 보라/);
  assert.deepEqual(numbering.missing(), [{ kind: "fig", label: "ghost" }]);
});

test("a reference inside inline code is code, not a reference", () => {
  assert.match(renderMarkdown("`[@fig:a]`"), /<code>\[@fig:a\]<\/code>/);
});

test("a section label makes the heading callable by name", () => {
  const html = renderMarkdown("## CA 세우기 {#sec:setup}\n\n[@sec:setup]을 보라");
  assert.match(html, /<h3 id="ca-세우기">CA 세우기<\/h3>/);
  assert.match(html, /<a class="xref" href="#ca-세우기">CA 세우기<\/a>을 보라/);
});

test("a labelled equation carries a number in the margin", () => {
  const html = renderMarkdown("$$ {#eq:mass}\nE = mc^2\n$$\n\n[@eq:mass]");
  assert.match(
    html,
    /<div class="math-block" id="eq-mass"><div class="math math-display">E = mc\^2<\/div><span class="eq-number">\(1\)<\/span><\/div>/,
  );
  assert.match(html, /<a class="xref" href="#eq-mass">식 1<\/a>/);
});

test("an unlabelled equation is left as it was", () => {
  assert.equal(
    renderMarkdown("$$\nE = mc^2\n$$"),
    '<div class="math math-display">E = mc^2</div>',
  );
});

test("a chart takes the next figure number and answers to its label", () => {
  const html = renderMarkdown(
    "```chart {type=line}\n: {#fig:subs} 가입자\n| 연도 | 2023 | 2024 |\n| 국내 | 1 | 2 |\n```\n\n[@fig:subs]",
  );
  assert.match(html, /<figure class="chart" id="fig-subs">/);
  assert.match(html, /<span class="caption-number">그림 1\.<\/span> 가입자/);
  assert.match(html, /<a class="xref" href="#fig-subs">그림 1<\/a>/);
});

test("a chart reads its grid from a data file", () => {
  const html = renderMarkdown(
    "```chart {type=line, src=data/subs.csv}\n: 가입자\n```",
    { resolve: (path) => (path === "data/subs.csv" ? "연도,2023,2024\n국내,1,2\n" : null) },
  );
  assert.match(html, /<figure class="chart"/);
  assert.match(html, /<svg class="chart-svg"/);
});

test("a grid written in the fence beats the file it also names", () => {
  const html = renderMarkdown(
    "```chart {type=line, src=data/subs.csv}\n| 연도 | 1 | 2 |\n| 국내 | 9 | 9 |\n```",
    { resolve: () => "연도,1,2\n국내,1,2\n" },
  );
  assert.match(html, /9/);
});

test("a chart naming a file it cannot read falls back to a code block", () => {
  const { html, unreadable, missingFiles } = renderDocument(
    "```chart {type=line, src=gone.csv}\n: 캡션\n```",
    { resolve: () => null },
  );
  assert.match(html, /<figure class="code-block">/);
  assert.deepEqual(unreadable, ["chart"]);
  assert.deepEqual(missingFiles, ["gone.csv"]);
});

test("a table fence reads its rows from a data file", () => {
  const html = renderMarkdown(
    "```table {src=data/ca.csv}\n: {#tbl:ca} CA 비교\n```",
    { resolve: () => "구분,루트 CA\n수명,10~20년\n" },
  );
  assert.match(html, /<div class="table-wrap" id="tbl-ca">/);
  assert.match(html, /<span class="caption-number">표 1\.<\/span> CA 비교/);
  assert.match(html, /<td[^>]*>루트 CA<\/td>/);
});

test("a pipe inside a data cell stays a character", () => {
  const html = renderMarkdown("```table {src=a.csv}\n```", {
    resolve: () => '"a|b",c\n',
  });
  assert.match(html, /<td[^>]*>a\|b<\/td>/);
});

test("a table fence with no readable file falls back to a code block", () => {
  const { html, unreadable } = renderDocument("```table {src=gone.csv}\n```", {
    resolve: () => null,
  });
  assert.match(html, /<figure class="code-block">/);
  assert.deepEqual(unreadable, ["table"]);
});

test("a table fence with a row range and a column list crops the file", () => {
  // Semicolons separate inside one attribute; a comma already ends one.
  const html = renderMarkdown("```table {src=a.csv, row-range=2:3, columns=1;3}\n```", {
    resolve: () => "h1,h2,h3\na,b,c\nd,e,f\ng,h,i\n",
  });
  assert.match(html, /<td[^>]*>a<\/td><td[^>]*>c<\/td>/);
  assert.doesNotMatch(html, />h1</);
  assert.doesNotMatch(html, />g</);
});

test("a code fence reads a file and says which one", () => {
  const html = renderMarkdown("```js {src=lib/a.mjs, lines}\n```", {
    resolve: () => "export default 1;\n",
  });
  assert.match(html, /export default 1;/);
  assert.match(html, /<span class="code-file">lib\/a\.mjs<\/span>/);
  assert.match(html, /class="code-gutter"/);
});

test("every file a document could not read is reported once", () => {
  const { missingFiles } = renderDocument("```js {src=gone.mjs}\n```", {
    resolve: () => null,
  });
  assert.deepEqual(missingFiles, ["gone.mjs"]);
});

test("a marker character in the manuscript cannot forge a reference", () => {
  const forged = `${String.fromCharCode(2)}fig:a${String.fromCharCode(2)}`;
  const html = renderMarkdown(`${forged}\n\n![alt](/a.png "{#fig:a} 그림")`);
  assert.doesNotMatch(html, /class="xref"/);
});

test("a table of contents entry loses the section label", () => {
  const { headings } = renderDocument("## 제목 {#sec:x}");
  assert.deepEqual(headings, [{ level: 3, id: "제목", text: "제목" }]);
});

test("the search index drops references and keeps the words around them", () => {
  const text = searchText(
    "[@fig:a]를 보라. [@tls13]도.\n\n: {#fig:a} 캡션 본문\n| a |\n| --- |\n| 1 |",
  );
  assert.doesNotMatch(text, /@fig:a|@tls13|\{#/);
  assert.match(text, /를 보라/);
  assert.match(text, /캡션 본문/);
});

test("a sidenote's words are searchable", () => {
  const text = searchText("본문[^^s]이다.\n\n[^^s]: 곁의 글");
  assert.match(text, /곁의 글/);
  assert.doesNotMatch(text, /\[\^\^/);
});

test("a summary drawn from the body carries no reference markup", () => {
  assert.equal(excerpt("[@fig:a]를 보라. 두 번째 문장."), "를 보라. 두 번째 문장.");
  // 각주와 사이드노트 표시도 마찬가지다. 링크 라벨의 대괄호와 달리 안에
  // 읽을 글이 없다.
  assert.equal(excerpt("본문[^a]과 곁[^^s]. 둘째."), "본문과 곁. 둘째.");
});
