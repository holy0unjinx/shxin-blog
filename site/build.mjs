import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { existsSync, rmSync } from "node:fs";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

import { minifyCss, stripJsComments } from "./minify.mjs";
import { bake } from "./bake.mjs";
import { errorCount, lint, report } from "./lint.mjs";
import { writePage } from "./editor.mjs";
import { postFrom } from "./post.mjs";
import { createSources } from "./sources.mjs";
import { ogCard, ogPath } from "./og.mjs";
import {
  convertible,
  loadSharp,
  toWebp,
  webpName,
  withPictureSources,
} from "./webp.mjs";

import {
  esc,
  frontmatter,
  renderDocument,
  searchText,
  slugify,
} from "../render/index.mjs";
import { robots, rss, sitemap } from "./feeds.mjs";
import {
  categoryPage,
  keywordPage,
  head,
  homePage,
  notFoundPage,
  pageAssets,
  PAGE_SIZE,
  pageCount,
  pagePath,
  postPage,
  seriesPage,
  shell,
  yearOf,
  yearPage,
} from "./pages.mjs";

const root = process.cwd();
// POSTS_DIR lets the test suite build a fixture set instead of whatever is
// sitting in posts/ at the time.
const postsDir = resolve(root, process.env.POSTS_DIR || "posts");
// OUT_DIR lets the test suite build into a scratch directory instead of
// racing against a server that is serving dist/.
const output = resolve(root, process.env.OUT_DIR || "dist");
const siteUrl = (process.env.SITE_URL || "https://shxin.blog").replace(
  /\/+$/,
  "",
);
const year = new Date().getFullYear();
const shellHtml = await readFile(join(root, "index.html"), "utf8");

// 글이 가리킨 파일을 읽는 사람. render/는 파일시스템을 모르고 이 셋만 안다.
// 미리보기 서버도 같은 것을 쓴다 — site/sources.mjs.
const { readText, measureImage, readBib, fileExists: assetExists } =
  createSources(root);

// A deploy rewrites style.css and app.js where they stand, and a browser has
// no way to tell the new file from the one it cached — which is why a reader
// used to need a hard reload. Naming each file after its own contents gives a
// change a new URL, and leaves the URL that did not change safe to keep.
function fingerprint(source) {
  return createHash("sha256").update(source).digest("hex").slice(0, 8);
}

function page({
  path,
  title,
  description,
  content,
  type,
  date,
  keywords,
  current,
  image = "",
  lang = "ko",
  assets: outside = {},
}) {
  return template
    .replace("<!--%LANG%-->", esc(lang))
    .replace("<!--%TITLE%-->", title)
    .replace(
      "<!--%HEAD%-->",
      head({
        title,
        description,
        url: `${siteUrl}${path}`,
        type,
        date,
        keywords,
        image: image ? `${siteUrl}${image}` : "",
      }),
    )
    .replace("<!--%ASSETS%-->", pageAssets(outside))
    .replace("<!--%APP%-->", shell(content, year, current));
}

async function write(path, html) {
  const dir = join(output, path.replace(/^\/+|\/+$/g, ""));
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.html"), html);
}

// 한 dist/를 두 빌드가 나눠 쓰면 한쪽이 훑어 둔 파일을 다른 쪽이 지운다.
// dev 서버가 파일 변경마다 빌드를 다시 부르는데 그 사이에 빌드를 한 번 더
// 부르면 그렇게 된다. 자물쇠 하나로 차례를 세운다 — mkdir은 이미 있으면
// 실패하므로 그 자체가 배타적인 신호다.
const lockPath = `${output}.lock`;
let holdsLock = false;
const dropLock = () => {
  if (!holdsLock) return;
  holdsLock = false;
  try {
    rmSync(lockPath, { recursive: true, force: true });
  } catch {
    // 이미 없으면 그만이다.
  }
};
process.on("exit", dropLock);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    dropLock();
    process.exit(130);
  });

