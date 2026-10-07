import assert from "node:assert/strict";
import test from "node:test";

import {
  collectIds,
  collectImages,
  collectLinks,
  errorCount,
  lint,
  lintArticle,
  report,
} from "../site/lint.mjs";
import { parseBib } from "../render/bib.mjs";
import { renderDocument } from "../render/index.mjs";

// A whole article as the build has it: front matter, what the renderer worked
// out, and the finished body.
function article(body, front = {}, options = {}) {
  const post = {
    slug: "a-post",
    title: "제목",
    date: "2026-01-01",
    category: "infra",
    keywords: [],
    hasDescription: true,
    ...front,
  };
  const document = renderDocument(body, options);
  return { post, document, html: document.html };
}

const messages = (found) => found.map((item) => item.message);

test("ids and links are read straight off the markup", () => {
  const html = '<h2 id="a">x</h2><a href="#a">y</a><a href="/b/">z</a>';
  assert.deepEqual([...collectIds(html)], ["a"]);
  assert.deepEqual(collectLinks(html), ["#a", "/b/"]);
});

test("images are read with their src and alt", () => {
  const found = collectImages('<img src="/a.png" alt="상자"><img src="/b.png">');
  assert.equal(found[0].alt, "상자");
  assert.equal(found[1].alt, undefined);
  assert.equal(found[1].src, "/b.png");
});

test("a clean article reports nothing", () => {
  const found = lintArticle(article("본문이 있는 글."));
  assert.deepEqual(found, []);
});

test("missing front matter is an error, a derived summary is a warning", () => {
  const found = lintArticle(
    article("본문.", { title: "", date: "", hasDescription: false }),
  );
  assert.deepEqual(messages(found), [
    "제목(title)이 없다",
    "날짜(date)가 없다",
    "한 줄 요약(description)이 없어 본문 앞부분을 썼다",
  ]);
  assert.equal(errorCount(found), 2);
});

test("a date that is not a date is an error", () => {
  const found = lintArticle(article("본문.", { date: "2026/01/01" }));
  assert.match(messages(found)[0], /YYYY-MM-DD/);
});

test("a title that is only the slug counts as no title", () => {
  const found = lintArticle(article("본문.", { title: "a-post" }));
  assert.deepEqual(messages(found), ["제목(title)이 없다"]);
});

test("a cross reference to nothing is reported", () => {
  const found = lintArticle(article("[@fig:ghost]를 보라."));
  assert.deepEqual(messages(found), ["부른 이름표가 없다 — [@fig:ghost]"]);
});

test("a label used twice is reported", () => {
  const found = lintArticle(
    article('![a](/x.png "{#fig:a} 하나")\n\n![b](/x.png "{#fig:a} 둘")', {}, {}),
  );
  assert.ok(messages(found).some((line) => line.includes("{#fig:a}")));
});

test("a citation key that is not in the bib is reported", () => {
  const bib = parseBib("@misc{known, title={t}}");
  const found = lintArticle(article("[@ghost]과 [@known]", {}, { bib }));
  assert.deepEqual(messages(found), ["참고문헌에 없는 key다 — [@ghost]"]);
});

test("a sidenote nobody called is a warning", () => {
  const found = lintArticle(article("본문.\n\n[^^a]: 안 부른 글"));
  assert.deepEqual(messages(found), [
    "부르지 않은 사이드노트라 나가지 않았다 — [^^a]",
  ]);
  assert.equal(errorCount(found), 0);
});

test("a file the document could not read is an error", () => {
  const found = lintArticle(
    article("```chart {type=line, src=gone.csv}\n: 캡션\n```", {}, {
      resolve: () => null,
    }),
  );
  const lines = messages(found);
  assert.ok(lines.some((line) => line.includes("gone.csv")));
  assert.ok(lines.some((line) => line.includes("chart 펜스를 읽지 못해")));
});

test("a fence that fell back to a code block is a warning", () => {
  const found = lintArticle(article("```diagram {type=nope}\na -> b\n```"));
  assert.deepEqual(messages(found), [
    "diagram 펜스를 읽지 못해 코드 블록으로 나갔다",
  ]);
});

test("an undefined reference-style link is reported", () => {
  const found = lintArticle(article("[RFC 8446][tls13]을 보라."));
  assert.ok(messages(found).some((line) => line.includes("[RFC 8446][tls13]")));
});

test("a defined reference-style link is not", () => {
  const found = lintArticle(
    article("[RFC 8446][tls13]\n\n[tls13]: https://example.com"),
  );
  assert.deepEqual(found, []);
});

test("an image with no alt is a warning", () => {
  const found = lintArticle(article("![](/a.png)"));
  assert.deepEqual(messages(found), ["대체 텍스트(alt)가 없는 그림 — /a.png"]);
});

test("an image whose file is not there is an error", () => {
  const found = lintArticle(article("![상자](/assets/gone.png)"), {
    fileExists: () => false,
  });
  assert.deepEqual(messages(found), ["없는 그림 파일 — /assets/gone.png"]);
});

test("an image on another host is not checked", () => {
  const found = lintArticle(article("![상자](https://example.com/a.png)"), {
    fileExists: () => false,
  });
  assert.deepEqual(found, []);
});

test("an anchor this page does not define is an error", () => {
  const found = lintArticle(article("[절](#없는-절)로 간다."));
  assert.deepEqual(messages(found), ["이 글에 없는 앵커를 가리킨다 — #없는-절"]);
});

test("an anchor the page does define is fine", () => {
  const found = lintArticle(article("## 절\n\n[절](#절)로 간다."));
  assert.deepEqual(found, []);
});

test("a footnote's own anchors are not reported", () => {
  const found = lintArticle(article("본문[^a]\n\n[^a]: 주석"));
  assert.deepEqual(found, []);
});

test("an address the build never produced is an error", () => {
  const routes = new Set(["/", "/real/"]);
  const found = lintArticle(article("[글](/없는-글/)과 [글](/real/)"), { routes });
  assert.deepEqual(messages(found), ["없는 주소를 가리킨다 — /없는-글/"]);
});

test("an address is checked before its fragment", () => {
  const routes = new Set(["/real/"]);
  const found = lintArticle(article("[절](/real/#어딘가)"), { routes });
  assert.deepEqual(found, []);
});

test("with no route list, outbound links are left alone", () => {
  const found = lintArticle(article("[글](/어디든/)"));
  assert.deepEqual(found, []);
});

test("two posts at one address is an error", () => {
  const found = lint({
    articles: [article("하나."), article("둘.")],
  });
  assert.ok(messages(found).some((line) => line.includes("같은 주소")));
});

test("the report groups by post and puts errors first", () => {
  const found = [
    { level: "warn", slug: "a", message: "경고 하나" },
    { level: "error", slug: "a", message: "오류 하나" },
    { level: "warn", slug: "b", message: "경고 둘" },
  ];
  assert.equal(
    report(found),
    ["  a", "    오류  오류 하나", "    경고  경고 하나", "  b", "    경고  경고 둘"].join("\n"),
  );
});

test("nothing found is an empty report", () => {
  assert.equal(report([]), "");
  assert.equal(errorCount([]), 0);
});

test("an article that carries its body inside the document is still read", () => {
  const found = lintArticle({
    post: { slug: "a", title: "제목", date: "2026-01-01" },
    document: { html: '<p>[이름][없는이름]</p>' },
  });
  assert.deepEqual(
    found.map(({ level }) => level),
    ["warn"],
  );
});
