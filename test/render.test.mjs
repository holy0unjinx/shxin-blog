import assert from "node:assert/strict";
import { test } from "node:test";

import {
  dateText,
  esc,
  excerpt,
  frontmatter,
  inline,
  plainText,
  readingMinutes,
  renderDocument,
  renderMarkdown,
  searchText,
  slugify,
} from "../render/index.mjs";

test("nested list keeps its hierarchy", () => {
  const html = renderMarkdown("- outer\n  - inner\n- second");
  assert.equal(
    html,
    "<ul><li>outer<ul><li>inner</li></ul></li><li>second</li></ul>",
  );
});

test("nested list survives three levels", () => {
  const html = renderMarkdown("- a\n  - b\n    - c");
  assert.equal(
    html,
    "<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li></ul>",
  );
});

test("ordered and unordered lists do not merge", () => {
  const html = renderMarkdown("- bullet\n1. number");
  assert.equal(html, "<ul><li>bullet</li></ul><ol><li>number</li></ol>");
});

test("headings shift one level down and cap at h6", () => {
  assert.equal(renderMarkdown("# One"), '<h2 id="one">One</h2>');
  assert.equal(renderMarkdown("##### Five"), '<h6 id="five">Five</h6>');
  assert.equal(renderMarkdown("###### Six"), '<h6 id="six">Six</h6>');
});

test("headings are collected with anchor ids", () => {
  const { headings } = renderDocument("## `Alpha` one\n\n### Beta");
  assert.deepEqual(headings, [
    { level: 3, id: "alpha-one", text: "Alpha one" },
    { level: 4, id: "beta", text: "Beta" },
  ]);
});

test("repeated heading text gets unique ids", () => {
  const { headings } = renderDocument("## Same\n\n## Same\n\n## Same");
  assert.deepEqual(
    headings.map((heading) => heading.id),
    ["same", "same-2", "same-3"],
  );
});

test("footnote labels are renumbered in reference order", () => {
  const html = renderMarkdown(
    "first[^plain] second[^cms]\n\n[^cms]: CMS note\n[^plain]: plain note",
  );
  assert.match(
    html,
    /first<sup class="footnote-ref" data-note="plain note"><a href="#fn-1" id="ref-1">1<\/a>/,
  );
  assert.match(
    html,
    /second<sup class="footnote-ref" data-note="CMS note"><a href="#fn-2" id="ref-2">2<\/a>/,
  );
  // The printed list follows the numbering, not the order of definition.
  assert.match(html, /<li id="fn-1" value="1">plain note.*<li id="fn-2" value="2">CMS note/s);
});

test("an unreferenced footnote still gets a number", () => {
  const html = renderMarkdown("body[^a]\n\n[^a]: used\n[^b]: orphan");
  assert.match(html, /<li id="fn-1" value="1">used/);
  assert.match(html, /<li id="fn-2" value="2">orphan/);
});

test("the reference section sits at the article's own top level", () => {
  // "##" renders as <h3>, so the reference heading must be an <h3> too rather
  // than claiming a level above every section the author wrote.
  assert.match(
    renderMarkdown("## 절\n\nx[^a]\n\n[^a]: n"),
    /<h3 id="notes" class="notes-title">/,
  );
  assert.match(
    renderMarkdown("# 절\n\nx[^a]\n\n[^a]: n"),
    /<h2 id="notes" class="notes-title">/,
  );
  assert.match(
    renderMarkdown("x[^a]\n\n[^a]: n"),
    /<h2 id="notes" class="notes-title">/,
  );
});

test("a heading named Notes cannot steal the anchor the footnote list needs", () => {
  const html = renderDocument("## Notes\n\nx[^a]\n\n[^a]: n").html;
  assert.match(html, /<h3 id="notes-2">Notes<\/h3>/);
  assert.match(html, /<h3 id="notes" class="notes-title">/);
});

test("a heading with no words still gets a usable id", () => {
  assert.deepEqual(renderDocument("## ***").headings, [
    { level: 3, id: "section", text: "" },
  ]);
});

test("a paragraph stops where a table without outer pipes begins", () => {
  assert.equal(
    renderMarkdown("앞 문단\n이름 | 값\n--- | ---\n1 | 2"),
    '<p>앞 문단</p><div class="table-wrap"><table><tbody><tr>' +
      '<td class="border-top-thick border-two-lines">이름</td>' +
      '<td class="border-top-thick border-two-lines">값</td></tr><tr>' +
      '<td class="border-thick">1</td><td class="border-thick">2</td>' +
      "</tr></tbody></table></div>",
  );
});

test("an escaped backslash is a literal backslash", () => {
  // "\\|" is a backslash followed by a cell separator, not an escaped pipe.
  const html = renderMarkdown("| a | b |\n| --- | --- |\n| x \\\\| y |");
  assert.match(html, /<td[^>]*>x \\<\/td><td[^>]*>y<\/td>/);
});

test("bare urls become links without swallowing punctuation", () => {
  assert.equal(
    inline("see https://example.com/a."),
    'see <a href="https://example.com/a" target="_blank" rel="noreferrer">https://example.com/a ↗</a>.',
  );
});

test("autolinking never rewrites an existing href", () => {
  assert.equal(
    inline("[label](https://example.com)"),
    '<a href="https://example.com" target="_blank" rel="noreferrer">label ↗</a>',
  );
  assert.equal(inline("`https://example.com`"), "<code>https://example.com</code>");
});

test("a tooltip carries its reading twice, for script and for none", () => {
  assert.equal(
    inline("본문에 [TLS 핸드셰이크](? 키 교환과 인증)가 나온다."),
    '본문에 <span class="tooltip" data-note="키 교환과 인증" ' +
      'title="키 교환과 인증" tabindex="0">TLS 핸드셰이크</span>가 나온다.',
  );
});

