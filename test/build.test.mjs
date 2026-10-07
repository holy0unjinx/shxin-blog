import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { after, before, test } from "node:test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
// Built from a fixture set into a scratch directory, so this suite neither
// collides with the server suite (which serves the real dist/) nor depends on
// which posts happen to be in posts/ today.
const dist = mkdtempSync(join(tmpdir(), "shxin-blog-"));
const postsDir = mkdtempSync(join(tmpdir(), "shxin-posts-"));
const read = (path) => readFileSync(join(dist, path), "utf8");

// 같은 원고를 DEV로 한 번 더 굽는다. 미리보기에만 서는 것들이 나가는
// 빌드에 끼지 않았다는 것은 두 결과를 나란히 놓아야 말할 수 있다.
const devDist = mkdtempSync(join(tmpdir(), "shxin-blog-dev-"));
const devDrafts = mkdtempSync(join(tmpdir(), "shxin-drafts-"));
const readDev = (path) => readFileSync(join(devDist, path), "utf8");

const withKeywords = `---
title: "사설 CA 구축"
date: 2026-07-29
category: infra
slug: private-ca
description: "step-ca로 사설 CA를 만들어 봅니다."
keywords: 사설 CA, HTTPS, step-ca
updated: 2026-08-14
---

> 인용으로 시작하는 글.

# HTTPS와 CA

본문에서 step-ca를 다룹니다.

## 사설 CA 만들기

step-ca를 세웁니다.
`;

const withoutKeywords = `---
title: "시작"
date: 2026-07-28
category: none
slug: first-post
description: "새 블로그를 시작합니다."
---

첫 글입니다.
`;

// infra 분류의 더 오래된 글. private-ca에서 시간순으로 바로 앞은 first-post
// (분류 none)이고 같은 분류로 앞은 이 글이므로, 어느 쪽이 골라지는지 이
// 글로 갈린다.
const olderInSameCategory = `---
title: "CA 이전에"
date: 2026-07-27
category: infra
slug: before-ca
description: "사설 인증서를 왜 쓰게 되었는지."
---

먼저 있었던 일.
`;

// 수식과 코드를 함께 지고, 언어를 스스로 밝히는 글.
const withCodeAndMath = `---
title: "A note in English"
date: 2026-07-20
category: notes
slug: with-code
lang: en
description: "This one carries both a formula and a fence."
---

The bound is $x^2$ tight.

\`\`\`js
const a = 1;
\`\`\`
`;

before(() => {
  writeFileSync(join(postsDir, "private-ca.md"), withKeywords);
  writeFileSync(join(postsDir, "first-post.md"), withoutKeywords);
  writeFileSync(join(postsDir, "before-ca.md"), olderInSameCategory);
  writeFileSync(join(postsDir, "with-code.md"), withCodeAndMath);
  const build = spawnSync(process.execPath, ["site/build.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      SITE_URL: "https://example.test",
      OUT_DIR: dist,
      POSTS_DIR: postsDir,
    },
  });
  assert.equal(build.status, 0, build.stderr);

  const devBuild = spawnSync(process.execPath, ["site/build.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      DEV: "1",
      SITE_URL: "https://example.test",
      OUT_DIR: devDist,
      POSTS_DIR: postsDir,
      // 빈 폴더를 가리켜 저장소의 진짜 초안이 끼어들지 않게 한다.
      DRAFT_DIR: devDrafts,
    },
  });
  assert.equal(devBuild.status, 0, devBuild.stderr);
});

after(() => {
  for (const dir of [dist, postsDir, devDist, devDrafts])
    rmSync(dir, { recursive: true, force: true });
});

test("every route is a fully rendered page", () => {
  const routes = [
    "index.html",
    "first-post/index.html",
    "category/infra/index.html",
    "404.html",
  ];
  for (const path of routes) {
    const html = read(path);
    assert.doesNotMatch(
      html,
      /<!--%(TITLE|HEAD|APP)%-->/,
      `${path} has an unfilled placeholder`,
    );
    assert.match(
      html,
      /<header class="site-head">/,
      `${path} is missing the shell`,
    );
  }
});

