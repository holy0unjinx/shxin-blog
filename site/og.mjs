// The card a link to this blog shows when it is shared.
//
// It is drawn as SVG, in the same typography as the page it points at: the
// wordmark, the category and date on the label line, the title set large, and
// the keywords along the bottom. Nothing is fetched and nothing is rasterised
// — the whole card is markup this build writes.
//
// The limit is worth stating plainly: some crawlers do not render SVG, and
// those show no image rather than this one. Rasterising would mean a native
// image library and a font stack inside the deploy image, which is a larger
// price than this blog is willing to pay for a preview. A crawler that does
// render SVG, and a reader who opens the file, both get the real card.

import { lineHeight, textWidth } from "../render/chart/text.mjs";
import { esc } from "../render/escape.mjs";
import { dateText } from "../render/index.mjs";

// The size every social preview is cut to.
const WIDTH = 1200;
const HEIGHT = 630;
const MARGIN = 84;
const TITLE = 68;
const LABEL = 24;

const n = (value) => String(Math.round(value * 100) / 100);

// The title is wrapped by measure, and cut off with an ellipsis rather than
// shrunk: a card whose type size depends on the length of the title makes two
// cards from the same blog look like two different blogs.
export function wrapTitle(title, { width = WIDTH - MARGIN * 2, size = TITLE, lines: limit = 4 } = {}) {
  const words = String(title).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && textWidth(candidate, size) > width) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  if (lines.length <= limit) return lines;
  const kept = lines.slice(0, limit);
  kept[limit - 1] = `${kept[limit - 1].replace(/\s+\S*$/, "")}…`;
  return kept;
}

/**
 * One card.
 *
 * The colours are the light theme's ink and paper written out, not the CSS
 * tokens: this file is fetched by a crawler with no stylesheet, and a card
 * that inherits nothing has to carry its own two values.
 */
export function ogCard(post, { siteName = "shxin.blog" } = {}) {
  const title = wrapTitle(post.title || post.slug || "");
  const step = lineHeight(TITLE);
  const label = [post.category, dateText(post.date)].filter(Boolean).join("  ·  ");
  const keywords = (post.keywords || []).slice(0, 5).join("  ·  ");
  const series = post.series ? `${post.series}` : "";

  // The title block is bottom-aligned on a fixed baseline, so a one-line
  // title and a four-line title share the same last line and the cards stack
  // consistently in a feed.
  const lastBaseline = HEIGHT - MARGIN - (keywords ? LABEL * 2.2 : 0);
  const firstBaseline = lastBaseline - (title.length - 1) * step;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" ` +
    `viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${esc(post.title || "")}">` +
    `<title>${esc(post.title || siteName)}</title>` +
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="#fff"/>` +
    // 위아래 두 줄. 종이 위의 논문이라는 조판을 카드에서도 지킨다.
    `<rect x="${MARGIN}" y="${MARGIN - 34}" width="${WIDTH - MARGIN * 2}" height="2" fill="#000"/>` +
    `<g font-family="CMU Serif, Times New Roman, Times, serif" fill="#000">` +
    `<text x="${MARGIN}" y="${MARGIN}" font-size="${LABEL}" letter-spacing="1">${esc(siteName)}</text>` +
    (label
      ? `<text x="${WIDTH - MARGIN}" y="${MARGIN}" font-size="${LABEL}" text-anchor="end" fill="#555">${esc(label)}</text>`
      : "") +
    (series
      ? `<text x="${MARGIN}" y="${n(firstBaseline - step * 0.9)}" font-size="${LABEL + 4}" fill="#555">${esc(series)}</text>`
      : "") +
    title
      .map(
        (line, index) =>
          `<text x="${MARGIN}" y="${n(firstBaseline + index * step)}" font-size="${TITLE}" font-weight="700">${esc(line)}</text>`,
      )
      .join("") +
    (keywords
      ? `<text x="${MARGIN}" y="${HEIGHT - MARGIN + 6}" font-size="${LABEL}" fill="#555">${esc(keywords)}</text>`
      : "") +
    `</g></svg>`
  );
}

export const ogPath = (slug) => `/og/${encodeURIComponent(slug)}.svg`;

// 크롤러가 그리는 그림꼴. svg는 여기 없다 — 카드가 svg라서 그림이 안 뜨는
// 것이 이 자리의 문제이므로, 그 문제를 가진 꼴을 답으로 고를 수는 없다.
// webp도 뺀다. 빌드가 쌍둥이로 굽기는 하지만 아직 받지 않는 크롤러가 있고,
// 원본 png·jpeg가 늘 옆에 남아 있다.
const SHAREABLE = /\.(png|jpe?g|gif)$/i;

const MIME = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

export function imageType(path) {
  const ext = String(path).split(/[?#]/)[0].split(".").pop().toLowerCase();
  return MIME[ext] || "";
}

/**
 * 글이 제 그림을 가지고 있으면 그 첫 장.
 *
 * 그린 카드보다 글이 실은 사진이 낫다 — 크롤러가 svg를 그리지 못해도 뜨고,
 * 무엇에 관한 글인지 글자보다 먼저 말한다. `measure`는 크기를 재는 사람이고
 * (빌드가 넘긴다) 없으면 재지 않는다. 너무 작은 그림은 건너뛴다: 본문에 끼인
 * 아이콘 한 장이 글 전체를 대표하면 공유된 자리에서 글이 우스워진다.
 */
export function articleImage(html, { measure = null, minWidth = 400 } = {}) {
  for (const [tag] of String(html).matchAll(/<img\b[^>]*>/g)) {
    const src = tag.match(/\bsrc="([^"]*)"/)?.[1];
    if (!src || src.startsWith("data:") || !SHAREABLE.test(src.split(/[?#]/)[0]))
      continue;
    // 바깥 주소는 재지 않으므로(빌드가 남의 서버를 찌르지 않는다) 크기를
    // 모른 채 받아들인다. 글쓴이가 적어 넣은 것이다.
    const size = measure?.(src);
    if (!size || size.width >= minWidth) return src;
  }
  return "";
}
