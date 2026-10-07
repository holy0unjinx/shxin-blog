import assert from "node:assert/strict";
import test from "node:test";

import {
  createNumbering,
  KINDS,
  MARK,
  numberCaption,
  takeLabel,
} from "../render/numbering.mjs";

// 번호는 글이 다 조판된 뒤에 실린 차례대로 붙는다. 그러므로 무엇이 몇 번인지
// 묻는 시험은 조판된 글을 흉내 내어 `assign`을 한 번 지나야 한다.
const printed = (numbering, html) => numbering.resolve(numbering.assign(html));

test("a label is pulled out and the rest of the caption survives", () => {
  assert.deepEqual(takeLabel("{#fig:ca-tree} CA 계층 비교"), {
    kind: "fig",
    label: "ca-tree",
    numbered: true,
    rest: "CA 계층 비교",
  });
});

test("a label is matched however it was typed", () => {
  assert.equal(takeLabel("{#FIG:CA-Tree} x").label, "ca-tree");
  assert.equal(takeLabel("{#FIG:CA-Tree} x").kind, "fig");
});

test("an unknown kind is dropped rather than counted", () => {
  const taken = takeLabel("{#nope:x} 캡션");
  assert.equal(taken.kind, "");
  assert.equal(taken.rest, "캡션");
});

test("nonumber opts a caption out and leaves no marker in the text", () => {
  const taken = takeLabel("{nonumber} 장식");
  assert.equal(taken.numbered, false);
  assert.equal(taken.rest, "장식");
});

test("a caption with no label reports none", () => {
  assert.deepEqual(takeLabel("그냥 캡션"), {
    kind: "",
    label: "",
    numbered: true,
    rest: "그냥 캡션",
  });
});

test("each kind counts on its own series", () => {
  const numbering = createNumbering();
  const figure = numbering.define("fig");
  const table = numbering.define("tbl");
  const second = numbering.define("fig");
  const theorem = numbering.define("thm", "pyth");
  assert.equal(
    numbering.assign(
      [figure.number, table.number, second.number, theorem.number].join(" "),
    ),
    "1 1 2 1",
  );
});

test("numbers follow the order the blocks appear in, not the order they were defined", () => {
  const numbering = createNumbering();
  // 렌더러는 펜스를 먼저 훑고 그림을 나중에 훑는다. 글에서는 그림이 위에
  // 있으므로 그림이 1번이어야 한다.
  const fence = numbering.define("fig");
  const image = numbering.define("fig");
  assert.equal(numbering.assign(`${image.number} ${fence.number}`), "1 2");
});

test("the same label may name a figure and a table at once", () => {
  const numbering = createNumbering();
  const figure = numbering.define("fig", "cost");
  const table = numbering.define("tbl", "cost");
  assert.deepEqual(numbering.duplicates(), []);
  assert.equal(
    printed(
      numbering,
      `${figure.number}${table.number}${numbering.mark("tbl", "cost")}`,
    ),
    '11<a class="xref" href="#tbl-cost">표 1</a>',
  );
});

test("an unknown kind claims no number", () => {
  assert.equal(createNumbering().define("nope"), null);
});

test("a reference resolves to the name and number of its target", () => {
  const numbering = createNumbering();
  const marker = numbering.mark("fig", "ca-tree");
  const first = numbering.define("fig");
  const target = numbering.define("fig", "ca-tree");
  assert.equal(
    printed(numbering, `${first.number}${target.number}<p>${marker}</p>`).slice(2),
    '<p><a class="xref" href="#fig-ca-tree">그림 2</a></p>',
  );
});

test("a bare reference prints the number without its name", () => {
  const numbering = createNumbering();
  const marker = numbering.mark("fig", "a", { bare: true });
  const entry = numbering.define("fig", "a");
  assert.match(printed(numbering, entry.number + marker), />1</);
});

test("a reference to a label nobody defined stays as it was written", () => {
  const numbering = createNumbering();
  const marker = numbering.mark("fig", "ghost");
  assert.equal(numbering.resolve(marker), "[@fig:ghost]");
  assert.deepEqual(numbering.missing(), [{ kind: "fig", label: "ghost" }]);
});

test("a reference naming the wrong kind is left alone too", () => {
  const numbering = createNumbering();
  const marker = numbering.mark("tbl", "a");
  numbering.define("fig", "a");
  assert.equal(numbering.resolve(marker), "[@tbl:a]");
});

test("a section reference carries the heading's words", () => {
  const numbering = createNumbering();
  const marker = numbering.mark("sec", "setup");
  numbering.defineSection("setup", "CA 세우기", "ca-sewugi");
  assert.equal(
    numbering.resolve(marker),
    '<a class="xref" href="#ca-sewugi">CA 세우기</a>',
  );
});

test("the second use of a label is reported and the first one keeps the name", () => {
  const numbering = createNumbering();
  numbering.define("fig", "a");
  numbering.define("fig", "a");
  assert.deepEqual(numbering.duplicates(), [{ kind: "fig", label: "a" }]);
  assert.equal(numbering.entries().length, 1);
  assert.equal(numbering.assign(numbering.entries()[0].number), "1");
});

test("an unlabelled definition still gets somewhere to land", () => {
  const numbering = createNumbering();
  assert.equal(numbering.assign(numbering.define("fig").id), "fig-1");
});

test("html without markers is returned untouched", () => {
  assert.equal(createNumbering().resolve("<p>x</p>"), "<p>x</p>");
});

test("every kind names itself", () => {
  for (const [kind, { name }] of KINDS)
    assert.equal(typeof name, "string", kind);
  assert.equal(MARK.length, 1);
});

test("a captioned figure is numbered and the label leaves the text", () => {
  const numbering = createNumbering();
  const numbered = numberCaption(numbering, "fig", "{#fig:a} 연도별 증가");
  assert.equal(numbering.assign(numbered.prefix), "그림 1.");
  assert.equal(numbered.text, "연도별 증가");
  assert.equal(numbered.id, "fig-a");
});

test("a label may name a kind other than the block's own", () => {
  const numbering = createNumbering();
  assert.equal(
    numbering.assign(numberCaption(numbering, "fig", "{#tbl:a} x").prefix),
    "표 1.",
  );
});

test("a block with neither caption nor label is not numbered", () => {
  const numbering = createNumbering();
  assert.equal(numberCaption(numbering, "fig", "").prefix, "");
  assert.equal(numbering.entries().length, 0);
});

test("force numbers a block that has only a label to show for itself", () => {
  const numbering = createNumbering();
  assert.equal(
    numbering.assign(numberCaption(numbering, "thm", "", { force: true }).prefix),
    "정리 1.",
  );
});

test("nonumber keeps a captioned figure out of the series", () => {
  const numbering = createNumbering();
  const numbered = numberCaption(numbering, "fig", "{nonumber} 장식");
  assert.equal(numbered.prefix, "");
  assert.equal(numbered.text, "장식");
  assert.equal(
    numbering.assign(numberCaption(numbering, "fig", "다음").prefix),
    "그림 1.",
  );
});

test("a definition that prints no number still gets one to be called by", () => {
  const numbering = createNumbering();
  // 코드 블록은 번호를 찍지 않으므로 html에 자리표를 남기지 않는다.
  const listing = numbering.define("lst", "serve");
  const marker = numbering.mark("lst", "serve");
  assert.equal(
    printed(numbering, `<figure id="${listing.id}">${marker}</figure>`),
    '<figure id="lst-serve"><a class="xref" href="#lst-serve">코드 1</a></figure>',
  );
});