test("post pages carry their own title, meta and body", () => {
  const html = read("private-ca/index.html");
  // 사이트 이름은 머리글과 og:site_name이 지고 있으므로 제목은 글 이름뿐이다.
  assert.match(html, /<title>사설 CA 구축<\/title>/);
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/example\.test\/private-ca\/">/,
  );
  assert.match(html, /<meta property="og:type" content="article">/);
  assert.match(
    html,
    /<meta property="article:published_time" content="2026-07-29">/,
  );
  assert.match(html, /<div class="prose">\S/, "body was not rendered");
  assert.match(html, /step-ca/, "body text is missing from the page");
});

test("keywords become a meta tag and a line under the abstract", () => {
  const html = read("private-ca/index.html");
  assert.match(
    html,
    /<meta name="keywords" content="사설 CA, HTTPS, step-ca">/,
  );
  // 이름-값 쌍이므로 설명 목록으로 적고, 낱말마다 그 낱말의 목록으로 간다.
  assert.match(
    html,
    /<dl class="keywords"><dt>Keywords<\/dt><dd><a href="\/keyword\/[^"]+\/">사설 CA<\/a> · <a[^>]*>HTTPS<\/a> · <a[^>]*>step-ca<\/a><\/dd><\/dl>/,
  );
});

test("a post without keywords gets neither the tag nor the line", () => {
  const html = read("first-post/index.html");
  assert.doesNotMatch(html, /name="keywords"/);
  assert.doesNotMatch(html, /class="keywords"/);
});

test("post pages keep heading anchors", () => {
  const html = read("private-ca/index.html");
  assert.match(html, /<h2 id="https와-ca">HTTPS와 CA<\/h2>/, "heading anchor is missing");
});

test("the table of contents ships in the page as working links", () => {
  // 옆여백의 자로 들어내는 것은 stylesheet가 하는 일이고, 마크업은
  // 자바스크립트가 없어도 그대로 차례 구실을 한다.
  const html = read("private-ca/index.html");
  assert.match(html, /<nav class="toc" aria-label="목차">/);
  // 자와 목록이 한 상자를 나눠 쓴다. 그 상자가 목록만큼 자라므로 자도 목록
  // 끝까지 간다. nav 자체는 넘칠 때 스크롤되는 창일 뿐이다.
  assert.match(
    html,
    /<div class="toc-body"><div class="toc-rail" aria-hidden="true"><span class="toc-progress"><\/span><\/div><ol>/,
  );
  assert.match(html, /<a href="#https와-ca">HTTPS와 CA<\/a>/);
  // 제목의 깊이가 그대로 겹친 목록으로 돌아와야 번호가 1, 1.1로 매겨진다.
  assert.match(html, /<a href="#https와-ca">HTTPS와 CA<\/a><ol><li><a href="#사설-ca-만들기">/);
  // 목차는 초록 다음, 본문을 여는 선 앞에 온다.
  assert.match(html, /<\/header><nav class="toc"[\s\S]*?<div class="rule">/);
});

test("the narrow-window table of contents folds, and ships unfolded", () => {
  // 좁은 창에서 초록과 본문 사이를 차례가 다 먹지 않게 접을 수 있어야 한다.
  // 손잡이는 details·summary이므로 자바스크립트가 없어도 여닫힌다. open으로
  // 나가는 것은, 스크립트가 없는 읽개와 여백의 자로 들어내는 넓은 창이
  // 펼 수 없는 목록을 만나지 않게 하기 위해서다.
  const html = read("private-ca/index.html");
  assert.match(
    html,
    /<nav class="toc" aria-label="목차"><details class="toc-fold" open><summary class="toc-title">Contents<\/summary><div class="toc-body">/,
  );
  assert.match(html, /<\/div><\/details><\/nav>/);
});

test("a post with one heading gets no table of contents", () => {
  assert.doesNotMatch(read("first-post/index.html"), /class="toc"/);
});

