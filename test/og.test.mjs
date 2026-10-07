import assert from "node:assert/strict";
import test from "node:test";

import { ogCard, ogPath, wrapTitle } from "../site/og.mjs";

test("a short title is one line", () => {
  assert.deepEqual(wrapTitle("짧은 제목"), ["짧은 제목"]);
});

test("a long title wraps by measure", () => {
  const lines = wrapTitle("하나 둘 셋 넷 다섯 여섯 일곱 여덟 아홉 열", {
    width: 300,
    lines: 10,
  });
  assert.ok(lines.length > 1);
  assert.equal(lines.join(" "), "하나 둘 셋 넷 다섯 여섯 일곱 여덟 아홉 열");
});

test("a title too long for the card is cut, not shrunk", () => {
  const lines = wrapTitle("가 ".repeat(80), { width: 300, lines: 3 });
  assert.equal(lines.length, 3);
  assert.match(lines[2], /…$/);
});

test("a word longer than the measure is left whole", () => {
  assert.deepEqual(wrapTitle("aaaaaaaaaaaaaaaaaaaa", { width: 10 }), [
    "aaaaaaaaaaaaaaaaaaaa",
  ]);
});

test("a card is a standalone svg at the size a preview is cut to", () => {
  const svg = ogCard({ title: "사설 CA 구축", category: "infra", date: "2026-07-29" });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1200" height="630"/);
  assert.match(svg, /<\/svg>$/);
  // 스타일시트 없이 읽히는 파일이므로 두 색을 직접 지고 있어야 한다.
  assert.match(svg, /fill="#fff"/);
  assert.match(svg, /fill="#000"/);
});

test("a card carries the title, the category and the date", () => {
  const svg = ogCard({ title: "사설 CA 구축", category: "infra", date: "2026-07-29" });
  assert.match(svg, />사설 CA 구축</);
  assert.match(svg, />infra {2}· {2}Jul 29, 2026</);
  assert.match(svg, />shxin\.blog</);
});

test("a card names the series when the post is in one", () => {
  const svg = ogCard({ title: "둘", series: "사설 CA 세우기" });
  assert.match(svg, />사설 CA 세우기</);
});

test("keywords ride along the bottom, at most five", () => {
  const svg = ogCard({ title: "t", keywords: ["a", "b", "c", "d", "e", "f"] });
  assert.match(svg, />a {2}· {2}b {2}· {2}c {2}· {2}d {2}· {2}e</);
  assert.doesNotMatch(svg, />[^<]*\bf\b/);
});

test("a post with nothing but a slug still gets a card", () => {
  const svg = ogCard({ slug: "untitled" });
  assert.match(svg, />untitled</);
});

test("markup in a title cannot break out of the card", () => {
  const svg = ogCard({ title: '<script>alert(1)</script>' });
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /&lt;script&gt;/);
});

test("a card has a title element and a label for a reader who cannot see it", () => {
  const svg = ogCard({ title: "제목" });
  assert.match(svg, /role="img" aria-label="제목"/);
  assert.match(svg, /<title>제목<\/title>/);
});

test("the path is escaped for a slug that needs it", () => {
  assert.equal(ogPath("사설-ca"), "/og/%EC%82%AC%EC%84%A4-ca.svg");
});
