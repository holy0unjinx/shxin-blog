// dev 전용 편집기. 나가는 빌드에는 이 파일이 들어가지 않는다.
//
// 미리보기를 여기서 그리지 않는 것이 이 파일의 유일한 중요한 결정이다.
// 원고는 서버로 보내고 서버가 빌드와 같은 함수로 조판해 돌려준다 — 자료
// 파일을 읽고, 그림 크기를 재고, 수식을 굽는 일이 전부 빌드와 같은 자리에서
// 일어나므로, 미리보기와 나갈 글이 어긋날 방법이 없다.

(() => {
  const root = document.querySelector(".write");
  if (!root) return;

  const rail = root.querySelector(".write-rail");
  const text = root.querySelector(".write-text");
  const slug = root.querySelector(".write-slug");
  const paper = root.querySelector(".write-paper");
  const status = root.querySelector(".write-status");
  const save = root.querySelector(".write-save");
  const fresh = root.querySelector(".write-new");
  const { starter, groups } = JSON.parse(
    root.querySelector(".write-snippets").textContent,
  );

  const STORE = "paper-blog-write";
  const CARET = "$0";

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
    paper.innerHTML = answer.content;
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

  fresh.addEventListener("click", () => {
    if (text.value.trim() && !confirm("쓰던 원고를 버리고 새로 시작한다")) return;
    text.value = starter || "";
    slug.value = "";
    text.focus();
    schedule();
    remember();
  });

  const saved = recall();
  text.value = saved?.source || starter || "";
  slug.value = saved?.slug || "";
  draw();
})();
