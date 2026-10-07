// Page-shape builders. These run at build time only; the browser receives the
// finished HTML and never re-renders it.

import { dateText, esc, slugify } from "../render/index.mjs";

// 홈 한 쪽에 카드로 서는 글의 수. 분야가 여러 개면 목록은 금방 길어지고, 한
// 화면에 전부 세워 둔 홈은 목록이 아니라 벽이 된다. 넘치는 만큼은 뒷쪽이
// 맡는다.
export const PAGE_SIZE = 20;

// 쪽 수와 쪽 주소. 첫 쪽은 홈 그 자체여서 /page/1/을 따로 내지 않는다 —
// 같은 목록이 두 주소에 서면 둘 중 어느 쪽이 정본인지 검색 엔진이 묻는다.
export const pageCount = (posts) =>
  Math.max(1, Math.ceil(posts.length / PAGE_SIZE));

export const pagePath = (number) => (number === 1 ? "/" : `/page/${number}/`);

export function shell(content, year, current = "") {
  // A page names itself in the navigation so a screen reader is told where it
  // already is instead of being offered the same place again.
  const here = (name) => (current === name ? ' aria-current="page"' : "");
  // The skip link is the first thing in the tab order and the only thing
  // before the masthead, so a keyboard reaches the article without walking
  // the whole header. It is off-screen until it takes focus.
  return `<a class="skip-link" href="#content">본문으로 건너뛰기</a><header class="site-head"><a href="/" class="wordmark">shxin<span>.</span>blog</a><nav><a href="/"${here("home")}>Archive</a><a href="/#categories">Categories</a><button type="button" class="search-open" aria-label="글 검색" hidden>Search</button><button type="button" class="theme-toggle" aria-label="Toggle color theme"><span class="to-dark">Dark</span><span class="to-light">Light</span></button></nav></header><div id="content">${content}</div><footer>shxin.blog · ${year}</footer>`;
}

function categoryLink(post) {
  return `/category/${encodeURIComponent(post.categorySlug)}/`;
}

function seriesLink(post) {
  return `/series/${encodeURIComponent(post.seriesSlug)}/`;
}

const postLink = (post) => `/${encodeURIComponent(post.slug)}/`;

// 연도. date가 비어 있는 글은 어느 해에도 속하지 않으므로 아카이브에서
// "연도 미상"으로 따로 모인다.
export function yearOf(post) {
  const match = String(post.date || "").match(/^(\d{4})/);
  return match ? match[1] : "";
}

// "10 MIN". The label layer of this paper is set in Arial, which carries no
// Hangul, so the estimate is written the way every other label here is.
// Absent on a post that has no body to measure, so every caller guards.
function readingText(post) {
  return post.readMinutes ? `${post.readMinutes} MIN` : "";
}

// The newest post opens the archive at a larger size when `lead` is set, the
// way a journal gives its cover to one article. Every other card is the same
// as it was.
function postCards(posts, { currentCategory = "", lead = false } = {}) {
  return posts
    .map((post, index) => {
      const reading = readingText(post);
      const category = post.categorySlug === currentCategory ? ' aria-current="page"' : "";
      const first = lead && index === 0 ? " is-lead" : "";
      return `<article class="post-card${first}${post.draft ? " is-draft" : ""}"><div class="post-meta"><time datetime="${esc(post.date)}">${dateText(post.date)}</time>${post.draft ? '<span class="draft-mark">초안</span>' : ""}<a href="${categoryLink(post)}"${category}>${esc(post.category)}</a>${reading ? `<span class="reading">${reading}</span>` : ""}</div><h2><a href="/${encodeURIComponent(post.slug)}/">${esc(post.title)}</a></h2><p>${esc(post.description)}</p><a class="read" href="/${encodeURIComponent(post.slug)}/">Read article <span>→</span></a></article>`;
    })
    .join("");
}

// 분류·시리즈·연도 칩 한 줄. 세 목록이 같은 모양이므로 한 함수가 만든다.
function chipRow({ id, label, items }) {
  if (!items.length) return "";
  return (
    `<section class="categories" id="${id}"><p>${esc(label)}</p><div>${items
      .map(
        ({ href, name, count }) =>
          `<a href="${href}">${esc(name)}${count ? ` <span>(${count})</span></a>` : "</a>"}`,
      )
      .join("")}</div></section>`
  );
}