test("the space after the tooltip marker is optional", () => {
  assert.match(inline("[낱말](?내용)"), /data-note="내용"/);
});

test("a tooltip reading loses its markup on the way into the attribute", () => {
  assert.match(
    inline("[낱말](? **굵게** `코드` $x^2$ 읽기)"),
    /data-note="굵게 코드 x2 읽기"/,
  );
});

test("a reading keeps the underscores of an identifier", () => {
  // "_" carries no emphasis in this renderer, so stripping it would only
  // mangle names like changepoint_prior_scale.
  assert.match(
    inline("[민감도](? changepoint_prior_scale 값)"),
    /data-note="changepoint_prior_scale 값"/,
  );
});

test("a tooltip reading ends at its first closing paren", () => {
  // Same limit as a link address: the reading holds no ")".
  assert.equal(
    inline("[낱말](? 읽기(짧음))"),
    '<span class="tooltip" data-note="읽기(짧음" title="읽기(짧음" ' +
      'tabindex="0">낱말</span>)',
  );
});

test("tooltip and link syntax do not read each other", () => {
  assert.equal(
    inline("[label](https://example.com/?q=1)"),
    '<a href="https://example.com/?q=1" target="_blank" rel="noreferrer">label ↗</a>',
  );
  // A bang in front of a tooltip is a bang, not an image with a "?src".
  assert.equal(
    inline("![낱말](?내용)"),
    '!<span class="tooltip" data-note="내용" title="내용" tabindex="0">낱말</span>',
  );
});

test("a tooltip reading cannot break out of its attributes", () => {
  const html = inline('[낱말](? "따옴표" <b>와 꺾쇠)');
  assert.match(html, /data-note="&quot;따옴표&quot; &lt;b&gt;와 꺾쇠"/);
  assert.match(html, /title="&quot;따옴표&quot; &lt;b&gt;와 꺾쇠"/);
});

test("a heading with a tooltip keeps only the label in its id and toc", () => {
  const { html, headings } = renderDocument("# [TLS 핸드셰이크](? 키 교환)");
  assert.equal(headings[0].text, "TLS 핸드셰이크");
  assert.equal(headings[0].id, "tls-핸드셰이크");
  assert.match(html, /<h2 id="tls-핸드셰이크"><span class="tooltip"/);
});

test("excerpt drops a tooltip reading and keeps its label", () => {
  // Brackets survive here exactly as they do for a link label; what matters
  // is that the reading never reaches a meta description.
  assert.equal(excerpt("[TLS](? 키 교환과 인증)는 절차다."), "[TLS]는 절차다.");
});

test("horizontal rule is not parsed as a list", () => {
  assert.equal(
    renderMarkdown("above\n\n---\n\nbelow"),
    "<p>above</p><hr><p>below</p>",
  );
});

test("image inside a paragraph stays inline", () => {
  const html = renderMarkdown("text ![alt](https://example.com/a.png) more");
  assert.equal(
    html,
    '<p>text <img src="https://example.com/a.png" alt="alt" loading="lazy" decoding="async"> more</p>',
  );
});

test("image on its own line becomes a numbered figure with a caption", () => {
  const html = renderMarkdown('![alt](https://example.com/a.png "Caption")');
  assert.equal(
    html,
    '<figure id="fig-1">' +
      '<figcaption><div class="caption-row"><span class="caption-text">' +
      '<span class="caption-number">그림 1.</span> Caption</span></div></figcaption>' +
      '<img src="https://example.com/a.png" alt="alt" loading="lazy" decoding="async">' +
      "</figure>",
  );
});

test("an image with no caption is a figure with no number", () => {
  const html = renderMarkdown("![alt](/a.png)");
  assert.equal(
    html,
    '<figure><img src="/a.png" alt="alt" loading="lazy" decoding="async"></figure>',
  );
});

test("a figure opts out of the series with nonumber", () => {
  const html = renderMarkdown('![alt](/a.png "{nonumber} 장식")');
  assert.doesNotMatch(html, /caption-number/);
  assert.match(html, /장식/);
});

test("intrinsic size is written in when the caller can measure the file", () => {
  const html = renderMarkdown("![alt](/a.png)", {
    measure: (src) => (src === "/a.png" ? { width: 800, height: 450 } : null),
  });
  assert.match(html, /width="800" height="450"/);
});

test("video and embed blocks render", () => {
  assert.match(
    renderMarkdown("!video[clip](/a.mp4)"),
    /<video controls preload="metadata" src="\/a\.mp4">/,
  );
  assert.match(
    renderMarkdown("!embed(https://www.youtube.com/embed/x)"),
    /<iframe src="https:\/\/www\.youtube\.com\/embed\/x"/,
  );
});

test("html in post content is escaped", () => {
  assert.equal(
    renderMarkdown("<script>alert(1)</script>"),
    "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
  );
});

test("dangerous link schemes are neutralised", () => {
  assert.equal(inline("[x](javascript:alert)"), '<a href="#">x</a>');
  assert.equal(inline("[x](data:text/html,y)"), '<a href="#">x</a>');
  assert.equal(inline("[x](/posts/)"), '<a href="/posts/">x</a>');
  assert.match(
    inline("[x](https://example.com)"),
    /target="_blank" rel="noreferrer"/,
  );
});

test("inline code is not reinterpreted as markup", () => {
  assert.equal(
    inline("`**bold** [a](https://b.c)`"),
    "<code>**bold** [a](https://b.c)</code>",
  );
});

test("token sentinels in source cannot forge output", () => {
  const nul = String.fromCharCode(0);
  assert.equal(inline(nul + "0" + nul), "0");
  assert.equal(renderMarkdown("@@BLOCK0@@"), "");
});

