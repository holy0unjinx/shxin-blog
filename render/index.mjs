// Pure content helpers shared by the build step (Node) and the test suite.
// Nothing in here touches the DOM, the filesystem, or global state, so the same
// Markdown rendering runs at build time and inside tests.

import {
  citeLabel,
  createBibliography,
  entryUrl,
  formatEntry,
  parseCitation,
  sortKey,
} from "./bib.mjs";
import { renderChart } from "./chart/index.mjs";
import { renderCodeBlock } from "./code.mjs";
import { renderDiagram } from "./diagram/index.mjs";
import { esc } from "./escape.mjs";
import { readAttrs } from "./attrs.mjs";
import {
  createNumbering,
  MARK,
  numberCaption,
  takeLabel,
} from "./numbering.mjs";
import {
  isTableRule,
  renderDataTable,
  renderTable,
  splitCaption,
  startsTable,
  TABLE_CAPTION,
} from "./table.mjs";

// Re-exported so every module that already reads escaping from here keeps
// working; the implementation moved out to break an import cycle.
export { esc };

const SENTINEL = "\u0000";

function isExternal(url) {
  return /^https?:\/\//i.test(url);
}

function safeUrl(url) {
  // Allow absolute http(s), root-relative and fragment links only. Anything
  // else (javascript:, data:, vbscript:) collapses to a harmless anchor.
  if (isExternal(url) || url.startsWith("/") || url.startsWith("#")) return url;
  return "#";
}

function anchor(href, label, title) {
  const named = title ? ` title="${esc(title)}"` : "";
  return isExternal(href)
    ? `<a href="${href}"${named} target="_blank" rel="noreferrer">${label} ↗</a>`
    : `<a href="${href}"${named}>${label}</a>`;
}

// 줄 끝에서 끊긴 자리를 나타내는 표시. 문단이 줄을 이어 붙인 뒤에도 어디서
// 끊겼는지 알아야 해서, 이어 붙이기 전에 이 글자를 남겨 둔다.
const BREAK = "\u0001";
const BREAK_ALL = /\u0001 ?/g;