for (let attempt = 0; ; attempt++) {
  try {
    await mkdir(lockPath);
    holdsLock = true;
    break;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    // 죽은 빌드가 남긴 자물쇠는 오래되면 뺏는다. 그러지 않으면 한 번의
    // 사고가 이후의 모든 빌드를 막는다.
    const age = Date.now() - (await stat(lockPath).catch(() => ({ mtimeMs: 0 }))).mtimeMs;
    if (age > 120_000) {
      await rm(lockPath, { recursive: true, force: true });
      continue;
    }
    if (attempt > 900) throw new Error(`빌드 자물쇠를 얻지 못했다 — ${lockPath}`);
    await new Promise((wake) => setTimeout(wake, 200));
  }
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

// 이름이 내용을 따라 바뀌는 것들. 글꼴이 먼저인 이유는 그 이름을 지고
// 있는 것이 style.css이고, style.css의 이름을 지고 있는 것이 index.html
// 이어서다. 순서가 뒤집히면 지문이 옛 주소를 가리킨 채 굳는다.
const assets = new Map();

const fontDir = join(root, "fonts");
if (existsSync(fontDir)) {
  await mkdir(join(output, "fonts"), { recursive: true });
  for (const file of await readdir(fontDir)) {
    const source = await readFile(join(fontDir, file));
    const dot = file.lastIndexOf(".");
    const name = `${file.slice(0, dot)}.${fingerprint(source)}${file.slice(dot)}`;
    await writeFile(join(output, "fonts", name), source);
    // style.css는 "fonts/…", index.html은 "/fonts/…"로 적는데, 앞의 것이
    // 뒤의 것에 들어 있으므로 한 번의 교체로 둘 다 걸린다.
    assets.set(`fonts/${file}`, `fonts/${name}`);
  }
}

for (const asset of ["app.js", "style.css"]) {
  const original = await readFile(join(root, asset), "utf8");
  // 배포본에서만 깎는다. 주석은 원본에 그대로 남는다.
  const trimmed = asset.endsWith(".css")
    ? minifyCss(original)
    : stripJsComments(original);
  // 깎은 것이 문법을 깨뜨렸으면 원본을 내보낸다. 빠른 페이지보다 도는
  // 페이지가 먼저다.
  let source = trimmed;
  if (asset.endsWith(".js"))
    try {
      new Function(trimmed);
    } catch {
      console.warn(`${asset}: 주석 제거가 문법을 깨뜨려 원본을 내보낸다`);
      source = original;
    }
  source = [...assets].reduce(
    (text, [from, to]) => text.replaceAll(from, to),
    source,
  );
  const dot = asset.lastIndexOf(".");
  const name = `${asset.slice(0, dot)}.${fingerprint(source)}${asset.slice(dot)}`;
  await writeFile(join(output, name), source);
  assets.set(`/${asset}`, `/${name}`);
}
// The template is the only place these are named, so rewriting it here is
// the whole of the cache busting.
const template = [...assets].reduce(
  (html, [from, to]) => html.replaceAll(from, to),
  shellHtml,
);
// KaTeX의 스타일시트와 글꼴. 수식은 빌드에서 이미 구워져 나가므로
// katex.min.js(수백 KB)는 필요하지 않지만, 글자 모양은 이 글꼴들이 진다.
// CDN에서 받아 오는 대신 dist/로 복사해 지문을 붙인다 — 바깥 요청이 한 건도
// 남지 않고, 1년 immutable로 캐시할 수 있다.
//
// woff2만 남긴다. 이 글꼴을 못 받는 브라우저는 수식을 그릴 만큼 새롭지 않고,
// 세 벌을 다 두면 배포본이 세 배가 된다. 수식이 있는 글이 하나도 없으면
// 아무것도 내보내지 않는다.
async function copyKatex() {
  const katexDir = join(root, "node_modules", "katex", "dist");
  if (!existsSync(join(katexDir, "katex.min.css"))) return "";
  const fontMap = new Map();
  const katexFonts = join(katexDir, "fonts");
  if (existsSync(katexFonts)) {
    await mkdir(join(output, "katex"), { recursive: true });
    for (const file of await readdir(katexFonts)) {
      if (!file.endsWith(".woff2")) continue;
      const source = await readFile(join(katexFonts, file));
      const dot = file.lastIndexOf(".");
      const name = `${file.slice(0, dot)}.${fingerprint(source)}${file.slice(dot)}`;
      await writeFile(join(output, "katex", name), source);
      fontMap.set(file, name);
    }
  }
  const original = await readFile(join(katexDir, "katex.min.css"), "utf8");
  const trimmed = minifyCss(original)
    // woff와 ttf를 지운다. src 목록의 첫 항목만 남으므로 뒤따르는 쉼표까지
    // 함께 걷어야 문법이 깨지지 않는다.
    .replace(/,\s*url\(fonts\/[^)]+\.(?:woff|ttf)\)\s*format\("[^"]*"\)/g, "")
    .replace(/url\(fonts\/([^)]+\.woff2)\)/g, (whole, file) =>
      fontMap.has(file) ? `url(/katex/${fontMap.get(file)})` : whole,
    );
  const name = `katex.${fingerprint(trimmed)}.css`;
  await writeFile(join(output, name), trimmed);
  return `/${name}`;
}

