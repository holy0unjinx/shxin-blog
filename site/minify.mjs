// 배포용으로만 도는 축소기. 원본은 주석이 촘촘한 채로 남고, 여기서 깎인
// 것은 dist/ 안의 사본뿐이다.
//
// 둘 다 정규식이 아니라 한 글자씩 읽는 상태 기계다. CSS의 url()과 문자열,
// 자바스크립트의 문자열·템플릿·정규식 리터럴 안에는 주석처럼 생긴 글자가
// 얼마든지 들어 있고, 그것을 주석으로 착각해 지우면 조용히 망가진다.

// 문자열이 열린 자리에서 닫는 자리까지 그대로 옮긴다. 역슬래시로 시작하는
// 두 글자는 언제나 한 덩어리다.
function copyString(source, start, quote) {
  let out = quote;
  let i = start + 1;
  while (i < source.length) {
    const character = source[i];
    if (character === "\\") {
      out += source.slice(i, i + 2);
      i += 2;
      continue;
    }
    out += character;
    i += 1;
    if (character === quote) break;
  }
  return [out, i];
}

export function minifyCss(source) {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === "/*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }
    const character = source[i];
    if (character === '"' || character === "'") {
      const [text, next] = copyString(source, i, character);
      out += text;
      i = next;
      continue;
    }
    // 따옴표 없는 url(...)은 안에 `;`이나 `:`이 든 자료 주소일 수 있으므로
    // 닫는 괄호까지 손대지 않고 옮긴다.
    if (source.slice(i, i + 4).toLowerCase() === "url(") {
      const end = source.indexOf(")", i);
      if (end !== -1 && !/^url\(\s*["']/i.test(source.slice(i))) {
        out += source.slice(i, end + 1);
        i = end + 1;
        continue;
      }
    }
    // 공백은 한 칸으로 줄인다. 선택자 사이의 결합자와 값 사이의 칸은 뜻이
    // 있으므로 없애지 않고, 구두점에 붙은 칸만 아래에서 떨어낸다.
    if (/\s/.test(character)) {
      let j = i;
      while (j < source.length && /\s/.test(source[j])) j += 1;
      out += " ";
      i = j;
      continue;
    }
    out += character;
    i += 1;
  }
  return (
    out
      // 구두점 양옆의 칸. `:`는 선택자에서도 쓰이므로 뒤쪽만 떨어낸다
      // (`a :hover`와 `a:hover`는 다른 것을 가리킨다).
      .replace(/\s*([{};,>])\s*/g, "$1")
      .replace(/([{};,:])\s+/g, "$1")
      .replace(/;}/g, "}")
      .trim()
  );
}

// 자바스크립트에서 `/`는 나눗셈일 수도 있고 정규식의 시작일 수도 있다.
// 바로 앞의 뜻있는 글자가 값을 끝낸 글자라면 나눗셈이고, 그렇지 않으면
// 정규식이다.
const VALUE_END = /[\w$)\]]/;

export function stripJsComments(source) {
  let out = "";
  let i = 0;
  let previous = "";
  while (i < source.length) {
    const character = source[i];
    const two = source.slice(i, i + 2);
    if (two === "//") {
      const end = source.indexOf("\n", i);
      i = end === -1 ? source.length : end;
      continue;
    }
    if (two === "/*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }
    if (character === '"' || character === "'") {
      const [text, next] = copyString(source, i, character);
      out += text;
      previous = character;
      i = next;
      continue;
    }
    // 템플릿 리터럴은 ${...} 안에 다시 아무 코드나 담을 수 있어 중첩을
    // 세어야 한다. 그 안의 주석은 지우지 않고 그대로 둔다: 뜻이 바뀌지
    // 않는 대신 세는 일이 단순해진다.
    if (character === "`") {
      let j = i + 1;
      let depth = 0;
      out += "`";
      while (j < source.length) {
        if (source[j] === "\\") {
          out += source.slice(j, j + 2);
          j += 2;
          continue;
        }
        if (source.slice(j, j + 2) === "${") depth += 1;
        else if (source[j] === "}" && depth > 0) depth -= 1;
        else if (source[j] === "`" && depth === 0) {
          out += "`";
          j += 1;
          break;
        }
        out += source[j];
        j += 1;
      }
      previous = "`";
      i = j;
      continue;
    }
    if (character === "/" && !VALUE_END.test(previous)) {
      // 정규식 리터럴. [] 안에서는 /가 닫지 않는다.
      let j = i + 1;
      let inClass = false;
      out += "/";
      while (j < source.length) {
        if (source[j] === "\\") {
          out += source.slice(j, j + 2);
          j += 2;
          continue;
        }
        if (source[j] === "[") inClass = true;
        else if (source[j] === "]") inClass = false;
        else if (source[j] === "/" && !inClass) {
          out += "/";
          j += 1;
          break;
        }
        out += source[j];
        j += 1;
      }
      previous = "/";
      i = j;
      continue;
    }
    out += character;
    if (!/\s/.test(character)) previous = character;
    i += 1;
  }
  // 주석만 있던 줄과 줄 끝의 칸을 걷어낸다. 줄바꿈은 남긴다: 세미콜론이
  // 없는 줄이 이어붙으면 뜻이 달라지고, gzip은 반복되는 줄바꿈을 거의
  // 공짜로 담는다.
  return out
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .filter((line) => line !== "")
    .join("\n");
}
