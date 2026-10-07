// Figure, table, equation, listing and theorem numbers, and the cross
// references that name them.
//
// Numbers used to be typed into captions by hand, which meant inserting one
// figure renumbered every caption after it. Here the renderer counts, and the
// author writes a label:
//
//   : {#fig:ca-tree} CA 계층          ->  그림 3. CA 계층
//   본문에서 [@fig:ca-tree]를 보면    ->  본문에서 그림 3을 보면
//
// A reference can point forward, so numbers cannot be substituted while the
// body is being rendered: a reference leaves a marker and `resolve` fills the
// markers in once the whole document has been read.

import { esc } from "./escape.mjs";

// The marker character. It never appears in a manuscript — renderDocument
// strips it from the source before anything else runs — so a marker in the
// html is always one this module put there.
export const MARK = String.fromCharCode(2);

// Each kind counts on its own, and each names itself the way a reader expects
// to see it named. `fig` covers every figure: an image, a video, a chart and a
// diagram all share one series, which is what a reader counting figures down
// the page expects.
export const KINDS = new Map([
  ["fig", { name: "그림", captioned: true }],
  ["tbl", { name: "표", captioned: true }],
  ["eq", { name: "식", captioned: false }],
  ["lst", { name: "코드", captioned: false }],
  ["thm", { name: "정리", captioned: false }],
  ["lem", { name: "보조정리", captioned: false }],
  ["cor", { name: "따름정리", captioned: false }],
  ["prop", { name: "명제", captioned: false }],
  ["def", { name: "정의", captioned: false }],
  ["ex", { name: "예", captioned: false }],
  ["rem", { name: "참고", captioned: false }],
  // A section is the one kind that has no number of its own: the body does not
  // print heading numbers, so a reference to one carries the heading's words.
  ["sec", { name: "", captioned: false }],
]);

