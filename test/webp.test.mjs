import assert from "node:assert/strict";
import test from "node:test";

import {
  convertible,
  loadSharp,
  toWebp,
  webpName,
  withPictureSources,
} from "../site/webp.mjs";

test("a missing sharp is an answer, not a crash", async () => {
  assert.equal(
    await loadSharp(() => {
      throw new Error("Cannot find module 'sharp'");
    }),
    null,
  );
});

test("sharp is unwrapped from its module however it is exported", async () => {
  const fake = () => {};
  assert.equal(await loadSharp(async () => ({ default: fake })), fake);
  assert.equal(await loadSharp(async () => fake), fake);
});

test("only photographs are converted", () => {
  assert.ok(convertible("assets/a.png"));
  assert.ok(convertible("assets/A.JPG"));
  assert.ok(convertible("assets/a.jpeg"));
  assert.ok(!convertible("assets/a.svg"));
  assert.ok(!convertible("assets/a.gif"));
  assert.ok(!convertible("assets/a.webp"));
});

test("the twin keeps the name and changes the extension", () => {
  assert.equal(webpName("/assets/a.png"), "/assets/a.webp");
  assert.equal(webpName("/assets/one.more/a.jpeg"), "/assets/one.more/a.webp");
});

test("a twin bigger than the original is not written", async () => {
  const sharp = () => ({ webp: () => ({ toBuffer: async () => Buffer.alloc(50) }) });
  assert.equal(await toWebp(Buffer.alloc(40), sharp), null);
  assert.equal((await toWebp(Buffer.alloc(60), sharp)).length, 50);
});

test("an image sharp cannot read leaves the original alone", async () => {
  const sharp = () => {
    throw new Error("unsupported image format");
  };
  assert.equal(await toWebp(Buffer.alloc(60), sharp), null);
});

test("no sharp, no twin", async () => {
  assert.equal(await toWebp(Buffer.alloc(60), null), null);
});

test("an image with a twin is wrapped and keeps its own tag", () => {
  const html = '<figure><img src="/assets/a.png" alt="x" width="2" height="1"></figure>';
  assert.equal(
    withPictureSources(html, new Set(["/assets/a.png"])),
    '<figure><picture><source srcset="/assets/a.webp" type="image/webp">' +
      '<img src="/assets/a.png" alt="x" width="2" height="1"></picture></figure>',
  );
});

test("an image with no twin is left as it was", () => {
  const html = '<img src="/favicon.svg" alt="x">';
  assert.equal(withPictureSources(html, new Set(["/assets/a.png"])), html);
  assert.equal(withPictureSources(html, new Set()), html);
  assert.equal(withPictureSources(html, null), html);
});

test("only the images that have twins are wrapped", () => {
  const html = '<img src="/assets/a.png" alt="a"><img src="/assets/b.png" alt="b">';
  const out = withPictureSources(html, new Set(["/assets/b.png"]));
  assert.equal(out.match(/<picture>/g).length, 1);
  assert.match(out, /<source srcset="\/assets\/b\.webp"/);
});
