// dev 전용 편집기 페이지의 마크업과 삽입 팔레트.
//
// 이 파일은 순수하다 — 파일도 DOM도 건드리지 않는다. 그래야 팔레트의 조각
// 하나하나를 시험이 실제로 렌더해 볼 수 있고, 팔레트가 거짓말을 하면
// (문법이 바뀌었는데 조각이 그대로면) 시험이 깨진다.
//
// 조각 안의 "$0"은 커서가 설 자리다. block이 참이면 삽입할 때 앞뒤로 빈 줄을
// 확보한다 — 문단 한가운데에 표를 꽂으면 표가 아니라 글자가 된다. quiet이
// 참이면 그 조각 하나로는 아무것도 그리지 않는 것이 맞다 — 각주 정의는
// 부르는 쪽이 있어야 서고, [toc:fig]는 목록에 오를 그림이 있어야 찬다.

import { esc } from "../render/index.mjs";

const CARET = "$0";

/**
 * 새 글의 앞머리.
 *
 * 빌드가 읽는 열쇠를 다 적어 둔다. 지우는 것이 채우는 것보다 쉽고, 무엇을
 * 적을 수 있는지가 여기 말고는 SYNTAX.md에만 있다.
 */
export const STARTER = `---
title: "제목"
date: ${new Date().toISOString().slice(0, 10)}
category: 분류
slug: new-post
description: "한 줄 요약."
keywords: 키워드, 둘
---

여기서부터 씁니다.
`;