if (existsSync(join(root, "assets")))
  await cp(join(root, "assets"), join(output, "assets"), { recursive: true });

// 사진마다 webp 쌍둥이를 굽는다 — sharp가 이 기계에 있을 때만. 없으면 이
// 단계는 아무 일도 하지 않고, 페이지는 글쓴이가 넣은 그림을 그대로 가리킨다.
// 원본은 남아 <picture>의 물러설 자리가 되므로, 두 기계가 내는 페이지는
// <source> 한 줄만 다르다.
const twins = new Set();
let twinsSaved = 0;
if (existsSync(join(output, "assets"))) {
  const sharp = await loadSharp();
  if (sharp)
    for await (const file of walk(join(output, "assets"))) {
      if (!convertible(file)) continue;
      const source = await readFile(file);
      const baked = await toWebp(source, sharp);
      if (!baked) continue;
      await writeFile(webpName(file), baked);
      twins.add(`/${relative(output, file).split(sep).join("/")}`);
      twinsSaved += source.length - baked.length;
    }
}
// The icon keeps its name at the site root, where a browser looks for it even
// when nothing points at it, so it is copied rather than fingerprinted.
if (existsSync(join(root, "favicon.svg")))
  await cp(join(root, "favicon.svg"), join(output, "favicon.svg"));

// 미리보기에서만 서는 것들. 나가는 빌드에는 초안도 편집기도 끼지 않는다.
const DEV = process.env.DEV === "1";

// 미리보기에서는 초안도 함께 굽는다. 초안은 조판을 눈으로 보려고 쓰는
// 것이라 실제 페이지 위에 서 봐야 하고, 그러자고 서버를 두 벌 띄우는 것은
// 번거롭다. DEV=1일 때만이므로 나가는 빌드에는 끼지 않는다.
const draftDir = resolve(root, process.env.DRAFT_DIR || "draft");
const sources = [{ dir: postsDir, draft: false }];
if (DEV && draftDir !== postsDir && existsSync(draftDir))
  sources.push({ dir: draftDir, draft: true });

const files = [];
for (const { dir, draft } of sources)
  for (const file of (await readdir(dir)).filter((name) => name.endsWith(".md")))
    files.push({ dir, file, draft });

const posts = [];
for (const { dir, file, draft } of files) {
  const source = await readFile(join(dir, file), "utf8");
  const { data, body } = frontmatter(source);
  posts.push(postFrom({ data, body, slug: basename(file, ".md"), draft }));
}
posts.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

// Bodies are rendered once and shared by the page and the feed.
const rendered = new Map();
// 이전·다음 글은 시리즈를 먼저, 그다음 분류를 찾는다. 한 주제를 따라 읽는
// 독자에게는 바로 옆 날짜의 글보다 같은 줄기의 다음 글이 이어 읽을 글이고,
// 여러 편으로 나눈 글에서는 그 줄기가 시리즈다. 어느 쪽도 없으면 바로 옆
// 글로 물러난다.
function link(post, here) {
  if (!post) return null;
  return {
    slug: post.slug,
    title: post.title,
    // 줄기를 벗어나 물러난 경우에만 어디로 가는지 알려 준다. 같은 줄기
    // 안에서 이어지는 것은 독자가 이미 아는 사실이다.
    category:
      post.categorySlug === here.categorySlug &&
      post.seriesSlug === here.seriesSlug
        ? ""
        : post.category,
  };
}

// 시리즈는 편 번호 순으로 읽는다. 목록은 최신순이므로 그 안에서 이웃을
// 찾으면 순서가 뒤집힌다.
const seriesOrder = new Map();
for (const post of posts) {
  if (!post.series) continue;
  if (!seriesOrder.has(post.seriesSlug)) seriesOrder.set(post.seriesSlug, []);
  seriesOrder.get(post.seriesSlug).push(post);
}
for (const list of seriesOrder.values())
  list.sort(
    (a, b) =>
      (a.part || Infinity) - (b.part || Infinity) ||
      new Date(a.date || 0) - new Date(b.date || 0),
  );