// 글쓴이가 표시를 글자로 쓰겠다고 밝힌 자리. esc()가 이미 지나간 뒤에 보므로
// "<"나 "&"는 실체 참조 꼴로 온다. "$", "[", "]", "`"는 여기 없다 — 수식과
// 코드의 구분자와 겹쳐 그보다 먼저 봐야 하기 때문이다(EARLY_ESCAPED).
const ESCAPED = /\\(&(?:amp|lt|gt|quot|#39);|[\\*_{}()#+\-.!|~^=:])/g;

// 수식과 코드보다 먼저 걷는 이스케이프. 이 넷은 여느 표시와 달리 자기
// 뒤의 규칙이 아니라 앞의 규칙에 걸린다.
//
//   $        인라인 수식의 구분자.
//   [ ]      "\\[…\\]"는 글자로 쓴 대괄호와 한 글자도 다르지 않다. 여러 줄
//            수식은 "$$…$$"가 맡으므로 대괄호를 수식으로 읽을 자리는 없다.
//   `        인라인 코드의 구분자. 담장 안에서도 쓸 수 있어, 코드 안에
//            역따옴표 한 자를 넣는 길이 이것뿐이다.
const EARLY_ESCAPED = /\\([$[\]`])/g;

/**
 * One line of Markdown.
 *
 * `notes` maps a footnote id to its plain text. When it is supplied every
 * reference carries the note as an attribute, which is what lets the page
 * show it on hover without a script and without a second copy of the text.
 *
 * `refs`는 참조식 링크의 이름과 주소다(`linkRefs`가 모은다). 없으면 참조식
 * 링크는 글자 그대로 남는다.
 *
 * `context`는 글 전체가 있어야 답이 나오는 것들을 쥔 자리다. 지금은
 * 번호 대장(`numbering`)이 들어 있고, 상호참조가 그것에 자리표를 남긴다.
 */
export function inline(text, notes, refs, context = {}) {
  const tokens = [];
  const token = (html) => {
    tokens.push(html);
    return `${SENTINEL}${tokens.length - 1}${SENTINEL}`;
  };
  const math = (formula) =>
    token(`<span class="math math-inline">${formula}</span>`);

  let html = esc(String(text).split(SENTINEL).join(""))
    // 글자로 쓴 "$"·대괄호·역따옴표는 수식과 코드보다 먼저 걷는다. 나머지
    // 이스케이프는 수식과 코드가 토큰이 된 다음에 본다 — LaTeX의 "\{"나
    // "\\"를 여기서 풀어 버리면 KaTeX가 받을 것이 사라진다.
    .replace(EARLY_ESCAPED, (_, character) => token(character))
    // Math first: its contents must survive every other rule untouched.
    .replace(/\$([^$\n]+)\$/g, (_, formula) => math(formula))
    // Inline code next, so emphasis and link syntax inside it stays literal.
    .replace(/`([^`]+)`/g, (_, code) => token(`<code>${code}</code>`))
    // 남은 역슬래시는 표시를 글자로 쓰겠다는 뜻이다. 토큰으로 바꿔 두면
    // 아래의 어떤 규칙도 그 글자를 다시 표시로 읽지 못한다.
    .replace(ESCAPED, (_, character) => token(character))
    // 문단이 줄을 이어 붙이기 전에 남겨 둔 자리.
    .replace(BREAK_ALL, () => token("<br>"))
    // 토큰으로 남긴다. 읽을 글이 속성으로 들어가므로, 아래의 어떤 규칙도
    // 그 속성 안을 다시 읽지 못해야 한다 — 참조식 링크 이름처럼 생긴 글이
    // 각주에 들어 있어도 속성 안에서 링크로 둔갑하지 않는다.
    // 사이드노트는 각주보다 먼저 본다. 캐럿이 하나 더 붙은 것뿐이라, 순서가
    // 뒤집히면 각주 규칙이 "^label"이라는 이름의 각주로 읽어 버린다.
    .replace(/\[\^\^([^\]]+)\]/g, (whole, index) => {
      const side = context.sidenotes?.get(index);
      // 정의가 없으면 글자 그대로 둔다. 토큰으로 막아 두지 않으면 아래의
      // 각주 규칙이 "^label"이라는 이름의 각주로 읽어 간다.
      if (!side) return token(whole);
      // 표시와 내용이 본문 흐름에 나란히 놓인다. 넓은 화면에서는 스타일이
      // 내용만 오른쪽 여백으로 띄우고, 좁은 화면에서는 그 자리에 한 덩이로
      // 앉는다 — 어느 쪽이든 읽는 자리에 글이 있고, 스크립트는 필요 없다.
      return token(
        `<sup class="sidenote-ref">${esc(side.mark)}</sup>` +
          `<span class="sidenote" role="note">` +
          `<span class="sidenote-mark">${esc(side.mark)}</span> ` +
          `${inline(side.note, notes, refs, context)}</span>`,
      );
    })
    .replace(/\[\^([^\]]+)\]/g, (_, id) => {
      const note = notes?.get(id);
      // 같은 각주를 두 번 부르면 표시는 둘이지만 돌아갈 자리는 하나다.
      // 처음 부른 자리만 앵커를 가진다 — 한 문서에 같은 id가 두 번 설 수는
      // 없고, 목록의 ↩는 그 각주가 처음 나온 자리로 돌려보낸다.
      const seen = context.seenNotes;
      const first = !seen || !seen.has(id);
      seen?.add(id);
      return token(
        `<sup class="footnote-ref"${note ? ` data-note="${esc(note)}"` : ""}>` +
          `<a href="#fn-${esc(id)}"${first ? ` id="ref-${esc(id)}"` : ""}>${esc(id)}</a></sup>`,
      );
    })
    // 상호참조. "[@fig:ca-tree]"는 "그림 3"이 되고, "[@#fig:a]"는 이름 없이
    // 번호만 남는다. 앞에서 뒤를 부를 수 있어야 하므로 번호는 글을 다 읽은
    // 뒤에 정해진다 — 여기서는 자리표만 남기고, numbering.resolve가 채운다.
    .replace(/\[@(#?)([a-z]+):([^\]\s]+)\]/gi, (whole, bare, kind, label) =>
      context.numbering
        ? token(
            context.numbering.mark(kind.toLowerCase(), label, {
              bare: Boolean(bare),
            }),
          )
        : whole,
    )
    // 인용. 상호참조 뒤에 본다 — "[@fig:a]"는 이미 자리표가 되었고, 남은
    // "[@key]"만 참고문헌을 가리킨다. 본문에는 번호가 아니라 (저자, 연도)가
    // 선다. 번호는 목록에서 각주와 나눠 쓰는 것이라 문장 안에 두 벌의 숫자가
    // 서지 않아야 하고, 이름과 해가 있으면 목록을 보지 않고도 무엇을 인용한
    // 글인지 읽힌다.
    .replace(/\[@([^\]]+)\]/g, (whole, inside) => {
      if (!context.bibliography) return whole;
      const cited = parseCitation(inside);
      const shown = cited.map(({ key, locator }) => {
        // 목록의 ↩가 돌아올 자리. 같은 출처를 여러 번 불러도 처음 부른
        // 자리에만 앵커가 선다.
        const first = !context.bibliography.cited(key);
        if (!context.bibliography.number(key)) return null;
        const label = citeLabel(context.bibliography.entry(key), locator);
        return (
          `<a href="#bib-${esc(key)}"${first ? ` id="cite-${esc(key)}"` : ""}>` +
          `${esc(label)}</a>`
        );
      });
      // 하나라도 모르는 key가 있으면 글자 그대로 둔다. 반쯤 바뀐 인용은
      // 오타를 감추기만 한다.
      if (!shown.length || shown.some((item) => item === null)) return token(whole);
      return token(`<span class="cite">(${shown.join("; ")})</span>`);
    })
    // A tooltip before the image and link rules: its reading holds spaces, so
    // no address pattern can claim it, and "!" in front stays a "!".
    .replace(/\[([^\]]+)\]\(\?\s*([^)]+)\)/g, (_, label, note) => {
      // The reading goes into an attribute, so it keeps no markup: code and
      // math are already tokens by now and give up their text here.
      const reading = plainText(
        note.replace(new RegExp(`${SENTINEL}(\\d+)${SENTINEL}`, "g"), (_, index) =>
          tokens[Number(index)].replace(/<[^>]*>/g, ""),
        ),
      );
      return token(
        `<span class="tooltip" data-note="${reading}" title="${reading}" tabindex="0">${label}</span>`,
      );
    })
    .replace(
      /!\[([^\]]*)\]\(([^\s)]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
      (_, alt, src, title) => {
        // 문단 안의 그림도 크기를 안다. 크기가 없으면 그 자리가 두 번
        // 배치되고, 그때마다 아래가 튄다.
        const size = context.measure?.(src);
        return token(
          `<img src="${safeUrl(src)}" alt="${alt}"${title ? ` title="${title}"` : ""}` +
            `${size ? ` width="${size.width}" height="${size.height}"` : ""}` +
            ` loading="lazy" decoding="async">`,
        );
      },
    )
    // 참조식 링크. 주소를 글 아래에 모아 두고 본문에서는 이름으로 부른다.
    // 이름 자리가 비면 label이 곧 이름이다. 모르는 이름이면 손대지 않고
    // 글자 그대로 둔다 — 오타가 링크로 둔갑하지 않게 하려는 것이다.
    .replace(/\[([^\]]+)\]\[([^\]]*)\]/g, (whole, label, key) => {
      const ref = refs?.get((key.trim() || label).trim().toLowerCase());
      return ref ? token(anchor(safeUrl(ref.url), label, ref.title)) : whole;
    })
    .replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, (_, label, url) =>
      token(anchor(safeUrl(url), label)),
    )
    // Bare URLs become links last, once every explicit anchor is already a
    // token, so an href can never be rewritten a second time.
    .replace(
      /(^|[\s(])(https?:\/\/[^\s<>"')]+)/g,
      (_, lead, url) => {
        const trail = url.match(/[.,;:!?]+$/)?.[0] || "";
        const href = url.slice(0, url.length - trail.length);
        return `${lead}${token(anchor(href, href))}${trail}`;
      },
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    // "~~"를 "~"보다 먼저 본다. 아래첨자 규칙은 "~~"를 비켜 가도록 짜여 있어
    // 둘이 서로를 갉아먹지 않는다.
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/==([^=]+)==/g, "<mark>$1</mark>")
    .replace(/\^([^\^\s][^\^]*?)\^/g, "<sup>$1</sup>")
    .replace(/(^|[^~])~([^~\s][^~]*?)~(?!~)/g, "$1<sub>$2</sub>");

  // 토큰이 다시 토큰을 품을 수 있다 — 글자로 쓴 역따옴표가 든 인라인 코드가
  // 그런 자리다. 한 번 되돌리면 안쪽 자리표가 드러나므로, 더 드러날 것이
  // 없을 때까지 되돌린다. 자리표는 우리가 붙인 것뿐이고(들어온 글의
  // SENTINEL은 맨 앞에서 걷었다) 한 번에 적어도 한 겹이 풀리므로 토큰 수를
  // 넘겨 돌 일이 없다.
  const placeholder = new RegExp(`${SENTINEL}(\\d+)${SENTINEL}`, "g");
  for (let pass = 0; pass <= tokens.length; pass += 1) {
    const next = html.replace(placeholder, (_, index) => tokens[Number(index)]);
    if (next === html) break;
    html = next;
  }
  return html;
}

// Strips inline markup so a heading can be reused as a table-of-contents
// label and as an anchor id.
export function plainText(text) {
  return String(text)
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    // 참조식 링크도 글자만 남는다. 주소는 글 아래에 있고, 속성 안에는
    // 누를 것이 없다.
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/\[\^\^?[^\]]+\]/g, "")
    // 상호참조는 번호로 바뀔 글이므로, 속성이나 앵커 이름으로 갈 때는
    // 남기지 않는다.
    .replace(/\[@[^\]]+\]/g, "")
    // 표시를 걷어 내는 일과 밝혀 둔 표시를 글자로 남기는 일은 한 번에
    // 본다. 따로 돌리면 글자로 쓴 "*"가 표시를 걷을 때 함께 지워진다.
    // "_" is not emphasis in this renderer, so an identifier like
    // changepoint_prior_scale keeps its underscores here too.
    .replace(/\\([\\`*_{}[\]()#+\-.!|~^=:$])|[*~^$]/g, (_, escaped) =>
      escaped === undefined ? "" : escaped,
    )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Hides code from the passes that read the manuscript as text.
 *
 * Footnote marks, sidenote marks and reference-style link definitions are all
 * found by scanning the source before a line is rendered. Code is text that
 * means itself: "[^1]" inside a fence is two brackets and a caret the author
 * wants printed, not a footnote — and the numbering pass, left alone, would
 * claim a number for it and then rewrite the code to match. A글 that explains
 * this very syntax is exactly where that happens.
 *
 * Fences and inline spans go out as markers and come back untouched.
 */
export function maskCode(source) {
  const held = [];
  const hide = (text) => `${MARK}C${held.push(text) - 1}${MARK}`;
  const body = String(source)
    .replace(/```[^\n]*\n[\s\S]*?```/g, hide)
    .replace(/`[^`\n]*`/g, hide);
  const restore = (text) =>
    String(text).replace(
      new RegExp(`${MARK}C(\\d+)${MARK}`, "g"),
      (_, index) => held[Number(index)],
    );
  return { body, restore };
}

// References decide the numbering: the first [^label] in the body becomes 1,
// the next new one 2, and the matching definitions are renumbered with them.
// Authors keep writing meaningful labels; readers always see 1, 2, 3.
//
// 인용은 여기서 세지 않는다. 참고문헌 목록은 번호가 아니라 저자 순으로 서고,
// 본문에는 (저자, 연도)가 나오기 때문이다.
function numberFootnotes(source) {
  const order = new Map();
  const claim = (label) => {
    if (!order.has(label)) order.set(label, order.size + 1);
  };
  // "[^^x]"는 사이드노트이므로 각주가 가져가지 않는다.
  for (const [, label] of source.matchAll(/\[\^(?!\^)([^\]]+)\](?!:)/g))
    claim(label);
  // A definition that is never referenced still belongs in the list.
  for (const [, label] of source.matchAll(/^\[\^(?!\^)([^\]]+)\]:/gm))
    claim(label);
  return source.replace(/\[\^(?!\^)([^\]]+)\](:?)/g, (match, label, colon) =>
    order.has(label) ? `[^${order.get(label)}]${colon}` : match,
  );
}