export const GROUPS = [
  {
    name: "본문",
    items: [
      { label: "굵게", snippet: `**${CARET}**` },
      { label: "기울임", snippet: `*${CARET}*` },
      { label: "취소선", snippet: `~~${CARET}~~` },
      { label: "형광", snippet: `==${CARET}==` },
      { label: "위첨자", snippet: `x^${CARET}^` },
      { label: "아래첨자", snippet: `H~${CARET}~O` },
      { label: "인라인 코드", snippet: `\`${CARET}\`` },
      { label: "줄 끊기", snippet: `\\\n${CARET}` },
    ],
  },
  {
    name: "링크",
    items: [
      { label: "바깥 링크", snippet: `[${CARET}](https://example.com)` },
      { label: "내부 링크", snippet: `[${CARET}](/some-post/)` },
      { label: "툴팁", snippet: `[${CARET}](? 이 자리에 뜻을 적는다)` },
      {
        label: "참조식 링크",
        snippet: `[${CARET}][이름]`,
      },
      {
        label: "참조 정의",
        block: true,
        quiet: true,
        snippet: `[이름]: https://example.com "${CARET}"`,
      },
    ],
  },
  {
    name: "주석",
    items: [
      { label: "각주 부르기", snippet: `[^${CARET}]` },
      {
        label: "각주 정의",
        block: true,
        quiet: true,
        snippet: `[^이름]: ${CARET}`,
      },
      { label: "사이드노트 부르기", snippet: `[^^${CARET}]` },
      {
        label: "사이드노트 정의",
        block: true,
        quiet: true,
        snippet: `[^^이름]: ${CARET}`,
      },
    ],
  },
  {
    name: "목록",
    items: [
      { label: "점 목록", block: true, snippet: `- ${CARET}\n- 둘\n  - 중첩` },
      { label: "번호 목록", block: true, snippet: `1. ${CARET}\n2. 둘` },
      { label: "할 일", block: true, snippet: `- [x] 끝난 일\n- [ ] ${CARET}` },
      {
        label: "정의 목록",
        block: true,
        snippet: `용어\n:: ${CARET}\n:: 뜻은 여러 줄이어도 된다`,
      },
    ],
  },
  {
    name: "인용",
    items: [
      { label: "인용문", block: true, snippet: `> ${CARET}` },
      {
        label: "출처 붙은 인용",
        block: true,
        snippet: `> ${CARET}\n> — 「출처」`,
      },
    ],
  },
  {
    name: "알림 상자",
    items: [
      { label: "NOTE", block: true, snippet: `> [!NOTE]\n> ${CARET}` },
      { label: "TIP", block: true, snippet: `> [!TIP] 제목\n> ${CARET}` },
      { label: "IMPORTANT", block: true, snippet: `> [!IMPORTANT]\n> ${CARET}` },
      { label: "WARNING", block: true, snippet: `> [!WARNING]\n> ${CARET}` },
      { label: "CAUTION", block: true, snippet: `> [!CAUTION]\n> ${CARET}` },
      {
        label: "DETAILS",
        block: true,
        snippet: `> [!DETAILS] 접히는 상자\n> ${CARET}`,
      },
    ],
  },
  {
    name: "정리 환경",
    items: [
      {
        label: "DEFINITION",
        block: true,
        snippet: `> [!DEFINITION] {#def:이름} 용어\n> ${CARET}`,
      },
      {
        label: "THEOREM",
        block: true,
        snippet: `> [!THEOREM] {#thm:이름} 이름\n> ${CARET}`,
      },
      { label: "LEMMA", block: true, snippet: `> [!LEMMA]\n> ${CARET}` },
      { label: "COROLLARY", block: true, snippet: `> [!COROLLARY]\n> ${CARET}` },
      {
        label: "PROPOSITION",
        block: true,
        snippet: `> [!PROPOSITION]\n> ${CARET}`,
      },
      { label: "EXAMPLE", block: true, snippet: `> [!EXAMPLE]\n> ${CARET}` },
      { label: "REMARK", block: true, snippet: `> [!REMARK]\n> ${CARET}` },
      { label: "PROOF", block: true, snippet: `> [!PROOF]\n> ${CARET}` },
    ],
  },
  {
    name: "수식",
    items: [
      { label: "인라인 수식", snippet: `$${CARET}$` },
      { label: "블록 수식", block: true, snippet: `$$\n${CARET}\n$$` },
      {
        label: "번호 붙은 수식",
        block: true,
        snippet: `$$ {#eq:이름}\n${CARET}\n$$`,
      },
    ],
  },
  {
    name: "상호참조",
    items: [
      { label: "그림 부르기", snippet: `[@fig:${CARET}]` },
      { label: "표 부르기", snippet: `[@tbl:${CARET}]` },
      { label: "식 부르기", snippet: `[@eq:${CARET}]` },
      { label: "코드 부르기", snippet: `[@lst:${CARET}]` },
      { label: "절 부르기", snippet: `[@sec:${CARET}]` },
      { label: "정리 부르기", snippet: `[@thm:${CARET}]` },
      { label: "번호만", snippet: `[@#fig:${CARET}]` },
      { label: "절 이름표", snippet: `{#sec:${CARET}}` },
      { label: "그림 목록", block: true, quiet: true, snippet: `[toc:fig]${CARET}` },
      { label: "표 목록", block: true, quiet: true, snippet: `[toc:tbl]${CARET}` },
    ],
  },
  {
    name: "그림",
    items: [
      {
        label: "그림 + 캡션",
        block: true,
        snippet: `![대체 텍스트](/assets/sample.png "{#fig:이름} ${CARET} | 덧붙일 말")`,
      },
      {
        label: "캡션 없는 그림",
        block: true,
        snippet: `![대체 텍스트](/assets/sample.png)${CARET}`,
      },
      {
        label: "둘을 한 줄에",
        block: true,
        snippet:
          "```figures {cols=2}\n" +
          `![왼쪽](/assets/sample.png "{#fig:왼쪽} ${CARET}")\n` +
          '![오른쪽](/assets/sample.png "{#fig:오른쪽} 오른쪽")\n' +
          "```",
      },
      {
        label: "영상",
        block: true,
        snippet: `!video[대체 텍스트](/assets/sample.mp4 "{#fig:영상} ${CARET}")`,
      },
      { label: "임베드", block: true, snippet: `!embed(https://example.com)${CARET}` },
    ],
  },
  {
    name: "코드",
    items: [
      {
        label: "언어 펜스",
        block: true,
        snippet: "```js\n" + CARET + "\n```",
      },
      {
        label: "파일명 · 줄번호 · 강조",
        block: true,
        snippet:
          "```js {file=server.mjs, lines, hl=2, #lst:이름}\n" +
          `const a = 1;\n${CARET}\n` +
          "```",
      },
      {
        label: "시작 번호 옮기기",
        block: true,
        snippet: "```js {from=120, hl=121}\n" + CARET + "\n```",
      },
      {
        label: "파일에서 읽기",
        block: true,
        snippet: "```js {file=escape.mjs, src=render/escape.mjs, lines}\n```" + CARET,
      },
      {
        label: "diff",
        block: true,
        snippet:
          "```diff\n" +
          "--- a/style.css\n+++ b/style.css\n" +
          `-  background: #f6f6f6;\n+  background: var(--bg-mark);\n${CARET}\n` +
          "```",
      },
      {
        label: "손대지 않는 블록",
        block: true,
        snippet: "```\n" + CARET + "\n```",
      },
    ],
  },
  {
    name: "표",
    items: [
      {
        label: "기본 표",
        block: true,
        snippet:
          `| 구분 | 값 |\n| :--- | ---: |\n| 하나 | ${CARET} |\n| 둘 | 2 |`,
      },
      {
        label: "캡션 · 이름표 · 출처",
        block: true,
        snippet:
          `: {#tbl:이름} ${CARET} | n=120\n` +
          "| 구분 | 값 |\n| :--- | ---: |\n| 하나 | 1 |\n" +
          ": 출처: 내부 문서",
      },
      {
        label: "셀 · 행 · 열 속성",
        block: true,
        snippet:
          `: {#tbl:속성} ${CARET}\n` +
          "| 구분 | 루트 | 중간 | {bolder}\n" +
          "| :--- | :---: {bg} | ------: |\n" +
          "| 인증서 | {span=2} 자기 서명 || {border=thick}\n" +
          "| 수명 | {valign=top} 10~20년 | 1~5년 |\n" +
          "| 상태 | {rows=2} 오프라인 | 온라인 | {bg}\n" +
          "| 비고 | | 갱신 필요 |",
      },
      {
        label: "바깥 파이프 없이",
        block: true,
        snippet: `구분 | 값\n--- | ---:\n${CARET} | a \\| b`,
      },
      {
        label: "csv에서 읽기",
        block: true,
        snippet:
          "```table {src=data/eei-sample.csv, row-range=1:6, column-attrs=bolder;align=right;align=right}\n" +
          `: {#tbl:자료} ${CARET}\n` +
          ": 출처: `data/eei-sample.csv`\n" +
          "```",
      },
    ],
  },
  {
    name: "다이어그램",
    items: [
      {
        label: "흐름 (flow)",
        block: true,
        snippet:
          "```diagram {type=flow}\n" +
          `: {#fig:흐름} ${CARET}\n` +
          "((시작)) -> 요청 검사\n" +
          "요청 검사 -> (발급): 유효\n" +
          "요청 검사 --> <거절>: 서명 불일치\n" +
          "발급 -> ((끝))\n" +
          "```",
      },
      {
        label: "가로 흐름",
        block: true,
        snippet:
          "```diagram {type=flow, dir=right}\n" +
          `: {nonumber} ${CARET}\n` +
          "읽기 -> 쓰기 -> 확인\n" +
          "```",
      },
      {
        label: "차례 (sequence)",
        block: true,
        snippet:
          "```diagram {type=sequence}\n" +
          `: {#fig:차례} ${CARET}\n` +
          "participant 클라이언트\n" +
          "participant 서버\n" +
          "클라이언트 -> 서버: ClientHello\n" +
          "서버 --> 클라이언트: ServerHello\n" +
          "note 서버: 서명 준비\n" +
          "클라이언트 ->> 서버: Finished\n" +
          "```",
      },
      {
        label: "계층 (tree)",
        block: true,
        snippet:
          "```diagram {type=tree}\n" +
          `: {#fig:계층} ${CARET}\n` +
          "루트 CA\n" +
          "  중간 CA (내부)\n" +
          "    서버 인증서\n" +
          "  중간 CA (외부)\n" +
          "```",
      },
    ],
  },
  {
    name: "그래프",
    items: [
      {
        label: "선 (line)",
        block: true,
        snippet:
          "```chart {type=line, marker=circle, y-label=가입자(만)}\n" +
          `: {#fig:선} ${CARET} | n=120\n` +
          "| 연도 | 2021 | 2022 | 2023 | 2024 |\n" +
          "| 국내 | 1.2 | 2.0 | 3.4 | 4.1 |\n" +
          "| 해외 | 0.8 | 1.4 | 2.1 | 3.6 | {dash=dashed}\n" +
          ": 자료: 내부 배포 기준.\n" +
          "```",
      },
      {
        label: "계단 (step)",
        block: true,
        snippet:
          "```chart {type=step, where=post, y-label=인스턴스}\n" +
          `: {nonumber} ${CARET}\n` +
          "| 시각 | 0 | 1 | 2 | 3 |\n| 예약 | 2 | 2 | 4 | 4 |\n" +
          "```",
      },
      {
        label: "면 (area)",
        block: true,
        snippet:
          "```chart {type=area, fill-to=하한, y-label=지연(ms)}\n" +
          `: {nonumber} ${CARET}\n` +
          "| 시각 | 1 | 2 | 3 |\n| 상한 | 30 | 42 | 38 |\n| 하한 | 12 | 18 | 15 |\n" +
          "```",
      },
      {
        label: "누적 면 (stackplot)",
        block: true,
        snippet:
          "```chart {type=stackplot, y-label=요청(만)}\n" +
          `: {nonumber} ${CARET}\n` +
          "| 주 | 1 | 2 | 3 |\n| 캐시 | 3 | 4 | 6 |\n| 원본 | 2 | 2 | 3 |\n" +
          "```",
      },
      {
        label: "산점 (scatter)",
        block: true,
        snippet:
          "```chart {type=scatter, x-label=코드 줄 수, y-label=리뷰 시간(분)}\n" +
          `: {nonumber} ${CARET}\n` +
          "| x | 12 | 40 | 88 | 130 | {role=x}\n| 리뷰 | 5 | 9 | 18 | 26 |\n" +
          "```",
      },
      {
        label: "오차 막대 (errorbar)",
        block: true,
        snippet:
          "```chart {type=errorbar, y-label=처리량(k/s)}\n" +
          `: {nonumber} ${CARET}\n` +
          "| 크기 | 1 | 2 | 4 | 8 |\n| 측정 | 10 | 19 | 35 | 60 |\n| 오차 | 1 | 2 | 3 | 5 | {role=error}\n" +
          "```",
      },
      {
        label: "스템 (stem)",
        block: true,
        snippet:
          "```chart {type=stem, y-label=상관}\n" +
          `: {nonumber} ${CARET}\n` +
          "| 시차 | 0 | 1 | 2 | 3 |\n| 값 | 1.0 | 0.6 | 0.2 | -0.1 |\n" +
          "```",
      },
      {
        label: "막대 (bar)",
        block: true,
        snippet:
          "```chart {type=bar, stacked, x-label=분기, y-label=건수}\n" +
          `: {nonumber} ${CARET}\n` +
          "| 분기 | 1Q | 2Q | 3Q | 4Q |\n| 신규 | 12 | 18 | 15 | 22 |\n| 재발 | 4 | 6 | 3 | 5 |\n" +
          "```",
      },
      {
        label: "가로 막대 (barh)",
        block: true,
        snippet:
          "```chart {type=barh, x-label=평균 시간(초), aspect=2}\n" +
          `: {nonumber} ${CARET}\n` +
          "| 단계 | 빌드 | 테스트 | 배포 |\n| 시간 | 42 | 128 | 19 |\n" +
          "```",
      },
      {
        label: "히스토그램 (hist)",
        block: true,
        snippet:
          "```chart {type=hist, bins=12, x-label=응답 시간(ms), y-label=건수}\n" +
          `: {nonumber} ${CARET}\n` +
          "| 측정 | 120 | 125 | 130 | 128 | 240 | 132 | 127 | 129 | 310 | 126 |\n" +
          "```",
      },
      {
        label: "구간 막대 (broken_barh)",
        block: true,
        snippet:
          "```chart {type=broken_barh, x-label=경과(분), aspect=2.4}\n" +
          `: {nonumber} ${CARET}\n` +
          "| 빌드 | 0:4 | 12:3 |\n| 테스트 | 4:8 |\n| 배포 | 15:2 |\n" +
          "```",
      },
      {
        label: "상자 수염 (box)",
        block: true,
        snippet:
          "```chart {type=box, y-label=응답 시간(ms)}\n" +
          `: {nonumber} ${CARET}\n` +
          "| 대조군 | 12 | 15 | 14 | 19 | 13 |\n| 실험군 | 22 | 25 | 41 | 24 | 23 |\n" +
          "```",
      },
      {
        label: "바이올린 (violin)",
        block: true,
        snippet:
          "```chart {type=violin, y-label=응답 시간(ms)}\n" +
          `: {nonumber} ${CARET}\n` +
          "| 대조군 | 12 | 15 | 14 | 19 | 13 | 16 | 14 |\n| 실험군 | 22 | 25 | 41 | 24 | 23 | 26 | 27 |\n" +
          "```",
      },
      {
        label: "경험 분포 (ecdf)",
        block: true,
        snippet:
          "```chart {type=ecdf, x-label=응답 시간(ms), y-label=누적 비율}\n" +
          `: {nonumber} ${CARET}\n` +
          "| 측정 | 120 | 125 | 130 | 128 | 240 | 132 | 127 |\n" +
          "```",
      },
      {
        label: "로그축 · 오른쪽 축",
        block: true,
        snippet:
          "```chart {type=line, y-scale=log, fill=hatch, legend=no, grid=no, hover=no, x-tick-rotate=45, y-label=요청 수}\n" +
          `: {#fig:축} ${CARET}\n` +
          "| 시각 | 09시 | 10시 | 11시 |\n| 요청 | 100 | 1000 | 12000 |\n| 오류율 | 0.2 | 0.5 | 0.9 | {axis=right}\n" +
          "```",
      },
      {
        label: "csv에서 읽기",
        block: true,
        snippet:
          "```chart {type=line, src=data/eei-sample.csv, x-label=연도, y-label=W/m², row-range=2:12}\n" +
          `: {#fig:자료그래프} ${CARET}\n` +
          "```",
      },
    ],
  },
  {
    name: "참고문헌",
    items: [
      { label: "인용", snippet: `[@${CARET}]` },
      { label: "쪽 붙은 인용", snippet: `[@${CARET}, 42쪽]` },
      { label: "둘을 한 괄호에", snippet: `[@${CARET}; @다른key]` },
    ],
  },
  {
    name: "구조",
    items: [
      { label: "제목 1", block: true, snippet: `# ${CARET} {#sec:이름}` },
      { label: "제목 2", block: true, snippet: `## ${CARET}` },
      { label: "제목 3", block: true, snippet: `### ${CARET}` },
      { label: "제목 4", block: true, snippet: `#### ${CARET}` },
      { label: "구분선", block: true, snippet: `---${CARET}` },
    ],
  },
];