test("reading time appears on the card and on the article", () => {
  assert.match(read("private-ca/index.html"), /<p class="eyebrow">[\s\S]*?· \d+ MIN<\/p>/);
  assert.match(read("index.html"), /<span class="reading">\d+ MIN<\/span>/);
  const posts = JSON.parse(read("posts.json"));
  for (const post of posts)
    assert.ok(post.readMinutes >= 1, `${post.slug} has no reading estimate`);
});

test("an article links on through its own category first", () => {
  // private-ca(infra, 07-29)에서 시간순 바로 앞은 first-post(none, 07-28)
  // 이지만, 같은 분류의 before-ca(infra, 07-27)가 있으므로 그쪽이 골라진다.
  const newest = read("private-ca/index.html");
  assert.match(
    newest,
    /<a class="post-nav-prev" href="\/before-ca\/"><span>Previous<\/span><strong>CA 이전에<\/strong><\/a>/,
  );
  // 같은 분류 안에서 이어지므로 분류 이름은 붙지 않는다.
  assert.doesNotMatch(newest, /<a class="post-nav-prev"[^>]*>[\s\S]*?<em>/);
  // 그보다 새 글은 어느 분류에도 없다.
  assert.match(newest, /<span class="post-nav-next post-nav-empty"><\/span>/);
});

test("a link that leaves the category says where it lands", () => {
  // first-post는 분류 none의 하나뿐인 글이므로 양쪽 모두 물러난다.
  const alone = read("first-post/index.html");
  assert.match(
    alone,
    /<a class="post-nav-prev" href="\/before-ca\/"><span>Previous<\/span><strong>CA 이전에<\/strong><em>infra<\/em><\/a>/,
  );
  assert.match(
    alone,
    /<a class="post-nav-next" href="\/private-ca\/"><span>Next<\/span><strong>사설 CA 구축<\/strong><em>infra<\/em><\/a>/,
  );
});

test("the oldest post in a category still reaches the one before it", () => {
  // before-ca는 infra에서 가장 오래된 글이므로 이전 글은 분류를 벗어나
  // 시간순 이웃인 with-code(notes)로 물러나고, 다음 글은 같은 분류의
  // private-ca다 — 시간순으로는 first-post가 더 가깝다.
  const oldest = read("before-ca/index.html");
  assert.match(oldest, /<a class="post-nav-prev" href="\/with-code\/">[\s\S]*?<em>notes<\/em>/);
  assert.match(
    oldest,
    /<a class="post-nav-next" href="\/private-ca\/"><span>Next<\/span><strong>사설 CA 구축<\/strong><\/a>/,
  );
});

test("every page opens with a skip link into the article", () => {
  for (const path of ["index.html", "private-ca/index.html", "404.html"]) {
    const html = read(path);
    assert.match(
      html,
      /<main id="app" class="paper"><a class="skip-link" href="#content">/,
      `${path} does not start with the skip link`,
    );
    assert.match(html, /<div id="content">/, `${path} has no skip target`);
  }
});

