// Extended table syntax. Attributes are written as {key=value} in three
// places, and a bare flag like {bg} takes the default value:
//
//   : 표 1. 캡션 | n=120              <- caption above, optional right aside
//   | {bolder} 구분 | 루트 CA | 중간 CA |
//   | :----- | :---: {bg} | ------: |   <- column attributes
//   | 인증서 | {span=2} 자기 서명   || {border=thick}
//   | 상태   | {rows=2} 오프라인 | 온라인 | {bg}
//   | 비고   |            | 갱신 필요 |
//   : 출처: 내부 문서                 <- note below the table
//
// Cell attributes go at the start of a cell, row attributes after the row's
// last pipe, column attributes inside a separator cell. Cell wins over row,
// row wins over column. Every attribute, borders included, can be written at
// any of the three levels.
//
// There is no header row: every row renders as body cells. Emphasis is an
// attribute, so {bolder} on a column, a row or a cell is what makes text bold.

import { flag, integer, pick, readAttrs } from "./attrs.mjs";
import { grid } from "./data.mjs";
import { esc } from "./escape.mjs";
import { numberCaption } from "./numbering.mjs";

const ALIGN = new Set(["left", "center", "right"]);
const VALIGN = new Set(["top", "middle", "bottom"]);
const BORDER = new Set(["none", "thin", "thick", "two-lines"]);

const ATTRS_ONLY = /^\{([^}]*)\}$/;
const LEADING_ATTRS = /^\{([^}]*)\}\s*/;
const TRAILING_ATTRS = /\s*\{([^}]*)\}$/;

// Braces at the end of a cell are attributes only when every key inside is one
// the renderer knows. That keeps text that merely ends in braces literal.
const CELL_KEYS = new Set([
  "span",
  "rows",
  "align",
  "valign",
  "bg",
  "bolder",
  "border",
  "border-top",
  "border-left",
  "border-right",
]);
const RULE_CELL = /^:?-+:?$/;

export const TABLE_CAPTION = /^:\s+(.+)$/;

// The four border sides read the same way at every level, so a cell, a row
// and a column all accept the same names.
function borders(attrs) {
  return {
    border: pick(attrs, "border", BORDER),
    borderTop: pick(attrs, "border-top", BORDER),
    borderLeft: pick(attrs, "border-left", BORDER),
    borderRight: pick(attrs, "border-right", BORDER),
  };
}

// Splits on unescaped pipes only, so "\|" stays a literal character.
// Leading and trailing pipes are optional.
export function cells(line) {
  const body = line
    .trim()
    .replace(/^\|/, "")
    .replace(/(?<!\\)\|$/, "");
  const out = [];
  let current = "";
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "\\" && (body[i + 1] === "|" || body[i + 1] === "\\")) {
      current += body[i + 1];
      i++;
      continue;
    }
    if (body[i] === "|") {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += body[i];
  }
  out.push(current.trim());
  return out;
}

// A row's attributes sit after its final pipe, where no cell content can be.
export function splitRow(line) {
  const trimmed = line.trim();
  let last = -1;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === "\\") {
      i++;
      continue;
    }
    if (trimmed[i] === "|") last = i;
  }
  if (last === -1) return { body: trimmed, attrs: {} };
  const tail = trimmed.slice(last + 1).trim();
  const match = tail.match(ATTRS_ONLY);
  if (!match) return { body: trimmed, attrs: {} };
  return { body: trimmed.slice(0, last + 1), attrs: readAttrs(match[1]) };
}

export function isTableRule(line) {
  if (typeof line !== "string" || !line.includes("|")) return false;
  const parts = cells(splitRow(line).body);
  return (
    parts.length > 0 &&
    parts.every((part) => RULE_CELL.test(part.replace(/\{[^}]*\}/, "").trim()))
  );
}

export function isTableRow(line) {
  return (
    typeof line === "string" &&
    line.includes("|") &&
    !isTableRule(line) &&
    !TABLE_CAPTION.test(line.trim())
  );
}

