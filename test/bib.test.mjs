import assert from "node:assert/strict";
import test from "node:test";

import {
  createBibliography,
  entryUrl,
  formatAuthors,
  formatEntry,
  parseBib,
  parseCitation,
} from "../render/bib.mjs";
import { renderDocument } from "../render/index.mjs";

const SAMPLE = `
% a comment line outside an entry
@article{tls13,
  title   = {The TLS 1.3 Protocol},
  author  = {Rescorla, Eric},
  journal = {RFC},
  number  = {8446},
  year    = {2018},
  url     = {https://www.rfc-editor.org/rfc/rfc8446}
}

@book{texbook,
  author    = {Knuth, Donald E. and Lamport, Leslie},
  title     = {The {TeX}book},
  publisher = {Addison-Wesley},
  year      = 1984
}

@inproceedings{paper,
  author    = {Kim, Jisoo and Park, Minho and Lee, Suyeon and Choi, Hana},
  title     = {측정 결과},
  booktitle = {학회 논문집},
  pages     = {12--30},
  year      = {2021}
}

@misc{ietf, author = {{IETF}}, title = {Charter}, year = {2020}}
`;

test("every entry is read, and its key folded", () => {
  const bib = parseBib(SAMPLE);
  assert.deepEqual([...bib.keys()], ["tls13", "texbook", "paper", "ietf"]);
  assert.equal(bib.get("tls13").type, "article");
  assert.equal(bib.get("texbook").year, "1984");
});

test("a braced value keeps its inner braces until it is printed", () => {
  const bib = parseBib(SAMPLE);
  assert.equal(bib.get("texbook").title, "The {TeX}book");
  assert.match(formatEntry(bib.get("texbook")), /<em>The TeXbook<\/em>\./);
});

test("a quoted value is read too", () => {
  const bib = parseBib('@misc{a, title = "제목", year = "2020"}');
  assert.equal(bib.get("a").title, "제목");
});

test("a value spanning lines is folded to one line", () => {
  const bib = parseBib("@misc{a, title = {첫 줄\n  둘째 줄}}");
  assert.equal(bib.get("a").title, "첫 줄 둘째 줄");
});

test("@string and @comment carry no source", () => {
  const bib = parseBib('@string{rfc = "RFC"}\n@comment{x, y=1}\n@misc{a, title={t}}');
  assert.deepEqual([...bib.keys()], ["a"]);
});

test("the first definition of a key wins", () => {
  const bib = parseBib("@misc{a, title={첫째}}\n@misc{a, title={둘째}}");
  assert.equal(bib.get("a").title, "첫째");
});

test("given names are cut to initials and a family name is not", () => {
  assert.equal(formatAuthors("Rescorla, Eric"), "Rescorla, E.");
  assert.equal(formatAuthors("Donald E. Knuth"), "Knuth, D. E.");
  assert.equal(
    formatAuthors("Knuth, Donald E. and Lamport, Leslie"),
    "Knuth, D. E., & Lamport, L.",
  );
});

test("a corporate author keeps the name it was given", () => {
  assert.equal(formatAuthors("{IETF}"), "IETF");
});

test("every author is named, however many there are", () => {
  // APA는 스물한 사람까지 다 적는다. 참고문헌은 출처를 찾는 자리이면서
  // 그것을 쓴 사람들이 이름을 갖는 유일한 자리다.
  const bib = parseBib(SAMPLE);
  const authors = formatAuthors(bib.get("paper").author);
  assert.equal(authors, "Kim, J., Park, M., Lee, S., & Choi, H.");
});

test("a family name on its own survives", () => {
  assert.equal(formatAuthors("Rescorla"), "Rescorla");
  assert.equal(formatAuthors("Rescorla,"), "Rescorla");
});

test("an article with a number and no volume prints the number plainly", () => {
  const bib = parseBib(SAMPLE);
  assert.match(formatEntry(bib.get("tls13")), /<em>RFC<\/em>, 8446\./);
});