// A label is written {#fig:ca-tree} where it stands alone — a caption — and
// #fig:ca-tree where it shares a brace group with other attributes, as on a
// fence. Both spellings read the same, and the label is folded to lower case
// so that a reference never fails on how it was typed.
const LABEL = /#([a-z]+):([^}\s,]+)/i;
// Stripping takes the standalone form first, braces and all, so a caption is
// left with no empty pair of braces in it.
const LABEL_GROUP = /\{\s*#[a-z]+:[^}\s,]+\s*\}/gi;
const LABEL_BARE = /#[a-z]+:[^}\s,]+\s*,?/gi;
// { nonumber } opts a decorative figure out of the series, and plain
// "nonumber" does the same where attributes already share a brace group.
const NONUMBER = /\bnonumber\b/i;
const NONUMBER_GROUP = /\{\s*nonumber\s*\}/gi;
const NONUMBER_BARE = /\bnonumber\b\s*,?/gi;

// Pulls a label out of a caption or a fence's attributes and hands back the
// text with the label removed, so the caller can go on reading what is left.
export function takeLabel(text) {
  const source = String(text ?? "");
  const match = source.match(LABEL);
  const numbered = !NONUMBER.test(source);
  const rest = source
    .replace(LABEL_GROUP, " ")
    .replace(LABEL_BARE, " ")
    .replace(NONUMBER_GROUP, " ")
    .replace(NONUMBER_BARE, " ")
    .replace(/,\s*(?=[,}]|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!match) return { kind: "", label: "", numbered, rest };
  const kind = match[1].toLowerCase();
  return {
    kind: KINDS.has(kind) ? kind : "",
    label: match[2].toLowerCase(),
    numbered,
    rest,
  };
}

/**
 * `plain` strips markup from a caption for the list of figures — a caption is
 * markdown and a list of figures is a list of names. The renderer hands its
 * own stripper in; on its own this module leaves the text as it was written.
 */
export function createNumbering({ plain = String } = {}) {
  const counters = new Map();
  const entries = new Map();
  // 정의한 차례대로 붙는 일련번호와, 그것이 실제로 받은 번호. 둘을 나눠 두는
  // 것은 번호가 정의한 차례가 아니라 글에 실린 차례로 매겨지기 때문이다.
  const bySerial = new Map();
  const numbers = new Map();
  const duplicates = [];
  const requested = new Map();
  let serials = 0;

  // 이름표는 종류마다 따로 산다. 한 글에 {#fig:비용}과 {#tbl:비용}이 같이
  // 있어도 서로를 밀어내지 않아야 한다 — 부르는 자리가 종류를 함께 적으므로
  // 둘을 가릴 수 있다.
  const key = (kind, label) => `${kind}:${String(label).toLowerCase()}`;

  // 번호가 들어갈 자리. 렌더러는 이 자리표를 캡션과 id에 박아 두고, 글이 다
  // 조판된 뒤에 `assign`이 실린 차례대로 번호를 채운다. 그러지 않으면 번호는
  // 글에 실린 차례가 아니라 렌더러가 훑는 차례를 따른다 — 펜스가 먼저,
  // 그림과 파이프 표가 나중이라, 위에 있는 그림이 아래 그래프보다 큰 번호를
  // 받는 일이 생긴다.
  const numberToken = (serial) => `${MARK}!${serial}:#${MARK}`;

  const claim = (serial) => {
    if (numbers.has(serial)) return numbers.get(serial);
    const entry = bySerial.get(serial);
    if (!entry) return 0;
    const number = (counters.get(entry.kind) || 0) + 1;
    counters.set(entry.kind, number);
    numbers.set(serial, number);
    return number;
  };

  // An anchor id for a numbered thing. A labelled one gets a readable id;
  // an unlabelled one still needs somewhere for a permalink to land, and its
  // number is not known yet, so the id carries the same placeholder.
  const anchorId = (kind, label, serial) =>
    `${kind}-${label || numberToken(serial)}`;

  return {
    /**
     * Claims a place in `kind`'s series. `label` may be empty: a caption that
     * carries no label is still counted, it simply cannot be referenced. The
     * number itself is not decided here — see `assign`.
     */
    define(kind, label = "", text = "") {
      if (!KINDS.has(kind)) return null;
      const clean = String(label).toLowerCase();
      const serial = ++serials;
      const entry = {
        kind,
        label: clean,
        serial,
        // 캡션의 글. 그림·표 목록이 이것을 읽는다.
        text: plain(text),
        // 조판 시점에는 자리표다. `assign`이 지나가면 숫자 글자가 된다.
        number: numberToken(serial),
        name: KINDS.get(kind).name,
        id: anchorId(kind, clean, serial),
      };
      bySerial.set(serial, entry);
      if (clean) {
        if (entries.has(key(kind, clean))) duplicates.push({ kind, label: clean });
        else entries.set(key(kind, clean), entry);
      }
      return entry;
    },

    // A section is named by its words rather than by a number, so it is
    // recorded straight from the heading it sits on.
    defineSection(label, text, id) {
      if (!label) return null;
      const entry = {
        kind: "sec",
        label: String(label).toLowerCase(),
        serial: 0,
        number: 0,
        name: "",
        text,
        id,
      };
      if (entries.has(key("sec", entry.label)))
        duplicates.push({ kind: "sec", label: entry.label });
      else entries.set(key("sec", entry.label), entry);
      return entry;
    },

    /**
     * The marker a reference leaves behind. `bare` prints the number without
     * its name, for a sentence that already supplies one ("그림 1과 [@#fig:b]").
     */
    mark(kind, label, { bare = false } = {}) {
      const clean = String(label).toLowerCase();
      const asked = key(kind, clean);
      if (!requested.has(asked)) requested.set(asked, { kind, label: clean });
      return `${MARK}${bare ? "#" : ""}${kind}:${clean}${MARK}`;
    },

    // Every label a reference asked for that no definition ever claimed. The
    // linter reads this; the renderer only needs it to leave the text alone.
    missing() {
      return [...requested.values()].filter(
        ({ kind, label }) => !entries.has(key(kind, label)),
      );
    },

    duplicates() {
      return duplicates;
    },

    entries() {
      return [...entries.values()];
    },

    // 어떤 정의가 몇 번을 받았는지. `assign`이 지난 뒤에만 답이 있다.
    numberOf(entry) {
      return entry ? numbers.get(entry.serial) : undefined;
    },

    /**
     * The marker a "[toc:fig]" line leaves behind.
     *
     * The list cannot be built where it is written: the figures below it have
     * not been read yet, and neither have their numbers been handed out. So
     * the line leaves a marker and `fillLists` builds the list once the whole
     * document is numbered.
     */
    listMark(kind) {
      return KINDS.has(kind) ? `${MARK}*${kind}${MARK}` : "";
    },

    /**
     * Fills every list marker. Runs after `assign` — a list of figures is a
     * list of numbers, and until then nothing has one.
     */
    fillLists(html) {
      const pattern = new RegExp(`${MARK}\\*([a-z]+)${MARK}`, "g");
      return String(html).replace(pattern, (_, kind) => {
        const listed = [...bySerial.values()]
          .filter((entry) => entry.kind === kind && numbers.has(entry.serial))
          .sort((a, b) => numbers.get(a.serial) - numbers.get(b.serial));
        if (!listed.length) return "";
        const items = listed
          .map((entry) => {
            const number = numbers.get(entry.serial);
            const id = `${entry.kind}-${entry.label || number}`;
            const name = `${entry.name} ${number}.`;
            return (
              `<li><a href="#${esc(id)}">` +
              `<span class="block-list-number">${esc(name)}</span>` +
              `${entry.text ? ` ${esc(entry.text)}` : ""}</a></li>`
            );
          })
          .join("");
        return `<nav class="block-list block-list-${esc(kind)}"><ol>${items}</ol></nav>`;
      });
    },

    /**
     * Hands out the numbers, in the order the definitions actually appear in
     * the finished html. Runs once, before `resolve`.
     */
    assign(html) {
      const pattern = new RegExp(`${MARK}!(\\d+):#${MARK}`, "g");
      const source = String(html);
      for (const match of source.matchAll(pattern)) claim(Number(match[1]));
      const filled = source.replace(pattern, (_, serial) =>
        String(claim(Number(serial))),
      );
      // 자리표를 내놓지 않는 정의도 번호는 받아야 한다. 코드 블록이 그렇다 —
      // 번호를 툴바에 찍지 않지만 본문의 "[@lst:서버]"는 그 번호를 부른다.
      // 그런 것은 정의한 차례대로 남은 번호를 받는다. 한 계열 안에서 아무도
      // 번호를 찍지 않으면 정의한 차례가 곧 글에 실린 차례다.
      for (const serial of bySerial.keys()) claim(serial);
      return filled;
    },

    /**
     * Fills every marker in the finished html. An unknown label comes back as
     * the author wrote it, so a typo stays visible rather than vanishing.
     */
    resolve(html) {
      const pattern = new RegExp(
        `${MARK}(#?)([a-z]+):([^${MARK}]+)${MARK}`,
        "g",
      );
      return String(html).replace(pattern, (_, bare, kind, label) => {
        const entry = entries.get(key(kind, label));
        if (!entry) return esc(`[@${kind}:${label}]`);
        if (entry.kind === "sec")
          return `<a class="xref" href="#${esc(entry.id)}">${esc(entry.text)}</a>`;
        const number = numbers.get(entry.serial);
        // 정의는 있는데 번호가 없다면 그 블록이 글에 실리지 않았다는 뜻이다.
        if (number === undefined) return esc(`[@${kind}:${label}]`);
        const shown = bare ? String(number) : `${entry.name} ${number}`;
        return `<a class="xref" href="#${esc(entry.id)}">${esc(shown)}</a>`;
      });
    },
  };
}

/**
 * The number a captioned block wears, worked out from the caption text.
 *
 * `kind` is what the block is by default — a chart and an image are both
 * figures — and a label may override it, which is how a chart used as a table
 * of numbers can be numbered as one. Returns the anchor id, the printed
 * prefix ("그림 3.") and the caption with the label taken out of it.
 */
export function numberCaption(numbering, kind, caption, { force = false } = {}) {
  const { kind: written, label, numbered, rest } = takeLabel(caption);
  const none = { id: "", prefix: "", text: rest, entry: null };
  if (!numbering || !numbered) return none;
  // Nothing to number when the block carries neither a caption nor a label,
  // unless the caller says every one of its blocks is numbered.
  if (!force && !rest && !label) return none;
  const entry = numbering.define(written || kind, label, rest);
  if (!entry) return none;
  return {
    id: entry.id,
    prefix: `${entry.name} ${entry.number}.`,
    text: rest,
    entry,
  };
}
