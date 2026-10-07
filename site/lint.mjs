// Content checks that stop being possible to do by eye.
//
// One post, one field of interest, one pair of eyes: fine. Two hundred posts
// across a dozen fields, each carrying figures, cross references, citations
// and links into the others: not fine. These are the things that go wrong
// quietly — a reference to a label that was renamed, a figure whose file
// moved, a link to a post whose slug changed — and each of them leaves a
// trace the build can see.
//
// Nothing here reads a file or renders anything. It reads what the renderer
// already worked out and reports what does not add up.

// An id a page defines, and a link a page follows.
export function collectIds(html) {
  return new Set(
    [...String(html).matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]),
  );
}

export function collectLinks(html) {
  return [...String(html).matchAll(/\bhref="([^"]+)"/g)].map((match) => match[1]);
}

export function collectImages(html) {
  return [...String(html).matchAll(/<img\b[^>]*>/g)].map((match) => ({
    tag: match[0],
    src: match[0].match(/\bsrc="([^"]*)"/)?.[1] ?? "",
    alt: match[0].match(/\balt="([^"]*)"/)?.[1],
  }));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// A reference-style link whose name was never defined stays on the page in
// the shape it was written in. That is the point — a typo has to be visible —
// but nobody rereads their own paragraphs looking for square brackets.
const UNDEFINED_REF = /\[[^\]\n]+\]\[[^\]\n]*\]/g;

/**
 * One article.
 *
 * `article` is `{ post, document, html }` as the build has them: `document`
 * is what renderDocument returned, `html` the finished body.
 */
export function lintArticle(article, { routes = null, fileExists = null } = {}) {
  const { post, document } = article;
  // 본문은 따로 건네받거나 문서 안에 있다. 굽고 난 html을 문서에 도로 넣어
  // 건네는 자리가 있어, 둘 다 받지 않으면 html을 읽는 검사가 통째로 조용히
  // 쉬게 된다.
  const html = article.html ?? document?.html ?? "";
  const found = [];
  const at = (level, message) => found.push({ level, slug: post.slug, message });

  if (!post.title || post.title === post.slug)
    at("error", "제목(title)이 없다");
  if (!post.date) at("error", "날짜(date)가 없다");
  else if (!ISO_DATE.test(post.date))
    at("error", `날짜가 YYYY-MM-DD 꼴이 아니다 — "${post.date}"`);
  if (post.updated && !ISO_DATE.test(post.updated))
    at("error", `고친 날이 YYYY-MM-DD 꼴이 아니다 — "${post.updated}"`);
  else if (post.updated && post.date && post.updated < post.date)
    at("warn", `고친 날이 쓴 날보다 앞선다 — ${post.updated} < ${post.date}`);
  if (post.hasDescription === false)
    at("warn", "한 줄 요약(description)이 없어 본문 앞부분을 썼다");

  for (const { kind, label } of document.numbering?.missing() ?? [])
    at("error", `부른 이름표가 없다 — [@${kind}:${label}]`);
  for (const { kind, label } of document.numbering?.duplicates() ?? [])
    at("error", `이름표가 두 번 쓰였다 — {#${kind}:${label}}`);
  for (const key of document.bibliography?.unknown() ?? [])
    at("error", `참고문헌에 없는 key다 — [@${key}]`);
  for (const label of document.unusedSidenotes ?? [])
    at("warn", `부르지 않은 사이드노트라 나가지 않았다 — [^^${label}]`);
  for (const path of document.missingFiles ?? [])
    at("error", `읽을 수 없는 파일을 가리킨다 — ${path}`);
  for (const kind of document.unreadable ?? [])
    at("warn", `${kind} 펜스를 읽지 못해 코드 블록으로 나갔다`);

  for (const match of String(html).match(UNDEFINED_REF) ?? [])
    at("warn", `정의되지 않은 참조식 링크로 보인다 — ${match}`);

  for (const image of collectImages(html)) {
    if (image.alt === undefined || image.alt === "")
      at("warn", `대체 텍스트(alt)가 없는 그림 — ${image.src || "(주소 없음)"}`);
    // 바깥 주소는 우리가 확인할 것이 없다.
    if (fileExists && image.src.startsWith("/") && !fileExists(image.src))
      at("error", `없는 그림 파일 — ${image.src}`);
  }

  // 문서 안 앵커. 우리가 낸 마크업의 id를 그대로 읽는다.
  const ids = collectIds(html);
  for (const href of collectLinks(html)) {
    if (href.startsWith("#")) {
      const fragment = decodeURIComponent(href.slice(1));
      if (fragment && !ids.has(fragment) && !ids.has(href.slice(1)))
        at("error", `이 글에 없는 앵커를 가리킨다 — ${href}`);
      continue;
    }
    if (!routes || !href.startsWith("/")) continue;
    const [path] = href.split("#");
    const decoded = decodeURIComponent(path);
    if (!routes.has(path) && !routes.has(decoded))
      at("error", `없는 주소를 가리킨다 — ${path}`);
  }

  return found;
}

/**
 * The whole site: every article, plus the checks that need more than one.
 *
 * `routes` is every address the build produced, and `fileExists` answers for
 * anything under the site root that is not a page. Both are optional, so a
 * caller that only has the articles still gets every other check.
 */
export function lint({ articles = [], routes = null, fileExists = null } = {}) {
  const found = [];
  const slugs = new Map();
  for (const { post } of articles) {
    const seen = slugs.get(post.slug) || 0;
    slugs.set(post.slug, seen + 1);
    if (seen)
      found.push({
        level: "error",
        slug: post.slug,
        message: "두 글이 같은 주소를 쓴다 — 뒤엣것이 앞엣것을 덮는다",
      });
  }
  for (const article of articles)
    found.push(...lintArticle(article, { routes, fileExists }));
  return found;
}

// A report a person reads, grouped by post, errors before warnings.
export function report(found) {
  if (!found.length) return "";
  const bySlug = new Map();
  for (const item of found) {
    if (!bySlug.has(item.slug)) bySlug.set(item.slug, []);
    bySlug.get(item.slug).push(item);
  }
  const lines = [];
  for (const [slug, items] of bySlug) {
    lines.push(`  ${slug}`);
    for (const item of items.sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1)))
      lines.push(`    ${item.level === "error" ? "오류" : "경고"}  ${item.message}`);
  }
  return lines.join("\n");
}

export const errorCount = (found) =>
  found.filter((item) => item.level === "error").length;