test("a volume takes its issue in parentheses", () => {
  const bib = parseBib("@article{a, title={t}, journal={J}, volume={7}, number={2}, pages={1--9}}");
  assert.match(
    formatEntry(bib.get("a")),
    /<em>J<\/em>, <em>7<\/em>\(2\), 1--9쪽\./,
  );
});

test("proceedings name where the paper appeared", () => {
  const bib = parseBib(SAMPLE);
  assert.match(
    formatEntry(bib.get("paper")),
    /In <em>학회 논문집<\/em> \(12--30쪽\)\./,
  );
});

test("the address is the entry's own, not a tail printed after it", () => {
  const bib = parseBib(SAMPLE);
  // 주소는 항목 글에 섞이지 않는다. 목록이 항목 전체를 링크로 감싼다.
  assert.ok(!formatEntry(bib.get("tls13")).includes("<a "));
  assert.equal(
    entryUrl(bib.get("tls13")),
    "https://www.rfc-editor.org/rfc/rfc8446",
  );
});

test("a doi is an address even with no url beside it", () => {
  const bib = parseBib("@article{a, title={t}, doi={10.1/xyz}}");
  assert.equal(entryUrl(bib.get("a")), "https://doi.org/10.1/xyz");
});

test("a source with no address anywhere is plain text in the list", () => {
  const { html } = renderDocument("[@texbook]", { bib: parseBib(SAMPLE) });
  assert.match(html, /<li id="bib-texbook">Knuth/);
});

test("a thesis says which kind it is", () => {
  const bib = parseBib("@phdthesis{a, title={t}, school={S}, year={2020}}");
  assert.match(formatEntry(bib.get("a")), /\[박사학위논문, S\]\./);
});

test("a citation splits into keys and locators", () => {
  assert.deepEqual(parseCitation("@a, 42쪽; @b"), [
    { key: "a", locator: "42쪽" },
    { key: "b", locator: "" },
  ]);
  assert.deepEqual(parseCitation("a"), [{ key: "a", locator: "" }]);
});

test("numbers follow first use, not the order of the file", () => {
  const register = createBibliography(parseBib(SAMPLE));
  assert.equal(register.number("texbook"), 1);
  assert.equal(register.number("tls13"), 2);
  assert.equal(register.number("texbook"), 1);
});

test("an unknown key claims no number and is reported", () => {
  const register = createBibliography(parseBib(SAMPLE));
  assert.equal(register.number("ghost"), 0);
  assert.deepEqual(register.unknown(), ["ghost"]);
});

test("a document that cited nothing prints no list", () => {
  const { html } = renderDocument("아무것도 부르지 않는다.", {
    bib: parseBib(SAMPLE),
  });
  assert.ok(!html.includes("<section class=\"notes\""));
});

test("a bib entry's own number field survives the ordinal beside it", () => {
  const { html } = renderDocument("[@tls13]", { bib: parseBib(SAMPLE) });
  assert.match(html, /<em>RFC<\/em>, 8446\./);
});

test("a citation in an article reads as author and year", () => {
  const bib = parseBib(SAMPLE);
  const { html } = renderDocument("[@tls13]을 보라.", { bib });
  assert.match(
    html,
    /<span class="cite">\(<a href="#bib-tls13" id="cite-tls13">Rescorla, 2018<\/a>\)<\/span>을 보라/,
  );
  assert.match(html, /<li id="bib-tls13"><a class="bib-link" [^>]*>Rescorla, E\. \(2018\)/);
});

test("a locator rides along inside the parentheses", () => {
  const bib = parseBib(SAMPLE);
  const { html } = renderDocument("[@texbook, 42쪽]", { bib });
  assert.match(html, /<a href="#bib-texbook" id="cite-texbook">Knuth·Lamport, 1984, 42쪽<\/a>/);
});

