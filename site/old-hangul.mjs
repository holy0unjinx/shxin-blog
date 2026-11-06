// /write/에서만 쓰는 옛한글 보조 입력. 보통 한글은 운영체제 입력기에 맡긴다.
// 팔레트를 누른 음절만 조합 자모(L/V/T)로 바꿔 저장한다.

export const OLD_HANGUL_KEYS = [
  { label: "ㆍ", title: "아래아", role: "vowel", char: "ᆞ" },
  { label: "ㆎ", title: "아래아·이", role: "vowel", char: "ᆡ" },
  { label: "ᆢ", title: "쌍아래아", role: "vowel", char: "ᆢ" },
  { label: "ㅿ 초성", title: "반치음 초성", role: "initial", char: "ᅀ" },
  { label: "ㆁ 초성", title: "옛이응 초성", role: "initial", char: "ᅌ" },
  { label: "ㆆ 초성", title: "여린히읗 초성", role: "initial", char: "ᅙ" },
  { label: "ㅸ 초성", title: "순경음 비읍 초성", role: "initial", char: "ᄫ" },
  { label: "ㅱ 초성", title: "순경음 미음 초성", role: "initial", char: "ᄝ" },
  { label: "ㆄ 초성", title: "순경음 피읖 초성", role: "initial", char: "ᅗ" },
  { label: "ㅿ 종성", title: "반치음 종성", role: "final", char: "ᇫ" },
  { label: "ㆁ 종성", title: "옛이응 종성", role: "final", char: "ᇰ" },
  { label: "ㆆ 종성", title: "여린히읗 종성", role: "final", char: "ᇹ" },
  { label: "ㅸ 종성", title: "순경음 비읍 종성", role: "final", char: "ᇦ" },
  { label: "ㅱ 종성", title: "순경음 미음 종성", role: "final", char: "ᇢ" },
  { label: "ㆄ 종성", title: "순경음 피읖 종성", role: "final", char: "ᇴ" },
  { label: "〮", title: "한 점 방점", role: "tone", char: "〮" },
  { label: "〯", title: "두 점 방점", role: "tone", char: "〯" },
];

// 아래아 뒤에 현대 받침을 이어 쓸 때에도 IME를 갈아 끼울 필요가 없게 한다.
export const OLD_HANGUL_FINALS = [
  ["ㄱ", "ᆨ"], ["ㄲ", "ᆩ"], ["ㄳ", "ᆪ"], ["ㄴ", "ᆫ"],
  ["ㄵ", "ᆬ"], ["ㄶ", "ᆭ"], ["ㄷ", "ᆮ"], ["ㄹ", "ᆯ"],
  ["ㄺ", "ᆰ"], ["ㄻ", "ᆱ"], ["ㄼ", "ᆲ"], ["ㄽ", "ᆳ"],
  ["ㄾ", "ᆴ"], ["ㄿ", "ᆵ"], ["ㅀ", "ᆶ"], ["ㅁ", "ᆷ"],
  ["ㅂ", "ᆸ"], ["ㅄ", "ᆹ"], ["ㅅ", "ᆺ"], ["ㅆ", "ᆻ"],
  ["ㅇ", "ᆼ"], ["ㅈ", "ᆽ"], ["ㅊ", "ᆾ"], ["ㅋ", "ᆿ"],
  ["ㅌ", "ᇀ"], ["ㅍ", "ᇁ"], ["ㅎ", "ᇂ"],
].map(([label, char]) => ({ label, title: `${label} 받침`, role: "final", char }));

const INITIALS = [..."ᄀᄁᄂᄃᄄᄅᄆᄇᄈᄉᄊᄋᄌᄍᄎᄏᄐᄑᄒ"];
const MEDIALS = [..."ᅡᅢᅣᅤᅥᅦᅧᅨᅩᅪᅫᅬᅭᅮᅯᅰᅱᅲᅳᅴᅵ"];
const COMPAT_INITIALS = [..."ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"];
const segmenter = new Intl.Segmenter("ko", { granularity: "grapheme" });

function kind(char) {
  const code = char.codePointAt(0);
  if ((code >= 0x1100 && code <= 0x115f) || (code >= 0xa960 && code <= 0xa97f)) return "initial";
  if ((code >= 0x1160 && code <= 0x11a7) || (code >= 0xd7b0 && code <= 0xd7c6)) return "vowel";
  if ((code >= 0x11a8 && code <= 0x11ff) || (code >= 0xd7cb && code <= 0xd7fb)) return "final";
  return code === 0x302e || code === 0x302f ? "tone" : "";
}

function parts(cluster) {
  if (!cluster) return null;
  if (cluster.length === 1) {
    const code = cluster.codePointAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const n = code - 0xac00;
      const tail = n % 28;
      return {
        initial: INITIALS[Math.floor(n / 588)],
        vowel: MEDIALS[Math.floor((n % 588) / 28)],
        final: tail ? String.fromCodePoint(0x11a7 + tail) : "",
        tone: "",
      };
    }
    const compat = COMPAT_INITIALS.indexOf(cluster);
    if (compat !== -1) return { initial: INITIALS[compat], vowel: "", final: "", tone: "" };
  }
  const result = { initial: "", vowel: "", final: "", tone: "" };
  for (const char of cluster) {
    const role = kind(char);
    if (!role) return null;
    result[role] += char;
  }
  return result.initial || result.vowel || result.final ? result : null;
}

function previousGrapheme(source, caret) {
  let previous = null;
  for (const part of segmenter.segment(source.slice(0, caret))) previous = part;
  return previous && previous.index + previous.segment.length === caret
    ? { start: previous.index, text: previous.segment }
    : null;
}

// 선택한 한 음절, 또는 커서 바로 앞의 한 음절을 고친다. 선택 범위가 여러
// 음절이면 해당 부분만 새 자모로 바꾼다. IME 조합 중에는 호출하지 않는다.
export function insertOldHangul(source, start, end, key) {
  const selected = source.slice(start, end);
  const picked = selected && [...segmenter.segment(selected)].length === 1
    ? { start, text: selected }
    : !selected ? previousGrapheme(source, start) : null;
  const current = picked && parts(picked.text);
  const canEdit = current && (key.role !== "initial" || Boolean(selected));

  if (key.role === "tone" && current) {
    const value = current.initial + current.vowel + current.final + key.char;
    const next = source.slice(0, picked.start) + value + source.slice(picked.start + picked.text.length);
    return { value: next, caret: picked.start + value.length };
  }
  if (canEdit && (key.role !== "final" || current.initial || current.vowel)) {
    current[key.role] = key.char;
    const value = current.initial + current.vowel + current.final + current.tone;
    const next = source.slice(0, picked.start) + value + source.slice(picked.start + picked.text.length);
    return { value: next, caret: picked.start + value.length };
  }
  const next = source.slice(0, start) + key.char + source.slice(end);
  return { value: next, caret: start + key.char.length };
}
