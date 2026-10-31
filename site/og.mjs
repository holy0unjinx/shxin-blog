// The card a link to this blog shows when it is shared.
//
// It is drawn as SVG in memory, then rasterised to the PNG the build ships.
// The card has the page's wordmark, category, date, title, and keywords.

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
 * tokens: the SVG is rendered without the site's stylesheet.
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
    `<g font-family="CMU Serif, 신명조, Times New Roman, serif" fill="#000">` +
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

export const ogPath = (slug) => `/og/${encodeURIComponent(slug)}.png`;
