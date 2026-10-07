// 팔레트 하나에서 두 벌의 토큰을 만든다.
//
// tools/theme.json이 출처다. 거기 적힌 것은 어두운 한 벌뿐이고, 밝은 벌은
// 여기서 파생한다 — 사람이 고른 밝은 색은 하나도 없다. 이 파일이 하는 일이
// 그 파생을 한 줄로 적어 두는 것이고, 시험이 style.css에 박힌 값과 여기서
// 나오는 값이 같은지 지킨다. theme.json이 바뀌면 이것을 다시 돌린다.
//
//   node tools/theme.mjs          바뀔 내용을 보여만 준다
//   node tools/theme.mjs --write  style.css의 표시 사이를 갈아 끼운다

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);

export const START = "/* === 팔레트: tools/theme.mjs가 만든다. 손으로 고치지 않는다. === */";
export const END = "/* === 팔레트 끝 === */";

/**
 * oklch를 sRGB 16진수로.
 *
 * 이 팔레트의 회색은 채도가 0.000이다. 채도가 0이면 oklab의 a와 b가 0이고,
 * 그러면 L, M, S가 모두 같은 값이 되어 선형 RGB 셋이 L³ 하나로 모인다.
 * 채도가 있는 색은 이 블로그가 쓰지 않으므로 여기서 다루지 않는다.
 */
export function greyHex(lightness) {
  const clamped = Math.min(1, Math.max(0, lightness));
  const linear = clamped ** 3;
  const encoded =
    linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
  const byte = Math.round(Math.min(1, Math.max(0, encoded)) * 255);
  return `#${byte.toString(16).padStart(2, "0").repeat(3)}`;
}

export const lightnessOf = (oklch) =>
  Number.parseFloat(oklch.slice(oklch.indexOf("(") + 1)) / 100;

export const chromaOf = (oklch) =>
  Number.parseFloat(oklch.slice(oklch.indexOf("(") + 1).split(/\s+/)[1]);

// 어두운 벌의 사다리. 바탕에서 글자까지 밝기 순이다.
export const RAMP = [
  "crust",
  "mantle",
  "base",
  "surface0",
  "surface1",
  "surface2",
  "overlay0",
  "overlay1",
  "overlay2",
  "subtext0",
  "subtext1",
  "text",
];

/**
 * 밝은 벌.
 *
 * 밝기를 뒤집되 50%가 아니라 base와 text의 한가운데를 축으로 삼는다. 50%로
 * 뒤집으면 바탕이 15%에서 85%로 가는데, 그것은 종이가 아니라 신문지다 —
 * 이 사다리가 50%를 중심으로 대칭이 아니어서 그렇다(바탕 쪽이 5~34%,
 * 글자 쪽이 61~98%). base와 text를 맞바꾸는 축으로 뒤집으면 바탕이 종이가
 * 되고, 무엇보다 어두운 벌이 가지고 있던 밝기 차이가 그대로 보존된다 —
 * 글자와 바탕의 대비비가 두 벌에서 같은 값이 나온다.
 *
 * crust와 mantle은 뒤집으면 100%를 넘는다. 흰색보다 밝은 것은 없으므로 둘
 * 다 흰색으로 잘린다. 이 블로그에서 그 둘은 종이 바깥(html 바탕)과 입력칸
 * 바탕이라, 겹쳐도 보이는 것이 달라지지 않는다.
 */
export function reflect(lightness, axis) {
  return Math.min(1, axis - lightness);
}

export function palette(theme) {
  const colors = theme.colors;
  const greys = RAMP.filter((name) => chromaOf(colors[name].oklch) === 0);
  if (greys.length !== RAMP.length)
    throw new Error(`사다리에 채도가 있는 색이 있다: ${RAMP.filter((n) => !greys.includes(n))}`);
  const lightness = Object.fromEntries(
    RAMP.map((name) => [name, lightnessOf(colors[name].oklch)]),
  );
  const axis = lightness.base + lightness.text;
  const dark = Object.fromEntries(RAMP.map((name) => [name, colors[name].hex]));
  const light = Object.fromEntries(
    RAMP.map((name) => [name, greyHex(reflect(lightness[name], axis))]),
  );
  return { axis, lightness, dark, light };
}