const LIST_ITEM = /^(\s*)([-*+]|\d+\.)\s+(.*)$/;
const HR = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const BLOCK_REF = /^@@BLOCK\d+@@$/;

// 줄 끝의 역슬래시 하나 또는 공백 둘은 그 자리에서 줄을 끊는다. 문단은 줄을
// 이어 붙이므로 붙이기 전에 자리를 표시해 둔다. 역슬래시가 짝수 개면 글자로
// 쓴 역슬래시이니 건드리지 않는다.
function hardBreak(line) {
  const run = line.match(/\\+$/);
  if (run) return run[0].length % 2 ? `${line.slice(0, -1)}${BREAK}` : line;
  return line.replace(/ {2,}$/, BREAK);
}

// 인용 첫 줄이 이름표를 달면 알림 상자가 된다. 이름표가 없거나 모르는
// 이름이면 여느 인용 그대로다.
const CALLOUTS = new Map([
  ["NOTE", "참고"],
  ["TIP", "도움말"],
  ["IMPORTANT", "중요"],
  ["WARNING", "주의"],
  ["CAUTION", "경고"],
]);

// 수학 조판의 환경. 같은 기계를 쓰지만 알림 상자와 두 가지가 다르다.
// 종류마다 따로 번호를 세고, 진술(정리·정의 …)은 기울인 글씨, 증명은 곧은
// 글씨다 — 관례가 그렇고, 색을 쓰지 않는 이 종이에서는 기울기가 종류를
// 가르는 몇 안 되는 층위 중 하나다.
const ENVIRONMENTS = new Map([
  ["THEOREM", "thm"],
  ["LEMMA", "lem"],
  ["COROLLARY", "cor"],
  ["PROPOSITION", "prop"],
  ["DEFINITION", "def"],
  ["EXAMPLE", "ex"],
  ["REMARK", "rem"],
  // 증명은 번호를 갖지 않는다. 부르는 것은 증명이 아니라 그것이 증명한
  // 진술이고, 끝은 번호가 아니라 ∎로 표시된다.
  ["PROOF", ""],
]);

/**
 * A quote, a callout box or a mathematical environment.
 *
 * `blocks` renders the lines below the label as blocks rather than as one
 * paragraph, which is what lets a proof hold a list, a display equation or a
 * code fence. `numbering` gives an environment its number.
 */
