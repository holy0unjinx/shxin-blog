// Text measurement for a renderer with no DOM.
//
// SVG has no automatic layout: a chart's left margin has to be wide enough
// for its widest y tick label before a single glyph exists. At build time
// there is nothing to measure against, so widths are estimated from the
// characters themselves. Every estimate rounds up — a margin a few units too
// wide is invisible, a margin too narrow clips the label.

// Width of one character as a fraction of the font size. The blog sets a
// serif face for Latin text and a Korean serif for Hangul; both put CJK
// glyphs on a full-width em and Latin glyphs well under it.
const FULL_WIDTH = 1;
const UPPERCASE = 0.6;
const LOWERCASE = 0.5;
const NARROW = 0.28;

const NARROW_CHARS = new Set([
  ..."ijltfIr.,:;'\"`!|()[]{}/\\-",
  " ",
]);

// Hangul, Han, Kana, and the full-width Latin and punctuation blocks.
const FULL_WIDTH_RANGES = [
  [0x1100, 0x11ff],
  [0x2e80, 0xa4cf],
  [0xa960, 0xa97f],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe4f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
];

function isFullWidth(code) {
  return FULL_WIDTH_RANGES.some(([low, high]) => code >= low && code <= high);
}

function charWidth(char) {
  const code = char.codePointAt(0);
  if (isFullWidth(code)) return FULL_WIDTH;
  if (NARROW_CHARS.has(char)) return NARROW;
  if (char >= "A" && char <= "Z") return UPPERCASE;
  return LOWERCASE;
}

/**
 * Estimated width of `text` rendered at `fontSize` user units, with a safety
 * margin so a slightly heavier face than assumed still fits.
 */
export function textWidth(text, fontSize) {
  let ems = 0;
  for (const char of String(text)) ems += charWidth(char);
  return ems * fontSize * 1.08;
}

export function lineHeight(fontSize) {
  return fontSize * 1.4;
}