test("a page tells a reader which entry in the navigation it is", () => {
  assert.match(read("index.html"), /<a href="\/" aria-current="page">Archive<\/a>/);
  // 글과 분류 페이지는 머리글의 어느 항목도 아니므로 아무것도 표시하지 않는다.
  assert.doesNotMatch(read("private-ca/index.html"), /aria-current="page">Archive/);
  // 분류 페이지의 카드는 지금 보고 있는 그 분류를 가리키고 있다.
  assert.match(
    read("category/infra/index.html"),
    /<a href="\/category\/infra\/" aria-current="page">infra<\/a>/,
  );
  assert.doesNotMatch(read("index.html"), /category\/infra\/" aria-current/);
});

test("the search button ships hidden, for app.js to reveal", () => {
  // 이 단추 뒤에 있는 것은 전부 자바스크립트다. 파일이 뜨지 않은 독자에게
  // 눌러도 아무 일이 없는 단추를 보이지 않는다.
  assert.match(
    read("index.html"),
    /<button type="button" class="search-open" aria-label="글 검색" hidden>/,
  );
});

test("sitemap lists every route", () => {
  const xml = read("sitemap.xml");
  for (const path of [
    "/",
    "/private-ca/",
    "/first-post/",
    "/category/infra/",
    "/category/none/",
  ])
    assert.match(
      xml,
      new RegExp(`<loc>https://example\\.test${path.replace(/\//g, "\\/")}</loc>`),
      `${path} is missing from the sitemap`,
    );
  assert.match(xml, /<lastmod>2026-07-29<\/lastmod>/);
});

test("rss carries absolute links and full article bodies", () => {
  const xml = read("rss.xml");
  assert.match(xml, /<link>https:\/\/example\.test\/<\/link>/);
  assert.match(xml, /<guid isPermaLink="true">https:\/\/example\.test\/first-post\/<\/guid>/);
  assert.match(xml, /<pubDate>Wed, 29 Jul 2026 00:00:00 GMT<\/pubDate>/);
  assert.match(xml, /<content:encoded><!\[CDATA\[<blockquote>/);
  assert.doesNotMatch(xml, /(href|src)="\//, "feed still holds a relative url");
});

test("robots.txt points crawlers at the sitemap", () => {
  assert.match(read("robots.txt"), /Sitemap: https:\/\/example\.test\/sitemap\.xml/);
});

test("every page advertises the feed", () => {
  assert.match(
    read("index.html"),
    /rel="alternate"\s+type="application\/rss\+xml"/,
  );
});

test("posts.json is metadata only", () => {
  const posts = JSON.parse(read("posts.json"));
  assert.ok(posts.length > 0);
  for (const post of posts) {
    assert.equal(post.body, undefined, "bodies must not ship in the index");
    assert.ok(post.slug && post.title && post.description);
  }
  assert.deepEqual(
    posts.find((post) => post.slug === "private-ca").keywords,
    ["사설 CA", "HTTPS", "step-ca"],
  );
  assert.deepEqual(
    posts.find((post) => post.slug === "first-post").keywords,
    [],
  );
});

test("posts are ordered newest first", () => {
  const dates = JSON.parse(read("posts.json")).map((post) => post.date);
  assert.deepEqual(dates, [...dates].sort().reverse());
});

test("the font ships in two parts, each named after its contents", () => {
  // 한자가 원본의 81%이고 대부분의 글에는 한 자도 없다. unicode-range가
  // 갈라져 있으므로 브라우저는 실제로 쓰인 쪽만 받는다.
  const fonts = readdirSync(join(dist, "fonts"));
  const base = fonts.find((name) => /^sm-base\.[0-9a-f]{8}\.woff2$/.test(name));
  const han = fonts.find((name) => /^sm-han\.[0-9a-f]{8}\.woff2$/.test(name));
  assert.ok(base, `base 글꼴이 없다: ${fonts.join(", ")}`);
  assert.ok(han, `한자 글꼴이 없다: ${fonts.join(", ")}`);
  const size = (name) => readFileSync(join(dist, "fonts", name)).length;
  assert.ok(size(base) > 0 && size(han) > 0);
  // 미리 받는 것은 어느 글에나 쓰이는 쪽뿐이다.
  const html = read("index.html");
  assert.match(html, new RegExp(`rel="preload"[\\s\\S]*?fonts/${base}`));
  assert.doesNotMatch(html, new RegExp(`preload[\\s\\S]{0,200}${han}`));
  // 지문이 붙은 이름을 아는 것은 stylesheet뿐이다.
  const css = fonts.length && readdirSync(dist).find((name) => /^style\./.test(name));
  const styles = readFileSync(join(dist, css), "utf8");
  assert.match(styles, new RegExp(`url\\("fonts/${base}"\\)`));
  assert.match(styles, new RegExp(`url\\("fonts/${han}"\\)`));
  assert.doesNotMatch(styles, /sm-base\.woff2/, "지문 없는 주소가 남았다");
});

test("본문 로마자 글꼴이 굵기와 범위로 갈려 나간다", () => {
  // 네 벌(보통·굵게·기울임·굵은 기울임) × 두 범위(라틴·라틴 확장). 굵은
  // 글씨가 없는 글은 굵은 벌을 받지 않고, 라틴 확장 글자가 없는 글은 확장
  // 쪽을 아예 받지 않는다.
  const fonts = readdirSync(join(dist, "fonts"));
  const named = (stem) =>
    fonts.find((name) => new RegExp(`^${stem}\\.[0-9a-f]{8}\\.woff2$`).test(name));
  const css = readdirSync(dist).find((name) => /^style\./.test(name));
  const styles = readFileSync(join(dist, css), "utf8");
  for (const weight of ["regular", "bold", "italic", "bolditalic"])
    for (const stem of [`cmu-${weight}`, `cmu-${weight}-ext`]) {
      const file = named(stem);
      assert.ok(file, `${stem}이 없다: ${fonts.join(", ")}`);
      assert.ok(readFileSync(join(dist, "fonts", file)).length > 0, stem);
      assert.match(styles, new RegExp(`url\\("fonts/${file}"\\)`), stem);
    }
  assert.doesNotMatch(styles, /cmu-[a-z]+(-ext)?\.woff2/, "지문 없는 주소가 남았다");
  // 미리 받는 것은 어느 글에나 나오는 보통 벌뿐이다.
  const html = read("index.html");
  assert.match(html, new RegExp(`rel="preload"[\\s\\S]*?fonts/${named("cmu-regular")}`));
  for (const stem of ["cmu-bold", "cmu-italic", "cmu-regular-ext"])
    assert.doesNotMatch(
      html,
      new RegExp(`preload[\\s\\S]{0,200}${named(stem)}`),
      stem,
    );
});

test("본문 스택은 CMU Serif가 앞서고 Times New Roman이 뒤를 받는다", () => {
  const css = readdirSync(dist).find((name) => /^style\./.test(name));
  const styles = readFileSync(join(dist, css), "utf8");
  // 영문 본문은 CMU Serif를 우선 사용한다.
  assert.match(styles, /--serif:\s*"CMU Serif",\s*"Times New Roman"/);
});

// unicode-range 하나를 코드 점 집합으로 편다. "U+0100-0130"과 "U+0131" 두
// 꼴만 쓰인다.
function codePoints(range) {
  const points = new Set();
  for (const part of range.split(",")) {
    const [from, to] = part.trim().replace(/^U\+/i, "").split("-");
    const start = Number.parseInt(from, 16);
    const end = to ? Number.parseInt(to, 16) : start;
    for (let at = start; at <= end; at++) points.add(at);
  }
  return points;
}

test("본문 글꼴들의 unicode-range가 겹치지 않는다", () => {
  // 두 범위가 같은 글자를 집으면 브라우저가 쓰지도 않을 파일을 받는다.
  // 이 저장소가 글꼴을 쪼개는 이유가 바로 그것을 막으려는 것이다.
  const css = readdirSync(dist).find((name) => /^style\./.test(name));
  const styles = readFileSync(join(dist, css), "utf8");
  const faces = [
    ...styles.matchAll(
      /@font-face\{([^}]*font-family:(?:"CMU Serif"|"신명조")[^}]*)\}/g,
    ),
  ].map((match) => match[1]);
  assert.ok(faces.length >= 10, `@font-face를 못 찾았다: ${faces.length}`);
  const seen = new Map();
  for (const face of faces) {
    const family = face.match(/font-family:("[^"]+")/)[1];
    const weight = face.match(/font-weight:([^;}]+)/)?.[1] ?? "normal";
    const style = face.match(/font-style:([^;}]+)/)?.[1] ?? "normal";
    const range = face.match(/unicode-range:([^;}]+)/)?.[1];
    if (!range) continue;
    // 같은 글자를 두 파일이 집는지는 굵기·기울임이 같은 것끼리만 따진다.
    const key = `${family}|${weight}|${style}`;
    const points = codePoints(range);
    const already = seen.get(key) ?? new Set();
    for (const point of points)
      assert.ok(
        !already.has(point),
        `${key}에서 U+${point.toString(16).toUpperCase()}를 두 범위가 집는다`,
      );
    for (const point of points) already.add(point);
    seen.set(key, already);
  }
  // 신명조와 CMU Serif 사이에서도 겹치면 안 된다.
  const serif = [...seen].filter(([key]) => key.startsWith('"신명조"'));
  const roman = [...seen].filter(([key]) => key.startsWith('"CMU Serif"'));
  for (const [, hangul] of serif)
    for (const [key, latin] of roman)
      for (const point of hangul)
        assert.ok(
          !latin.has(point),
          `신명조와 ${key}가 U+${point.toString(16).toUpperCase()}를 함께 집는다`,
        );
});