// 목록은 최신순이므로 step이 +1이면 더 오래된 쪽, -1이면 더 새로운 쪽이다.
function sibling(index, step) {
  const here = posts[index];
  const series = seriesOrder.get(here.seriesSlug);
  if (series) {
    // 시리즈 안에서는 +1이 다음 편이다. 날짜 목록의 방향과 반대이므로
    // 뒤집어 읽는다.
    const at = series.indexOf(here);
    const next = series[at - step];
    if (next) return link(next, here);
  }
  // 시리즈를 다 읽은 사람에게 같은 시리즈의 다른 편을 다시 권하지 않는다.
  // 날짜순으로는 1편이 마지막 편보다 새로울 수 있어, 걸러 두지 않으면
  // 마지막 편의 "다음 글"이 1편으로 돌아간다. 그 편들은 시리즈 목차에서
  // 이미 닿는다.
  const outside = posts.filter(
    (post) =>
      post === here || !here.series || post.seriesSlug !== here.seriesSlug,
  );
  const at = outside.indexOf(here);
  for (let i = at + step; i >= 0 && i < outside.length; i += step)
    if (outside[i].categorySlug === here.categorySlug)
      return link(outside[i], here);
  return link(outside[at + step], here);
}

// 이어 읽을 글. 키워드가 겹치는 것이 가장 무겁고, 같은 시리즈가 그다음,
// 같은 분류가 마지막이다 — 분류는 넓게 걸리므로 그것만으로는 "관련"이라고
// 부를 만한 것이 못 된다. 점수가 0이면 아무것도 내지 않는다.
function related(here, limit = 3) {
  const keywords = new Set(here.keywords.map((word) => word.toLowerCase()));
  return posts
    .filter((post) => post.slug !== here.slug)
    .map((post) => {
      const shared = post.keywords.filter((word) =>
        keywords.has(word.toLowerCase()),
      ).length;
      const score =
        shared * 3 +
        (here.seriesSlug && post.seriesSlug === here.seriesSlug ? 2 : 0) +
        (post.categorySlug === here.categorySlug ? 1 : 0);
      return { post, score };
    })
    .filter(({ score }) => score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || new Date(b.post.date || 0) - new Date(a.post.date || 0),
    )
    .slice(0, limit)
    .map(({ post }) => ({
      slug: post.slug,
      title: post.title,
      category: post.category,
    }));
}

// 먼저 전부 렌더하고 굽는다. 수식이 있는 글이 하나라도 있어야 KaTeX
// 스타일시트를 내보낼지가 정해지고, 그 지문 붙은 이름을 페이지가 알아야
// 하므로 쓰기는 그다음이다.
const articles = [];
for (const post of posts) {
  const document = renderDocument(post.body, {
    resolve: readText,
    measure: measureImage,
    bib: readBib(post.bib),
  });
  // 수식과 강조는 여기서 구워진다. 읽는 쪽에서 다시 그릴 것이 없으므로
  // JavaScript가 꺼져 있어도 수식이 보이고, 바깥 꾸러미를 받을 일이 없다.
  const baked = await bake(document.html);
  for (const failure of baked.failed)
    console.warn(`${post.slug}: 수식을 읽지 못했다 — ${failure.reason}`);
  if (baked.unknown.length)
    console.warn(
      `${post.slug}: 모르는 언어라 강조하지 않았다 — ${baked.unknown.join(", ")}`,
    );
  // 피드는 원본 그림 한 장만 가리킨다. RSS는 상대 주소를 절대 주소로
  // 고쳐 내보내는데 그 손이 <source srcset>까지 닿지 않으므로, <picture>는
  // 우리가 조판하는 페이지에만 넣는다.
  rendered.set(post.slug, baked.html);
  const html = withPictureSources(baked.html, twins);
  articles.push({ post, document: { ...document, html }, baked });
}

// 수식이 있는 글이 하나도 없으면 KaTeX는 나가지 않는다. 다만 미리보기에는
// 편집기가 서 있고 거기서는 언제든 수식을 칠 수 있으므로, DEV에서는 늘
// 내보낸다.
const katexStyle =
  DEV || articles.some(({ baked }) => baked.math) ? await copyKatex() : "";

