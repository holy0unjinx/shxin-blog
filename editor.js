// dev 전용 편집기. 나가는 빌드에는 이 파일이 들어가지 않는다.
//
// 미리보기를 여기서 그리지 않는 것이 이 파일의 유일한 중요한 결정이다.
// 원고는 서버로 보내고 서버가 빌드와 같은 함수로 조판해 돌려준다 — 자료
// 파일을 읽고, 그림 크기를 재고, 수식을 굽는 일이 전부 빌드와 같은 자리에서
// 일어나므로, 미리보기와 나갈 글이 어긋날 방법이 없다.

import { insertOldHangul, OLD_HANGUL_FINALS, OLD_HANGUL_KEYS } from "./old-hangul.mjs";

(() => {
  const root = document.querySelector(".write");
  if (!root) return;

  const rail = root.querySelector(".write-rail");
  const text = root.querySelector(".write-text");
  const slug = root.querySelector(".write-slug");
  const frame = root.querySelector(".write-frame");
  const previewScroll = root.querySelector(".write-preview-scroll");
  const widthButtons = [...root.querySelectorAll("[data-preview-width]")];
  const status = root.querySelector(".write-status");
  const save = root.querySelector(".write-save");
  const load = root.querySelector(".write-load");
  const fresh = root.querySelector(".write-new");
  const { starter, groups } = JSON.parse(
    root.querySelector(".write-snippets").textContent,
  );

  const STORE = "paper-blog-write";
  const WIDTH_STORE = "paper-blog-preview-width";
  const CARET = "$0";

  // 프레임의 viewport가 실제 선택 폭이다. 본문 CSS의 @media도 이 폭을
  // 따르므로 좁은 화면의 그림·수식·글자 크기를 별도로 흉내 낼 필요가 없다.
  let previewHtml = "";
  function showPreview() {
    const doc = frame.contentDocument;
    const target = doc?.querySelector(".write-paper");
    if (!target) return;
    target.innerHTML = previewHtml;
    doc.documentElement.dataset.theme = document.documentElement.dataset.theme;
  }
  const boundFrames = new WeakSet();
  function frameReady() {
    showPreview();
    const doc = frame.contentDocument;
    if (!doc || boundFrames.has(doc)) return;
    boundFrames.add(doc);
    doc.addEventListener("click", (event) => {
      const link = event.target.closest?.("a[href]");
      if (link && !link.getAttribute("href").startsWith("#")) event.preventDefault();
    });
  }
  frame.addEventListener("load", frameReady);
  if (frame.contentDocument?.readyState === "complete") frameReady();
  new MutationObserver(() => {
    const doc = frame.contentDocument;
    if (doc) doc.documentElement.dataset.theme = document.documentElement.dataset.theme;
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  // iframe viewport는 고른 폭 그대로다. 칸이 더 좁으면 배율만 낮춰 맞춘다 —
  // width를 줄이면 @media가 바뀌어 768 미리보기가 아니게 된다.
  // 높이는 CSS 변수로만 잡고, 여기서 clientHeight를 다시 쓰지 않는다.
  // 예전에 높이·스크롤바를 건드릴 때마다 ResizeObserver가 다시 돌아 깜빡였다.
  let chosenWidth = "768";
  let appliedKey = "";
  function applyPreviewWidth() {
    const wanted = Number(chosenWidth);
    const room = previewScroll.clientWidth;
    if (room <= 0) return;
    const scale = Math.min(1, room / wanted);
    const key = `${wanted}:${room}`;
    if (key === appliedKey) return;
    appliedKey = key;
    if (frame.getAttribute("width") !== String(wanted)) frame.width = String(wanted);
    previewScroll.style.setProperty("--preview-width", `${wanted}px`);
    previewScroll.style.setProperty("--preview-scale", String(scale));
    previewScroll.style.setProperty("--preview-fit-width", `${wanted * scale}px`);
  }
  function setPreviewWidth(width) {
    if (!["390", "768", "1280"].includes(width)) return;
    chosenWidth = width;
    appliedKey = "";
    for (const button of widthButtons)
      button.setAttribute("aria-pressed", String(button.dataset.previewWidth === width));
    applyPreviewWidth();
    try { localStorage.setItem(WIDTH_STORE, width); } catch { /* storage unavailable */ }
  }
  for (const button of widthButtons)
    button.addEventListener("click", () => setPreviewWidth(button.dataset.previewWidth));
  new ResizeObserver(applyPreviewWidth).observe(previewScroll);
  try {
    setPreviewWidth(localStorage.getItem(WIDTH_STORE) || "768");
  } catch {
    setPreviewWidth("768");
  }

  function remember() {
    try {
      localStorage.setItem(
        STORE,
        JSON.stringify({ slug: slug.value, source: text.value }),
      );
    } catch {
      /* storage unavailable */
    }
  }

  function recall() {
    try {
      return JSON.parse(localStorage.getItem(STORE) || "null");
    } catch {
      return null;
    }
  }

  // 상태줄 한 줄. lint는 오류를 먼저 세운다 — 경고 스무 건 아래에 묻힌
  // 오류는 없는 것과 같다.
  function say(message, findings) {
    status.textContent = "";
    status.dataset.level = "";
    const line = document.createElement("span");
    line.textContent = message;
    status.append(line);
    if (!findings || !findings.length) return;
    const errors = findings.filter((item) => item.level === "error");
    status.dataset.level = errors.length ? "error" : "warn";
    const list = document.createElement("ul");
    for (const item of [...errors, ...findings.filter((i) => i.level !== "error")]) {
      const row = document.createElement("li");
      row.dataset.level = item.level;
      row.textContent = item.message;
      list.append(row);
    }
    status.append(list);
  }

  // 커서 자리에 조각을 꽂는다.
  //
  // block인 조각은 제 줄에서 시작하고 제 줄에서 끝나야 한다 — 문단 한가운데
  // 꽂힌 표는 표가 아니라 파이프가 섞인 글자다. 그래서 앞뒤로 빈 줄이
  // 있는지 보고, 없으면 만든다. 이미 있으면 더 만들지 않는다.
  function insert(snippet, block) {
    const start = text.selectionStart;
    const end = text.selectionEnd;
    const before = text.value.slice(0, start);
    const after = text.value.slice(end);

    let head = "";
    let tail = "";
    if (block) {
      if (before && !/\n\n$/.test(before)) head = /\n$/.test(before) ? "\n" : "\n\n";
      if (after && !/^\n\n/.test(after)) tail = /^\n/.test(after) ? "\n" : "\n\n";
    }

    const at = snippet.indexOf(CARET);
    const body = snippet.split(CARET).join("");
    text.value = before + head + body + tail + after;
    const caret = start + head.length + (at === -1 ? body.length : at);
    text.focus();
    text.setSelectionRange(caret, caret);
    schedule();
    remember();
  }

  for (const button of rail.querySelectorAll("button[data-at]"))
    button.addEventListener("click", () => {
      const [group, item] = button.dataset.at.split(".").map(Number);
      const chosen = groups[group]?.items[item];
      if (chosen) insert(chosen.snippet, chosen.block);
    });

  // 현대 한글은 IME가 조합한다. 옛 자모 버튼을 누를 때만 커서 음절을
  // 조합 자모로 바꾼다. 조합 중 버튼을 눌러도 IME의 미완성 글자를 훼손하지 않는다.
  let composing = false;
  text.addEventListener("compositionstart", () => { composing = true; });
  text.addEventListener("compositionend", () => { composing = false; });
  for (const [attribute, keys] of [
    ["data-old", OLD_HANGUL_KEYS],
    ["data-final", OLD_HANGUL_FINALS],
  ])
    for (const button of rail.querySelectorAll(`button[${attribute}]`))
      button.addEventListener("click", () => {
        if (composing) return;
        const key = keys[Number(button.getAttribute(attribute))];
        if (!key) return;
        const result = insertOldHangul(text.value, text.selectionStart, text.selectionEnd, key);
        text.value = result.value;
        text.focus();
        text.setSelectionRange(result.caret, result.caret);
        schedule();
        remember();
      });

  // 늦게 온 응답이 최신 응답을 덮지 않게 한다. 빠르게 치면 요청 셋이 동시에
  // 날아 있고, 돌아오는 순서는 보낸 순서가 아니다.
  let sent = 0;
  let shown = 0;
  let timer = 0;

  async function draw() {
    const mine = ++sent;
    let answer;
    try {
      const response = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: text.value }),
      });
      answer = await response.json();
    } catch (error) {
      // 서버가 다시 뜨는 중이다 — 저장하면 nodemon이 빌드를 돌리고 그 사이
      // 서버가 잠깐 없다. 그린 것을 그대로 두고 말만 한다.
      if (mine > shown) say(`서버에 닿지 못했다 — ${error.message}`);
      return;
    }
    if (mine <= shown) return;
    shown = mine;
    if (!answer.ok) {
      // 원고는 늘 반쪽인 순간을 지난다. 마지막으로 성공한 화면을 지운 채
      // 오류만 세워 두면 쓰는 사람이 자리를 잃는다.
      say(`렌더 실패 — ${answer.message}`);
      return;
    }
    previewHtml = answer.content;
    showPreview();
    if (!slug.value && answer.slug && answer.slug !== "preview")
      slug.value = answer.slug;
    const count = answer.lint.length;
    say(count ? `lint ${count}건` : "이상 없음", answer.lint);
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(draw, 250);
  }

  text.addEventListener("input", () => {
    schedule();
    remember();
  });
  slug.addEventListener("input", remember);

  // Tab이 다음 칸으로 가 버리면 코드 펜스 안을 들여쓸 수 없다. 이 칸
  // 안에서만 두 칸을 넣는다.
  text.addEventListener("keydown", (event) => {
    if (event.key !== "Tab" || event.shiftKey) return;
    event.preventDefault();
    insert("  ", false);
  });

  save.addEventListener("click", async () => {
    const name = slug.value.trim();
    if (!name) {
      say("이름(slug)을 먼저 적는다");
      slug.focus();
      return;
    }
    try {
      const response = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: name, source: text.value }),
      });
      const answer = await response.json();
      if (!answer.ok) {
        say(`저장 실패 — ${answer.message}`);
        return;
      }
      slug.value = answer.slug;
      remember();
      status.textContent = "";
      const line = document.createElement("span");
      line.textContent = `${answer.path} 저장됨 — 다시 굽고 나면 `;
      const link = document.createElement("a");
      link.href = `/${encodeURIComponent(answer.slug)}/`;
      link.textContent = `/${answer.slug}/`;
      status.dataset.level = "";
      status.append(line, link);
    } catch (error) {
      say(`저장 실패 — ${error.message}`);
    }
  });

  async function loadDraft(name) {
    const wanted = (name ?? slug.value).trim();
    if (!wanted) {
      say("이름(slug)을 먼저 적는다");
      slug.focus();
      return false;
    }
    if (
      text.value.trim() &&
      text.value !== starter &&
      !confirm("쓰던 원고를 버리고 불러온다")
    )
      return false;
    try {
      const response = await fetch(
        `/api/draft?slug=${encodeURIComponent(wanted)}`,
      );
      const answer = await response.json();
      if (!answer.ok) {
        say(`불러오기 실패 — ${answer.message}`);
        return false;
      }
      text.value = answer.source;
      slug.value = answer.slug;
      remember();
      schedule();
      say(`${answer.path} 불러옴`);
      return true;
    } catch (error) {
      say(`불러오기 실패 — ${error.message}`);
      return false;
    }
  }

  load.addEventListener("click", () => {
    loadDraft();
  });
  slug.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    loadDraft();
  });

  fresh.addEventListener("click", () => {
    if (text.value.trim() && !confirm("쓰던 원고를 버리고 새로 시작한다")) return;
    text.value = starter || "";
    slug.value = "";
    text.focus();
    schedule();
    remember();
  });

  const wanted = new URLSearchParams(location.search).get("slug");
  const saved = recall();
  text.value = saved?.source || starter || "";
  slug.value = saved?.slug || "";
  if (wanted) {
    // 주소로 다른 원고를 열더라도 브라우저에 남은 미저장 글을 묻지 않고
    // 덮어쓰지는 않는다. 불러오기에 실패하면 그 글을 계속 보여 준다.
    loadDraft(wanted).then((ok) => {
      if (!ok) draw();
    });
  } else {
    draw();
  }
})();
