import assert from "node:assert/strict";
import test from "node:test";

import { renderDocument, renderMarkdown, sideMark, sidenotes } from "../render/index.mjs";

test("marks run through six symbols and then double up", () => {
  assert.equal(sideMark(1), "*");
  assert.equal(sideMark(6), "‖");
  assert.equal(sideMark(7), "**");
  assert.equal(sideMark(13), "***");
});

test("a definition is lifted out and its reference numbered in reading order", () => {
  const { body, sidenotes: notes } = sidenotes(
    "둘째[^^b] 첫째[^^a]\n\n[^^a]: a note\n[^^b]: b note",
  );
  assert.match(body, /둘째\[\^\^1\] 첫째\[\^\^2\]/);
  assert.equal(notes.get("1").note, "b note");
  assert.equal(notes.get("1").mark, "*");
  assert.equal(notes.get("2").note, "a note");
  assert.equal(notes.get("2").mark, "†");
});

test("a label is matched however it was typed", () => {
  const { sidenotes: notes } = sidenotes("x[^^Ref]\n\n[^^ref]: note");
  assert.equal(notes.get("1").note, "note");
});

test("the same note referenced twice keeps one mark", () => {
  const { body, sidenotes: notes } = sidenotes("a[^^x] b[^^x]\n\n[^^x]: note");
  assert.match(body, /a\[\^\^1\] b\[\^\^1\]/);
  assert.equal(notes.size, 1);
});

test("a reference with no definition stays as it was written", () => {
  const html = renderMarkdown("본문[^^ghost]");
  assert.match(html, /본문\[\^\^ghost\]/);
});

test("a definition nobody called is reported rather than printed", () => {
  const { html, unusedSidenotes } = renderDocument("본문\n\n[^^a]: 안 부른 글");
  assert.doesNotMatch(html, /sidenote/);
  assert.doesNotMatch(html, /안 부른 글/);
  assert.deepEqual(unusedSidenotes, ["a"]);
});

test("the mark and the note sit together in the flow of the sentence", () => {
  const html = renderMarkdown("본문[^^a]이다.\n\n[^^a]: 여백의 글");
  assert.equal(
    html,
    '<p>본문<sup class="sidenote-ref">*</sup>' +
      '<span class="sidenote" role="note"><span class="sidenote-mark">*</span> ' +
      "여백의 글</span>이다.</p>",
  );
});

test("a note keeps its markup, unlike a footnote's hover reading", () => {
  const html = renderMarkdown("x[^^a]\n\n[^^a]: **굵게** `코드` [링크](/a)");
  assert.match(html, /<strong>굵게<\/strong>/);
  assert.match(html, /<code>코드<\/code>/);
  assert.match(html, /<a href="\/a">링크<\/a>/);
});

test("sidenotes and footnotes count on separate series", () => {
  const html = renderMarkdown("a[^^s] b[^f]\n\n[^^s]: side\n[^f]: foot");
  assert.match(html, /<sup class="sidenote-ref">\*<\/sup>/);
  assert.match(html, /<a href="#fn-1" id="ref-1">1<\/a>/);
  assert.match(html, /<li id="fn-1" value="1">foot/);
  assert.doesNotMatch(html, /<li id="fn-\d+">side/);
});

test("a footnote definition is not stolen by the sidenote rule", () => {
  const html = renderMarkdown("x[^a]\n\n[^a]: 하단");
  assert.match(html, /<li id="fn-1" value="1">하단/);
});

test("a sidenote works inside a theorem", () => {
  const html = renderMarkdown("> [!THEOREM]\n> 진술[^^a]\n\n[^^a]: 곁의 글");
  assert.match(html, /environment-thm/);
  assert.match(html, /class="sidenote"/);
});

test("a heading with a sidenote keeps only its words in the anchor", () => {
  const { headings } = renderDocument("## 제목[^^a]\n\n[^^a]: 곁의 글");
  assert.equal(headings[0].text, "제목");
  assert.equal(headings[0].id, "제목");
});

test("a sidenote can carry a cross reference", () => {
  const html = renderMarkdown(
    '본문[^^a]\n\n![x](/a.png "{#fig:b} 그림")\n\n[^^a]: [@fig:b]를 보라',
  );
  assert.match(html, /class="sidenote".*<a class="xref" href="#fig-b">그림 1<\/a>/s);
});
