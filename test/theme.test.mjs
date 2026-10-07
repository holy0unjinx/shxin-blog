import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  chromaOf,
  currentBlock,
  greyHex,
  lightnessOf,
  palette,
  RAMP,
  readTheme,
  reflect,
  ROLES,
  tokenBlock,
} from "../tools/theme.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const theme = await readTheme();
const css = readFileSync(join(root, "style.css"), "utf8");

// 대비비. 두 벌이 같은 값을 내는지 보는 데 쓴다.
function channel(hex) {
  const value = Number.parseInt(hex.slice(1, 3), 16) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
const contrast = (a, b) => {
  const [high, low] = [channel(a) + 0.05, channel(b) + 0.05].sort((x, y) => y - x);
  return high / low;
};

test("oklch에서 16진수로 가는 변환이 출처의 값을 그대로 되살린다", () => {
  // 밝은 벌이 이 변환 하나에 달려 있다. 어두운 벌은 theme.json에 16진수가
  // 적혀 있으므로, 같은 밝기를 넣어 같은 16진수가 나오는지로 검산할 수 있다.
  for (const name of RAMP) {
    const { oklch, hex } = theme.colors[name];
    assert.equal(greyHex(lightnessOf(oklch)), hex, name);
  }
});

test("사다리의 회색은 채도가 없다", () => {
  // 색을 쓰지 않는다는 규칙이 팔레트 안에서 지켜지는지. 채도가 끼면 위의
  // 변환도 틀리고(그 변환은 채도 0만 다룬다) 종이의 규칙도 깨진다.
  for (const name of RAMP)
    assert.equal(chromaOf(theme.colors[name].oklch), 0, name);
});

test("밝은 벌은 base와 text를 맞바꾸는 축의 반사다", () => {
  const { axis, lightness, dark, light } = palette(theme);
  assert.equal(axis, lightness.base + lightness.text);
  // 축이 맞바꾸는 두 자리.
  assert.equal(light.base, dark.text);
  assert.equal(light.text, dark.base);
  // 나머지도 같은 반사 하나로 나온다 — 손으로 고른 값이 없다.
  for (const name of RAMP)
    assert.equal(light[name], greyHex(reflect(lightness[name], axis)), name);
});

test("두 벌의 대비비가 거의 같다", () => {
  // 반사는 oklch의 밝기 차이를 보존한다. WCAG의 대비비는 sRGB 상대 휘도로
  // 재는 다른 자다 — 그래서 두 벌이 똑같은 값을 내지는 않는다. 축으로 삼은
  // base와 text만 정확히 같고(18.53), 나머지는 10% 안쪽에서 따라온다. 그
  // 정도면 한쪽만 읽기 좋은 일은 생기지 않는다.
  const { dark, light } = palette(theme);
  assert.equal(
    contrast(dark.text, dark.base).toFixed(4),
    contrast(light.text, light.base).toFixed(4),
    "축으로 삼은 두 자리는 정확히 같아야 한다",
  );
  for (const name of RAMP) {
    const inDark = contrast(dark[name], dark.base);
    const inLight = contrast(light[name], light.base);
    const drift = Math.abs(inDark - inLight) / Math.max(inDark, inLight);
    assert.ok(
      drift < 0.1,
      `${name}: 어두운 벌 ${inDark.toFixed(2)} vs 밝은 벌 ${inLight.toFixed(2)} (${(drift * 100).toFixed(1)}%)`,
    );
  }
});

test("본문과 물러난 글자가 두 벌 모두에서 읽힌다", () => {
  const { dark, light } = palette(theme);
  for (const [label, set] of [["어두운", dark], ["밝은", light]]) {
    assert.ok(contrast(set.text, set.base) >= 7, `${label} 벌의 본문`);
    // 날짜·라벨이 여기 선다. 작은 글자라 4.5를 넘어야 한다.
    assert.ok(contrast(set.subtext0, set.base) >= 4.5, `${label} 벌의 물러난 글자`);
    // 테두리는 3이면 된다.
    assert.ok(contrast(set.overlay0, set.base) >= 3, `${label} 벌의 흐린 글자`);
  }
});

test("style.css에 박힌 팔레트가 생성기와 같다", async () => {
  // 손으로 고치면 여기서 깨진다. theme.json이 바뀌면
  // `node tools/theme.mjs --write`를 돌린다.
  const now = await currentBlock();
  assert.ok(now, "style.css에 팔레트 표시가 없다");
  assert.equal(now, tokenBlock(theme));
});

test("어두운 벌의 값이 theme.json 그대로다", () => {
  // 밝은 벌만 파생이다. 어두운 벌에 우리가 고른 값이 섞이면 안 된다.
  const block = css.slice(css.indexOf(':root[data-theme="dark"]'));
  for (const name of RAMP)
    assert.ok(
      block.includes(`--color-${name}: ${theme.colors[name].hex};`),
      `${name}이 theme.json과 다르다`,
    );
});

test("액센트 여덟 색은 가져오지 않았다", () => {
  // 원본 시스템의 원칙: 위계는 색이 아니라 크기와 굵기로 만든다. 이 종이도
  // 그래프와 코드에 같은 규칙을 쓰고 있어, 둘이 같은 말을 한다.
  const accents = Object.entries(theme.colors)
    .filter(([, value]) => chromaOf(value.oklch) > 0)
    .map(([, value]) => value.hex);
  assert.equal(accents.length, 8);
  for (const hex of accents) {
    assert.ok(!css.includes(hex), `style.css에 ${hex}가 있다`);
    assert.ok(
      !readFileSync(join(root, "editor.css"), "utf8").includes(hex),
      `editor.css에 ${hex}가 있다`,
    );
  }
});

test("종이의 이름이 모두 사다리 위의 한 자리를 가리킨다", () => {
  // 뜻과 자리를 갈라 두는 것이 이 층의 목적이다. 어딘가 날것의 16진수가
  // 끼면 팔레트를 바꿔도 그 자리만 옛 색으로 남는다.
  for (const [role, source] of ROLES)
    assert.match(
      css,
      new RegExp(`--${role}: var\\(--color-${source}\\);`),
      `--${role}`,
    );
  // 인쇄도 예외가 아니다. 종이의 흰색과 검은색도 사다리 위의 한 자리다.
  const body = css.slice(css.indexOf("/* === 팔레트 끝 === */"));
  const raw = [...body.matchAll(/:\s*(#[0-9a-fA-F]{3,8})\b/g)].map((m) => m[1]);
  assert.deepEqual(raw, [], `날것의 색이 남아 있다: ${raw.join(", ")}`);
});

test("간격은 사다리 아홉 단으로만 적는다", () => {
  for (let step = 1; step <= 9; step++)
    assert.match(css, new RegExp(`--space-${step}:\\s*\\d+px;`), `--space-${step}`);
  assert.ok((css.match(/var\(--space-/g) ?? []).length >= 40);
});


test("인쇄는 화면의 벌이 어느 쪽이든 밝은 벌로 나간다", () => {
  // 어두운 벌로 읽던 사람이 인쇄하면 흰 종이에 흰 글자가 나오던 자리다.
  // body 하나를 덮는 것으로는 모자라다 — 제 색을 스스로 잡는 자리가 마흔
  // 군데 넘고, 그것들은 전부 사다리를 통해 색을 받는다.
  const { light } = palette(theme);
  const from = css.indexOf("@media print");
  assert.ok(from !== -1, "@media print가 없다");
  const block = css.slice(from);
  const reset = block.slice(0, block.indexOf("}\n}") + 3);
  assert.match(reset, /:root\[data-theme="dark"\]/, "어두운 벌을 되돌리지 않는다");
  for (const name of RAMP)
    assert.ok(
      reset.includes(`--color-${name}: ${light[name]};`),
      `인쇄에서 ${name}이 밝은 벌이 아니다`,
    );
});

test("종이에서는 구조선이 한 단 진해진다", () => {
  // 종이에는 바탕이 찍히지 않으므로 구조를 지는 것은 선뿐이다. 화면의
  // surface2(밝은 벌에서 #bbbbbb)는 잉크로 옮기면 거의 남지 않는다.
  const block = css.slice(css.indexOf("@media print"));
  assert.match(block, /--line: var\(--color-overlay0\);/);
});

test("사이드노트가 나갈 여백이 종이에 실제로 있다", () => {
  // 인쇄 규칙이 사이드노트를 오른쪽으로 30mm 밀어낸다. 그만한 여백을
  // @page가 만들어 두지 않으면 종이 밖으로 잘린다.
  const block = css.slice(css.indexOf("@media print"));
  const pull = Number(block.match(/\.sidenote\s*\{[^}]*margin:\s*0\s+-(\d+(?:\.\d+)?)mm/)?.[1]);
  assert.ok(pull > 0, "사이드노트가 여백으로 나가지 않는다");
  const right = Number(block.match(/@page\s*\{[^}]*margin:\s*[\d.]+mm\s+(\d+(?:\.\d+)?)mm/)?.[1]);
  assert.ok(right, "@page가 없다");
  assert.ok(right > pull, `오른쪽 여백 ${right}mm가 밀어내는 ${pull}mm보다 좁다`);
});


test("둥근 모서리가 없다", () => {
  // 장식보다 정밀함이 먼저다. 버튼도 카드도 인풋도 코드 칩도 각지게 둔다.
  const rounded = [
    ...css.matchAll(/border-radius:\s*([^;}]+)/g),
    ...readFileSync(join(root, "editor.css"), "utf8").matchAll(
      /border-radius:\s*([^;}]+)/g,
    ),
  ]
    .map((match) => match[1].trim())
    .filter((value) => !/^0[a-z%]*$/.test(value));
  assert.deepEqual(rounded, [], `둥근 모서리가 남아 있다: ${rounded.join(", ")}`);
});

test("그림의 껍데기에도 둥근 모서리가 없다", () => {
  // CSS만 보아서는 놓친다. SVG의 모서리는 border-radius가 아니라 rect의 rx다.
  // 글쓴이가 부른 모양(다이어그램의 `(둥근 상자)`)은 문법에 있는 것이므로
  // 여기 걸리지 않아야 하고, 우리가 그리는 껍데기는 걸려야 한다.
  const hover = readFileSync(join(root, "render/chart/hover.mjs"), "utf8");
  assert.doesNotMatch(hover, /\brx=/, "그래프 툴팁이 둥글다");
  const shapes = readFileSync(join(root, "render/diagram/shapes.mjs"), "utf8");
  // 여기 남은 rx는 원(ellipse)의 반지름과, shape가 "round"일 때뿐이다.
  const rounded = [...shapes.matchAll(/rx=/g)].length;
  assert.equal(rounded, 2, "다이어그램 모양이 바뀌었다 — 문법과 함께 확인할 것");
  assert.match(shapes, /shape === "round" \? Math\.min\(12/);
});

test("글을 끌어서 고른 자리에도 색이 없다", () => {
  // 브라우저 기본 선택 색은 파란색이다. 색을 쓰지 않는 종이에서 그것 하나가
  // 남으면, 글을 고르는 순간마다 규칙이 깨진다. 잉크와 종이를 맞바꾼다.
  assert.match(
    css,
    /(?:^|\n)::selection \{\s*background: var\(--ink\);\s*color: var\(--paper\);/,
    "전역 ::selection이 없다",
  );
  // 그림 속 글자도 같은 값이라야 본문과 따로 놀지 않는다.
  for (const kind of ["chart", "diagram"]) {
    const rule = css.match(
      new RegExp(`\\.${kind}-svg ::selection \\{([^}]*)\\}`),
    )?.[1];
    assert.ok(rule, `.${kind}-svg ::selection이 없다`);
    assert.match(rule, /background: var\(--ink\)/, kind);
    assert.match(rule, /fill: var\(--paper\)/, `${kind}: SVG 글자는 fill로 칠해진다`);
  }
  // 운영체제 색 키워드는 더 이상 쓰지 않는다 — 그것이 파란색이던 자리다.
  assert.doesNotMatch(css, /HighlightText|background-color:\s*Highlight/);
});