test("emphasis, superscript and subscript", () => {
  assert.equal(
    inline("**b** *i* ^up^ ~down~"),
    "<strong>b</strong> <em>i</em> <sup>up</sup> <sub>down</sub>",
  );
});

test("math is rendered as katex placeholders", () => {
  assert.equal(
    inline("$E=mc^2$"),
    '<span class="math math-inline">E=mc^2</span>',
  );
  assert.equal(
    renderMarkdown("$$\na=b\n$$"),
    '<div class="math math-display">a=b</div>',
  );
});

test("code block carries its language and escapes content", () => {
  const html = renderMarkdown("```js\nconst a = 1 < 2;\n```");
  assert.match(html, /class="language-js"/);
  assert.match(html, /const a = 1 &lt; 2;/);
  assert.match(html, /<button type="button" class="copy-code">Copy<\/button>/);
});

test("every row renders as body cells, with no header", () => {
  const html = renderMarkdown("| a | b |\n| --- | --- |\n| 1 | 2 |");
  assert.equal(
    html,
    '<div class="table-wrap"><table><tbody><tr>' +
      '<td class="border-top-thick border-two-lines">a</td>' +
      '<td class="border-top-thick border-two-lines">b</td></tr><tr>' +
      '<td class="border-thick">1</td><td class="border-thick">2</td>' +
      "</tr></tbody></table></div>",
  );
});

test("a table opens thick, closes thick and doubles under its first row", () => {
  const html = renderMarkdown("| a |\n| --- |\n| 1 |\n| 2 |");
  assert.match(html, /<td class="border-top-thick border-two-lines">a<\/td>/);
  assert.match(html, /<tr><td>1<\/td><\/tr>/);
  assert.match(html, /<td class="border-thick">2<\/td>/);
});

test("a one row table closes thick rather than doubling", () => {
  assert.match(
    renderMarkdown("| --- |\n| 1 |"),
    /<td class="border-top-thick border-thick">1<\/td>/,
  );
});

test("a row border overrides the default it would have taken", () => {
  const html = renderMarkdown(
    "| a | {border=thin}\n| --- |\n| 1 |\n| 2 | {border=none}",
  );
  assert.match(html, /<td class="border-top-thick border-thin">a<\/td>/);
  assert.match(html, /<td class="border-none">2<\/td>/);
  assert.doesNotMatch(html, /border-two-lines/);
});

test("the first row may override the default top border", () => {
  const html = renderMarkdown("| a | {border-top=none}\n| --- |\n| 1 |");
  assert.match(html, /<td class="border-top-none border-two-lines">a<\/td>/);
  assert.doesNotMatch(html, /border-top-thick/);
});

test("borders can be written on a cell or a column too", () => {
  const html = renderMarkdown(
    "| a | b |\n| --- {border-right=thin} | --- |\n" +
      "| {border=thin} 1 | 2 |\n| 3 | {border-left=thick} 4 |",
  );
  assert.match(html, /<td class="border-thin border-right-thin">1<\/td>/);
  assert.match(html, /<td class="border-thick border-right-thin">3<\/td>/);
  assert.match(html, /<td class="border-thick border-left-thick">4<\/td>/);
});

test("a cell border beats the row and the row beats the column", () => {
  const html = renderMarkdown(
    "| a |\n| --- {border=thick} |\n| {border=none} 1 |\n| 2 | {border=thin}\n| 3 |",
  );
  assert.match(html, /<td class="border-none">1<\/td>/);
  assert.match(html, /<td class="border-thin">2<\/td>/);
  assert.match(html, /<td class="border-thick">3<\/td>/);
});

test("a rowspan takes its bottom border from the row it ends in", () => {
  const html = renderMarkdown(
    "| a | b |\n| --- | --- |\n| {rows=2} 1 | 2 |\n|  | 3 | {border=thin}",
  );
  assert.match(html, /<td rowspan="2" class="border-thin">1<\/td>/);
  assert.match(html, /<td class="border-thin">3<\/td>/);
});

test("a row border skips a cell that is still spanning", () => {
  const html = renderMarkdown(
    "| a | b |\n| --- | --- |\n| {rows=2} 1 | 2 | {border=thick}\n|  | 3 |\n| 4 | 5 |",
  );
  assert.match(html, /<td rowspan="2">1<\/td><td class="border-thick">2<\/td>/);
  assert.doesNotMatch(html, /rowspan="2" class/);
});

test("bolder resolves from cell, row and column", () => {
  const html = renderMarkdown(
    "| a | b | c |\n| --- {bolder} | --- | --- |\n" +
      "| 1 | {bolder} 2 | 3 |\n| 4 | 5 | 6 | {bolder}",
  );
  assert.match(html, /<td class="bolder">1<\/td><td class="bolder">2<\/td><td>3<\/td>/);
  assert.match(
    html,
    /<td class="bolder border-thick">4<\/td><td class="bolder border-thick">5<\/td>/,
  );
});

test("a cell can switch off the bolder its row asked for", () => {
  assert.match(
    renderMarkdown("| a | b |\n| --- | --- |\n| 1 | {bolder=no} 2 | {bolder}"),
    /<td class="bolder border-thick">1<\/td><td class="border-thick">2<\/td>/,
  );
});

test("column alignment comes from the separator row", () => {
  const html = renderMarkdown("| a | b | c |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |");
  assert.match(html, /<td class="align-left border-top-thick[^"]*">a<\/td>/);
  assert.match(html, /<td class="align-center border-top-thick[^"]*">b<\/td>/);
  assert.match(html, /<td class="align-right border-top-thick[^"]*">c<\/td>/);
  assert.match(html, /<td class="align-right border-thick">3<\/td>/);
});

