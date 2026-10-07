// Delimited data files -> the same string[][] grid that a pipe fence produces.
//
// A table or a chart can point at a file instead of carrying its rows inline
// (`{src=data/subs.csv}`). Everything downstream already speaks the grid, so
// this module's whole job is to turn one text format into it. It reads no
// files itself: the caller hands over the text, which keeps render.mjs pure.

const DELIMITERS = new Map([
  [".csv", ","],
  [".tsv", "\t"],
  [".txt", "\t"],
]);

export function delimiterFor(path) {
  const name = String(path).toLowerCase();
  for (const [extension, delimiter] of DELIMITERS)
    if (name.endsWith(extension)) return delimiter;
  return null;
}

// RFC 4180 with two concessions to hand-written files: a "#" line is a
// comment, and a blank line is skipped rather than becoming an empty row.
// Both matter because these files are read by people too.
export function parseDelimited(text, delimiter = ",") {
  const source = String(text).replace(/^\ufeff/, "");
  const rows = [];
  let row = [];
  let field = "";
  // Three states, because a quote means a different thing in each: OPEN is
  // before any character of a field, INSIDE is within a quoted field, and
  // PLAIN is within a bare one.
  let state = "open";

  const endField = () => {
    row.push(state === "open" || state === "plain" ? field.trim() : field);
    field = "";
    state = "open";
  };
  const endRow = () => {
    endField();
    // A comment or a blank line carries no row. A blank line is what a single
    // empty field looks like by the time it gets here.
    const blank = row.length === 1 && row[0] === "";
    const comment = row.length > 0 && row[0].startsWith("#");
    if (!blank && !comment) rows.push(row);
    row = [];
  };

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (state === "inside") {
      if (char !== '"') {
        field += char;
        continue;
      }
      // "" is one quote; a lone quote ends the quoted part, and anything after
      // it on the same field is appended as it was written.
      if (source[i + 1] === '"') {
        field += '"';
        i++;
      } else state = "quoted";
      continue;
    }
    if (char === delimiter) {
      endField();
      continue;
    }
    if (char === "\r") continue;
    if (char === "\n") {
      endRow();
      continue;
    }
    if (char === '"' && state === "open") {
      state = "inside";
      continue;
    }
    if (state === "open") state = "plain";
    field += char;
  }
  // A file that does not end in a newline still ends a row.
  if (field !== "" || row.length || state !== "open") endRow();
  return rows;
}

// "2:20" keeps rows 2 through 20 counting from 1, the way an author counts
// lines in the file they are looking at. "2:" runs to the end.
export function sliceRows(rows, range) {
  if (!range) return rows;
  const match = String(range).match(/^(\d*):(\d*)$/);
  if (!match) return rows;
  const from = match[1] ? Math.max(1, Number(match[1])) : 1;
  const to = match[2] ? Number(match[2]) : rows.length;
  if (to < from) return rows;
  return rows.slice(from - 1, to);
}

// "1,3,4" keeps those columns in that order, so a wide export can be narrowed
// and reordered without editing the file.
export function pickColumns(rows, list) {
  if (!list) return rows;
  const wanted = String(list)
    .split(/[,;]/)
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((index) => Number.isInteger(index) && index > 0);
  if (!wanted.length) return rows;
  return rows.map((row) => wanted.map((index) => row[index - 1] ?? ""));
}

// The one entry the fences use: text plus the attributes written on the fence.
// Returns null when the path names a format this does not read, so the caller
// can fall back the way it falls back on any unreadable fence.
export function grid(path, text, { rows: range = "", columns = "" } = {}) {
  const delimiter = delimiterFor(path);
  if (!delimiter || typeof text !== "string") return null;
  const parsed = pickColumns(sliceRows(parseDelimited(text, delimiter), range), columns);
  return parsed.length ? parsed : null;
}
