// BibTeX in, a numbered reference list out.
//
// The manuscript names a source by its key and the renderer does the
// counting, the same bargain the figure numbers strike:
//
//   본문에서 [@tls13]을 보면, [@tls13, 4절]과 [@rfc5280; @tls13]도 쓴다.
//
// Numbers follow first use, so inserting a citation renumbers nothing by
// hand. A key with no entry stays on the page as it was written — a typo has
// to be visible to be fixed.

import { esc } from "./escape.mjs";

// A field value is {braced}, "quoted" or a bare number. Braces nest, which is
// what protects {IETF} and {\LaTeX} from the case folding a style would
// otherwise apply, so the reader has to count them.
function readValue(source, start) {
  let i = start;
  while (i < source.length && /\s/.test(source[i])) i++;
  const open = source[i];
  if (open === "{" || open === '"') {
    const close = open === "{" ? "}" : '"';
    let depth = 0;
    let value = "";
    for (; i < source.length; i++) {
      const char = source[i];
      if (char === "{") {
        depth++;
        if (open === "{" && depth === 1) continue;
      } else if (char === "}") {
        depth--;
        if (open === "{" && depth === 0) {
          i++;
          break;
        }
      } else if (char === close && open === '"' && depth === 0) {
        if (value) {
          i++;
          break;
        }
        continue;
      }
      if (!(open === '"' && char === '"' && !value)) value += char;
    }
    return { value: value.trim(), next: i };
  }
  let value = "";
  for (; i < source.length; i++) {
    if (/[,}\n]/.test(source[i])) break;
    value += source[i];
  }
  return { value: value.trim(), next: i };
}

/**
 * Parses a .bib file. Entry keys are folded to lower case, as are field
 * names, because a citation should not fail on how a key was typed.
 */
export function parseBib(text) {
  const entries = new Map();
  const source = String(text ?? "");
  const pattern = /@(\w+)\s*[{(]\s*([^,\s}]+)\s*,/g;
  let match;
  while ((match = pattern.exec(source))) {
    const type = match[1].toLowerCase();
    // @string, @preamble and @comment carry no source.
    if (type === "string" || type === "preamble" || type === "comment") continue;
    const key = match[2].toLowerCase();
    const fields = {};
    let i = pattern.lastIndex;
    while (i < source.length) {
      while (i < source.length && /[\s,]/.test(source[i])) i++;
      if (source[i] === "}" || source[i] === ")" || i >= source.length) {
        i++;
        break;
      }
      const name = source.slice(i).match(/^([\w-]+)\s*=/);
      if (!name) break;
      i += name[0].length;
      const read = readValue(source, i);
      fields[name[1].toLowerCase()] = read.value.replace(/\s+/g, " ");
      i = read.next;
    }
    pattern.lastIndex = i;
    if (!entries.has(key)) entries.set(key, { key, type, ...fields });
  }
  return entries;
}

// "Rescorla, Eric" -> "Rescorla, E."  ·  "Eric Rescorla" -> "Rescorla, E."
// A name wrapped in braces in the source is a corporate author and is left
// exactly as it was written.
function shortenName(raw) {
  const name = raw.trim();
  if (!name) return "";
  if (/^\{.*\}$/.test(name)) return name.slice(1, -1).trim();
  const initial = (given) =>
    given
      .split(/[\s.]+/)
      .filter(Boolean)
      .map((part) => (part.length === 1 ? `${part}.` : `${part[0]}.`))
      .join(" ");
  if (name.includes(",")) {
    const [family, ...given] = name.split(",");
    const rest = given.join(",").trim();
    return rest ? `${family.trim()}, ${initial(rest)}` : family.trim();
  }
  const parts = name.split(/\s+/);
  if (parts.length === 1) return parts[0];
  const family = parts.pop();
  return `${family}, ${initial(parts.join(" "))}`;
}

/**
 * The author line, APA style: "Cooper, D., Santesson, S., & Farrell, S."
 *
 * Every name stays. A reference list is read to find a source, but it is also
 * the one place the people who wrote it are named, and APA cuts nobody until
 * twenty-one.
 */
export function formatAuthors(raw) {
  const names = String(raw || "")
    .split(/\s+and\s+/i)
    .map(shortenName)
    .filter(Boolean);
  if (!names.length) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1]}`;
}

const joinParts = (parts) => parts.filter(Boolean).join(" ");

// 목록의 이름은 "Rescorla, E."이지만 본문에 들어앉는 이름은 성뿐이다. 문장
// 한가운데 괄호로 서는 글이라 짧아야 하고, 어느 항목인지 가리기에는 성과
// 연도로 넉넉하다.
// 중괄호로 감싼 이름은 단체다. "{World Meteorological Organization}"에서 성을
// 찾겠다고 마지막 낱말을 떼면 "Organization"이 남는다 — 이름이 아니다.
function familyName(name) {
  const raw = String(name).trim();
  if (!raw) return "";
  if (/^\{.*\}$/.test(raw)) return raw.slice(1, -1).trim();
  const clean = raw.replace(/[{}]/g, "").trim();
  if (clean.includes(",")) return clean.split(",")[0].trim();
  const parts = clean.split(/\s+/);
  return parts[parts.length - 1];
}

export function citeNames(raw) {
  const names = String(raw || "")
    .split(/\s+and\s+/i)
    .map(familyName)
    .filter(Boolean);
  if (!names.length) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]}·${names[1]}`;
  return `${names[0]} 외`;
}