function columnAttributes(line) {
  return cells(splitRow(line).body).map((part) => {
    const brace = part.match(/\{([^}]*)\}/);
    const attrs = brace ? readAttrs(brace[1]) : {};
    const dashes = part.replace(/\{[^}]*\}/, "").trim();
    const left = dashes.startsWith(":");
    const right = dashes.endsWith(":");
    const align = left && right ? "center" : right ? "right" : left ? "left" : "";
    return {
      align: pick(attrs, "align", ALIGN) || align,
      valign: pick(attrs, "valign", VALIGN),
      bg: flag(attrs, "bg"),
      bolder: flag(attrs, "bolder"),
      ...borders(attrs),
    };
  });
}

// Unescapes the "\\|" an author writes to keep a literal pipe out of the
// caption splitter and out of the cell splitter.
function unescapePipes(text) {
  return text.replace(/\\([|\\])/g, "$1");
}

// A caption above the table may carry a right-aligned aside after an
// unescaped pipe:  ": 표 1. 캡션 | n=120".
export function splitCaption(text) {
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\" && (text[i + 1] === "|" || text[i + 1] === "\\")) {
      i++;
      continue;
    }
    if (text[i] === "|")
      return {
        main: unescapePipes(text.slice(0, i).trim()),
        aside: unescapePipes(text.slice(i + 1).trim()),
      };
  }
  return { main: unescapePipes(text.trim()), aside: "" };
}

// A cell may carry its attributes at either end: "{bolder} 2.1" and
// "2.1 {bolder}" mean the same thing. When a key is written at both ends the
// trailing one wins, since it is the one closest to the row's own attributes.
function readCell(text) {
  const lead = text.match(LEADING_ATTRS);
  let body = lead ? text.slice(lead[0].length) : text;
  const attrs = lead ? readAttrs(lead[1]) : {};

  const tail = body.match(TRAILING_ATTRS);
  const tailAttrs = tail ? readAttrs(tail[1]) : {};
  const tailKeys = Object.keys(tailAttrs);
  const trailing =
    tailKeys.length > 0 && tailKeys.every((key) => CELL_KEYS.has(key));
  if (trailing) {
    body = body.slice(0, tail.index);
    Object.assign(attrs, tailAttrs);
  }

  const match = lead || trailing;
  return {
    text: body,
    span: integer(attrs, "span"),
    rows: integer(attrs, "rows"),
    align: pick(attrs, "align", ALIGN),
    valign: pick(attrs, "valign", VALIGN),
    bg: flag(attrs, "bg"),
    bolder: flag(attrs, "bolder"),
    ...borders(attrs),
    explicit: Boolean(match),
  };
}

function readRow(line) {
  const { body, attrs } = splitRow(line);
  return {
    cells: cells(body).map(readCell),
    align: pick(attrs, "align", ALIGN),
    valign: pick(attrs, "valign", VALIGN),
    bg: flag(attrs, "bg"),
    bolder: flag(attrs, "bolder"),
    ...borders(attrs),
  };
}

// A blank cell that only exists to keep the source grid aligned is not
// content. Both a colspan and a rowspan swallow the placeholders they cover,
// so an author may write one pipe per column and let the spans do the work.
function isPlaceholder(cell) {
  return Boolean(cell) && cell.text === "" && !cell.explicit;
}

// Cells a row occupies once its spans have absorbed their placeholders.
function rowWidth(row) {
  let width = 0;
  for (let i = 0; i < row.cells.length; i++) {
    const cell = row.cells[i];
    width += cell.span;
    let swallow = cell.span - 1;
    while (swallow > 0 && isPlaceholder(row.cells[i + 1])) {
      i++;
      swallow--;
    }
  }
  return width;
}

function classAttribute(names) {
  const list = names.filter(Boolean);
  return list.length ? ` class="${list.join(" ")}"` : "";
}

