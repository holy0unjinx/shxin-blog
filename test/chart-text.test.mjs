import assert from "node:assert/strict";
import { test } from "node:test";

import { lineHeight, textWidth } from "../render/chart/text.mjs";

test("an empty label takes no width", () => {
  assert.equal(textWidth("", 14), 0);
});

test("width scales with the font size", () => {
  assert.equal(textWidth("hello", 20) / textWidth("hello", 10), 2);
});

test("a Hangul label is wider than the same count of ASCII lowercase", () => {
  assert.ok(textWidth("가나다라", 14) > textWidth("abcd", 14));
});

test("narrow punctuation counts for less than lowercase", () => {
  assert.ok(textWidth("iiii", 14) < textWidth("oooo", 14));
});

test("uppercase counts for more than lowercase", () => {
  assert.ok(textWidth("OOOO", 14) > textWidth("oooo", 14));
});

test("width never shrinks when characters are appended", () => {
  let previous = 0;
  for (const text of ["2", "20", "200", "2000"]) {
    const width = textWidth(text, 14);
    assert.ok(width >= previous, `${text} shrank`);
    previous = width;
  }
});

test("a full-width digit counts as a full em, an ASCII digit less", () => {
  assert.ok(textWidth("１", 14) > textWidth("1", 14));
});

test("line height leaves room above and below the glyphs", () => {
  assert.ok(lineHeight(14) > 14);
  assert.ok(lineHeight(14) < 14 * 2);
});