test("화살표는 신명조가 진다", () => {
  // 바깥 링크의 화살표는 신명조가 맡는다.
  const css = readdirSync(dist).find((name) => /^style\./.test(name));
  const styles = readFileSync(join(dist, css), "utf8");
  const smBase = styles.slice(styles.indexOf("sm-base"));
  assert.match(smBase.slice(0, 400), /U\+2190-21FF/);
  // 같은 구간을 CMU Serif가 함께 집으면 브라우저가 헛걸음을 한다.
  const cmu = styles.slice(0, styles.indexOf("sm-base"));
  assert.doesNotMatch(cmu, /U\+2190-21FF/);
});

test("the icon keeps its own name at the site root", () => {
  assert.ok(readFileSync(join(dist, "favicon.svg")).length > 0);
});

test("every page points at the icon", () => {
  // The icon is one file for every size, so a page names it once and never
  // carries a second copy for a second resolution.
  for (const page of ["index.html", "private-ca/index.html", "404.html"])
    assert.match(read(page), /<link rel="icon" href="\/favicon\.svg"/);
});

test("the stylesheet and the script are named after their contents", () => {
  // A deploy rewrites these two files in place. Naming them by their own hash
  // gives a changed file a new URL, which is the only thing a browser cache
  // reliably notices.
  const html = read("index.html");
  const css = html.match(/href="\/(style\.[0-9a-f]{8}\.css)"/);
  const js = html.match(/src="\/(app\.[0-9a-f]{8}\.js)"/);
  assert.ok(css, html.slice(0, 400));
  assert.ok(js, html.slice(0, 800));
  assert.ok(readFileSync(join(dist, css[1])).length > 0);
  assert.ok(readFileSync(join(dist, js[1])).length > 0);
  assert.ok(!html.includes('href="/style.css"'), "an unhashed link is left");
});

