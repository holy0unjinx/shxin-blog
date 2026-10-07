import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { imageSize } from "../render/image.mjs";
import { renderMarkdown } from "../render/index.mjs";

const fixture = (name) =>
  readFileSync(join(import.meta.dirname, "fixtures", name));

test("a png says its size in its first chunk", () => {
  assert.deepEqual(imageSize(fixture("box.png")), { width: 800, height: 450 });
});

test("a gif says its size in its screen descriptor", () => {
  assert.deepEqual(imageSize(fixture("box.gif")), { width: 120, height: 64 });
});

test("a jpeg says its size in its frame header", () => {
  assert.deepEqual(imageSize(fixture("box.jpg")), { width: 500, height: 300 });
});

test("all three webp flavours are read", () => {
  assert.deepEqual(imageSize(fixture("box-vp8x.webp")), { width: 640, height: 480 });
  assert.deepEqual(imageSize(fixture("box-vp8.webp")), { width: 200, height: 100 });
  assert.deepEqual(imageSize(fixture("box-vp8l.webp")), { width: 150, height: 100 });
});

test("an avif says its size in an ispe box", () => {
  assert.deepEqual(imageSize(fixture("box.avif")), { width: 1280, height: 720 });
});

test("an svg falls back to its viewBox", () => {
  assert.deepEqual(imageSize(fixture("box.svg")), { width: 240, height: 120 });
});

test("an svg prefers its own width and height", () => {
  assert.deepEqual(
    imageSize('<svg width="64px" height="32px" viewBox="0 0 10 10"></svg>'),
    { width: 64, height: 32 },
  );
});

test("an svg sized in percent falls back to the viewBox", () => {
  assert.deepEqual(
    imageSize('<svg width="100%" height="100%" viewBox="0 0 30 20"></svg>'),
    { width: 30, height: 20 },
  );
});

test("bytes of no known format are not guessed at", () => {
  assert.equal(imageSize(Buffer.alloc(40)), null);
  assert.equal(imageSize(Buffer.from("not an image at all, really")), null);
  assert.equal(imageSize(Buffer.alloc(4)), null);
  assert.equal(imageSize(null), null);
});

test("a file too short to hold a header is declined, not guessed at", () => {
  assert.equal(imageSize(fixture("box.png").subarray(0, 20)), null);
});

test("a png header is enough, even with the pixels missing", () => {
  // The size is in the first chunk, so a header-only read still answers.
  assert.deepEqual(imageSize(fixture("box.png").subarray(0, 24)), {
    width: 800,
    height: 450,
  });
});

test("a measured figure carries its size into the markup", () => {
  const html = renderMarkdown("![상자](/assets/box.png)", {
    measure: (src) => (src === "/assets/box.png" ? { width: 800, height: 450 } : null),
  });
  assert.match(
    html,
    /<img src="\/assets\/box\.png" alt="상자" width="800" height="450" loading="lazy" decoding="async">/,
  );
});

test("an image the caller cannot measure goes out without a size", () => {
  const html = renderMarkdown("![상자](/assets/box.png)", { measure: () => null });
  assert.doesNotMatch(html, /width=/);
  assert.match(html, /loading="lazy" decoding="async"/);
});

test("an inline image is measured too", () => {
  const html = renderMarkdown("글 ![상자](/a.png) 뒤", {
    measure: () => ({ width: 40, height: 20 }),
  });
  assert.match(html, /<img src="\/a\.png" alt="상자" width="40" height="20" loading="lazy" decoding="async">/);
});
