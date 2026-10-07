import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { GROUPS, plain, STARTER, writePage } from "../site/editor.mjs";
import { parseBib } from "../render/bib.mjs";
import { imageSize } from "../render/image.mjs";
import { frontmatter, renderDocument } from "../render/index.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// 팔레트는 저장소의 진짜 파일을 가리킨다(data/*.csv, /assets/sample.png).
// 빌드가 하는 그대로 읽어야 조각이 실제로 무엇이 되는지 알 수 있다.
const inside = (path) => {
  const full = resolve(root, String(path).replace(/^\/+/, ""));
  return full === root || full.startsWith(root + sep) ? full : null;
};
const readText = (path) => {
  const full = inside(path);
  try {
    return full ? readFileSync(full, "utf8") : null;
  } catch {
    return null;
  }
};
const measure = (src) => {
  const full = inside(src.split(/[?#]/)[0]);
  try {
    return full ? imageSize(readFileSync(full)) : null;
  } catch {
    return null;
  }
};
const bib = parseBib(readText("refs.bib") || "");

const render = (source) =>
  renderDocument(source, { resolve: readText, measure, bib });

const items = GROUPS.flatMap((group) =>
  group.items.map((item) => ({ ...item, group: group.name })),
);

// 펜스로 시작하는 조각의 언어. 우리 문법 셋(chart/diagram/table)은 읽히지
// 않으면 코드 블록으로 조용히 떨어지므로, 어느 쪽이 되었는지를 따로 본다.
const fenceLanguage = (snippet) =>
  snippet.match(/^```(\w+)/)?.[1] ?? "";

test("팔레트에 빈 자리가 없다", () => {
  assert.ok(GROUPS.length > 0);
  for (const group of GROUPS) {
    assert.ok(group.name, "그룹에 이름이 없다");
    assert.ok(group.items.length > 0, `${group.name}이 비었다`);
    for (const item of group.items) {
      assert.ok(item.label, `${group.name}에 이름 없는 항목이 있다`);
      assert.ok(item.snippet, `${item.label}에 조각이 없다`);
    }
  }
});

test("이름이 겹치는 항목이 없다", () => {
  for (const group of GROUPS) {
    const labels = group.items.map((item) => item.label);
    assert.equal(new Set(labels).size, labels.length, `${group.name}에 같은 이름이 둘`);
  }
});

// 이 시험이 이 파일의 전부다. 팔레트가 "이렇게 쓰면 된다"고 말하는 것을
// 렌더러에 그대로 먹여, 말한 대로 되는지 본다. 문법이 바뀌었는데 조각이
// 그대로면 여기서 깨진다.
for (const item of items)
  test(`${item.group} · ${item.label} — 조각이 읽힌다`, () => {
    const source = plain(item.snippet);
    const document = render(source);
    assert.deepEqual(
      document.unreadable,
      [],
      `읽지 못해 코드 블록으로 떨어졌다: ${document.unreadable.join(", ")}`,
    );
    assert.deepEqual(
      document.missingFiles,
      [],
      `없는 파일을 가리킨다: ${document.missingFiles.join(", ")}`,
    );
    // 정의만 있는 조각(각주 정의, [toc:fig] 등)은 짝이 없으면 아무것도
    // 그리지 않는 것이 맞다. 그 밖의 조각은 반드시 무언가가 되어야 한다.
    if (!item.quiet)
      assert.notEqual(document.html.trim(), "", "아무것도 그리지 않았다");
  });

// 그래프와 다이어그램은 SVG가 되어야 한다. 타입 이름이 바뀌면 렌더러는
// 조용히 코드 블록으로 물러나므로, 위의 unreadable 검사와 함께 이것이
// 팔레트의 그래프 17종·다이어그램 4종을 실제로 한 번씩 그려 본다.
for (const item of items.filter(
  (candidate) => fenceLanguage(candidate.snippet) === "chart" ||
    fenceLanguage(candidate.snippet) === "diagram",
))
  test(`${item.group} · ${item.label} — SVG가 된다`, () => {
    const { html } = render(plain(item.snippet));
    assert.match(html, /<svg/, "SVG가 아니다");
    assert.doesNotMatch(html, /<code class="language-(chart|diagram)"/);
  });

for (const item of items.filter(
  (candidate) =>
    candidate.group === "표" && !candidate.snippet.startsWith("```"),
))
  test(`표 · ${item.label} — 표가 된다`, () => {
    const { html } = render(plain(item.snippet));
    assert.match(html, /<table/);
  });

test("csv에서 읽는 표가 자료 파일을 읽는다", () => {
  const item = items.find(
    (candidate) => candidate.group === "표" && candidate.label === "csv에서 읽기",
  );
  const { html } = render(plain(item.snippet));
  assert.match(html, /<table/);
  assert.doesNotMatch(html, /<code class="language-table"/);
});

test("알림 상자와 정리 환경이 제 상자가 된다", () => {
  for (const item of items.filter((candidate) => candidate.group === "알림 상자")) {
    const { html } = render(plain(item.snippet));
    assert.match(html, /class="callout callout-/, item.label);
  }
  for (const item of items.filter((candidate) => candidate.group === "정리 환경")) {
    const { html } = render(plain(item.snippet));
    assert.match(html, /class="environment environment-/, item.label);
  }
});

test("그림과 자료 조각이 가리키는 파일이 저장소에 있다", () => {
  // 팔레트가 없는 그림을 권하면 글쓴이는 lint 오류부터 만난다. 영상과
  // 임베드는 빼 둔다 — 저장소에 표본 영상이 없고, 팔레트 예제 하나를 위해
  // 영상 파일을 두는 것은 값이 맞지 않는다. 그쪽은 링크 조각의
  // "https://example.com"과 같은 자리 표시다.
  for (const item of items) {
    for (const [, path] of plain(item.snippet).matchAll(/!\[[^\]]*\]\((\/assets\/[^\s")]+)/g))
      assert.ok(existsSync(join(root, path.slice(1))), `없는 그림: ${path}`);
    for (const [, path] of plain(item.snippet).matchAll(/src=(data\/[^,\s}]+)/g))
      assert.ok(existsSync(join(root, path)), `없는 자료 파일: ${path}`);
  }
});

test("새 글 앞머리가 빌드가 읽는 꼴이다", () => {
  const { data, body } = frontmatter(STARTER);
  assert.ok(data.title);
  assert.match(data.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(data.slug);
  assert.ok(data.description);
  assert.notEqual(body.trim(), "");
});

test("페이지가 제 조각을 다 담는다", () => {
  const html = writePage();
  assert.match(html, /<textarea class="write-text"/);
  assert.match(html, /class="write-slug"/);
  assert.match(html, /class="write-save"/);
  assert.match(html, /class="write-preview"/);
  for (const group of GROUPS) assert.ok(html.includes(group.name), group.name);
  // 버튼 하나에 자리 번호 하나.
  const buttons = [...html.matchAll(/data-at="(\d+)\.(\d+)"/g)];
  assert.equal(buttons.length, items.length);
});

test("내려보내는 조각이 팔레트와 같다", () => {
  const html = writePage();
  const json = html.match(
    /<script type="application\/json" class="write-snippets">([\s\S]*?)<\/script>/,
  )[1];
  // "</script>"가 태그를 닫지 못하게 막아 두었는지.
  assert.doesNotMatch(json, /<\/?script/i);
  const sent = JSON.parse(json.replace(/\\u003c/g, "<"));
  assert.equal(sent.starter, STARTER);
  assert.equal(sent.groups.length, GROUPS.length);
  for (const [index, group] of GROUPS.entries()) {
    assert.equal(sent.groups[index].name, group.name);
    assert.equal(sent.groups[index].items.length, group.items.length);
    for (const [at, item] of group.items.entries())
      assert.equal(sent.groups[index].items[at].snippet, item.snippet, item.label);
  }
});