test("the abstract is a name and a value, not two loose lines", () => {
  assert.match(
    read("private-ca/index.html"),
    /<dl class="deck"><dt>Abstract<\/dt><dd class="abstract">step-ca로 사설 CA를 만들어 봅니다.<\/dd><\/dl>/,
  );
});

test("the home page opens with one post at a larger size", () => {
  const html = read("index.html");
  // 최신 글 하나만 첫머리를 받고, 나머지는 그대로다.
  assert.match(html, /<article class="post-card is-lead">/);
  assert.equal((html.match(/is-lead/g) || []).length, 1);
  // 분류 페이지는 표지가 아니므로 첫머리 글이 없다.
  assert.doesNotMatch(read("category/infra/index.html"), /is-lead/);
});

test("no page asks a third party for anything", () => {
  // 수식과 강조는 빌드가 굽는다. 예전에는 KaTeX와 highlight.js를 CDN에서
  // 받고 SRI로 검증했는데, 이제 받아 올 것이 없다.
  for (const path of [
    "index.html",
    "404.html",
    "category/infra/index.html",
    "private-ca/index.html",
    "with-code/index.html",
  ])
    assert.doesNotMatch(read(path), /cdn\.jsdelivr|cdnjs|unpkg/, path);
});

test("a page carries the katex stylesheet only when it has a formula", () => {
  // 스타일시트는 글꼴을 지고 있어 가볍지 않다. 수식이 없는 페이지가 그것을
  // 받아 둘 이유가 없다.
  for (const path of ["index.html", "404.html", "category/infra/index.html"])
    assert.doesNotMatch(read(path), /katex/, `${path}가 KaTeX를 지고 있다`);
  assert.doesNotMatch(read("private-ca/index.html"), /katex/);
  assert.match(read("with-code/index.html"), /<link rel="stylesheet" href="\/katex\.[0-9a-f]{8}\.css">/);
});

