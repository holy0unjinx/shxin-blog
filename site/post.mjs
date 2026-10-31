// 앞머리 한 덩이를 글 하나로 읽는 사람.
//
// 빌드는 posts/와 draft/의 파일마다 이것을 부르고, 미리보기 서버는 지금
// 타자를 치고 있는 원고에 대해 부른다. 둘이 같은 함수를 타야 미리보기의
// 제목·분류·요약·읽는 시간이 실제 글과 같은 규칙으로 나온다.

import { excerpt, readingMinutes, slugify } from "../render/index.mjs";

// "keywords: 사설 CA, HTTPS" in the front matter becomes a list. Commas and
// their full-width twin both separate, and blanks are dropped.
export function keywordList(value) {
  return (value || "")
    .split(/[,，]/)
    .map((word) => word.trim())
    .filter(Boolean);
}

export function postFrom({ data = {}, body = "", slug, draft = false }) {
  const name = data.slug || slug;
  const category = data.category || "Uncategorized";
  return {
    slug: name,
    title: data.title || name,
    date: data.date || "",
    // 고친 날. 글은 한 번 쓰고 끝나지 않는다 — 자료가 갱신되면 본문도 바뀌고,
    // 그때 sitemap과 RSS가 처음 날짜를 계속 들고 있으면 바뀐 것을 아무도
    // 모른다. 적지 않으면 쓴 날이 곧 고친 날이다.
    updated: data.updated || "",
    // 초안은 미리보기에만 선다. 목록과 글 머리에 표시가 붙어, 지금 보는
    // 것이 나갈 글인지 아닌지 헷갈리지 않는다.
    draft,
    // 글마다 언어를 적을 수 있다. 다국어 글이 섞이면 <html lang>이 맞아야
    // 스크린 리더가 제 소리로 읽고 브라우저가 제 규칙으로 줄을 나눈다.
    lang: data.lang || "ko",
    category,
    categorySlug: data.categorySlug || slugify(category),
    description: data.description || excerpt(body),
    // 한 줄 요약을 글쓴이가 적었는지. 없으면 본문 앞부분을 쓰는데, 그것은
    // 물러난 것이지 고른 것이 아니므로 lint가 알려 준다.
    hasDescription: Boolean(data.description),
    keywords: keywordList(data.keywords),
    readMinutes: readingMinutes(body),
    bib: data.bib || "",
    // 여러 편으로 나눈 글. part를 적지 않으면 날짜순으로 매겨진다.
    series: data.series || "",
    seriesSlug: data.series ? data.seriesSlug || slugify(data.series) : "",
    part: Number.parseInt(data.part ?? "", 10) || 0,
    // 분류나 시리즈의 README. 목록에 서는 글이 아니라 그 목록 맨 위에 펼쳐지는
    // 글이다 — GitHub 프로필이 README.md를 저장소 목록 위에 두듯이.
    readme: readmeTarget(data.readme),
    // 머리글을 몇 덩이까지 펼쳐 둘지. 목록보다 먼저 서는 글이므로 길면
    // 목록을 화면 밖으로 밀어낸다.
    fold: foldAt(data.fold),
    body,
  };
}

// "readme: series"는 시리즈 페이지, "readme: category"나 "readme: true"는
// 분류 페이지의 머리에 선다. 그 밖의 값은 보통 글이다.
export function readmeTarget(value) {
  const word = String(value ?? "").trim().toLowerCase();
  if (word === "series") return "series";
  if (word === "category" || word === "true") return "category";
  return "";
}

// 머리글이 펼쳐 둘 덩이 수. 세는 것은 픽셀이 아니라 최상위 블록이다 —
// 높이로 자르면 줄 하나가 반으로 잘리고, 글꼴과 창 폭마다 자리가 달라진다.
// "fold: none"은 접지 않고 다 보여 준다.
export const FOLD_DEFAULT = 4;

export function foldAt(value, fallback = FOLD_DEFAULT) {
  const word = String(value ?? "").trim().toLowerCase();
  if (!word) return fallback;
  // 접지 않는 쪽을 고르는 말들. 0도 여기다 — "0덩이만 보여 준다"는 뜻으로
  // 읽으면 머리글이 통째로 숨고, 그것을 원해서 적는 사람은 없다.
  if (["none", "no", "false", "off", "all", "0"].includes(word)) return Infinity;
  const count = Number.parseInt(word, 10);
  return count > 0 ? count : fallback;
}