for (const [index, { post, document, baked }] of articles.entries()) {
  await write(`/${post.slug}/`, page({
    path: `/${encodeURIComponent(post.slug)}/`,
    title: post.title,
    description: post.description,
    content: postPage(post, document, {
      prev: sibling(index, 1),
      next: sibling(index, -1),
      series: post.series
        ? {
            total: seriesOrder.get(post.seriesSlug).length,
            index: seriesOrder.get(post.seriesSlug).indexOf(post) + 1,
          }
        : null,
      related: related(post),
    }),
    type: "article",
    date: post.date,
    keywords: post.keywords,
    lang: post.lang,
    image: ogPath(post.slug),
    assets: { math: baked.math, katexStyle },
  }));
  // 공유 카드. 글마다 하나씩, 빌드가 그린다.
  await mkdir(join(output, "og"), { recursive: true });
  await writeFile(join(output, "og", `${post.slug}.svg`), ogCard(post));
}

// 키워드는 앞머리에 여러 개가 오고 여러 글이 나눠 쓴다. 분류가 글 하나에
// 하나뿐인 것과 다른 점이고, 쌓이면 분류보다 이쪽이 실제 진입로가 된다.
const keywords = new Map();
for (const post of posts)
  for (const word of post.keywords) {
    const slug = slugify(word);
    if (!slug) continue;
    if (!keywords.has(slug)) keywords.set(slug, { name: word, posts: [] });
    keywords.get(slug).posts.push(post);
  }
for (const [keywordSlug, { name, posts: list }] of keywords)
  await write(`/keyword/${keywordSlug}/`, page({
    path: `/keyword/${encodeURIComponent(keywordSlug)}/`,
    title: name,
    description: `"${name}"을 다룬 글 ${list.length}개.`,
    content: keywordPage(name, list),
  }));

const categories = new Map(posts.map((post) => [post.categorySlug, post.category]));
for (const [categorySlug, name] of categories) {
  const list = posts.filter((post) => post.categorySlug === categorySlug);
  await write(`/category/${categorySlug}/`, page({
    path: `/category/${encodeURIComponent(categorySlug)}/`,
    title: name,
    description: `${name} 카테고리의 글 ${list.length}개.`,
    content: categoryPage(name, list, categorySlug),
  }));
}

// 시리즈 목차. 편이 하나뿐인 시리즈에도 페이지를 낸다 — 이어질 글을
// 예고하며 쓰기 시작하는 것이 보통이고, 두 번째 편이 나오는 날 주소가
// 생기는 것은 늦다.
for (const [seriesSlug, list] of seriesOrder)
  await write(`/series/${seriesSlug}/`, page({
    path: `/series/${encodeURIComponent(seriesSlug)}/`,
    title: list[0].series,
    description: `${list[0].series} 시리즈의 글 ${list.length}편.`,
    content: seriesPage(list[0].series, list),
  }));

// 연도별 목록. 글 slug가 네 자리 수와 같으면 그 주소는 이미 글의 것이므로
// 그 해는 홈의 Years 칩에서 빠진 채 글 목록 안에만 남는다.
const taken = new Set(posts.map((post) => post.slug));
const years = [...new Set(posts.map(yearOf).filter(Boolean))]
  .filter((year) => !taken.has(year))
  .sort()
  .reverse();
for (const year of years)
  await write(`/${year}/`, page({
    path: `/${year}/`,
    title: year,
    description: `${year}년에 쓴 글 ${posts.filter((post) => yearOf(post) === year).length}개.`,
    content: yearPage(year, posts.filter((post) => yearOf(post) === year)),
  }));

// 홈과 그 뒷쪽. 글이 한 쪽에 다 들어가면 뒷쪽은 아예 나지 않으므로, 글이
// 적은 동안 홈은 그 자체로 전체 목록이다.
const pages = pageCount(posts);
for (let number = 1; number <= pages; number += 1)
  await write(pagePath(number), page({
    path: pagePath(number),
    title: number === 1 ? "shxin.blog" : `shxin.blog — ${number}쪽`,
    description:
      number === 1
        ? "the blog of shxin"
        : `전체 글 ${posts.length}개 가운데 ${number}쪽.`,
    content: homePage(posts, number),
    current: "home",
  }));

await writeFile(
  join(output, "404.html"),
  page({
    path: "/404.html",
    title: "Page not found",
    description: "Page not found",
    content: notFoundPage(),
  }),
);

