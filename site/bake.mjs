// Math and syntax highlighting, baked into the html at build time.
//
// Both used to happen in the browser: KaTeX and highlight.js came from a CDN
// and rewrote the page after it had already been painted. Doing it here buys
// three things. A reader with no JavaScript sees the formulas. Nothing is
// fetched from a third party. And the highlighting is ours, so the code block
// can follow this paper's one rule — no colour — instead of importing a
// palette from a theme built for a site that has one.
//
// This runs on the html renderDocument produced, not on the manuscript. That
// keeps render.mjs free of both dependencies and lets a build without them
// fall back to shipping the raw TeX and the plain code.

import { esc } from "../render/escape.mjs";

// The two packages are loaded on demand, so importing this module costs
// nothing until something is actually baked, and a build with neither
// installed still runs.
let katex = null;
let hljs = null;

async function loadKatex() {
  if (katex !== null) return katex;
  try {
    katex = (await import("katex")).default;
  } catch {
    katex = false;
  }
  return katex;
}

async function loadHighlight() {
  if (hljs !== null) return hljs;
  try {
    hljs = (await import("highlight.js")).default;
  } catch {
    hljs = false;
  }
  return hljs;
}

// The renderer escaped the source on its way into the element, so it has to be
// unescaped on its way back out. These five are the whole of what esc() does.
export function unescape(text) {
  return String(text)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

const MATH = /<(div|span) class="math math-(display|inline)">([\s\S]*?)<\/\1>/g;

/**
 * Replaces every math element's TeX with KaTeX's own markup.
 *
 * A formula KaTeX cannot read keeps its source on the page, wrapped so the
 * stylesheet can mark it: a build must not turn a typo in one formula into a
 * missing paragraph.
 */
export async function bakeMath(html) {
  const engine = await loadKatex();
  if (!engine) return { html, baked: 0, failed: [] };
  const failed = [];
  let baked = 0;
  const out = String(html).replace(MATH, (whole, tag, mode, body) => {
    const tex = unescape(body);
    try {
      const rendered = engine.renderToString(tex, {
        displayMode: mode === "display",
        throwOnError: true,
        strict: false,
        // MathML rides along with the visual markup. It is what a screen
        // reader reads and what a copy lands as; dropping it would trade a
        // formula that can be read aloud for a few kilobytes.
        output: "htmlAndMathml",
      });
      baked += 1;
      return `<${tag} class="math math-${mode} math-baked">${rendered}</${tag}>`;
    } catch (error) {
      failed.push({ tex, reason: error.message });
      return `<${tag} class="math math-${mode} math-raw">${esc(tex)}</${tag}>`;
    }
  });
  return { html: out, baked, failed };
}

const CODE = /<code class="language-([^"]*)">([\s\S]*?)<\/code>/g;

// 이 세 이름은 우리 문법이다. 읽히지 않아 코드 블록으로 떨어진 것이므로
// highlight.js가 모르는 것이 당연하고, 알릴 일은 renderDocument의
// `unreadable`이 이미 한다.
const OURS = new Set(["chart", "diagram", "table"]);

/**
 * Highlights every code element whose language highlight.js knows.
 *
 * An unknown language — and `text`, which is what a fence with no language
 * becomes — is left exactly as it was. Highlighting a plain block would only
 * invent structure that is not there.
 */
export async function bakeCode(html) {
  const engine = await loadHighlight();
  if (!engine) return { html, baked: 0, unknown: [] };
  const unknown = new Set();
  let baked = 0;
  const out = String(html).replace(CODE, (whole, language, body) => {
    if (language === "text" || !engine.getLanguage(language)) {
      if (language && language !== "text" && !OURS.has(language))
        unknown.add(language);
      return whole;
    }
    try {
      const { value } = engine.highlight(unescape(body), {
        language,
        ignoreIllegals: true,
      });
      baked += 1;
      return `<code class="language-${esc(language)} hljs">${value}</code>`;
    } catch {
      return whole;
    }
  });
  return { html: out, baked, unknown: [...unknown] };
}

/**
 * Both passes over one document.
 *
 * `math` and `code` say whether the page still needs anything from outside:
 * baked math needs KaTeX's stylesheet for its fonts, baked code needs
 * nothing at all.
 */
export async function bake(html) {
  const math = await bakeMath(html);
  const code = await bakeCode(math.html);
  return {
    html: code.html,
    math: math.baked > 0 || math.failed.length > 0,
    code: code.baked > 0,
    failed: math.failed,
    unknown: code.unknown,
  };
}
