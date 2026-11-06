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
const OLD_JAMO = /[\u1100-\u11ff\ua960-\ua97f\ud7b0-\ud7ff]/u;
const graphemes = new Intl.Segmenter("ko", { granularity: "grapheme" });

const n = (value) => String(Math.round(value * 100) / 100);

// 공유 PNG를 굽는 resvg는 한 <text> 안의 글꼴 대체에 옛한글 조합을
// 적용하지 않는다. 옛 음절만 별도의 <text>로 그려 같은 폰트에서 조합한다.
function runs(value) {
  const result = [];
  for (const { segment } of graphemes.segment(String(value))) {
    const old = OLD_JAMO.test(segment);
    if (result.at(-1)?.old === old) result.at(-1).text += segment;
    else result.push({ old, text: segment });
  }
  return result;
}

function runWidth(run, size) {
  if (run.old) return [...graphemes.segment(run.text)].length * size;
  // textWidth의 8% 여유는 줄바꿈에는 필요하지만 이어지는 두 글꼴
  // 사이에는 빈틈이 된다.
  return textWidth(run.text, size) / 1.08;
}

function cardText(value, x, y, size, attributes = "", end = false) {
  const chunks = runs(value);
  if (!chunks.some((part) => part.old))
    return `<text x="${n(x)}" y="${n(y)}" font-size="${size}"${end ? ' text-anchor="end"' : ""}${attributes}>${esc(value)}</text>`;
  let at = end ? x - chunks.reduce((sum, part) => sum + runWidth(part, size), 0) : x;
  return chunks.map((part) => {
    const svg = `<text x="${n(at)}" y="${n(y)}" font-size="${size}"${attributes}${part.old ? ' font-family="Noto Serif CJK KR"' : ""}>${esc(part.text)}</text>`;
    at += runWidth(part, size);
    return svg;
  }).join("");
}

function titleWidth(value, size) {
  return runs(value).reduce((sum, part) => sum + runWidth(part, size), 0) * 1.08;
}

// The title is wrapped by measure, and cut off with an ellipsis rather than
// shrunk: a card whose type size depends on the length of the title makes two
// cards from the same blog look like two different blogs.
export function wrapTitle(title, { width = WIDTH - MARGIN * 2, size = TITLE, lines: limit = 4 } = {}) {
  const words = String(title).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && titleWidth(candidate, size) > width) {
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
    cardText(siteName, MARGIN, MARGIN, LABEL, ' letter-spacing="1"') +
    (label
      ? cardText(label, WIDTH - MARGIN, MARGIN, LABEL, ' fill="#555"', true)
      : "") +
    (series
      ? cardText(series, MARGIN, firstBaseline - step * 0.9, LABEL + 4, ' fill="#555"')
      : "") +
    title
      .map(
        (line, index) =>
          cardText(line, MARGIN, firstBaseline + index * step, TITLE, ' font-weight="700"'),
      )
      .join("") +
    (keywords
      ? cardText(keywords, MARGIN, HEIGHT - MARGIN + 6, LABEL, ' fill="#555"')
      : "") +
    `</g></svg>`
  );
}

export const ogPath = (slug) => `/og/${encodeURIComponent(slug)}.png`;