function categoryChips(posts) {
  const seen = new Map();
  for (const post of posts)
    if (!seen.has(post.categorySlug)) seen.set(post.categorySlug, post);
  return [...seen.values()].map((post) => ({
    href: categoryLink(post),
    name: post.category,
    count: posts.filter((item) => item.categorySlug === post.categorySlug).length,
  }));
}

function seriesChips(posts) {
  const seen = new Map();
  for (const post of posts)
    if (post.series && !seen.has(post.seriesSlug)) seen.set(post.seriesSlug, post);
  return [...seen.values()].map((post) => ({
    href: seriesLink(post),
    name: post.series,
    count: posts.filter((item) => item.seriesSlug === post.seriesSlug).length,
  }));
}

function yearChips(posts) {
  const years = [...new Set(posts.map(yearOf).filter(Boolean))].sort().reverse();
  return years.map((year) => ({
    href: `/${year}/`,
    name: year,
    count: posts.filter((post) => yearOf(post) === year).length,
  }));
}

// 쪽을 넘기는 줄. 한 쪽에 다 들어가는 블로그에는 아예 서지 않는다. 뒷쪽일
// 수록 옛 글이므로 글자는 쪽 번호가 아니라 그쪽에 무엇이 있는지로 적는다.
function pager(number, total) {
  if (total < 2) return "";
  const step = (to, text, rel) =>
    to >= 1 && to <= total
      ? `<a class="read" rel="${rel}" href="${pagePath(to)}">${text}</a>`
      : `<span class="pager-end">${text}</span>`;
  return (
    `<nav class="pager" aria-label="쪽 넘기기">` +
    step(number - 1, "<span>←</span> 새 글", "prev") +
    `<p>${number} / ${total}</p>` +
    step(number + 1, "옛 글 <span>→</span>", "next") +
    `</nav>`
  );
}

/**
 * 홈과 그 뒷쪽. number는 1부터이고, 1쪽만 첫 글을 크게 세운다 — 표지는
 * 한 번만 있는 것이다.
 */
export function homePage(posts, number = 1) {
  const total = pageCount(posts);
  const here = posts.slice((number - 1) * PAGE_SIZE, number * PAGE_SIZE);
  return (
    `<section class="archive-title"><p>Archive — ${String(posts.length).padStart(2, "0")} articles</p></section>` +
    `<section class="post-list">${postCards(here, { lead: number === 1 })}</section>` +
    pager(number, total) +
    // 칩은 쪽마다 선다. 머리글의 Categories가 가리키는 곳이 홈의 닻이고,
    // 뒷쪽에서 그 닻만 없으면 옛 글을 보다 분야로 건너뛸 수가 없다.
    chipRow({ id: "categories", label: "Categories", items: categoryChips(posts) }) +
    chipRow({ id: "series", label: "Series", items: seriesChips(posts) }) +
    chipRow({ id: "years", label: "Years", items: yearChips(posts) })
  );
}

export function yearPage(year, posts) {
  return (
    `<section class="category-head"><a class="back" href="/">← Archive</a>` +
    `<p class="eyebrow">Year</p><h1>${esc(year)}</h1>` +
    `<p>${posts.length}개의 글</p></section>` +
    `<section class="post-list">${postCards(posts)}</section>`
  );
}

/**
 * 시리즈 목차. 편 번호가 있으면 그 순서, 없으면 날짜순이다.
 */
export function seriesPage(name, posts) {
  return (
    `<section class="category-head"><a class="back" href="/">← Archive</a>` +
    `<p class="eyebrow">Series</p><h1>${esc(name)}</h1>` +
    `<p>${posts.length}편</p></section>` +
    `<ol class="series-list">${posts
      .map(
        (post, index) =>
          `<li><span class="series-part">${index + 1}</span>` +
          `<a href="${postLink(post)}">${esc(post.title)}</a>` +
          `<p>${esc(post.description)}</p></li>`,
      )
      .join("")}</ol>`
  );
}