test("a formula is drawn into the page, not left for a script", () => {
  const html = read("with-code/index.html");
  assert.match(html, /class="math math-inline math-baked"/);
  assert.match(html, /<math xmlns="http:\/\/www\.w3\.org\/1998\/Math\/MathML"/);
  assert.doesNotMatch(html, /katex\.min\.js/);
});

test("code is highlighted into the page too", () => {
  const html = read("with-code/index.html");
  assert.match(html, /<code class="language-js hljs">/);
  assert.match(html, /<span class="hljs-keyword">const<\/span>/);
});

test("the katex fonts are fingerprinted and served from here", () => {
  const css = read("katex." + read("with-code/index.html").match(/katex\.([0-9a-f]{8})\.css/)[1] + ".css");
  assert.match(css, /url\(\/katex\/KaTeX_Main-Regular\.[0-9a-f]{8}\.woff2\)/);
  // woff와 ttf는 남기지 않는다.
  assert.doesNotMatch(css, /\.(?:woff|ttf)\)/);
});

test("a post can name its own language", () => {
  assert.match(read("with-code/index.html"), /<html lang="en"/);
  // 적지 않은 글은 한국어다.
  assert.match(read("private-ca/index.html"), /<html lang="ko"/);
});

test("text files ship with a compressed copy beside them", () => {
  // 서버는 요청마다 다시 압축하는 대신 이 파일을 그대로 흘려보낸다.
  // 두 벌인 것은 brotli를 못 받는 상대가 아직 있기 때문이다.
  for (const path of ["index.html", "rss.xml", "posts.json", "search.json"]) {
    const plain = readFileSync(join(dist, path)).length;
    for (const extension of [".br", ".gz"]) {
      const packed = readFileSync(join(dist, `${path}${extension}`)).length;
      assert.ok(packed < plain, `${path}${extension}가 원본보다 크다`);
    }
  }
  // 이미 압축된 것에는 두지 않는다.
  const font = readdirSync(join(dist, "fonts"));
  for (const name of font) assert.doesNotMatch(name, /\.woff2\.(gz|br)$/);
});

test("brotli is the smaller of the two copies", () => {
  // 서버가 brotli를 먼저 묻는 근거. 작은 파일에서는 뒤집힐 수 있으므로
  // 실제로 크기가 걸리는 파일로 잰다.
  const gzip = readFileSync(join(dist, "rss.xml.gz")).length;
  const brotli = readFileSync(join(dist, "rss.xml.br")).length;
  assert.ok(brotli < gzip, `brotli ${brotli}B가 gzip ${gzip}B보다 작지 않다`);
});

