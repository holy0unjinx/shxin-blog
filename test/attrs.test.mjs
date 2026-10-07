import assert from "node:assert/strict";
import { test } from "node:test";

import { flag, integer, pick, readAttrs } from "../render/attrs.mjs";

test("readAttrs splits on commas and whitespace alike", () => {
  assert.deepEqual(readAttrs("span=2, align=Center bg"), {
    span: "2",
    align: "center",
    bg: "",
  });
});

test("readAttrs lowercases keys and values", () => {
  assert.deepEqual(readAttrs("Type=LINE"), { type: "line" });
});

test("pick returns the fallback for a bare key and empty for a missing one", () => {
  const allowed = new Set(["left", "right"]);
  assert.equal(pick({ align: "" }, "align", allowed, "left"), "left");
  assert.equal(pick({}, "align", allowed, "left"), "");
});

test("pick rejects a value outside the allowed set", () => {
  assert.equal(pick({ align: "sideways" }, "align", new Set(["left"]), ""), "");
});

test("flag distinguishes absent from switched off", () => {
  assert.equal(flag({}, "bg"), undefined);
  assert.equal(flag({ bg: "" }, "bg"), true);
  assert.equal(flag({ bg: "no" }, "bg"), false);
  assert.equal(flag({ bg: "0" }, "bg"), false);
});

test("integer keeps values above one and falls back otherwise", () => {
  assert.equal(integer({ span: "3" }, "span"), 3);
  assert.equal(integer({ span: "1" }, "span"), 1);
  assert.equal(integer({ span: "x" }, "span"), 1);
});

test("text meant to be read keeps the case it was written in", () => {
  // A set match should not care how it was typed, but an axis name is not a
  // set match: folding it would print a unit back as w/m².
  const attrs = readAttrs("align=CENTER y-label=W/m² label=Peak fill-to=Lower");
  assert.equal(attrs.align, "center");
  assert.equal(attrs["y-label"], "W/m²");
  assert.equal(attrs.label, "Peak");
  assert.equal(attrs["fill-to"], "Lower");
});