test("two sources in one bracket share it", () => {
  const bib = parseBib(SAMPLE);
  const { html } = renderDocument("[@tls13; @texbook]", { bib });
  assert.match(
    html,
    /\(<a href="#bib-tls13" id="cite-tls13">Rescorla, 2018<\/a>; <a href="#bib-texbook" id="cite-texbook">Knuth·Lamport, 1984<\/a>\)/,
  );
});

test("one unknown key leaves the whole citation as it was written", () => {
  const bib = parseBib(SAMPLE);
  const { html, bibliography } = renderDocument("[@tls13; @ghost]", { bib });
  assert.match(html, /\[@tls13; @ghost\]/);
  assert.deepEqual(bibliography.unknown(), ["ghost"]);
});

test("a cross reference is not read as a citation", () => {
  const bib = parseBib(SAMPLE);
  const { html } = renderDocument('[@fig:a]\n\n![x](/a.png "{#fig:a} 그림")', { bib });
  assert.match(html, /<a class="xref" href="#fig-a">그림 1<\/a>/);
  assert.doesNotMatch(html, /class="cite"/);
});

test("footnotes and sources keep their own lists in one shape", () => {
  const bib = parseBib(SAMPLE);
  const { html } = renderDocument(
    "각주[^a]와 [@tls13], 또 각주[^b]\n\n[^a]: 첫 주석\n[^b]: 둘째 주석",
    { bib },
  );
  assert.equal(html.match(/<section class="notes"/g).length, 2);
  assert.match(html, /<h2 id="notes" class="notes-title">주석<\/h2>/);
  assert.match(html, /<h2 id="references" class="notes-title">참고문헌<\/h2>/);
  assert.deepEqual(
    [...html.matchAll(/<li id="(fn-\d+)" value="(\d+)"/g)].map((m) => [m[1], m[2]]),
    [
      ["fn-1", "1"],
      ["fn-2", "2"],
    ],
  );
});

test("the reference list stands in author order, not citation order", () => {
  const bib = parseBib(SAMPLE);
  const { html } = renderDocument("[@tls13]과 [@texbook], [@paper]", { bib });
  assert.deepEqual(
    [...html.matchAll(/<li id="bib-([^"]+)"/g)].map((match) => match[1]),
    ["paper", "texbook", "tls13"],
  );
});

test("a heading cannot steal an anchor the two lists need", () => {
  const bib = parseBib(SAMPLE);
  const { html } = renderDocument(
    "## References\n\n## Notes\n\n[@tls13] x[^a]\n\n[^a]: n",
    { bib },
  );
  assert.match(html, /<h3 id="references-2">References<\/h3>/);
  assert.match(html, /<h3 id="notes-2">Notes<\/h3>/);
});

test("a citation inside inline code is code", () => {
  const bib = parseBib(SAMPLE);
  const { html } = renderDocument("`[@tls13]`", { bib });
  assert.match(html, /<code>\[@tls13\]<\/code>/);
});

test("with no bib at all a citation stays text", () => {
  const { html } = renderDocument("[@tls13]");
  assert.match(html, /\[@tls13\]/);
});

test("a citation works inside a sidenote", () => {
  const bib = parseBib(SAMPLE);
  const { html } = renderDocument("x[^^a]\n\n[^^a]: [@tls13]을 보라", { bib });
  assert.match(html, /class="sidenote".*class="cite"/s);
});

test("a source in the list points back to where it was cited", () => {
  const bib = parseBib(SAMPLE);
  const { html } = renderDocument("[@tls13]을 보라. 다시 [@tls13].", { bib });
  // 앵커는 처음 부른 자리에만 선다 — 한 문서에 같은 id가 두 번 설 수 없다.
  assert.equal(html.match(/id="cite-tls13"/g).length, 1);
  assert.match(
    html,
    /<li id="bib-tls13">.*<a href="#cite-tls13" aria-label="Back to reference">↩<\/a><\/li>/,
  );
});