test("search.json carries the bodies the index leaves out", () => {
  // 목록은 그대로 가볍고, 본문은 검색을 여는 사람만 받는다.
  const index = JSON.parse(read("posts.json"));
  const bodies = JSON.parse(read("search.json"));
  assert.deepEqual(
    bodies.map((entry) => entry.slug),
    index.map((post) => post.slug),
  );
  const text = new Map(bodies.map((entry) => [entry.slug, entry.text]));
  // 제목에도 초록에도 없고 본문에만 있는 말이 실려 있어야 검색이 닿는다.
  assert.match(text.get("private-ca"), /본문에서 step-ca를 다룹니다/);
  assert.match(text.get("first-post"), /첫 글입니다/);
  // 인용과 제목 표시는 글이 아니므로 걷어 낸다.
  assert.doesNotMatch(text.get("private-ca"), /[>#]/);
  // 코드와 수식은 자료라 빠진다.
  assert.doesNotMatch(text.get("with-code"), /const a = 1/);
  assert.doesNotMatch(text.get("with-code"), /x\^2/);
});

test("the shipped stylesheet and script carry no comments", () => {
  const files = readdirSync(dist);
  const css = readFileSync(join(dist, files.find((n) => /^style\./.test(n))), "utf8");
  const js = readFileSync(join(dist, files.find((n) => /^app\./.test(n))), "utf8");
  assert.doesNotMatch(css, /\/\*/, "stylesheet에 주석이 남았다");
  assert.doesNotMatch(js, /^\s*\/\//m, "script에 주석 줄이 남았다");
  // 그래도 문법은 살아 있어야 한다.
  new Function(js);
});

test("a keyword gets a page of its own", () => {
  const html = read("keyword/https/index.html");
  assert.match(html, /<p class="eyebrow">Keyword<\/p><h1>HTTPS<\/h1>/);
  assert.match(html, /사설 CA 구축/);
});

test("the day a post was fixed stands beside the day it was written", () => {
  const html = read("private-ca/index.html");
  assert.match(html, /Jul 29, 2026 · Aug 14, 2026 고침/);
  // sitemap은 고친 날을 든다. 그러지 않으면 바뀐 것을 아무도 모른다.
  assert.match(read("sitemap.xml"), /<loc>[^<]*\/private-ca\/<\/loc>\s*<lastmod>2026-08-14<\/lastmod>/);
});


// ── dev 전용 편집기 ─────────────────────────────────────────

test("나가는 빌드에는 편집기가 없다", () => {
  for (const path of ["write/index.html", "editor.js", "editor.css"])
    assert.equal(existsSync(join(dist, path)), false, path);
});

test("DEV 빌드에는 편집기가 선다", () => {
  const html = readDev("write/index.html");
  assert.match(html, /<textarea class="write-text"/);
  assert.match(html, /<link rel="stylesheet" href="\/editor\.css">/);
  assert.match(html, /<script defer src="\/editor\.js"><\/script>/);
  // 페이지의 나머지는 여느 페이지와 같다 — 지문 붙은 style.css와 app.js,
  // 머리글과 바닥글.
  assert.match(html, /<header class="site-head">/);
  assert.match(html, /href="\/style\.[0-9a-f]{8}\.css"/);
  assert.ok(existsSync(join(devDist, "editor.js")));
  assert.ok(existsSync(join(devDist, "editor.css")));
  // 편집기에서는 언제든 수식을 칠 수 있으므로, 글에 수식이 없어도 KaTeX가
  // 나간다.
  const katex = readdirSync(devDist).find((name) => /^katex\.[0-9a-f]{8}\.css$/.test(name));
  assert.ok(katex, "KaTeX 스타일시트가 없다");
  assert.match(html, new RegExp(`href="/${katex}"`));
});

test("편집기는 읽을 글이 아니므로 목록 어디에도 없다", () => {
  assert.doesNotMatch(readDev("sitemap.xml"), /\/write\//);
  assert.doesNotMatch(readDev("rss.xml"), /\/write\//);
  const posts = JSON.parse(readDev("posts.json"));
  assert.ok(Array.isArray(posts));
  assert.equal(posts.some((post) => post.slug === "write"), false);
  assert.doesNotMatch(readDev("index.html"), /href="\/write\/"/);
});

test("DEV가 아니면 초안 폴더를 읽지 않는다", () => {
  // 나가는 빌드와 DEV 빌드가 같은 글 넷을 굽는다 — 다른 것은 편집기뿐이다.
  const pages = (dir) =>
    readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  assert.deepEqual(
    pages(devDist).filter((name) => name !== "write"),
    pages(dist),
  );
});
