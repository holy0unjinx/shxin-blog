import assert from "node:assert/strict";
import test from "node:test";

import { articleImage, imageType, ogCard, ogPath, wrapTitle } from "../site/og.mjs";

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

// ── 글이 제 그림을 가지고 있을 때 ──────────────────────────────────────────

test("본문의 첫 그림이 카드가 된다", () => {
  const html = '<p>글</p><figure><img src="/assets/a.png" alt="가"></figure>';
  assert.equal(articleImage(html), "/assets/a.png");
});

test("크롤러가 그리지 못하는 꼴은 고르지 않는다", () => {
  // svg는 이 자리의 문제 그 자체이고, webp는 아직 받지 않는 크롤러가 있다.
  for (const src of ["/favicon.svg", "/assets/a.webp", "/assets/a.avif"])
    assert.equal(articleImage(`<img src="${src}">`), "", src);
  // data: URL은 주소가 아니다.
  assert.equal(articleImage('<img src="data:image/png;base64,AAA">'), "");
  assert.equal(articleImage("<p>그림이 없는 글</p>"), "");
});

test("그림이 없으면 뒤의 쓸 만한 것을 찾아간다", () => {
  const html = '<img src="/favicon.svg"><img src="/assets/real.jpg">';
  assert.equal(articleImage(html), "/assets/real.jpg");
});

test("너무 작은 그림은 건너뛴다 — 아이콘 한 장이 글을 대표하지 않는다", () => {
  const html = '<img src="/assets/icon.png"><img src="/assets/wide.png">';
  const measure = (src) =>
    src === "/assets/icon.png" ? { width: 24, height: 24 } : { width: 1200, height: 630 };
  assert.equal(articleImage(html, { measure }), "/assets/wide.png");
  // 재는 사람이 없으면 재지 않는다.
  assert.equal(articleImage(html), "/assets/icon.png");
  // 크기를 알 수 없는 바깥 주소는 글쓴이가 적은 것으로 믿는다.
  assert.equal(
    articleImage('<img src="https://example.test/a.png">', { measure: () => null }),
    "https://example.test/a.png",
  );
});

test("그림꼴은 확장자가 말한다", () => {
  assert.equal(imageType("/a/b.png"), "image/png");
  assert.equal(imageType("/a/b.JPG"), "image/jpeg");
  assert.equal(imageType("/a/b.jpeg?v=2"), "image/jpeg");
  assert.equal(imageType("/og/x.svg"), "image/svg+xml");
  assert.equal(imageType("/a/b.zip"), "");
});
