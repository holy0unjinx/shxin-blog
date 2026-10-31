import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { initWasm, Resvg } from "@resvg/resvg-wasm";

let ready;

// resvg's WASM renderer accepts the site's WOFF2 files directly. Supplying
// them explicitly keeps the same typeface in the PNG without system fonts.
export async function ogPng(svg, fontBuffers) {
  ready ??= readFile(fileURLToPath(import.meta.resolve("@resvg/resvg-wasm/index_bg.wasm"))).then(initWasm);
  await ready;
  const card = new Resvg(svg, { font: { fontBuffers } });
  try {
    const rendered = card.render();
    try {
      return Buffer.from(rendered.asPng());
    } finally {
      rendered.free();
    }
  } finally {
    card.free();
  }
}