const newest = (list) =>
  list.map((post) => post.date).filter(Boolean).sort().at(-1);

await writeFile(
  join(output, "rss.xml"),
  rss({
    posts,
    rendered,
    siteUrl,
    title: "shxin.blog",
    description: "the blog of shxin",
    buildDate: new Date().toUTCString(),
  }),
);

await writeFile(
  join(output, "sitemap.xml"),
  sitemap({
    siteUrl,
    entries: [
      { path: "/", lastmod: newest(posts) },
      ...posts.map((post) => ({
        path: `/${encodeURIComponent(post.slug)}/`,
        lastmod: post.updated || post.date,
      })),
      ...[...keywords].map(([keywordSlug, { posts: list }]) => ({
        path: `/keyword/${encodeURIComponent(keywordSlug)}/`,
        lastmod: newest(list),
      })),
      ...[...categories.keys()].map((categorySlug) => ({
        path: `/category/${encodeURIComponent(categorySlug)}/`,
        lastmod: newest(
          posts.filter((post) => post.categorySlug === categorySlug),
        ),
      })),
      ...[...seriesOrder].map(([seriesSlug, list]) => ({
        path: `/series/${encodeURIComponent(seriesSlug)}/`,
        lastmod: newest(list),
      })),
      ...years.map((year) => ({
        path: `/${year}/`,
        lastmod: newest(posts.filter((post) => yearOf(post) === year)),
      })),
      // 홈은 위에 이미 있으므로 둘째 쪽부터다.
      ...Array.from({ length: pages - 1 }, (unused, index) => ({
        path: pagePath(index + 2),
        lastmod: newest(posts.slice((index + 1) * PAGE_SIZE)),
      })),
    ],
  }),
);

await writeFile(join(output, "robots.txt"), robots(siteUrl));

// ── 콘텐츠 lint ───────────────────────────────────────────────────────────
// 글이 늘고 분야가 갈리면 손으로 못 잡는 것들. 빌드를 멈추지는 않는다 —
// 글을 쓰는 중에 막혀서는 안 되고, 잡는 것은 CI의 몫이다. LINT_EXIT=1이면
// 오류가 있을 때 종료 코드로 알린다(`npm run lint`).
const routes = new Set([
  "/",
  ...Array.from({ length: pages - 1 }, (unused, index) => pagePath(index + 2)),
  "/404.html",
  "/rss.xml",
  "/sitemap.xml",
  "/robots.txt",
  "/posts.json",
  "/search.json",
  ...posts.map((post) => `/${post.slug}/`),
  ...posts.map((post) => `/${encodeURIComponent(post.slug)}/`),
  ...posts.map((post) => ogPath(post.slug)),
  ...[...keywords.keys()].flatMap((slug) => [
    `/keyword/${slug}/`,
    `/keyword/${encodeURIComponent(slug)}/`,
  ]),
  ...[...categories.keys()].flatMap((slug) => [
    `/category/${slug}/`,
    `/category/${encodeURIComponent(slug)}/`,
  ]),
  ...[...seriesOrder.keys()].flatMap((slug) => [
    `/series/${slug}/`,
    `/series/${encodeURIComponent(slug)}/`,
  ]),
  ...years.map((year) => `/${year}/`),
]);

// dev 전용 편집기. 나가는 빌드에는 페이지도, 그 스타일도, 그 코드도 없다.
// sitemap·rss·posts.json 어디에도 넣지 않는다 — 읽을 글이 아니다.
if (DEV) {
  for (const asset of ["editor.css", "editor.js"]) {
    const source = await readFile(join(root, asset), "utf8");
    // 지문을 붙이지 않는다. dev 서버는 무엇이든 no-cache로 내보내므로
    // 이름이 바뀔 이유가 없고, 이름이 고정이라야 편집기 페이지가 그것을
    // 그냥 가리킬 수 있다.
    await writeFile(join(output, asset), source);
  }
  await write("/write/", page({
    path: "/write/",
    title: "쓰기",
    description: "dev 전용 편집기",
    content: writePage(),
    assets: {
      math: true,
      katexStyle,
      styles: ["/editor.css"],
      scripts: ["/editor.js"],
    },
  }));
}

// 페이지가 아닌 것들(그림 등)은 파일이 있는지로 답한다.
const findings = lint({ articles, routes, fileExists: assetExists });
if (findings.length) {
  console.log(`\nlint: ${findings.length}건`);
  console.log(report(findings));
}