function quoteBlock(quote, text, section, numbering) {
  // 인용의 마지막 줄이 "—"로 시작하면 출처다. 인용문 안에 섞여 같은 크기로
  // 서면 누가 한 말인지가 그 말의 일부처럼 읽힌다.
  const attribution = quote.length > 1 && SOURCE_LINE.test(quote[quote.length - 1])
    ? quote.pop().replace(SOURCE_LINE, "").trim()
    : "";
  const label = quote[0]?.match(/^\[!(\w+)\]\s*(.*)$/);
  const kind = label ? label[1].toUpperCase() : "";
  const isDetails = kind === "DETAILS";
  const isEnvironment = ENVIRONMENTS.has(kind);
  if (!label || (!isDetails && !isEnvironment && !CALLOUTS.has(kind))) {
    const quoted = `<blockquote>${text(trimBreak(quote.join(" ")))}</blockquote>`;
    return attribution
      ? `<figure class="quote">${quoted}` +
          `<figcaption class="quote-source">— ${text(attribution)}</figcaption></figure>`
      : quoted;
  }

  const body = section(quote.slice(1).join("\n"));

  if (isEnvironment) {
    const series = ENVIRONMENTS.get(kind);
    // 이름표 뒤의 글은 이름표가 아니라 그 진술의 이름이다 — "(피타고라스)".
    const marked = takeLabel(label[2]);
    const numbered = series
      ? numberCaption(numbering, marked.kind || series, label[2], { force: true })
      : { id: "", prefix: "", entry: null };
    const name = numbered.entry
      ? `${numbered.entry.name} ${numbered.entry.number}`
      : "증명";
    const note = marked.rest;
    return (
      `<section class="environment environment-${series || "proof"}"` +
      `${numbered.id ? ` id="${esc(numbered.id)}"` : ""}>` +
      `<p class="environment-title"><span class="environment-name">${esc(name)}</span>` +
      `${note ? `<span class="environment-note">(${text(note)})</span>` : ""}</p>` +
      `<div class="environment-body">${body}` +
      `${series ? "" : '<span class="qed" aria-label="증명 끝">∎</span>'}</div>` +
      `</section>`
    );
  }

  const heading = label[2].trim();
  if (isDetails) {
    // 제목은 <summary> 안이라 표시를 살릴 자리가 아니다. 글자만 남긴다.
    const summary = plainText(heading) || "더 보기";
    return `<details class="callout callout-details"><summary>${esc(summary)}</summary>${body}</details>`;
  }
  const title = heading ? text(heading) : esc(CALLOUTS.get(kind));
  return `<div class="callout callout-${kind.toLowerCase()}"><p class="callout-title">${title}</p>${body}</div>`;
}

const trimBreak = (value) => value.replace(new RegExp(`${BREAK}\\s*$`), "");

// 인용 아래에 붙는 출처 줄. 전각 대시와 하이픈 둘 다 받는다 — 원고에서 어느
// 쪽을 쓸지는 자판이 정한다.
const SOURCE_LINE = /^\s*(?:—|--)\s+/;

// 뜻 줄. 캡션(": 내용")과 갈리도록 콜론을 둘 쓴다.
const DEFINITION_ITEM = /^::\s+(.*)$/;

// 목록 한 칸이 "[ ]"나 "[x]"로 시작하면 할 일 칸이다. 표시만 하는 것이라
// 상자는 잠가 둔다 — 눌러서 바뀌는 값이면 어디엔가 저장되어야 하는데,
// 정적인 글에는 그럴 자리가 없다.
const TASK_ITEM = /^\[([ xX])\]\s+(.*)$/;

function collectList(lines, start, text) {
  const first = lines[start].match(LIST_ITEM);
  const baseIndent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const items = [];
  let i = start;

  while (i < lines.length) {
    const match = lines[i].match(LIST_ITEM);
    if (!match) break;
    const indent = match[1].length;
    if (indent < baseIndent) break;

    if (indent > baseIndent) {
      const [nested, next] = collectList(lines, i, text);
      if (!items.length) items.push({ text: "", children: "" });
      items[items.length - 1].children += nested;
      i = next;
      continue;
    }
    // A marker switch at the same depth starts a separate list.
    if (/\d/.test(match[2]) !== ordered) break;
    items.push({ text: match[3], children: "" });
    i++;
  }

  const tag = ordered ? "ol" : "ul";
  const tasks = items.some((item) => TASK_ITEM.test(item.text));
  const html = `<${tag}${tasks ? ' class="task-list"' : ""}>${items
    .map((item) => {
      const task = item.text.match(TASK_ITEM);
      if (!task) return `<li>${text(item.text)}${item.children}</li>`;
      const done = task[1].toLowerCase() === "x";
      return (
        `<li class="task"><input type="checkbox" disabled${done ? " checked" : ""}>` +
        `<span>${text(task[2])}</span>${item.children}</li>`
      );
    })
    .join("")}</${tag}>`;
  return [html, i];
}

export function renderMarkdown(source, options) {
  return renderDocument(source, options).html;
}

/**
 * One article.
 *
 * `options.resolve(path)`는 글이 가리킨 파일의 내용을 돌려준다(없으면 null).
 * 렌더러가 파일시스템을 모르게 하려는 자리다 — 빌드는 진짜 파일을 읽어
 * 넘기고, 테스트는 고정값을 넘긴다.
 */