// True when lines[start] begins a table, whichever side of the separator the
// first row sits on. The paragraph scanner uses this so a first row without
// outer pipes is not swallowed into the paragraph above it.
export function startsTable(lines, start) {
  if (start >= lines.length) return false;
  return (
    (isTableRow(lines[start]) && isTableRule(lines[start + 1] || "")) ||
    (isTableRule(lines[start]) && isTableRow(lines[start + 1] || ""))
  );
}

/**
 * Renders one table starting at `lines[start]`.
 * Returns [html, nextIndex] or null when no table begins there.
 */
export function renderTable(lines, start, inline, captionAbove = "", options = {}) {
  if (!startsTable(lines, start)) return null;
  let i = start;
  // The separator may sit on the first line or the second; either way it only
  // carries column attributes. No row is a header row.
  const ruleSecond = isTableRow(lines[i]) && isTableRule(lines[i + 1] || "");

  const columnDefaults = columnAttributes(ruleSecond ? lines[i + 1] : lines[i]);
  const rows = [];
  if (ruleSecond) rows.push(readRow(lines[i]));
  i += ruleSecond ? 2 : 1;
  while (i < lines.length && isTableRow(lines[i])) {
    rows.push(readRow(lines[i]));
    i++;
  }

  let captionBelow = "";
  const below = (lines[i] || "").trim().match(TABLE_CAPTION);
  if (below) {
    captionBelow = below[1];
    i++;
  }

  const columns = Math.max(columnDefaults.length, ...rows.map(rowWidth));

  const grid = rows.map(() => new Array(columns).fill(false));
  const rendered = rows.map(() => []);

  rows.forEach((row, r) => {
    let pointer = 0;
    let column = 0;
    while (column < columns) {
      if (grid[r][column]) {
        // Covered by a rowspan from above. A blank placeholder left there to
        // keep the source grid aligned is swallowed rather than shifted.
        const next = row.cells[pointer];
        if (next && next.text === "" && !next.explicit) pointer++;
        column++;
        continue;
      }
      const cell = row.cells[pointer++] || readCell("");
      const span = Math.min(cell.span, columns - column);
      let swallow = span - 1;
      while (swallow > 0 && isPlaceholder(row.cells[pointer])) {
        pointer++;
        swallow--;
      }
      const depth = Math.min(cell.rows, rows.length - r);
      // A rowspan ends where its last row ends, so its bottom line comes from
      // that row's {border}, not from the row the cell was written in.
      const endIndex = r + depth - 1;
      const endRow = rows[endIndex];
      for (let rr = r; rr < r + depth; rr++)
        for (let cc = column; cc < column + span; cc++) grid[rr][cc] = true;

      const fallback = columnDefaults[column] || {};
      const align = cell.align || row.align || fallback.align || "";
      const valign = cell.valign || row.valign || fallback.valign || "";
      const bg = cell.bg ?? row.bg ?? fallback.bg ?? false;
      const bolder = cell.bolder ?? row.bolder ?? fallback.bolder ?? false;
      // Every side resolves cell > row > column, same as the other attributes.
      // The bottom asks the row the cell ends in, not the one it starts in.
      // The table opens and closes on a thick rule and sets its first row off
      // with a double thin one; anything written down overrides that.
      const borderTop =
        cell.borderTop ||
        row.borderTop ||
        fallback.borderTop ||
        (r === 0 ? "thick" : "");
      const borderBottom =
        cell.border ||
        endRow.border ||
        fallback.border ||
        (endIndex === rows.length - 1
          ? "thick"
          : endIndex === 0
            ? "two-lines"
            : "");
      const borderLeft =
        cell.borderLeft || row.borderLeft || fallback.borderLeft || "";
      const borderRight =
        cell.borderRight || row.borderRight || fallback.borderRight || "";
      rendered[r].push(
        `<td${span > 1 ? ` colspan="${span}"` : ""}${depth > 1 ? ` rowspan="${depth}"` : ""}` +
          classAttribute([
            align && `align-${align}`,
            valign && `valign-${valign}`,
            bg && "bg-mark",
            bolder && "bolder",
            borderTop && `border-top-${borderTop}`,
            borderBottom && `border-${borderBottom}`,
            borderLeft && `border-left-${borderLeft}`,
            borderRight && `border-right-${borderRight}`,
          ]) +
          `>${inline(cell.text)}</td>`,
      );
      column += span;
    }
  });

  // Borders live on the cells, not the row, so a rowspan carries the line all
  // the way across instead of stopping at the column it was written in.
  const rowHtml = rows.map((_, r) => `<tr>${rendered[r].join("")}</tr>`);

  // The caption keeps display:table-caption so its box still spans the table;
  // the flex row that pushes the aside to the right lives one level in.
  // The number is claimed before the caption is split, so the label is gone by
  // the time the words are read.
  const numbered = numberCaption(options.numbering, "tbl", captionAbove);
  const { main, aside } = splitCaption(numbered.text);
  const caption =
    numbered.prefix || numbered.text
      ? `<caption><div class="caption-row"><span class="caption-text">` +
        `${numbered.prefix ? `<span class="caption-number">${esc(numbered.prefix)}</span> ` : ""}` +
        `${inline(main)}</span>` +
        `${aside ? `<span class="caption-aside">${inline(aside)}</span>` : ""}</div></caption>`
      : "";

  const html =
    `<div class="table-wrap"${numbered.id ? ` id="${esc(numbered.id)}"` : ""}>` +
    `<table>${caption}<tbody>${rowHtml.join("")}</tbody></table>` +
    `${captionBelow ? `<p class="table-note">${inline(captionBelow)}</p>` : ""}` +
    `</div>`;

  return [html, i];
}

