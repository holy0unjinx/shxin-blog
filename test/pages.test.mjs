// Series, the paged home, and the "read on" list. Built from a fixture set
// so the assertions do not depend on which posts are in posts/ today.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { after, before, test } from "node:test";

import { PAGE_SIZE, homePage, pageCount, pagePath, yearOf } from "../site/pages.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = mkdtempSync(join(tmpdir(), "shxin-pages-"));
const postsDir = mkdtempSync(join(tmpdir(), "shxin-pages-posts-"));
const read = (path) => readFileSync(join(dist, path), "utf8");
const exists = (path) => {
  try {
    read(path);
    return true;
  } catch {
    return false;
  }
};

function post({ slug, title, date, category = "infra", extra = "", body = "본문." }) {
  return `---
title: "${title}"
date: ${date}
category: ${category}
slug: ${slug}
description: "${title}의 한 줄."
${extra}---

${body}
`;
}

before(() => {
  // 세 편짜리 시리즈. part는 날짜순과 어긋나게 적어, 순서를 무엇이 정하는지
  // 가려지게 한다.
  writeFileSync(
    join(postsDir, "ca-1.md"),
    post({
      slug: "ca-1",
      title: "CA 하나",
      date: "2026-01-03",
      extra: 'series: "사설 CA 세우기"\npart: 1\nkeywords: 사설 CA, step-ca\n',
    }),
  );
  writeFileSync(
    join(postsDir, "ca-2.md"),
    post({
      slug: "ca-2",
      title: "CA 둘",
      date: "2026-01-01",
      extra: 'series: "사설 CA 세우기"\npart: 2\nkeywords: 사설 CA\n',
    }),
  );
  writeFileSync(
    join(postsDir, "ca-3.md"),
    post({
      slug: "ca-3",
      title: "CA 셋",
      date: "2026-01-02",
      extra: 'series: "사설 CA 세우기"\npart: 3\n',
    }),
  );
  // 시리즈에 들지 않은 글 둘. 하나는 같은 분류, 하나는 다른 분류다.
  writeFileSync(
    join(postsDir, "solo.md"),
    post({ slug: "solo", title: "혼자", date: "2025-06-01", extra: "keywords: step-ca\n" }),
  );
  writeFileSync(
    join(postsDir, "other.md"),
    post({ slug: "other", title: "다른 분야", date: "2024-02-02", category: "math" }),
  );
  const build = spawnSync(process.execPath, ["site/build.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SITE_URL: "https://example.test", OUT_DIR: dist, POSTS_DIR: postsDir },
  });
  assert.equal(build.status, 0, build.stderr);
});

after(() => {
  rmSync(dist, { recursive: true, force: true });
  rmSync(postsDir, { recursive: true, force: true });
});

test("a year is read off the date, and a post without one has no year", () => {
  assert.equal(yearOf({ date: "2026-07-29" }), "2026");
  assert.equal(yearOf({ date: "" }), "");
  assert.equal(yearOf({}), "");
});