export function renderDocument(source, options = {}) {
  const numbering = options.numbering || createNumbering({ plain: plainText });
  const resolve = typeof options.resolve === "function" ? options.resolve : null;
  // 그림의 내재 크기를 아는 사람. 빌드가 파일을 읽어 넘기고, 없으면 크기
  // 없이 나간다.
  const measure = typeof options.measure === "function" ? options.measure : null;
  // 읽지 못한 파일. 한 펜스가 두 길로 읽혀도(그래프로 한 번, 코드 블록으로
  // 한 번) 이름은 한 번만 남는다.
  const missing = new Set();
  const readFile = (path) => {
    const text = resolve?.(path);
    if (typeof text === "string") return text;
    missing.add(path);
    return null;
  };
  // 우리가 쓰는 표시는 글쓴이의 것이 아니다. 글에 들어 있으면 걷어 내고
  // 시작한다.
  const cleaned = String(source)
    .replace(/@@BLOCK\d+@@/g, "")
    .split(BREAK)
    .join("")
    .split(MARK)
    .join("");
  // 사이드노트가 각주보다 먼저다. 캐럿이 하나 더 붙은 것뿐이라, 각주 쪽이
  // 먼저 훑으면 그 정의를 각주 정의로 데려간다.
  // 원고를 글로 훑는 패스들 앞에서 코드를 가려 둔다. 펜스 안의 "[^1]"은
  // 각주가 아니라 글쓴이가 찍고 싶은 글자다.
  const masked = maskCode(cleaned);
  const sides = sidenotes(masked.body);
  const bibEntries = options.bib || new Map();
  const { body: noted, notes } = footnotes(numberFootnotes(sides.body));
  const { body: linked, refs } = linkRefs(noted);
  const body = masked.restore(linked);
  for (const note of notes) note.note = masked.restore(note.note);
  for (const side of sides.sidenotes.values())
    side.note = masked.restore(side.note);
  // Definitions are known before a single line is rendered, so every
  // reference can be printed with its own note attached. The stored text is
  // stripped of markup: it goes into an attribute, where a link or an
  // emphasis mark has nothing to render into.
  const noteText = new Map(
    notes.map((note) => [note.id, plainText(note.note)]),
  );
  // 참고문헌 대장. options.bib이 없으면 인용은 글자 그대로 남는다.
  const bibliography = createBibliography(bibEntries);
  const context = {
    numbering,
    sidenotes: sides.sidenotes,
    bibliography,
    measure,
    // 이미 표시가 선 각주. 두 번째 표시는 앵커를 갖지 않는다.
    seenNotes: new Set(),
  };
  const text = (source) => inline(source, noteText, refs, context);
  const headings = [];
  const usedIds = new Map();
  // 두 목록이 "notes"와 "references" 앵커를 가진다. 같은 이름의 절이 글에
  // 있으면 그쪽이 꼬리표를 받는다.
  if (notes.length) usedIds.set("notes", 1);
  if (bibEntries.size) usedIds.set("references", 1);
  const headingId = (text) => {
    const plain = plainText(text);
    const base = plain ? slugify(plain) : "section";
    const seen = usedIds.get(base) || 0;
    usedIds.set(base, seen + 1);
    return seen ? `${base}-${seen + 1}` : base;
  };
  const blocks = [];
  const block = (html) => {
    blocks.push(html);
    return `\n@@BLOCK${blocks.length - 1}@@\n`;
  };
  // 읽지 못해 코드 블록으로 떨어진 펜스. 조용히 사라지지는 않지만, 글쓴이가
  // 알아채지 못할 수 있으므로 lint가 볼 수 있게 남긴다.
  const unreadable = [];

  // 캡션 한 줄. 번호가 붙었으면 번호가 앞에 서고, 오른쪽 요소는 표·그래프와
  // 같은 규칙으로 "|" 뒤에 온다.
  const figcaption = (numbered) => {
    if (!numbered.prefix && !numbered.text) return "";
    const { main, aside } = splitCaption(numbered.text);
    return (
      `<figcaption><div class="caption-row"><span class="caption-text">` +
      `${numbered.prefix ? `<span class="caption-number">${esc(numbered.prefix)}</span> ` : ""}` +
      `${main ? text(main) : ""}</span>` +
      `${aside ? `<span class="caption-aside">${text(aside)}</span>` : ""}` +
      `</div></figcaption>`
    );
  };

  // 그림 하나. 크기를 아는 그림이면 width·height가 박혀 레이아웃이 튀지
  // 않는다(options.measure가 그것을 안다).
  const figure = (alt, src, caption) => {
    const numbered = numberCaption(numbering, "fig", caption || "");
    const size = measure?.(src);
    const dimensions = size
      ? ` width="${size.width}" height="${size.height}"`
      : "";
    // 캡션은 그림 위에 선다. 표와 그래프가 그렇고, 한 글에서 캡션이 어느
    // 때는 위 어느 때는 아래에 있으면 읽는 쪽이 매번 찾아야 한다.
    return (
      `<figure${numbered.id ? ` id="${esc(numbered.id)}"` : ""}>` +
      figcaption(numbered) +
      `<img src="${esc(safeUrl(src))}" alt="${esc(alt)}"${dimensions} loading="lazy" decoding="async">` +
      `</figure>`
    );
  };

  // 줄을 읽기 전에 들어 올리는 것들. 펜스·블록 수식·그림은 여러 줄을 지고
  // 있어 줄 단위 규칙과 섞이면 서로를 갉아먹으므로, 먼저 자리표로 바꿔 둔다.
  // 인용 안에서도 같은 일이 필요해서 함수로 두었다 — 인용은 자기 본문을
  // 한 겹 벗겨 이 함수에 다시 넣는다.
  const extract = (source) =>
    source
    .replace(/```([^\n]*)\n([\s\S]*?)```/g, (_, lang, code) => {
      // A chart or a diagram fence draws a figure. When the renderer cannot
      // read it — no type it knows, or no usable numbers — it declines, and
      // the fence falls through to the code block below so the author sees
      // their own source instead of silence.
      if (/^chart\b/.test(lang.trim())) {
        const chart = renderChart(lang, code, text, blocks.length, {
          numbering,
          resolve: readFile,
        });
        if (chart) return block(chart);
        unreadable.push("chart");
      }
      if (/^diagram\b/.test(lang.trim())) {
        const drawn = renderDiagram(lang, code, blocks.length, {
          numbering,
          inline: text,
        });
        if (drawn) return block(drawn);
        unreadable.push("diagram");
      }
      // 그림 둘을 한 줄에. 전후 비교나 두 모델의 잔차처럼 나란히 놓여야
      // 비교가 되는 것들이 있고, 그럴 때 그림 하나가 한 줄을 다 쓰면 눈이
      // 위아래를 오간다. 캡션과 번호 규칙은 여느 그림과 같다.
      if (/^figures\b/.test(lang.trim())) {
        const brace = lang.match(/\{([^}]*)\}/);
        const attrs = brace ? readAttrs(brace[1]) : {};
        const asked = Number.parseInt(attrs.cols ?? "", 10);
        const drawn = code
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const image = line.match(
              /^!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)$/,
            );
            return image ? figure(image[1], image[2], image[3]) : "";
          })
          .filter(Boolean);
        if (drawn.length) {
          // 칸 수를 적지 않으면 그림 개수가 곧 칸 수다.
          const cols = Math.min(
            Math.max(Number.isInteger(asked) ? asked : drawn.length, 2),
            4,
          );
          return block(
            `<div class="figure-row" style="--cols:${cols}">${drawn.join("")}</div>`,
          );
        }
        unreadable.push("figures");
      }
      if (/^table\b/.test(lang.trim())) {
        const built = renderDataTable(lang, code, text, {
          numbering,
          resolve: readFile,
        });
        if (built) return block(built);
        unreadable.push("table");
      }
      const rendered = renderCodeBlock(lang, code, {
        numbering,
        resolve: readFile,
      });
      return block(rendered.html);
    })
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
      // "$$ {#eq:mass}"는 그 식에 번호를 준다. 이름이 없는 식은 번호도 없다
      // — 부를 일이 없는 번호를 여백에 세워 둘 이유가 없다.
      const marked = takeLabel(math);
      const numbered =
        marked.kind === "eq"
          ? numberCaption(numbering, "eq", math, { force: true })
          : null;
      const formula = marked.kind === "eq" ? marked.rest : math.trim();
      const inner = `<div class="math math-display">${esc(formula)}</div>`;
      if (!numbered?.entry) return block(inner);
      return block(
        `<div class="math-block" id="${esc(numbered.id)}">${inner}` +
          `<span class="eq-number">(${numbered.entry.number})</span></div>`,
      );
    })
    .replace(
      /^!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)$/gm,
      (_, alt, src, caption) => block(figure(alt, src, caption)).trim(),
    )
    .replace(/^!video\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)$/gm,
      (_, alt, src, caption) => {
        const numbered = numberCaption(numbering, "fig", caption || "");
        const id = numbered.id ? ` id="${esc(numbered.id)}"` : "";
        return block(
          `<figure${id}>` +
            figcaption(numbered) +
            `<video controls preload="metadata" src="${esc(safeUrl(src))}">${esc(alt)}</video>` +
            `</figure>`,
        ).trim();
      },
    )
    .replace(/^!embed\((https?:\/\/[^\s)]+)\)$/gm, (_, src) =>
      block(
        `<div class="embed"><iframe src="${esc(src)}" loading="lazy" allowfullscreen title="Embedded content"></iframe></div>`,
      ).trim(),
    );

  /**
   * A run of lines, read as blocks.
   *
   * It calls itself for the body of a quote, a callout and an environment, so
   * a proof can hold a list or a display equation the way the article around
   * it can. Everything that had to be lifted out before line reading began —
   * fences, display math, figures — is already a @@BLOCK@@ placeholder by
   * now, and a placeholder is one line wherever it lands.
   */
  const renderBlocks = (lines) => {
  let html = "";
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (BLOCK_REF.test(line.trim())) {
      html += blocks[Number(line.match(/\d+/)[0])];
      i++;
      continue;
    }
    if (HR.test(line)) {
      html += "<hr>";
      i++;
      continue;
    }
    // "[toc:fig]" 한 줄은 그림 목록이 된다. 그림이 아홉인 글에서는 목차만큼
    // 쓰인다. 목록은 지금 세울 수 없다 — 아래에 있는 그림은 아직 읽히지도
    // 번호를 받지도 않았으므로, 자리표만 남기고 numbering.fillLists가 채운다.
    const list = line.trim().match(/^\[toc:([a-z]+)\]$/i);
    if (list) {
      html += numbering.listMark(list[1].toLowerCase());
      i++;
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      // The page already owns <h1>, so headings start one level down.
      const level = Math.min(heading[1].length + 1, 6);
      // "## 제목 {#sec:setup}"은 그 절에 이름을 붙인다. 절은 번호를 쓰지
      // 않으므로, 그 이름을 부르면 제목의 글자가 링크로 나온다.
      const marked = takeLabel(heading[2]);
      const title = marked.kind === "sec" ? marked.rest : heading[2];
      const id = headingId(title);
      if (marked.kind === "sec")
        numbering.defineSection(marked.label, plainText(title), id);
      headings.push({ level, id, text: plainText(title) });
      html += `<h${level} id="${id}">${text(title)}</h${level}>`;
      i++;
      continue;
    }
    // A ": text" line directly above a table is its caption; anywhere else
    // it is just a paragraph.
    const caption = line.trim().match(TABLE_CAPTION);
    const tableStart = caption ? i + 1 : i;
    const table = renderTable(
      lines,
      tableStart,
      text,
      caption ? caption[1] : "",
      { numbering },
    );
    if (table) {
      html += table[0];
      i = table[1];
      continue;
    }

    // 용어와 뜻. ":"는 이미 캡션이 쓰고 있으므로 "::"로 적는다.
    //
    //   원시다항식
    //   :: 계수들의 최대공약수가 1인 정수계수 다항식
    if (
      line.trim() &&
      !DEFINITION_ITEM.test(line) &&
      i + 1 < lines.length &&
      DEFINITION_ITEM.test(lines[i + 1])
    ) {
      let terms = "";
      while (
        i < lines.length &&
        lines[i].trim() &&
        !DEFINITION_ITEM.test(lines[i]) &&
        i + 1 < lines.length &&
        DEFINITION_ITEM.test(lines[i + 1])
      ) {
        terms += `<dt>${text(lines[i++].trim())}</dt>`;
        while (i < lines.length && DEFINITION_ITEM.test(lines[i]))
          terms += `<dd>${text(lines[i++].match(DEFINITION_ITEM)[1].trim())}</dd>`;
      }
      html += `<dl class="definitions">${terms}</dl>`;
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const [list, next] = collectList(lines, i, text);
      html += list;
      i = next;
      continue;
    }
    const paragraph = [hardBreak(line)];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !BLOCK_REF.test(lines[i].trim()) &&
      !HR.test(lines[i]) &&
      !LIST_ITEM.test(lines[i]) &&
      !isTableRule(lines[i]) &&
      !startsTable(lines, i) &&
      !TABLE_CAPTION.test(lines[i].trim()) &&
      !DEFINITION_ITEM.test(lines[i]) &&
      !/^(?:#{1,6}\s|\||>|!video|!embed)/.test(lines[i])
    )
      paragraph.push(hardBreak(lines[i++]));
    html += `<p>${text(trimBreak(paragraph.join(" ")))}</p>`;
  }

  return html;
  };

  /**
   * One run of source, quotes and all.
   *
   * A quote is pulled off before the pre-pass runs, because a fence or a
   * display equation written inside one carries a "> " on every line and no
   * regex that reads the two together stays readable. Stripping the marker
   * first and handing the body back to this same function gives nesting for
   * free: a proof holds a display equation, a callout holds a list, and a
   * quote inside either is still a quote.
   */
  const renderSection = (source) => {
    const lines = String(source).split(/\r?\n/);
    let out = "";
    let i = 0;
    while (i < lines.length) {
      if (/^>\s?/.test(lines[i])) {
        const quote = [];
        while (i < lines.length && /^>\s?/.test(lines[i]))
          quote.push(hardBreak(lines[i++].replace(/^>\s?/, "")));
        out += quoteBlock(quote, text, renderSection, numbering);
        continue;
      }
      const chunk = [];
      while (i < lines.length && !/^>\s?/.test(lines[i])) chunk.push(lines[i++]);
      out += renderBlocks(extract(chunk.join("\n")).split(/\r?\n/));
    }
    return out;
  };

  let html = renderSection(body);

  const top = headings.length
    ? Math.min(...headings.map((heading) => heading.level))
    : 2;
  // 인용이 있으면 "참고문헌"이라는 이름은 출처 목록이 가진다. 각주는 주석이
  // 되고 앵커도 갈라진다 — 한 글에 같은 이름의 두 절이 서는 일이 없어야
  // 한다. 인용이 없으면 각주가 그 이름을 그대로 쓴다.
  // 각주와 출처는 각자의 목록에 선다. 둘은 다른 것이다 — 각주는 이 글이
  // 곁들이는 말이고 출처는 이 글이 기댄 남의 글이다. 대신 조판은 하나다:
  // 같은 테두리, 같은 크기, 같은 제목 꼴.
  //
  // 각주는 본문에 나온 차례대로 번호를 달고, 참고문헌은 APA대로 저자 순으로
  // 서며 번호를 달지 않는다. value를 적어 두는 것은 정의가 빠진 각주가 있어도
  // 남은 항목의 번호가 본문의 표시와 어긋나지 않게 하려는 것이다.
  const section = (id, title, list) =>
    `<section class="notes"><h${top} id="${id}" class="notes-title">${title}</h${top}>` +
    list +
    `</section>`;

  if (notes.length)
    html += section(
      "notes",
      "주석",
      `<ol>${notes
        .map(
          (note) =>
            `<li id="fn-${esc(note.id)}" value="${esc(note.id)}">${text(note.note)} ` +
            `<a href="#ref-${esc(note.id)}" aria-label="Back to reference">↩</a></li>`,
        )
        .join("")}</ol>`,
    );

  const sources = bibliography
    .used()
    .filter(({ entry }) => entry)
    .sort((a, b) => sortKey(a.entry).localeCompare(sortKey(b.entry), "ko"));
  if (sources.length)
    html += section(
      "references",
      "참고문헌",
      `<ul class="bib-list">${sources
        .map(({ key, entry }) => {
          // 주소는 따로 서지 않는다. 항목 전체가 링크다 — 참고문헌 한 줄은
          // 한 덩이이고, 꼬리의 URL만 겨누게 할 이유가 없다.
          const body = formatEntry(entry);
          const url = entryUrl(entry);
          const inner = url
            ? `<a class="bib-link" href="${esc(url)}" target="_blank" rel="noreferrer">${body}</a>`
            : body;
          return (
            `<li id="bib-${esc(key)}">${inner} ` +
            `<a href="#cite-${esc(key)}" aria-label="Back to reference">↩</a></li>`
          );
        })
        .join("")}</ul>`,
    );

  // 번호는 글이 다 조판된 뒤에 실린 차례대로 매긴다. 그 다음이 상호참조다
  // — 자리표가 남아 있는 동안에는 몇 번인지 아직 아무도 모른다.
  html = numbering.assign(html);
  html = numbering.fillLists(html);
  html = numbering.resolve(html);
  return {
    html,
    headings,
    math: /class="math/.test(html),
    code: /<pre><code/.test(html),
    // 글을 다 읽은 뒤에야 알 수 있는 것들. lint가 이것을 읽는다.
    numbering,
    missingFiles: [...missing],
    unreadable,
    // 정의만 있고 부르지 않은 사이드노트. 각주와 달리 세울 자리가 없어
    // 조용히 빠지므로 lint가 알려야 한다.
    unusedSidenotes: sides.unused,
    // 본문이 부른 출처와, 대장에 없던 key. lint가 읽는다.
    bibliography,
  };
}