test("outer pipes are optional", () => {
  assert.equal(
    renderMarkdown("a | b\n--- | ---\n1 | 2"),
    '<div class="table-wrap"><table><tbody><tr>' +
      '<td class="border-top-thick border-two-lines">a</td>' +
      '<td class="border-top-thick border-two-lines">b</td></tr><tr>' +
      '<td class="border-thick">1</td><td class="border-thick">2</td>' +
      "</tr></tbody></table></div>",
  );
});

test("an escaped pipe stays inside its cell", () => {
  const html = renderMarkdown("| a | b |\n| --- | --- |\n| x \\| y | z |");
  assert.match(html, /<td[^>]*>x \| y<\/td>/);
  assert.match(html, /<td[^>]*>z<\/td>/);
});

test("a short row is padded to the column count", () => {
  const html = renderMarkdown("| a | b | c |\n| --- | --- | --- |\n| 1 |");
  assert.match(html, /<tr><td[^>]*>1<\/td><td[^>]*><\/td><td[^>]*><\/td><\/tr>/);
});

test("a caption above the table becomes its caption, and the renderer numbers it", () => {
  const html = renderMarkdown(": 설명\n| a |\n| --- |\n| 1 |");
  assert.match(
    html,
    /<table><caption><div class="caption-row"><span class="caption-text"><span class="caption-number">표 1\.<\/span> 설명<\/span><\/div><\/caption>/,
  );
});

test("a labelled table can be called by name from the body", () => {
  const html = renderMarkdown(
    "[@tbl:ca]를 보라.\n\n: {#tbl:ca} 설명\n| a |\n| --- |\n| 1 |",
  );
  assert.match(html, /<a class="xref" href="#tbl-ca">표 1<\/a>를 보라/);
  assert.match(html, /<div class="table-wrap" id="tbl-ca">/);
});

test("tables and figures count on separate series", () => {
  const html = renderMarkdown(
    ': 표\n| a |\n| --- |\n| 1 |\n\n![alt](/a.png "그림")\n\n: 다음 표\n| b |\n| --- |\n| 2 |',
  );
  assert.match(html, /표 1\./);
  assert.match(html, /그림 1\./);
  assert.match(html, /표 2\./);
});

test("a pipe in the caption splits off a right-aligned aside", () => {
  const html = renderMarkdown(": 설명 | n=120\n| a |\n| --- |\n| 1 |");
  assert.match(
    html,
    /<span class="caption-text"><span class="caption-number">표 1\.<\/span> 설명<\/span><span class="caption-aside">n=120<\/span>/,
  );
});

test("an escaped pipe stays inside the caption", () => {
  const html = renderMarkdown(": 앞 \\| 뒤\n| a |\n| --- |\n| 1 |");
  assert.match(html, /<span class="caption-number">표 1\.<\/span> 앞 \| 뒤<\/span>/);
  assert.doesNotMatch(html, /caption-aside/);
});

test("a caption below the table becomes a note", () => {
  const html = renderMarkdown("| a |\n| --- |\n| 1 |\n: 출처: 내부 문서");
  assert.match(html, /<\/table><p class="table-note">출처: 내부 문서<\/p><\/div>/);
});

test("a table can carry both a caption and a note", () => {
  const html = renderMarkdown(": 위\n| a |\n| --- |\n| 1 |\n: 아래");
  assert.match(
    html,
    /<span class="caption-text"><span class="caption-number">표 1\.<\/span> 위<\/span>/,
  );
  assert.match(html, /<p class="table-note">아래<\/p>/);
});

test("a colon line with no table after it stays a paragraph", () => {
  assert.equal(renderMarkdown(": 그냥 문장"), "<p>: 그냥 문장</p>");
});

test("colspan absorbs the blank cells it covers", () => {
  const html = renderMarkdown(
    "| a | b | c |\n| --- | --- | --- |\n| 1 | {span=2} 2 ||",
  );
  assert.match(html, /<tr><td[^>]*>1<\/td><td colspan="2"[^>]*>2<\/td><\/tr>/);
});

test("rowspan absorbs the placeholder below it", () => {
  const html = renderMarkdown(
    "| a | b |\n| --- | --- |\n| {rows=2} 1 | 2 |\n|  | 3 |",
  );
  assert.match(html, /<td rowspan="2"[^>]*>1<\/td><td[^>]*>2<\/td><\/tr>/);
  assert.match(html, /<tr><td[^>]*>3<\/td><\/tr>/);
});

test("a rowspan may not outlive the table", () => {
  const html = renderMarkdown("| a |\n| --- |\n| {rows=9} 1 |");
  assert.doesNotMatch(html, /rowspan/);
});

test("cell, row and column attributes resolve in that order", () => {
  const html = renderMarkdown(
    "| a | b |\n| --- {bg} | --- |\n| {bg=no} 1 | 2 | {bg}",
  );
  // The column shows in the row the cell and row attributes leave alone, the
  // row covers what the column did not, and the cell overrules both.
  assert.match(html, /<td class="bg-mark border-top-thick[^"]*">a<\/td>/);
  assert.match(html, /<td class="border-thick">1<\/td>/);
  assert.match(html, /<td class="bg-mark[^"]*">2<\/td>/);
});

test("vertical alignment and row borders become cell classes", () => {
  const html = renderMarkdown(
    "| a |\n| --- |\n| {valign=top} 1 | {border=thick, border-top=thin}",
  );
  assert.match(
    html,
    /<td class="valign-top border-top-thin border-thick">1<\/td>/,
  );
});

test("bg is a flag with one highlight", () => {
  assert.match(
    renderMarkdown("| a |\n| --- |\n| {bg} 1 |"),
    /<td class="bg-mark[^"]*">1<\/td>/,
  );
});

