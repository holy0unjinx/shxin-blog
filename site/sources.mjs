// 글이 가리킨 바깥 파일을 읽는 사람.
//
// render/는 파일시스템을 모른다 — 글이 "data/foo.csv"를 가리키면 렌더러는
// resolve(path)를 부르고, 그 부름에 답하는 것이 이 모듈이다. 빌드와 미리보기
// 서버가 같은 답을 해야 미리보기가 실제 글과 같은 것을 그린다.
//
// 팩토리인 것은 캐시 때문이다. 빌드는 한 번 돌고 끝이라 캐시를 전 과정에
// 걸쳐 쓰지만, 계속 살아 있는 서버가 같은 캐시를 들고 있으면 자료 파일이
// 바뀌어도 옛 내용을 계속 그린다. 서버는 요청마다 새로 만든다.

import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";

import { parseBib } from "../render/bib.mjs";
import { imageSize } from "../render/image.mjs";

export function createSources(root) {
  // 저장소 밖으로는 나가지 않는다 — 글이 "../../etc/passwd"를 가리켜도
  // 읽히지 않아야 한다.
  function insideRoot(path) {
    const full = resolve(root, String(path).replace(/^\/+/, ""));
    return full === root || full.startsWith(root + sep) ? full : null;
  }

  const textCache = new Map();
  function readText(path) {
    if (textCache.has(path)) return textCache.get(path);
    const full = insideRoot(path);
    let text = null;
    try {
      if (full) text = readFileSync(full, "utf8");
    } catch {
      // 없는 파일은 오류가 아니다. 그 문법이 물러나고 lint가 알린다.
      text = null;
    }
    textCache.set(path, text);
    return text;
  }

  // 그림의 내재 크기. 바깥 주소는 재지 않는다 — 빌드가 남의 서버에 요청을
  // 보내는 일은 없어야 하고, 그 값을 캐시할 방법도 없다.
  const sizeCache = new Map();
  function measureImage(src) {
    if (/^(?:https?:)?\/\//i.test(src) || src.startsWith("data:")) return null;
    if (sizeCache.has(src)) return sizeCache.get(src);
    const full = insideRoot(src.split(/[?#]/)[0]);
    let size = null;
    try {
      if (full) size = imageSize(readFileSync(full));
    } catch {
      size = null;
    }
    sizeCache.set(src, size);
    return size;
  }

  // 참고문헌 원본. 글마다 `bib:`로 다른 파일을 가리킬 수 있고, 없으면
  // refs.bib을 본다. 같은 파일을 글마다 다시 파싱하지 않는다.
  const bibCache = new Map();
  function readBib(name) {
    const path = name || "refs.bib";
    if (bibCache.has(path)) return bibCache.get(path);
    const text = readText(path);
    const parsed = text ? parseBib(text) : new Map();
    bibCache.set(path, parsed);
    return parsed;
  }

  // lint가 "없는 그림 파일"을 묻는 자리. 주소는 사이트 뿌리 기준으로 오고,
  // 읽기와 같은 울타리 안에서만 답한다.
  function fileExists(path) {
    const full = insideRoot(path);
    return Boolean(full) && existsSync(full);
  }

  return { insideRoot, readText, measureImage, readBib, fileExists };
}