// 사이드노트 표시. 번호가 아니라 기호를 쓰는 것은 각주와 섞이지 않게 하려는
// 것이다 — 한 문단에 각주 3과 사이드노트 3이 같이 서면 어느 목록을 봐야
// 하는지 알 수 없다. 여섯 개를 다 쓰면 겹쳐 쓴다(**, ††).
const SIDE_MARKS = ["*", "†", "‡", "§", "¶", "‖"];

export function sideMark(index) {
  const symbol = SIDE_MARKS[(index - 1) % SIDE_MARKS.length];
  return symbol.repeat(Math.floor((index - 1) / SIDE_MARKS.length) + 1);
}

/**
 * 사이드노트를 걷어낸다.
 *
 * 문법은 각주와 나란하고 캐럿 하나가 더 붙는다: 본문 `[^^label]`, 정의
 * `[^^label]: 내용`. 각주와 달리 하단 목록으로 내려가지 않고 그 줄 옆
 * 여백에 서므로, 읽는 자리에 내용이 함께 있어야 한다.
 */
export function sidenotes(body) {
  const notes = new Map();
  const stripped = String(body).replace(
    /^\[\^\^([^\]]+)\]:\s*(.+)$/gm,
    (_, label, note) => {
      notes.set(label.trim().toLowerCase(), note.trim());
      return "";
    },
  );
  // 본문에 나온 순서대로 기호를 매긴다. 정의만 있고 부르지 않은 것은 어디에
  // 세울 자리가 없으므로 나가지 않고, lint가 알린다.
  const order = new Map();
  const unused = new Set(notes.keys());
  const numbered = stripped.replace(/\[\^\^([^\]]+)\]/g, (whole, raw) => {
    const label = raw.trim().toLowerCase();
    if (!notes.has(label)) return whole;
    if (!order.has(label)) order.set(label, order.size + 1);
    unused.delete(label);
    return `[^^${order.get(label)}]`;
  });
  const byIndex = new Map();
  for (const [label, index] of order)
    byIndex.set(String(index), { mark: sideMark(index), note: notes.get(label) });
  return { body: numbered, sidenotes: byIndex, unused: [...unused] };
}