/**
 * A `table` fence that reads its rows from a data file.
 *
 *   ```table {src=data/ca.csv, row-range=1:20, columns=1,3}
 *   : {#tbl:ca} CA 계층 비교
 *   ```
 *
 * The body carries the captions only; the grid comes from the file. Returns
 * null when the file cannot be read, and the caller lets the fence fall
 * through to a code block the way an unreadable chart does.
 */
export function renderDataTable(lang, body, inline, options = {}) {
  const brace = String(lang).match(/\{([^}]*)\}/);
  const attrs = brace ? readAttrs(brace[1]) : {};
  if (!attrs.src) return null;
  const text = options.resolve?.(attrs.src);
  if (typeof text !== "string") return null;
  const rows = grid(attrs.src, text, {
    rows: attrs["row-range"] || "",
    columns: attrs.columns || "",
  });
  if (!rows) return null;

  let captionAbove = "";
  let captionBelow = "";
  for (const line of String(body).split(/\r?\n/)) {
    const caption = line.trim().match(TABLE_CAPTION);
    if (!caption) continue;
    if (captionAbove) captionBelow = caption[1];
    else captionAbove = caption[1];
  }

  // A cell out of a data file is data, not markup, so a stray pipe in it is
  // escaped before it reaches the grid splitter.
  const width = Math.max(...rows.map((row) => row.length));
  const lines = rows.map(
    (row) => `| ${row.map((cell) => cell.replace(/\|/g, "\\|")).join(" | ")} |`,
  );
  // The grid parser wants a separator line, which is where column attributes
  // are written. A data file carries none, so an empty one goes in: the fence
  // can still write them once, in {column-attrs=...}.
  const columnAttrs = (attrs["column-attrs"] || "")
    .split(/[;]/)
    .map((part) => part.trim())
    .filter(Boolean);
  lines.splice(
    1,
    0,
    `| ${Array.from({ length: width }, (_, index) =>
      columnAttrs[index] ? `--- {${columnAttrs[index]}}` : "---",
    ).join(" | ")} |`,
  );
  if (captionBelow) lines.push(`: ${captionBelow}`);
  const rendered = renderTable(lines, 0, inline, captionAbove, options);
  return rendered ? rendered[0] : null;
}