test("an unknown attribute value cannot emit an undefined class", () => {
  const html = renderMarkdown(
    "| a |\n| --- |\n| {bg, align=sideways, span=0} 1 |",
  );
  assert.match(html, /<td class="bg-mark[^"]*">1<\/td>/);
  assert.doesNotMatch(html, /align-|colspan/);
});

test("cell attributes may sit at the end of the cell", () => {
  const html = renderMarkdown(
    "| a | b |\n| --- | --- |\n| 1 | 2.1 {bolder} |\n| 3 | 4 {span=2, bg} |",
  );
  assert.match(html, /<td class="bolder">2\.1<\/td>/);
  assert.match(html, /<td colspan="2" class="bg-mark border-thick">4<\/td>/);
});

test("a trailing brace that is not an attribute stays text", () => {
  const html = renderMarkdown(
    "| a | b |\n| --- | --- |\n| 끝이 {x} | 값은 {bolder=no} 이다 |",
  );
  assert.match(html, /<td class="border-thick">끝이 \{x\}<\/td>/);
  assert.match(html, /값은 \{bolder=no\} 이다/);
});

test("an attribute written at both ends takes the trailing value", () => {
  assert.match(
    renderMarkdown("| a |\n| --- |\n| {bolder} 1 {bolder=no} |"),
    /<td class="border-thick">1<\/td>/,
  );
});

test("braces inside cell text are left alone", () => {
  assert.match(
    renderMarkdown("| a |\n| --- |\n| 값은 {x} 이다 |"),
    /<td[^>]*>값은 \{x\} 이다<\/td>/,
  );
});

test("a leading separator only sets column attributes", () => {
  const html = renderMarkdown("| --- | --- |\n| 1 | 2 |");
  assert.doesNotMatch(html, /<thead>|<th>/);
  assert.match(
    html,
    /<tbody><tr><td class="border-top-thick border-thick">1<\/td>/,
  );
});

test("cell contents still run through inline markup", () => {
  const html = renderMarkdown("| a |\n| --- |\n| **b** `c` |");
  assert.match(html, /<td[^>]*><strong>b<\/strong> <code>c<\/code><\/td>/);
});

test("footnotes move to a reference section", () => {
  const html = renderMarkdown("text[^1]\n\n[^1]: note");
  assert.match(
    html,
    /<sup class="footnote-ref" data-note="note"><a href="#fn-1" id="ref-1">1<\/a><\/sup>/,
  );
  assert.match(html, /<section class="notes">.*<li id="fn-1" value="1">note/s);
});

test("blockquote joins its lines", () => {
  assert.equal(
    renderMarkdown("> one\n> two"),
    "<blockquote>one two</blockquote>",
  );
});

test("frontmatter parses keys and strips quotes", () => {
  const { data, body } = frontmatter(
    '---\ntitle: "Hi"\ndate: 2026-01-02\n---\nbody\n',
  );
  assert.deepEqual(data, { title: "Hi", date: "2026-01-02" });
  assert.equal(body, "body\n");
});

test("frontmatter is optional", () => {
  assert.deepEqual(frontmatter("plain"), { data: {}, body: "plain" });
});

test("excerpt takes the first two sentences without markup", () => {
  assert.equal(excerpt("# Title\n\nOne. Two. Three."), "One. Two.");
});

test("slugify handles unicode and empty input", () => {
  assert.equal(slugify("Private CA"), "private-ca");
  assert.equal(slugify("인프라 기초"), "인프라-기초");
  assert.equal(slugify("!!!"), "uncategorized");
});

test("dateText is timezone independent", () => {
  assert.equal(dateText("2026-07-29"), "Jul 29, 2026");
  assert.equal(dateText(""), "");
});

test("esc covers every html-significant character", () => {
  assert.equal(esc(`<&>"'`), "&lt;&amp;&gt;&quot;&#39;");
});

test("a chart fence becomes a figure, not a code block", () => {
  const html = renderMarkdown(
    "```chart {type=line}\n| x | 1 | 2 |\n| y | 3 | 4 |\n```",
  );
  assert.ok(html.startsWith('<figure class="chart">'));
  assert.ok(!html.includes("code-block"));
});

test("a chart fence the renderer cannot read stays visible as source", () => {
  const html = renderMarkdown("```chart {type=피자}\n| x | 1 |\n```");
  assert.ok(html.includes("code-block"));
  assert.ok(html.includes("| x | 1 |"));
});

test("an ordinary fence is still a code block", () => {
  const html = renderMarkdown("```js\nconst a = 1;\n```");
  assert.ok(html.includes('class="language-js"'));
});

test("two charts in one document keep separate pattern namespaces", () => {
  const one = "```chart {type=area, fill=hatch}\n| x | 1 | 2 |\n| y | 3 | 4 |\n```";
  const html = renderMarkdown(`${one}\n\n${one}`);
  const ids = [...html.matchAll(/id="(chart\d+)-title"/g)].map((m) => m[1]);
  assert.equal(ids.length, 2);
  assert.notEqual(ids[0], ids[1]);
});

test("a reference carries its note as plain text for the hover reading", () => {
  const html = renderMarkdown(
    "text[^1]\n\n[^1]: [WMO. (2026). State of the global climate 2025.](https://doi.org/10.59327/x)",
  );
  // The link keeps its address in the printed list and loses it in the
  // attribute, where there is nothing to click.
  assert.match(
    html,
    /data-note="WMO\. \(2026\)\. State of the global climate 2025\."/,
  );
  assert.match(html, /<li id="fn-1" value="1"><a href="https:\/\/doi\.org\/10\.59327\/x"/);
});

