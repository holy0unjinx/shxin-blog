// Attribute reading shared by the table renderer and the chart renderer.
// Both write attributes as {key=value} and both need the same three
// behaviours: a value must come from a known set, a bare flag means "on",
// and an absent key must stay distinguishable from one switched off.

const OFF = new Set(["no", "off", "false", "0"]);

// Values are folded to lower case so that matching one against a set never
// depends on how it was typed. A few keys carry text meant to be read rather
// than matched — an axis name, a point annotation, the name of another
// series — and those keep the case they were written in, or a unit like
// W/m² comes back out of the renderer as w/m².
// A path and a file name are read by a filesystem, not matched against a set,
// so they keep the case they were written in.
const VERBATIM = new Set([
  "x-label",
  "y-label",
  "y2-label",
  "label",
  "fill-to",
  "src",
  "file",
]);

export function readAttrs(text) {
  const attrs = {};
  for (const part of String(text).split(/[,\s]+/)) {
    if (!part) continue;
    const [key, value = ""] = part.split("=");
    const name = key.trim().toLowerCase();
    attrs[name] = VERBATIM.has(name) ? value.trim() : value.trim().toLowerCase();
  }
  return attrs;
}

// Only a value from the allowed set survives, so a typo can never emit a
// class name that the stylesheet does not define.
export function pick(attrs, key, allowed, fallback = "") {
  const value = attrs[key];
  if (value === undefined) return "";
  if (value === "") return fallback;
  return allowed.has(value) ? value : fallback;
}

// A bare {bg} switches the flag on and {bg=no} switches it back off, so a
// cell can escape what its row or column asked for. An absent key stays
// undefined, which is how a cell > row > column chain knows to look one
// level further out.
export function flag(attrs, key) {
  const value = attrs[key];
  if (value === undefined) return undefined;
  return !OFF.has(value);
}

export function integer(attrs, key, fallback = 1) {
  const value = Number.parseInt(attrs[key] ?? "", 10);
  return Number.isInteger(value) && value > 1 ? value : fallback;
}