// Keywords sit under the abstract, in the same shape as the deck above them.
function keywordLine(keywords = []) {
  if (!keywords.length) return "";
  // 낱말마다 그 낱말을 다룬 글 목록으로 간다. 분류가 글 하나에 하나뿐인
  // 것과 달리 키워드는 여러 글이 나눠 쓰므로, 여기가 실제 진입로가 된다.
  return `<dl class="keywords"><dt>Keywords</dt><dd>${keywords
    .map(
      (word) =>
        `<a href="/keyword/${encodeURIComponent(slugify(word))}/">${esc(word)}</a>`,
    )
    .join(" · ")}</dd></dl>`;
}

// Headings arrive flat, each carrying its own level. Nesting them back up is
// what lets the printed list number itself 1, 1.1, 1.2 through CSS counters
// rather than through numbers baked into the markup.
function tocTree(headings) {
  const root = { children: [] };
  const stack = [{ level: -Infinity, node: root }];
  for (const heading of headings) {
    while (stack.length > 1 && heading.level <= stack[stack.length - 1].level)
      stack.pop();
    const node = { ...heading, children: [] };
    stack[stack.length - 1].node.children.push(node);
    stack.push({ level: heading.level, node });
  }
  return root.children;
}

function tocList(nodes) {
  return `<ol>${nodes
    .map(
      (node) =>
        `<li><a href="#${node.id}">${esc(node.text)}</a>${node.children.length ? tocList(node.children) : ""}</li>`,
    )
    .join("")}</ol>`;
}

// The contents ship in the page, so they are a working list of links with no
// JavaScript at all. On a wide window the stylesheet lifts the same markup out
// into the left margin as a rail, where app.js marks the section being read
// and fills the rule beside it. One heading is not a contents page.
export function toc(headings) {
  if (headings.length < 2) return "";
  // On a narrow window the contents sit between the abstract and the article,
  // where a long list pushes the opening paragraph off the screen. A details
  // element folds them away with no script of its own; it ships open so that
  // a reader without JavaScript — and the wide window, which turns the same
  // markup into the margin rail — never meets a list that cannot be unfolded.
  // The rule and the list share one box. That box is what the rule is
  // measured against, and it grows with the list — the nav itself is only the
  // window that scrolls, and a rule stretched to the window would stop at the
  // fold and leave the rows below it with nothing beside them.
  return `<nav class="toc" aria-label="목차"><details class="toc-fold" open><summary class="toc-title">Contents</summary><div class="toc-body"><div class="toc-rail" aria-hidden="true"><span class="toc-progress"></span></div>${tocList(tocTree(headings))}</div></details></nav>`;
}

// The end of an article is a dead end otherwise: the only way on was back to
// the archive. Older sits left, newer right, and a missing side keeps its
// column so the remaining one does not slide across. A link that had to leave
// the category to find a neighbour names the category it lands in, so the jump
// is not a surprise.
function postNav({ prev, next } = {}) {
  if (!prev && !next) return "";
  const cell = (post, label, side) =>
    post
      ? `<a class="post-nav-${side}" href="/${encodeURIComponent(post.slug)}/"><span>${label}</span><strong>${esc(post.title)}</strong>${post.category ? `<em>${esc(post.category)}</em>` : ""}</a>`
      : `<span class="post-nav-${side} post-nav-empty"></span>`;
  return `<nav class="post-nav" aria-label="다른 글">${cell(prev, "Previous", "prev")}${cell(next, "Next", "next")}</nav>`;
}

// 시리즈 띠. 이 글이 몇 편 중 몇 편인지 말하고 목차로 보낸다. 여러 편으로
// 나눈 글은 중간부터 읽기 시작하는 사람이 있고, 그 사람에게 필요한 것은
// 앞 글이 아니라 전체 구조다.
function seriesBanner(post, series = {}) {
  if (!post.series || !series.total) return "";
  return (
    `<p class="series-banner"><a href="${seriesLink(post)}">${esc(post.series)}</a>` +
    `<span>${series.total}편 중 ${series.index}편</span></p>`
  );
}

// 이어 읽을 글. 겹치는 것이 없으면 아무것도 내지 않는다 — 빈 칸을 채우려고
// 관계없는 글을 붙이면 이 자리를 한 번 읽어 본 사람이 다시 보지 않는다.
function relatedPosts(posts = []) {
  if (!posts.length) return "";
  return (
    `<section class="related" aria-label="이어 읽을 글"><p>Related</p>` +
    `<ol>${posts
      .map(
        (post) =>
          `<li><a href="${postLink(post)}">${esc(post.title)}</a>` +
          `<span>${esc(post.category)}</span></li>`,
      )
      .join("")}</ol></section>`
  );
}