/**
 * 커서 표시를 걷어 낸 조각. 시험과 빌드가 같은 답을 봐야 하므로 여기 둔다.
 */
export const plain = (snippet) => snippet.split(CARET).join("");

// JSON을 <script> 안에 둘 때 "</script>"가 태그를 닫아 버리지 않게 한다.
const safeJson = (value) =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

/** /write/ 페이지의 본문. */
export function writePage() {
  const rail = GROUPS.map(
    (group, groupIndex) =>
      `<details class="write-group"${groupIndex === 0 ? " open" : ""}>` +
      `<summary>${esc(group.name)}</summary><div>` +
      group.items
        .map(
          (item, itemIndex) =>
            `<button type="button" data-at="${groupIndex}.${itemIndex}">${esc(item.label)}</button>`,
        )
        .join("") +
      "</div></details>",
  ).join("");

  // 조각도 새 글 앞머리도 JSON 한 덩이로 내려간다. 줄바꿈이 든 글을 HTML
  // 속성에 우겨넣지 않아도 되고, 버튼은 자리 번호만 지면 된다.
  const data = {
    starter: STARTER,
    groups: GROUPS.map((group) => ({
      name: group.name,
      items: group.items.map((item) => ({
        snippet: item.snippet,
        block: Boolean(item.block),
      })),
    })),
  };

  return (
    `<div class="write">` +
    `<aside class="write-rail"><p class="write-rail-head">문법</p>${rail}</aside>` +
    `<section class="write-source">` +
    `<div class="write-bar">` +
    `<label>draft/<input class="write-slug" type="text" spellcheck="false" placeholder="new-post">.md</label>` +
    `<button type="button" class="write-save">저장</button>` +
    `<button type="button" class="write-new">새 글</button>` +
    `</div>` +
    `<textarea class="write-text" spellcheck="false" aria-label="원고"></textarea>` +
    `</section>` +
    `<section class="write-preview"><div class="write-paper paper"></div></section>` +
    `<p class="write-status" role="status"></p>` +
    `<script type="application/json" class="write-snippets">${safeJson(data)}</script>` +
    `</div>`
  );
}