test("a heading is nothing but its own text and id", () => {
  // 절로 가는 링크는 제목 자체다. 조판에 기호를 더하지 않으므로 마크업은
  // id 하나만 지고 있고, 누르는 일은 app.js가 맡는다.
  const html = renderMarkdown("# 서론\n\n## 배경");
  assert.equal(html, '<h2 id="서론">서론</h2><h3 id="배경">배경</h3>');
});

test("reading time counts prose and skips code, math and figures", () => {
  // 1000 한글 글자는 500자/분 기준으로 2분이고, 담장 안의 5000자는 읽는
  // 것이 아니므로 그 값을 밀어올리지 못한다.
  const prose = "가".repeat(1000);
  const fence = "```js\n" + "x".repeat(5000) + "\n```";
  assert.equal(readingMinutes(prose), 2);
  assert.equal(readingMinutes(`${prose}\n\n${fence}`), 2);
  assert.equal(readingMinutes(`${prose}\n\n$$${"y".repeat(3000)}$$`), 2);
  assert.equal(readingMinutes(`${prose}\n\n![그림](${"z".repeat(2000)}.png)`), 2);
});

test("reading time is never zero and counts latin words separately", () => {
  assert.equal(readingMinutes(""), 1);
  assert.equal(readingMinutes("짧다"), 1);
  // 200낱말/분이므로 400낱말은 2분이다.
  assert.equal(readingMinutes(Array(400).fill("word").join(" ")), 2);
});

test("a document reports whether it needs katex or highlight.js", () => {
  const plain = renderDocument("본문뿐입니다.");
  assert.equal(plain.math, false);
  assert.equal(plain.code, false);

  const math = renderDocument("$$x^2$$");
  assert.equal(math.math, true);
  assert.equal(math.code, false);

  const inlineMath = renderDocument("값은 $x$ 입니다.");
  assert.equal(inlineMath.math, true);

  const code = renderDocument("```js\nconst a = 1;\n```");
  assert.equal(code.code, true);
  assert.equal(code.math, false);

  // 차트는 SVG를 직접 그리므로 어느 쪽도 필요하지 않다.
  const chart = renderDocument("```chart {type=line}\n| 해 | 1 | 2 |\n| 값 | 3 | 4 |\n```");
  assert.equal(chart.math, false);
  assert.equal(chart.code, false);
});