/**
 * The words a citation wears in a sentence: (Rescorla, 2018), and with a
 * locator (Knuth, 1984, 42쪽). A source with no author falls back to its
 * title, and one with neither to its key — something has to be printed, and
 * an empty pair of parentheses names nothing.
 */
export function citeLabel(entry, locator = "") {
  const names =
    citeNames(entry?.author || entry?.editor) ||
    unbrace(entry?.title) ||
    entry?.key ||
    "";
  return [names, entry?.year ? unbrace(entry.year) : "", locator]
    .filter(Boolean)
    .join(", ");
}

// Braces inside a value are BibTeX's way of protecting a word from a style's
// case folding. This blog applies no folding, so by the time a value is
// printed the braces have done their job and only get in the way.
const unbrace = (value) => String(value || "").replace(/[{}]/g, "").trim();

// 항목 하나를 APA 꼴로. 누가, 언제, 무엇을, 어디에.
//
//   Rescorla, E. (2018). The TLS 1.3 protocol. RFC, 8446.
//   Knuth, D. E. (1984). The TeXbook. Addison-Wesley.
//
// 기울임은 APA가 정한 자리에만 쓴다 — 단행본과 보고서의 제목, 학술지 이름과
// 권 번호. 이 종이가 색을 쓰지 않는 것과 같은 이유로, 기울임도 뜻이 있는
// 자리에만 선다.
const italic = (text) => `<em>${esc(text)}</em>`;

// 제목이 기울어 서는 종류. 그 자체로 한 권인 것들이다.
const STANDALONE = new Set([
  "book",
  "techreport",
  "phdthesis",
  "mastersthesis",
  "misc",
]);

function describe(entry) {
  const { type } = entry;
  const where = [];
  if (type === "article") {
    const volume = unbrace(entry.volume);
    const number = unbrace(entry.number);
    const journal = unbrace(entry.journal);
    // 학술지 이름과 권은 기울인다. 호는 괄호 안에 곧은 글씨로 붙고, 쪽수는
    // 같은 덩이에 쉼표로 이어진다 — 실린 자리는 한 문장이다.
    const head = [journal && italic(journal), volume && italic(volume)]
      .filter(Boolean)
      .join(", ");
    where.push(
      `${head}${volume && number ? `(${esc(number)})` : ""}` +
        `${!volume && number ? `, ${esc(number)}` : ""}` +
        `${entry.pages ? `, ${esc(`${unbrace(entry.pages)}쪽`)}` : ""}`,
    );
  } else if (type === "inbook") {
    where.push(
      entry.edition && esc(`${unbrace(entry.edition)} 판`),
      unbrace(entry.publisher) && esc(unbrace(entry.publisher)),
      unbrace(entry.address) && esc(unbrace(entry.address)),
    );
  } else if (type === "inproceedings" || type === "incollection") {
    where.push(
      entry.booktitle &&
        `In ${italic(unbrace(entry.booktitle))}` +
          (entry.pages ? ` (${esc(unbrace(entry.pages))}쪽)` : ""),
      unbrace(entry.publisher) && esc(unbrace(entry.publisher)),
    );
  } else if (type === "book") {
    where.push(
      unbrace(entry.publisher) && esc(unbrace(entry.publisher)),
      unbrace(entry.address) && esc(unbrace(entry.address)),
    );
  } else if (type === "techreport") {
    where.push(unbrace(entry.institution) && esc(unbrace(entry.institution)));
  } else if (type === "phdthesis" || type === "mastersthesis") {
    const kind = type === "phdthesis" ? "박사학위논문" : "석사학위논문";
    where.push(
      esc(`[${kind}${entry.school ? `, ${unbrace(entry.school)}` : ""}]`),
    );
  } else {
    where.push(
      unbrace(entry.howpublished) && esc(unbrace(entry.howpublished)),
      unbrace(entry.publisher) && esc(unbrace(entry.publisher)),
      unbrace(entry.institution) && esc(unbrace(entry.institution)),
    );
  }
  return where.filter(Boolean);
}