export function postPage(post, document, siblings = {}) {
  const reading = readingText(post);
  return `<article class="article"><a class="back" href="/">← Archive</a><header class="article-head"><p class="eyebrow">${post.draft ? '<span class="draft-mark">초안</span> · ' : ""}<a href="${categoryLink(post)}">${esc(post.category)}</a> · ${dateText(post.date)}${
    post.updated && post.updated !== post.date
      ? ` · ${esc(dateText(post.updated))} 고침`
      : ""
  }${reading ? ` · ${reading}` : ""}</p><h1>${esc(post.title)}</h1>${seriesBanner(post, siblings.series)}<dl class="deck"><dt>Abstract</dt><dd class="abstract">${esc(post.description)}</dd></dl>${keywordLine(post.keywords)}</header>${toc(document.headings)}<div class="rule"></div><div class="prose">${document.html}</div>${postNav(siblings)}${relatedPosts(siblings.related)}</article>`;
}

export function keywordPage(name, posts) {
  return (
    `<section class="category-head"><a class="back" href="/">← Archive</a>` +
    `<p class="eyebrow">Keyword</p><h1>${esc(name)}</h1>` +
    `<p>${posts.length}개의 글</p></section>` +
    `<section class="post-list">${postCards(posts)}</section>`
  );
}

export function categoryPage(name, posts, categorySlug = "") {
  return `<section class="category-head"><a class="back" href="/">← Archive</a><p class="eyebrow">Category</p><h1>${esc(name)}</h1><p>${posts.length}개의 글</p></section><section class="post-list">${postCards(posts, { currentCategory: categorySlug })}</section>`;
}

export function notFoundPage() {
  return '<section class="not-found"><p class="eyebrow">ERROR 404</p><h1>Page not found.</h1><a class="read" href="/">← Back to archive</a></section>';
}

// 페이지마다 다르게 붙는 것. 수식이 있는 페이지만 KaTeX 스타일시트를 받고,
// 그 스타일시트도 CDN이 아니라 우리 dist/에 있다. 수식 자체는 빌드에서 이미
// 구워져 나가므로 katex.min.js는 아무 페이지에도 붙지 않는다.
//
// 문법 강조도 마찬가지다. 예전에는 highlight.js와 github 테마 두 벌을 CDN에서
// 받고 테마를 바꿀 때 주소를 갈아치웠다. 이제 강조는 빌드가 하고 배색은
// style.css의 무채색 규칙이 지므로, 코드가 있는 페이지도 바깥 요청이 없다.
export function pageAssets({
  math = false,
  katexStyle = "",
  styles = [],
  scripts = [],
} = {}) {
  const tags = [];
  if (math && katexStyle)
    tags.push(`<link rel="stylesheet" href="${esc(katexStyle)}">`);
  // 한 페이지만 쓰는 스타일과 스크립트. 편집기가 이 자리를 쓴다 — 읽는
  // 사람의 페이지에는 그 규칙도 그 코드도 내려가지 않는다.
  for (const href of styles)
    tags.push(`<link rel="stylesheet" href="${esc(href)}">`);
  for (const src of scripts) tags.push(`<script defer src="${esc(src)}"></script>`);
  return tags.join("");
}

export function head({
  title,
  description,
  url,
  type = "website",
  date,
  keywords = [],
  image = "",
}) {
  const tags = [
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:site_name" content="shxin.blog">`,
  ];
  // 카드가 있는 페이지만 큰 카드를 청한다. 그림이 없는데 큰 카드를 청하면
  // 자리가 비어 나온다.
  if (image) {
    tags.push(
      `<meta property="og:image" content="${esc(image)}">`,
      `<meta property="og:image:type" content="image/svg+xml">`,
      `<meta property="og:image:width" content="1200">`,
      `<meta property="og:image:height" content="630">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:image" content="${esc(image)}">`,
    );
  } else tags.push(`<meta name="twitter:card" content="summary">`);
  if (keywords.length)
    tags.push(`<meta name="keywords" content="${esc(keywords.join(", "))}">`);
  if (date) tags.push(`<meta property="article:published_time" content="${esc(date)}">`);
  return tags.join("\n    ");
}