// 사다리 위의 이름과 이 블로그가 부르는 이름. 왼쪽이 뜻이고 오른쪽이 자리다.
// 어두운 벌에서 맺은 짝을 밝은 벌이 그대로 쓰므로, 두 벌의 관계가 같다.
export const ROLES = [
  ["ink", "text", "본문 글자"],
  ["muted", "subtext0", "물러난 글자 — 날짜, 라벨, 설명"],
  ["paper", "crust", "종이"],
  ["hairline", "surface1", "가장 여린 선 — 줄 사이"],
  ["line", "surface2", "테두리"],
  ["accent", "text", "고른 것, 지금 있는 자리"],
  ["bg-mark", "surface0", "칠한 바탕 — 코드, 형광, 알림 상자, 표 강조 칸"],
];

// 종이가 crust로 한 단 밖으로 나가면서 mantle은 갈 자리가 없어졌다. 밝은 벌
// 에서 mantle은 crust와 같은 흰색으로 잘리므로, 거기 기댄 이름은 종이와
// 구별되지 않는다. 파고든 바탕이 필요한 자리(편집기의 원고 칸)는 코드 블록과
// 같은 깊이면 되므로 --bg-mark를 쓴다.

const indent = (lines) => lines.map((line) => `  ${line}`).join("\n");

export function tokenBlock(theme) {
  const { dark, light } = palette(theme);
  const vars = (set) => RAMP.map((name) => `--color-${name}: ${set[name]};`);
  const roles = ROLES.map(([role, source, why]) => `--${role}: var(--color-${source}); /* ${why} */`);
  return [
    START,
    `/* 출처는 tools/theme.json("${theme.name}")이다. 어두운 벌이 그 파일에 적힌`,
    `   그대로이고, 밝은 벌은 base와 text의 한가운데를 축으로 밝기를 뒤집어`,
    "   얻는다 — tools/theme.mjs의 reflect()가 그 한 줄이다.",
    "",
    "   이 사다리의 회색은 채도가 전부 0.000이다. 색을 쓰지 않는다는 이 종이의",
    "   규칙과, 위계는 색이 아니라 크기와 굵기로 만든다는 원본 시스템의 규칙이",
    "   같은 말이어서, 액센트 여덟 색은 가져오지 않았다. */",
    ":root {",
    indent(vars(light)),
    "",
    indent(roles),
    "}",
    ':root[data-theme="dark"] {',
    indent(vars(dark)),
    "  color-scheme: dark;",
    "}",
    "@media print {",
    "  /* 종이는 언제나 밝은 벌이다. 어두운 벌로 읽던 사람이 인쇄하면 흰 종이에",
    "     흰 글자가 나온다 — body 하나를 덮는 것으로는 모자라고, 제 색을 스스로",
    "     잡는 마흔 몇 자리가 그대로 어두운 값을 쓴다. 사다리를 여기서 한 번",
    "     되돌리면 본문부터 그래프와 다이어그램까지 전부 따라온다. */",
    "  :root,",
    '  :root[data-theme="dark"] {',
    indent(vars(light).map((line) => `  ${line}`)),
    "    color-scheme: light;",
    "    /* 종이에는 바탕이 찍히지 않는다. 화면에서 구조를 지던 여린 선은 빛을",
    "       등지고 있어 보이던 것이라, 잉크로는 한 단 더 내려야 남는다. */",
    "    --line: var(--color-overlay0);",
    "  }",
    "}",
    END,
  ].join("\n");
}

export async function readTheme() {
  return JSON.parse(await readFile(join(here, "theme.json"), "utf8"));
}

export async function currentBlock() {
  const css = await readFile(join(root, "style.css"), "utf8");
  const from = css.indexOf(START);
  const to = css.indexOf(END);
  if (from === -1 || to === -1) return null;
  return css.slice(from, to + END.length);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const theme = await readTheme();
  const block = tokenBlock(theme);
  if (!process.argv.includes("--write")) {
    console.log(block);
    const now = await currentBlock();
    console.log(
      now === null
        ? "\n// style.css에 표시가 없다. 처음 넣는 것이면 손으로 한 번 붙인다."
        : now === block
          ? "\n// style.css와 같다."
          : "\n// style.css와 다르다. --write로 갈아 끼운다.",
    );
  } else {
    const path = join(root, "style.css");
    const css = await readFile(path, "utf8");
    const from = css.indexOf(START);
    const to = css.indexOf(END);
    if (from === -1 || to === -1) throw new Error("style.css에 표시가 없다");
    await writeFile(path, css.slice(0, from) + block + css.slice(to + END.length));
    console.log("style.css를 갈아 끼웠다.");
  }
}