// 제목 바로 뒤에 마침표 없이 붙는 한정어. APA는 판과 보고서 번호를 제목의
// 일부로 본다 — "State of the global climate 2025 (WMO-No. 1391)."
function titleTail(entry) {
  if (entry.type === "book" && entry.edition)
    return ` (${esc(unbrace(entry.edition))} 판)`;
  if (entry.type === "techreport" && entry.number)
    return ` (보고서 ${esc(unbrace(entry.number))})`;
  return "";
}

/** The address a source lives at, or "" when it has none. */
export function entryUrl(entry) {
  const url =
    entry?.url || (entry?.doi ? `https://doi.org/${unbrace(entry.doi)}` : "");
  return /^https?:\/\//i.test(String(url)) ? String(url) : "";
}

/**
 * One reference list item, APA style.
 *
 * The address is not printed as a line of its own. The whole entry is the
 * link — a reference is one thing, and asking the reader to aim at a URL
 * tail when the whole line means the same thing is asking for nothing.
 */
export function formatEntry(entry) {
  const authors = formatAuthors(entry.author || entry.editor);
  // 해가 없는 출처는 APA대로 (n.d.)다. 빈자리로 두면 제목이 저자에 붙어
  // 한 덩이로 읽힌다.
  const year = `(${entry.year ? unbrace(entry.year) : "n.d."}).`;
  const title = unbrace(entry.title) || entry.key;
  const parts = [
    authors && `${esc(authors)}`,
    year && esc(year),
    STANDALONE.has(entry.type)
      ? `${italic(title)}${titleTail(entry)}.`
      : `${esc(title)}${titleTail(entry)}.`,
    ...describe(entry).map((part) => `${part}.`),
  ];
  return joinParts(parts);
}

/**
 * The sort key for a reference list. APA orders by author, and a source with
 * no author is filed under its title.
 */
export function sortKey(entry) {
  const first = String(entry?.author || entry?.editor || "").split(
    /\s+and\s+/i,
  )[0];
  return (
    familyName(first) ||
    unbrace(entry?.title) ||
    entry?.key ||
    ""
  ).toLowerCase();
}

// "[@a, 42쪽; @b]" -> two citations, the first carrying a locator.
export function parseCitation(inside) {
  return String(inside)
    .split(";")
    .map((part) => {
      const match = part.trim().match(/^@?\s*([^,\s]+)\s*(?:,\s*(.+))?$/);
      if (!match) return null;
      return { key: match[1].toLowerCase(), locator: (match[2] || "").trim() };
    })
    .filter(Boolean);
}

/**
 * The register a document keeps while it is being rendered: which sources
 * were cited, in what order, and which keys had no entry.
 */
export function createBibliography(entries = new Map(), ordinals = null) {
  const order = new Map();
  const unknown = new Set();
  return {
    /** The source behind a key, or undefined. */
    entry(key) {
      return entries.get(key);
    },
    /**
     * Whether this key has been cited already.
     *
     * The list links back to the first mention, so the first citation is the
     * one that has to carry the anchor — asked before `number` claims it.
     */
    cited(key) {
      return order.has(key);
    },
    /**
     * The number a key wears. Footnotes and sources share one list now, so
     * the ordinal is worked out before rendering starts and handed in;
     * without it the register counts citations on its own, which is what a
     * caller with no list to share still wants.
     */
    number(key) {
      if (!entries.has(key)) {
        unknown.add(key);
        return 0;
      }
      if (!order.has(key)) order.set(key, ordinals?.get(key) ?? order.size + 1);
      return order.get(key);
    },
    unknown() {
      return [...unknown];
    },
    /**
     * The sources this document cited, in the order it cited them.
     *
     * The ordinal is kept beside the entry rather than merged into it: a
     * BibTeX entry already has a `number` field — an RFC number, an issue
     * number — and merging would silently overwrite it.
     */
    used() {
      return [...order.keys()].map((key) => ({
        key,
        ordinal: order.get(key),
        entry: entries.get(key),
      }));
    },
  };
}
