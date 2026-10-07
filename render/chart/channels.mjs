// The three channels that tell one series from another without colour.
//
// The blog's palette is ink on paper and nothing else, so a chart separates
// its series the way a printed figure does: by line pattern, by marker shape,
// and by how dark a filled area is. Each channel cycles independently, so
// even past the end of one channel two series still differ in another.
//
// Shades are the ink colour at a reduced opacity rather than fixed greys.
// That way the same class works in both themes: black ink on white paper,
// white ink on black paper, no second palette to keep in step.

export const DASH_COUNT = 6;
export const SHADE_COUNT = 6;

const SHAPES = [
  "circle",
  "triangle",
  "square",
  "diamond",
  "plus",
  "cross",
  "triangle-down",
  "star",
];

const HATCH_ANGLES = [
  { id: 1, path: "M0,8 l8,-8", extra: "" },
  { id: 2, path: "M0,0 l8,8", extra: "" },
  { id: 3, path: "M0,8 l8,-8 M0,0 l8,8", extra: "" },
  { id: 4, path: "M0,4 l8,0", extra: "" },
  { id: 5, path: "M4,0 l0,8", extra: "" },
  { id: 6, path: "", extra: '<circle cx="4" cy="4" r="1.2"/>' },
];

export function dashClass(index) {
  return `dash-${(index % DASH_COUNT) + 1}`;
}

export function shadeClass(index) {
  return `shade-${(index % SHADE_COUNT) + 1}`;
}

export function markerShape(index) {
  return SHAPES[index % SHAPES.length];
}

/**
 * How a filled shape should be painted, given the series' fill mode. The
 * shade arrives as a class name rather than a ready-made attribute: an
 * element may only carry one class attribute, and a second one is dropped
 * without complaint, taking the fill with it.
 */
export function fillAttribute(index, mode, prefix) {
  if (mode === "none") return { className: "", attr: ' fill="none"' };
  if (mode === "hatch")
    return {
      className: "",
      attr: ` fill="url(#${prefix}-hatch-${(index % SHADE_COUNT) + 1})"`,
    };
  return { className: shadeClass(index), attr: "" };
}

/** The class and fill attributes for one filled shape, ready to interpolate. */
export function paint(base, index, mode, prefix) {
  const { className, attr } = fillAttribute(index, mode, prefix);
  return ` class="${className ? `${base} ${className}` : base}"${attr}`;
}

/** A marker centred on (x, y), sized by its bounding box. */
export function markerSvg(shape, x, y, size) {
  const r = size / 2;
  const round = (value) => Number(value.toFixed(2));
  const point = (dx, dy) => `${round(x + dx)},${round(y + dy)}`;
  switch (shape) {
    case "square":
      return `<rect x="${round(x - r)}" y="${round(y - r)}" width="${round(size)}" height="${round(size)}"/>`;
    case "triangle":
      return `<polygon points="${point(0, -r)} ${point(r, r)} ${point(-r, r)}"/>`;
    case "triangle-down":
      return `<polygon points="${point(0, r)} ${point(r, -r)} ${point(-r, -r)}"/>`;
    case "diamond":
      return `<polygon points="${point(0, -r)} ${point(r, 0)} ${point(0, r)} ${point(-r, 0)}"/>`;
    case "plus":
      return `<path class="chart-marker-stroke" d="M${point(-r, 0)} L${point(r, 0)} M${point(0, -r)} L${point(0, r)}"/>`;
    case "cross":
      return `<path class="chart-marker-stroke" d="M${point(-r, -r)} L${point(r, r)} M${point(-r, r)} L${point(r, -r)}"/>`;
    case "star": {
      const points = [];
      for (let i = 0; i < 10; i++) {
        const reach = i % 2 ? r * 0.45 : r;
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        points.push(point(Math.cos(angle) * reach, Math.sin(angle) * reach));
      }
      return `<polygon points="${points.join(" ")}"/>`;
    }
    default:
      return `<circle cx="${round(x)}" cy="${round(y)}" r="${round(r)}"/>`;
  }
}

/** The six hatch patterns, named so two charts on one page cannot collide. */
export function hatchDefs(prefix) {
  return HATCH_ANGLES.map(
    ({ id, path, extra }) =>
      `<pattern id="${prefix}-hatch-${id}" width="8" height="8" patternUnits="userSpaceOnUse">` +
      `${path ? `<path class="chart-hatch" d="${path}"/>` : ""}${extra}</pattern>`,
  ).join("");
}

/**
 * The legend mark for a line series: the line itself, at legend scale. The
 * dash may be given, for a series that named its own pattern rather than
 * taking the one its position hands out.
 */
export function swatchLine(index, marker, dash = "", stroked = true) {
  const line = stroked
    ? `<line class="chart-line ${dash || dashClass(index)}" x1="0" y1="0" x2="26" y2="0"/>`
    : "";
  return marker
    ? `${line}<g class="chart-marker">${markerSvg(marker, 13, 0, 7)}</g>`
    : line;
}

/** The legend mark for a filled series: a small swatch of the same fill. */
export function swatchBox(index, mode, prefix) {
  return `<rect x="0" y="-6" width="26" height="12"${paint("chart-area-edge", index, mode, prefix)}/>`;
}