// Metadata only: the article bodies are already baked into each page, so the
// index stays small no matter how many posts exist.
await writeFile(
  join(output, "posts.json"),
  JSON.stringify(posts.map(({ body, ...meta }) => meta)),
);

// 본문까지 찾으려면 본문이 있어야 한다. 목록과 한 파일에 두면 검색을 쓰지
// 않는 사람도 글 전체를 받게 되므로 따로 둔다. 검색창을 처음 열 때만
// 받아 가고, 그 한 번도 빌드가 미리 압축해 둔 파일로 나간다.
await writeFile(
  join(output, "search.json"),
  JSON.stringify(
    posts.map((post) => ({ slug: post.slug, text: searchText(post.body) })),
  ),
);

// 글로 된 파일마다 압축본을 나란히 둔다. 서버는 요청이 올 때마다 다시
// 압축하는 대신 이 파일을 그대로 흘려보낸다. 요청당 CPU가 사라지고, 그
// 대가를 한 번만 치르므로 여기서는 가장 센 단계를 쓸 수 있다. woff2와
// SVG 중 woff2는 이미 압축되어 있어 넣어도 커지기만 한다.
const PRECOMPRESS = new Set([".css", ".html", ".js", ".json", ".txt", ".xml", ".svg"]);

// 두 벌을 만든다. brotli를 못 받는 상대가 아직 있으므로 gzip은 남는다.
// 여기서 드는 값은 빌드 한 번뿐이라 양쪽 다 가장 센 단계로 짠다.
const CODECS = [
  { extension: ".br", pack: (source) => brotliCompressSync(source, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
      [constants.BROTLI_PARAM_SIZE_HINT]: source.length,
    },
  }) },
  { extension: ".gz", pack: (source) => gzipSync(source, { level: 9 }) },
];

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

// 훑는 것과 읽는 것 사이에 파일이 사라질 수 있다 — 같은 dist/를 두 빌드가
// 나눠 쓰는 때가 그렇다(dev 서버가 돌고 있는데 빌드를 한 번 더 부르는 경우).
// 압축본과 크기표는 둘 다 있으면 좋은 것이지 빌드가 걸릴 일이 아니므로,
// 없어진 파일은 없는 것으로 세고 지나간다.
async function readIfPresent(file) {
  try {
    return await readFile(file);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

let compressed = 0;
let saved = 0;
for await (const file of walk(output)) {
  if (!PRECOMPRESS.has(extname(file).toLowerCase())) continue;
  const source = await readIfPresent(file);
  if (!source) continue;
  let best = 0;
  for (const codec of CODECS) {
    const packed = codec.pack(source);
    // 압축이 이득이 없는 작은 파일은 두지 않는다. 서버는 없으면 그대로
    // 내보내므로 빠진 파일이 문제가 되지 않는다.
    if (packed.length >= source.length) continue;
    await writeFile(`${file}${codec.extension}`, packed);
    compressed += 1;
    // 한 요청은 한 벌만 받아 가므로, 아낀 양은 제일 작은 쪽으로 센다.
    best = best ? Math.min(best, packed.length) : packed.length;
  }
  if (best) saved += source.length - best;
}

const sizes = new Map();
for await (const file of walk(output)) {
  if (file.endsWith(".gz") || file.endsWith(".br")) continue;
  const path = relative(output, file).split(sep).join("/");
  const bytes = await readIfPresent(file);
  if (bytes) sizes.set(path, bytes.length);
}
const total = [...sizes.values()].reduce((sum, size) => sum + size, 0);

console.log(
  `Built ${posts.length} post(s), ${categories.size} category page(s), ` +
    `${keywords.size} keyword page(s), ` +
    `${seriesOrder.size} series page(s), ${years.length} year page(s), ` +
    `rss.xml and sitemap.xml in ${process.env.OUT_DIR || "dist"}/`,
);
console.log(
  `  ${sizes.size} file(s), ${(total / 1024).toFixed(0)} KiB; ${compressed} pre-compressed, ${(saved / 1024).toFixed(0)} KiB saved on the wire`,
);
if (twins.size)
  console.log(
    `  ${twins.size} webp twin(s), ${(twinsSaved / 1024).toFixed(0)} KiB smaller than the photographs they stand in for`,
  );

dropLock();

if (process.env.LINT_EXIT === "1" && errorCount(findings))
  process.exitCode = 1;