export function footnotes(body) {
  const notes = [];
  const stripped = body.replace(/^\[\^(?!\^)([^\]]+)\]:\s*(.+)$/gm, (_, id, note) => {
    notes.push({ id, note });
    return "";
  });
  // Definitions may appear in any order in the source; the printed list
  // follows the reference numbering.
  notes.sort((a, b) => Number(a.id) - Number(b.id));
  return { body: stripped, notes };
}

// 참조식 링크의 주소 정의(`[이름]: 주소 "제목"`)를 걷어 낸다. 각주 정의
// (`[^1]: …`)와 모양이 비슷하지만 이름이 "^"로 시작하지 않는 쪽만 여기서
// 가져가므로 둘이 섞이지 않는다. 각주를 먼저 걷은 뒤에 부른다.
export function linkRefs(body) {
  const refs = new Map();
  const stripped = body.replace(
    /^\[([^\^\]][^\]]*)\]:[ \t]*(\S+)(?:[ \t]+"([^"]*)")?[ \t]*$/gm,
    (_, label, url, title) => {
      refs.set(label.trim().toLowerCase(), { url, title: title || "" });
      return "";
    },
  );
  return { body: stripped, refs };
}

export function frontmatter(source) {
  const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
  const data = {};
  if (match) {
    for (const line of match[1].split(/\r?\n/)) {
      const item = line.match(/^([\w-]+):\s*(.*)$/);
      if (item) data[item[1]] = item[2].replace(/^["']|["']$/g, "");
    }
  }
  return { data, body: source.slice(match ? match[0].length : 0) };
}

export function excerpt(body) {
  const plain = body
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!?(\[[^\]]*\])\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/\[\^[^\]]+\]:.*$/gm, "")
    // 각주와 사이드노트 표시는 글이 아니라 표시다. 링크 라벨의 대괄호와
    // 달리 안에 읽을 글이 없으므로 자리째 사라진다.
    .replace(/\[\^\^?[^\]]+\]/g, "")
    // 상호참조·인용·캡션 이름표는 번호나 목록으로 바뀔 표시다. 한 줄 요약에
    // 원고의 이름표가 남을 자리는 없다.
    .replace(/\[@[^\]]+\]/g, "")
    .replace(/\{#[a-z]+:[^}\s]+\}/gi, "")
    .replace(/\{\s*nonumber\s*\}/gi, "")
    // 주소 정의 줄, 알림 상자 이름표, 할 일 상자는 글이 아니다.
    .replace(/^\[[^\^\]][^\]]*\]:[ \t]*\S+.*$/gm, "")
    .replace(/^[ \t]*>?[ \t]*\[!\w+\]/gm, "")
    .replace(/\[[ xX]\]/g, "")
    // 줄 끊기 표시는 글이 아니다. 짝수 개는 글자로 쓴 역슬래시이므로
    // 아래 이스케이프 규칙이 가져간다.
    .replace(/(^|[^\\])\\[ \t]*$/gm, "$1 ")
    // 표시를 걷는 일과 밝혀 둔 표시를 글자로 남기는 일을 한 번에 본다.
    // "~"와 "="는 낱말 안에 붙는 표시라 지우고, 나머지는 예전처럼 칸으로
    // 바꾼다 — 문단 표시가 붙어 있던 자리는 띄어야 문장이 읽힌다.
    .replace(
      /\\([\\`*_{}[\]()#+\-.!|~^=:$])|[~=]|[*_`>#|]/g,
      (match, escaped) =>
        escaped !== undefined ? escaped : /[~=]/.test(match) ? "" : " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  const sentences =
    plain.match(/[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/g) || [];
  return sentences
    .slice(0, 2)
    .map((sentence) => sentence.trim())
    .join(" ")
    .trim();
}

// 읽는 데 걸리는 시간. 코드 담장, 차트, 수식, 그림·영상·끼워넣기 줄, 각주
// 정의는 눈으로 훑는 것이지 읽는 것이 아니므로 셈에서 빠진다. 한글은 글자를,
// 로마자는 낱말을 세는데, 같은 뜻을 담는 데 드는 글자 수가 서로 다르기
// 때문이다. 기준은 한글 500자/분, 로마자 200낱말/분이고, 0분은 없다.
const HANGUL_PER_MINUTE = 500;
const WORDS_PER_MINUTE = 200;

export function readingMinutes(body) {
  const plain = String(body)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$\n]*\$/g, " ")
    .replace(/^!(?:video|embed)?[[(][\s\S]*?$/gm, " ")
    .replace(/^\[\^[^\]]+\]:.*$/gm, " ")
    // 주소 정의 줄과 이름표·상자는 눈으로 훑는 것이지 읽는 것이 아니다.
    .replace(/^\[[^\^\]][^\]]*\]:[ \t]*\S+.*$/gm, " ")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/^[ \t]*>?[ \t]*\[!\w+\]/gm, " ")
    .replace(/\[[ xX]\]/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>#|~=-]/g, " ");
  const cjk = plain.match(/[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) || [];
  const words = plain.replace(/[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu, " ")
    .match(/[\p{L}\p{N}]+/gu) || [];
  const minutes = cjk.length / HANGUL_PER_MINUTE + words.length / WORDS_PER_MINUTE;
  return Math.max(1, Math.round(minutes));
}

// 검색이 읽을 본문. 읽기 시간과 같은 자리를 덜어 낸다 — 코드, 수식, 그림은
// 글이 아니라 자료다. 다만 세는 것이 아니라 찾는 것이라 낱말은 붙여 둔다:
// 붙임표를 공백으로 바꾸면 "step-ca"라고 쳤을 때 찾지 못한다.
export function searchText(body) {
  return String(body)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$\n]*\$/g, " ")
    .replace(/^!(?:video|embed)?[[(][\s\S]*?$/gm, " ")
    // 각주는 표시만 걷어 내고 글은 남긴다. 본문에 없는 말이 각주에만 있는
    // 일이 잦으니, 찾을 수 있는 편이 맞다.
    .replace(/^\[\^[^\]]+\]:\s*/gm, " ")
    .replace(/\[\^[^\]]+\]/g, " ")
    // 상호참조와 인용은 번호로 바뀔 표시다. 찾는 사람은 "그림 3"이나
    // "[1]"을 치지 않고, 원고의 이름표를 알지도 못한다.
    .replace(/\[@[^\]]+\]/g, " ")
    // 캡션의 이름표도 표시다. 그 자리에 나오는 글은 캡션 본문뿐이다.
    .replace(/\{#[a-z]+:[^}\s]+\}/gi, " ")
    .replace(/\{\s*nonumber\s*\}/gi, " ")
    // 참조식 링크의 주소 정의는 자료다. 본문에서 부른 이름은 글자만 남는다.
    .replace(/^\[[^\^\]][^\]]*\]:[ \t]*\S+.*$/gm, " ")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}[>#]+\s*/gm, " ")
    // 알림 상자의 이름표와 할 일 상자. 상자 제목과 칸의 글은 글이므로
    // 표시만 걷는다.
    .replace(/^[ \t]*\[!\w+\][ \t]*/gm, " ")
    .replace(/^([ \t]*(?:[-*+]|\d+\.)[ \t]+)\[[ xX]\][ \t]+/gm, "$1")
    .replace(/\|/g, " ")
    // 줄 끊기 표시는 글이 아니다. 짝수 개는 글자로 쓴 역슬래시이므로
    // 아래 이스케이프 규칙이 가져간다.
    .replace(/(^|[^\\])\\[ \t]*$/gm, "$1 ")
    // 표시를 걷는 일과 밝혀 둔 표시를 글자로 남기는 일은 한 번에 본다.
    // 따로 돌리면 글자로 쓴 "*" 자리에 역슬래시만 남는다. 찾는 사람은 글에
    // 보이는 대로 치므로 역슬래시는 사라져야 한다.
    .replace(/\\([\\`*_{}[\]()#+\-.!|~^=:$])|[*`~]|==/g, (_, escaped) =>
      escaped === undefined ? "" : escaped,
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(value) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "") || "uncategorized"
  );
}

export function dateText(value) {
  return value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${value}T00:00:00Z`))
    : "";
}