test("search text keeps the prose and drops what is not prose", () => {
  const body = [
    "# 제목",
    "",
    "> 인용으로 시작한다.",
    "",
    "본문에서 step-ca를 다룬다. [문서](https://example.test)를 보라.",
    "",
    "```js",
    "const secret = 1;",
    "```",
    "",
    "경계는 $x^2$ 이다.",
    "",
    "| 왼쪽 | 오른쪽 |",
    "| --- | --- |",
    "| 값 | 다른 값 |",
  ].join("\n");
  const text = searchText(body);

  // 글은 남는다.
  assert.match(text, /제목/);
  assert.match(text, /인용으로 시작한다/);
  assert.match(text, /다른 값/);
  // 링크는 글자만 남고 주소는 빠진다.
  assert.match(text, /문서/);
  assert.doesNotMatch(text, /example\.test/);
  // 코드와 수식은 자료다.
  assert.doesNotMatch(text, /const secret/);
  assert.doesNotMatch(text, /x\^2/);
  // 표시 문자는 남지 않는다.
  assert.doesNotMatch(text, /[#>|`]/);
  // 한 줄로 이어 붙는다.
  assert.doesNotMatch(text, /\n/);
});

test("search text does not break a hyphenated name apart", () => {
  // 읽기 시간은 낱말을 세느라 붙임표를 공백으로 바꾸지만, 검색은 찾는
  // 일이라 "step-ca"가 그대로 남아야 친 대로 걸린다.
  assert.match(searchText("step-ca를 세운다."), /step-ca/);
});

test("search text keeps a footnote body and drops its marker", () => {
  const body = ["본문이다.[^1]", "", "[^1]: 각주에만 있는 말."].join("\n");
  const text = searchText(body);
  assert.match(text, /각주에만 있는 말/);
  assert.doesNotMatch(text, /\[\^1\]/);
});

test("a hard break survives the joining of a paragraph's lines", () => {
  // 문단은 줄을 이어 붙이므로, 끊긴 자리를 붙이기 전에 표시해 두지 않으면
  // 어디서 끊겼는지 알 수 없게 된다.
  assert.equal(renderMarkdown("첫 줄\\\n둘째 줄"), "<p>첫 줄<br>둘째 줄</p>");
  assert.equal(renderMarkdown("첫 줄  \n둘째 줄"), "<p>첫 줄<br>둘째 줄</p>");
  assert.equal(
    renderMarkdown("> 첫 줄\\\n> 둘째 줄"),
    "<blockquote>첫 줄<br>둘째 줄</blockquote>",
  );
});

test("a break at the end of a block leaves nothing behind", () => {
  // 끊을 다음 줄이 없으면 <br>도 없다. 빈 줄 하나가 문단 끝에 붙으면
  // 아래 여백이 두 배로 벌어진다.
  assert.equal(renderMarkdown("한 줄\\"), "<p>한 줄</p>");
  assert.equal(renderMarkdown("한 줄  "), "<p>한 줄</p>");
});

test("an even run of backslashes is a backslash, not a break", () => {
  assert.equal(renderMarkdown("첫 줄\\\\\n둘째 줄"), "<p>첫 줄\\ 둘째 줄</p>");
});

test("a backslash turns a marker into a character", () => {
  assert.equal(renderMarkdown("\\*별\\*"), "<p>*별*</p>");
  assert.equal(renderMarkdown("\\`코드\\`"), "<p>`코드`</p>");
  assert.equal(renderMarkdown("\\$5"), "<p>$5</p>");
  assert.equal(renderMarkdown("\\&"), "<p>&amp;</p>");
  assert.equal(renderMarkdown("\\\\"), "<p>\\</p>");
});

test("an escaped bracket is a bracket, not a formula", () => {
  // "\[…\]"는 글자로 쓴 대괄호와 한 글자도 다르지 않다. 여러 줄 수식은
  // "$$…$$"가 맡으므로 대괄호를 수식으로 읽을 자리가 없다.
  assert.equal(renderMarkdown("\\[대괄호\\]"), "<p>[대괄호]</p>");
  assert.equal(renderDocument("\\[대괄호\\]").math, false);
});

test("an escaped backtick fits inside inline code", () => {
  // 코드 안에 역따옴표 한 자를 넣는 길은 이것뿐이다. 토큰이 토큰을 품는
  // 유일한 자리이기도 하다.
  assert.equal(renderMarkdown("`a\\`b`"), "<p><code>a`b</code></p>");
});

test("an escaped marker stays a character in a heading's plain text", () => {
  assert.equal(plainText("\\*별\\* *강조*"), "*별* 강조");
  assert.equal(plainText("\\[대괄호\\]"), "[대괄호]");
});

test("strikethrough and highlight do not eat the subscript", () => {
  assert.equal(
    inline("~~지움~~ ==칠함== ~아래~"),
    "<del>지움</del> <mark>칠함</mark> <sub>아래</sub>",
  );
});

test("a reference link takes its address from the list below", () => {
  const html = renderDocument(
    '본문 [이름][key]과 [묶음][]이다.\n\n[key]: https://a.example "제목"\n[묶음]: https://b.example',
  ).html;
  // 이름 자리가 비면 label이 곧 이름이다. 제목은 title 속성으로 간다.
  assert.match(html, /<a href="https:\/\/a\.example" title="제목"/);
  assert.match(html, /<a href="https:\/\/b\.example"/);
  // 주소 정의는 본문에 남지 않는다.
  assert.equal(renderDocument("문단.\n\n[key]: https://a.example").html, "<p>문단.</p>");
});

test("a reference name is matched without regard to case", () => {
  assert.match(
    renderDocument("[이름][KEY]\n\n[key]: https://a.example").html,
    /<a href="https:\/\/a\.example"/,
  );
});

test("an unknown reference name is left as it was written", () => {
  // 오타가 링크로 둔갑하면 어디가 끊겼는지 알 수 없게 된다.
  assert.equal(renderDocument("[없는][nope] 이름.").html, "<p>[없는][nope] 이름.</p>");
});

test("a footnote definition and a link definition do not mix", () => {
  const html = renderDocument(
    "본문[^1]과 [이름][key].\n\n[^1]: 각주.\n[key]: https://a.example",
  ).html;
  assert.match(html, /<li id="fn-1" value="1">각주\./);
  assert.match(html, /<a href="https:\/\/a\.example"/);
});

test("a reference link inside a note keeps the hover reading plain", () => {
  // 속성으로 들어가는 글에는 누를 것이 없다. 아래 목록에서는 링크로 남는다.
  const html = renderDocument(
    "본문[^1]\n\n[^1]: 각주 [이름][key].\n\n[key]: https://a.example",
  ).html;
  assert.match(html, /data-note="각주 이름\."/);
  assert.match(html, /<li id="fn-1" value="1">각주 <a href="https:\/\/a\.example"/);
});

test("a labelled quote becomes a callout with its own name", () => {
  const kinds = {
    NOTE: "참고",
    TIP: "도움말",
    IMPORTANT: "중요",
    WARNING: "주의",
    CAUTION: "경고",
  };
  for (const [kind, name] of Object.entries(kinds))
    assert.equal(
      renderMarkdown(`> [!${kind}]\n> 본문.`),
      `<div class="callout callout-${kind.toLowerCase()}">` +
        `<p class="callout-title">${name}</p><p>본문.</p></div>`,
    );
});

test("a callout heading replaces the name and the body still takes markup", () => {
  assert.equal(
    renderMarkdown("> [!TIP] 제목\n> 첫 줄\n> ~~둘째~~ 줄"),
    '<div class="callout callout-tip"><p class="callout-title">제목</p>' +
      "<p>첫 줄 <del>둘째</del> 줄</p></div>",
  );
});

test("a callout with no body is only its name", () => {
  assert.equal(
    renderMarkdown("> [!WARNING] 조심"),
    '<div class="callout callout-warning"><p class="callout-title">조심</p></div>',
  );
});

test("an unknown label leaves the quote a quote", () => {
  // 모르는 이름을 상자로 만들면 오타가 조판을 바꾼다.
  assert.equal(
    renderMarkdown("> [!NOPE]\n> 본문."),
    "<blockquote>[!NOPE] 본문.</blockquote>",
  );
});

test("a details callout folds its body behind its heading", () => {
  assert.equal(
    renderMarkdown("> [!DETAILS] 더 읽기\n> 속."),
    '<details class="callout callout-details"><summary>더 읽기</summary>' +
      "<p>속.</p></details>",
  );
  // 제목이 없으면 손잡이에 쓸 말을 우리가 고른다.
  assert.match(renderMarkdown("> [!DETAILS]\n> 속."), /<summary>더 보기<\/summary>/);
});

test("a details summary keeps letters and drops markup", () => {
  // <summary>는 표시를 살릴 자리가 아니다.
  assert.match(
    renderMarkdown("> [!DETAILS] ~~지운~~ 제목\n> 속."),
    /<summary>지운 제목<\/summary>/,
  );
});

test("a task list locks its boxes", () => {
  // 눌러서 바뀌는 값이면 어디엔가 저장되어야 하는데, 정적인 글에는 그럴
  // 자리가 없다.
  assert.equal(
    renderMarkdown("- [ ] 하나\n  - 딸림\n- [x] 둘"),
    '<ul class="task-list">' +
      '<li class="task"><input type="checkbox" disabled><span>하나</span>' +
      "<ul><li>딸림</li></ul></li>" +
      '<li class="task"><input type="checkbox" disabled checked><span>둘</span></li>' +
      "</ul>",
  );
});

test("a list with no boxes is an ordinary list", () => {
  assert.equal(renderMarkdown("- 하나\n- 둘"), "<ul><li>하나</li><li>둘</li></ul>");
});

test("search text drops the new markers and keeps the letters", () => {
  const body = [
    "첫 줄\\",
    "둘째 줄 ==칠한 글==과 ~~지운 글~~, \\*별\\*.",
    "",
    "> [!WARNING] 조심할 것",
    "> 상자 본문.",
    "",
    "- [x] 끝난 일",
    "",
    "[RFC 8446][tls13]을 봅니다.",
    "",
    '[tls13]: https://www.rfc-editor.org/rfc/rfc8446 "The TLS 1.3 Protocol"',
  ].join("\n");
  const text = searchText(body);
  // 글은 남는다: 상자 제목도 할 일 칸도 사람이 쓴 글이다.
  for (const word of ["칠한 글", "지운 글", "조심할 것", "상자 본문", "끝난 일", "RFC 8446"])
    assert.match(text, new RegExp(word));
  // 표시는 남지 않는다. 찾는 사람은 글에 보이는 대로 친다.
  for (const marker of ["==", "~~", "[!WARNING]", "[x]", "\\\\", "rfc-editor"])
    assert.ok(!text.includes(marker), `검색 본문에 ${marker}가 남았다`);
  // 글자로 쓴 별은 글자다.
  assert.match(text, /\*별\*/);
});

test("an excerpt is not broken by a callout label or a marker", () => {
  assert.equal(
    excerpt("> [!NOTE] 상자\n> 본문 ==칠한 글==과 ~~지운 글~~. 두 문장째."),
    "상자 본문 칠한 글과 지운 글. 두 문장째.",
  );
});

test("reading time skips the labels and the addresses", () => {
  // 500자/분이므로 한글 500자는 1분이고, 이름표와 주소 정의가 그 값을
  // 밀어올리지 못한다.
  const prose = "가".repeat(500);
  const noise = [
    "> [!NOTE] 이름표",
    "",
    "- [ ] 남은 일",
    "",
    `[tls13]: https://www.rfc-editor.org/rfc/rfc8446 "${"x".repeat(2000)}"`,
  ].join("\n");
  assert.equal(readingMinutes(prose), 1);
  assert.equal(readingMinutes(`${prose}\n\n${noise}`), 1);
});

test("a footnote called twice keeps one anchor to return to", () => {
  const html = renderMarkdown("첫[^a] 둘째[^a]\n\n[^a]: 주석");
  assert.equal(html.match(/id="ref-1"/g).length, 1);
  assert.equal(html.match(/href="#fn-1"/g).length, 2);
  assert.match(html, /<li id="fn-1" value="1">주석 <a href="#ref-1"/);
});

test("a quote's last line names its source", () => {
  const html = renderMarkdown("> 한 말\n> — 누군가");
  assert.equal(
    html,
    '<figure class="quote"><blockquote>한 말</blockquote>' +
      '<figcaption class="quote-source">— 누군가</figcaption></figure>',
  );
});

test("a quote with no source stays a plain blockquote", () => {
  assert.equal(renderMarkdown("> 한 말\n> 이어지는 말"), "<blockquote>한 말 이어지는 말</blockquote>");
});

test("a term followed by :: lines becomes a definition list", () => {
  assert.equal(
    renderMarkdown("원시다항식\n:: 최대공약수가 1인 것\n:: 또 다른 뜻"),
    '<dl class="definitions"><dt>원시다항식</dt><dd>최대공약수가 1인 것</dd>' +
      "<dd>또 다른 뜻</dd></dl>",
  );
});

test("a lone :: line is not a definition list", () => {
  assert.match(renderMarkdown(":: 뜻만 있는 줄"), /^<p>/);
});

test("[toc:fig] lists every figure in the order they are numbered", () => {
  const html = renderMarkdown(
    '[toc:fig]\n\n![a](/a.png "첫 그림")\n\n![b](/b.png "둘째 그림")',
  );
  assert.match(
    html,
    /<nav class="block-list block-list-fig"><ol><li><a href="#fig-1">.*그림 1\..*첫 그림<\/a><\/li><li><a href="#fig-2">/,
  );
});

test("a list of a kind with nothing in it prints nothing", () => {
  assert.equal(renderMarkdown("[toc:tbl]"), "");
});

test("a figures fence puts its images in one row", () => {
  const html = renderMarkdown(
    '```figures {cols=2}\n![a](/a.png "왼쪽")\n![b](/b.png "오른쪽")\n```',
  );
  assert.match(html, /<div class="figure-row" style="--cols:2">/);
  assert.equal(html.match(/<figure id="fig-\d"/g).length, 2);
});

test("a figures fence with no readable image falls back to a code block", () => {
  const { html, unreadable } = renderDocument("```figures\n그림이 아니다\n```");
  assert.match(html, /<figure class="code-block"/);
  assert.deepEqual(unreadable, ["figures"]);
});

test("code hides the marks it prints from the passes that count them", () => {
  const html = renderMarkdown(
    "본문[^a]\n\n```markdown\n각주는 [^9]처럼 쓴다\n```\n\n인라인 `[^9]`도.\n\n[^a]: 진짜",
  );
  assert.match(html, /\[\^9\]처럼 쓴다/);
  assert.match(html, /<code>\[\^9\]<\/code>/);
  assert.equal(html.match(/<li id="fn-\d+"/g).length, 1);
});
