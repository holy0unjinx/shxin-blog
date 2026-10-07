// Intrinsic image size, read from the file's own header.
//
// An <img> with no width and height is laid out twice: once at zero height,
// and again when the bytes arrive and everything below it jumps. Writing the
// real numbers in fixes that, and the numbers are in the first few dozen
// bytes of every format this blog uses — no image library needed, which
// matters because one would be a native dependency and this site has none.
//
// Nothing here reads a file. The caller hands over the bytes.

const ascii = (bytes, start, length) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

function png(bytes) {
  // IHDR is always the first chunk: 8 bytes of signature, 4 of length, 4 of
  // type, then width and height as big-endian 32-bit.
  if (ascii(bytes, 12, 4) !== "IHDR") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function gif(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
}

function jpeg(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    // A frame header (SOF0..SOF15, minus the four that are not frames)
    // carries the size. Everything else is skipped by its own length.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
      return {
        width: view.getUint16(offset + 7),
        height: view.getUint16(offset + 5),
      };
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }
    offset += 2 + view.getUint16(offset + 2);
  }
  return null;
}

function webp(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const format = ascii(bytes, 12, 4);
  if (format === "VP8 ")
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    };
  if (format === "VP8L") {
    // 14 bits each, packed across four bytes after the one-byte signature.
    const bits = view.getUint32(21, true);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (format === "VP8X")
    return {
      width: (view.getUint16(24, true) | (bytes[26] << 16)) + 1,
      height: (view.getUint16(27, true) | (bytes[29] << 16)) + 1,
    };
  return null;
}

// AVIF and HEIC keep the size in an `ispe` box somewhere inside `meta`. The
// boxes nest, and walking them properly costs more than scanning for the one
// four-byte tag that matters — a false hit would have to be four exact bytes
// followed by a plausible pair of dimensions.
function iso(bytes) {
  // The tag plus the two dimensions it is followed by are 16 bytes, and the
  // scan must be able to reach a tag that close to the end.
  for (let i = 0; i + 16 <= bytes.length; i++) {
    if (ascii(bytes, i, 4) !== "ispe") continue;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(i + 8);
    const height = view.getUint32(i + 12);
    if (width > 0 && height > 0 && width < 1e6 && height < 1e6)
      return { width, height };
  }
  return null;
}

const NUMBER = /^\s*([\d.]+)\s*(px)?\s*$/;

// An SVG says its size in its own markup: width and height when it has them,
// or the last two numbers of the viewBox when it does not.
function svg(text) {
  const tag = String(text).match(/<svg\b[^>]*>/i);
  if (!tag) return null;
  const attribute = (name) =>
    tag[0].match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1];
  const width = attribute("width");
  const height = attribute("height");
  if (width && height && NUMBER.test(width) && NUMBER.test(height))
    return {
      width: Math.round(Number(width.match(NUMBER)[1])),
      height: Math.round(Number(height.match(NUMBER)[1])),
    };
  const box = attribute("viewbox") || attribute("viewBox");
  const numbers = (box || "").trim().split(/[\s,]+/).map(Number);
  if (numbers.length === 4 && numbers.every((value) => Number.isFinite(value)))
    return { width: Math.round(numbers[2]), height: Math.round(numbers[3]) };
  return null;
}

/**
 * The intrinsic size of one image, or null when the bytes are of a format
 * this does not read or are too short to hold a header. `bytes` is a Buffer
 * or Uint8Array; an SVG may be handed over as text.
 */
export function imageSize(bytes) {
  if (typeof bytes === "string") return svg(bytes);
  if (!bytes || bytes.length < 24) return null;
  const view = new Uint8Array(bytes.buffer || bytes, bytes.byteOffset || 0, bytes.length);
  const signature = ascii(view, 0, 4);
  try {
    if (view[0] === 0x89 && signature.slice(1) === "PNG") return png(view);
    if (signature.startsWith("GIF")) return gif(view);
    if (view[0] === 0xff && view[1] === 0xd8) return jpeg(view);
    if (signature === "RIFF" && ascii(view, 8, 4) === "WEBP") return webp(view);
    if (ascii(view, 4, 4) === "ftyp") return iso(view);
    if (/^\s*(<\?xml|<svg)/i.test(ascii(view, 0, Math.min(64, view.length))))
      return svg(new TextDecoder().decode(view));
  } catch {
    // A truncated file is not an error worth stopping a build for: the image
    // goes out without a size, and the linter says which one.
    return null;
  }
  return null;
}
