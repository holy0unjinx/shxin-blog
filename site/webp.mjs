// WebP twins for the raster images a post points at, when this machine can
// make them.
//
// `sharp` is a native dependency and this repository does not carry one — the
// build has to run on a machine that never opened a compiler. So the step
// asks whether sharp is installed and does nothing when it is not: the same
// pages go out, carrying the images the author committed.
//
// When it is installed, every png and jpeg under `assets/` gets a `.webp`
// twin and each `<img>` pointing at one is wrapped in a `<picture>`. The
// original stays, and stays as the fallback, so a page never depends on the
// twin having been made — the same html works on both machines apart from one
// extra `<source>` line.

import { extname } from "node:path";

/**
 * sharp, or null.
 *
 * `load` is only there so a test can hand over a stand-in: pulling a native
 * module into the test run to check the code around it would be the same
 * dependency this module exists to avoid.
 */
export async function loadSharp(load = () => import("sharp")) {
  try {
    const module = await load();
    return module?.default ?? module ?? null;
  } catch {
    return null;
  }
}

// 사진만 굽는다. svg는 벡터라 굽을 것이 없고(이미 텍스트라 사전 압축이
// 맡는다), gif는 움직임을 지고 있으며, webp와 avif는 이미 그 자리에 있다.
const CONVERTIBLE = new Set([".png", ".jpg", ".jpeg"]);

export const convertible = (path) =>
  CONVERTIBLE.has(extname(String(path)).toLowerCase());

export const webpName = (path) =>
  String(path).replace(/\.[^.\/]+$/, "") + ".webp";

/**
 * The webp bytes for one image, or null when it is not worth having.
 *
 * A twin bigger than the original is not a twin worth writing: the page would
 * carry a second file and hand the reader the slower of the two.
 */
export async function toWebp(bytes, sharp, { quality = 82 } = {}) {
  if (!sharp) return null;
  try {
    const baked = await sharp(bytes).webp({ quality, effort: 5 }).toBuffer();
    return baked.length < bytes.length ? baked : null;
  } catch {
    // 읽지 못한 그림은 오류가 아니다. 원본이 그대로 나가고 페이지는 같다.
    return null;
  }
}

const IMG = /<img\b[^>]*>/g;

/**
 * Wraps every `<img>` whose source has a twin in a `<picture>`.
 *
 * `twins` answers for a src — a Set or a Map keyed by the address as it is
 * written in the html. An image with no twin is left exactly as it was.
 */
export function withPictureSources(html, twins) {
  if (!twins || twins.size === 0) return String(html);
  return String(html).replace(IMG, (tag) => {
    const src = tag.match(/\bsrc="([^"]*)"/)?.[1];
    if (!src || !twins.has(src)) return tag;
    return (
      `<picture><source srcset="${webpName(src)}" type="image/webp">` +
      `${tag}</picture>`
    );
  });
}