test("a series gets its own contents page, in part order", () => {
  const html = read("series/사설-ca-세우기/index.html");
  assert.match(html, /<h1>사설 CA 세우기<\/h1>/);
  assert.match(html, /<p>3편<\/p>/);
  const order = [...html.matchAll(/href="\/(ca-\d)\//g)].map((m) => m[1]);
  assert.deepEqual(order, ["ca-1", "ca-2", "ca-3"]);
});

test("the printed part number counts the parts that exist", () => {
  const html = read("series/사설-ca-세우기/index.html");
  assert.match(html, /<span class="series-part">1<\/span><a href="\/ca-1\//);
  assert.match(html, /<span class="series-part">3<\/span><a href="\/ca-3\//);
});

test("an article in a series says where it sits and links to the contents", () => {
  assert.match(
    read("ca-2/index.html"),
    /<p class="series-banner"><a href="\/series\/%EC%82%AC%EC%84%A4-ca-%EC%84%B8%EC%9A%B0%EA%B8%B0\/">사설 CA 세우기<\/a><span>3편 중 2편<\/span><\/p>/,
  );
  assert.doesNotMatch(read("solo/index.html"), /series-banner/);
});

test("next and previous follow the series, not the calendar", () => {
  // ca-2는 날짜로는 시리즈에서 가장 오래된 글이지만, 편으로는 가운데다.
  const html = read("ca-2/index.html");
  assert.match(html, /<a class="post-nav-prev" href="\/ca-1\//);
  assert.match(html, /<a class="post-nav-next" href="\/ca-3\//);
});

test("the last part of a series never points back into it", () => {
  // ca-1은 날짜로는 가장 새 글이므로, 걸러 두지 않으면 마지막 편의 "다음
  // 글"이 1편으로 돌아간다. 그 편들은 시리즈 목차에서 이미 닿는다.
  const html = read("ca-3/index.html");
  assert.match(html, /<a class="post-nav-prev" href="\/ca-2\//);
  assert.doesNotMatch(html, /<a class="post-nav-next" href="\/ca-1\//);
  assert.match(html, /<span class="post-nav-next post-nav-empty"><\/span>/);
});

test("a post outside every series still links by date and category", () => {
  // solo은 시리즈에 들지 않았으므로 시리즈 글도 이웃이 될 수 있다.
  const html = read("solo/index.html");
  assert.match(html, /<a class="post-nav-next" href="\/ca-2\//);
  assert.match(html, /<a class="post-nav-prev" href="\/other\//);
});

test("the home page lists the series and the years beside the categories", () => {
  const html = read("index.html");
  assert.match(html, /<section class="categories" id="series"><p>Series<\/p>/);
  assert.match(html, /<a href="\/series\/%EC%82%AC%EC%84%A4-ca-%EC%84%B8%EC%9A%B0%EA%B8%B0\/">사설 CA 세우기 <span>\(3\)<\/span><\/a>/);
  assert.match(html, /<section class="categories" id="years"><p>Years<\/p>/);
  assert.match(html, /<a href="\/2026\/">2026 <span>\(3\)<\/span><\/a>/);
});

test("a home page that already holds every post has no pager and no second page", () => {
  // 다섯 편은 한 쪽 아래이므로 넘길 쪽이 없다.
  assert.ok(5 < PAGE_SIZE);
  assert.doesNotMatch(read("index.html"), /class="pager"/);
  assert.equal(exists("page/2/index.html"), false);
});

// 쪽 나눔은 순수 함수라 스무 편 넘는 빌드를 세우지 않고 여기서 바로 잰다.
const many = Array.from({ length: PAGE_SIZE * 2 + 3 }, (unused, index) => ({
  slug: `p${index}`,
  title: `글 ${index}`,
  date: "2026-01-01",
  category: "infra",
  categorySlug: "infra",
  description: "한 줄.",
  excerpt: "한 줄.",
  keywords: [],
}));

test("the home page splits into pages of PAGE_SIZE, the first page keeping the lead", () => {
  assert.equal(pageCount(many), 3);
  assert.equal(pagePath(1), "/");
  assert.equal(pagePath(3), "/page/3/");

  const first = homePage(many, 1);
  assert.equal((first.match(/post-card/g) || []).length, PAGE_SIZE);
  assert.equal((first.match(/is-lead/g) || []).length, 1);
  assert.match(first, /<p>1 \/ 3<\/p>/);
  // 첫 쪽에는 갈 앞쪽이 없고, 뒤로는 갈 곳이 있다.
  assert.match(first, /<span class="pager-end"><span>←<\/span> 새 글<\/span>/);
  assert.match(first, /rel="next" href="\/page\/2\/"/);
});

// 쪽이 실제로 파일과 sitemap이 되는지는 빌드를 세워야 보인다. 위 fixture는
// 다섯 편이라 쪽이 하나뿐이므로, 이 시험만 스물다섯 편을 따로 세운다.
test("a build with more posts than one page writes /page/2/ and lists it in the sitemap", () => {
  const many = mkdtempSync(join(tmpdir(), "shxin-paged-"));
  const out = mkdtempSync(join(tmpdir(), "shxin-paged-dist-"));
  try {
    for (let index = 0; index < PAGE_SIZE + 5; index += 1)
      writeFileSync(
        join(many, `p${index}.md`),
        post({
          slug: `p${index}`,
          title: `글 ${index}`,
          date: `2026-01-${String((index % 28) + 1).padStart(2, "0")}`,
        }),
      );
    const build = spawnSync(process.execPath, ["site/build.mjs"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, SITE_URL: "https://example.test", OUT_DIR: out, POSTS_DIR: many },
    });
    assert.equal(build.status, 0, build.stderr);

    const second = readFileSync(join(out, "page/2/index.html"), "utf8");
    assert.equal((second.match(/post-card/g) || []).length, 5);
    // 표지는 첫 쪽에만 있다.
    assert.doesNotMatch(second, /is-lead/);
    assert.match(second, /rel="prev" href="\/"/);
    assert.match(readFileSync(join(out, "index.html"), "utf8"), /rel="next" href="\/page\/2\/"/);
    assert.match(readFileSync(join(out, "sitemap.xml"), "utf8"), /<loc>https:\/\/example\.test\/page\/2\/<\/loc>/);
    assert.equal(existsSync(join(out, "page/3/index.html")), false);
  } finally {
    rmSync(many, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});

test("the last page holds the remainder and only points back", () => {
  const last = homePage(many, 3);
  assert.equal((last.match(/post-card/g) || []).length, 3);
  assert.doesNotMatch(last, /is-lead/);
  assert.match(last, /rel="prev" href="\/page\/2\/"/);
  assert.match(last, /<span class="pager-end">옛 글 <span>→<\/span><\/span>/);
  // 분야 칩은 쪽마다 선다. 머리글의 Categories가 가리키는 닻이기 때문이다.
  assert.match(last, /id="categories"/);
});

test("each year gets a page of its own", () => {
  const html = read("2026/index.html");
  assert.match(html, /<h1>2026<\/h1>/);
  assert.match(html, /<p>3개의 글<\/p>/);
  assert.doesNotMatch(html, /href="\/other\//);
  assert.ok(exists("2025/index.html"));
  assert.ok(exists("2024/index.html"));
});

test("the new routes are in the sitemap", () => {
  const xml = read("sitemap.xml");
  for (const path of ["/2026/", "/series/%EC%82%AC%EC%84%A4-ca-%EC%84%B8%EC%9A%B0%EA%B8%B0/"])
    assert.match(xml, new RegExp(path.replace(/[/]/g, "\\/")), path);
});

test("read-on weighs shared keywords above a shared category", () => {
  // ca-1은 solo와 키워드(step-ca) 하나를 나눠 쓰고, ca-2와는 사설 CA를
  // 나눠 쓰며 시리즈까지 같다.
  const html = read("ca-1/index.html");
  const section = html.match(/<section class="related"[\s\S]*?<\/section>/)[0];
  const slugs = [...section.matchAll(/href="\/([^/]+)\//g)].map((m) => m[1]);
  assert.equal(slugs[0], "ca-2");
  assert.ok(slugs.includes("solo"));
  assert.ok(slugs.length <= 3);
});

test("read-on says nothing when nothing overlaps", () => {
  // other는 분류도 시리즈도 키워드도 겹치지 않는다.
  assert.doesNotMatch(read("other/index.html"), /class="related"/);
});

test("a post is never related to itself", () => {
  for (const slug of ["ca-1", "ca-2", "solo"]) {
    const html = read(`${slug}/index.html`);
    const related = html.match(/<section class="related"[\s\S]*?<\/section>/);
    if (related) assert.doesNotMatch(related[0], new RegExp(`href="/${slug}/"`));
  }
});

test("posts.json carries the series so an outside reader can group by it", () => {
  const posts = JSON.parse(read("posts.json"));
  const one = posts.find((item) => item.slug === "ca-1");
  assert.equal(one.series, "사설 CA 세우기");
  assert.equal(one.seriesSlug, "사설-ca-세우기");
  assert.equal(one.part, 1);
});
