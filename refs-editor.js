// dev 전용 refs.bib 편집기. 파일이 밖에서 바뀌면 저장을 막아 원본을 지킨다.
(() => {
  const root = document.querySelector(".refs-edit");
  if (!root) return;

  const source = root.querySelector(".refs-text");
  const status = root.querySelector(".refs-status");
  const reload = root.querySelector(".refs-reload");
  const save = root.querySelector(".refs-save");
  const store = "paper-blog-refs";
  let version = "";
  let baseline = "";

  function say(message) {
    status.textContent = message;
  }

  function remember() {
    try {
      localStorage.setItem(store, JSON.stringify({ source: source.value, version }));
    } catch {
      // 저장 공간이 막혀 있어도 파일 편집은 계속할 수 있다.
    }
  }

  function recall() {
    try {
      return JSON.parse(localStorage.getItem(store) || "null");
    } catch {
      return null;
    }
  }

  function forget() {
    try {
      localStorage.removeItem(store);
    } catch {
      // 저장 공간이 막혀 있으면 지울 것도 없다.
    }
  }

  async function load(discard = false) {
    if (discard && source.value !== baseline &&
        !confirm("수정 중인 내용을 버리고 refs.bib를 다시 불러올까요?")) return;
    try {
      const response = await fetch("/api/refs", { cache: "no-store" });
      const answer = await response.json();
      if (!response.ok || !answer.ok) throw new Error(answer.message || "읽지 못했다");

      baseline = answer.source;
      version = answer.version;
      const saved = discard ? null : recall();
      if (saved && typeof saved.source === "string" && saved.source !== baseline) {
        source.value = saved.source;
        version = saved.version || "";
        say("브라우저에 남은 편집 내용을 복구했습니다. 파일이 바뀌었다면 저장 전에 다시 확인하세요.");
      } else {
        source.value = baseline;
        forget();
        say("refs.bib를 불러왔습니다.");
      }
      source.disabled = false;
    } catch (error) {
      say(`불러오기 실패 — ${error.message}`);
    }
  }

  source.disabled = true;
  source.addEventListener("input", remember);
  reload.addEventListener("click", () => load(true));
  save.addEventListener("click", async () => {
    if (source.disabled) return;
    if (!source.value.trim() && !confirm("참고문헌을 모두 지울까요?")) return;
    try {
      const response = await fetch("/api/refs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: source.value, version }),
      });
      const answer = await response.json();
      if (!response.ok || !answer.ok) throw new Error(answer.message || "저장하지 못했다");
      baseline = source.value;
      version = answer.version;
      forget();
      say("refs.bib를 저장했습니다. 개발 서버가 다시 빌드합니다.");
    } catch (error) {
      say(`저장 실패 — ${error.message}`);
    }
  });

  window.addEventListener("beforeunload", (event) => {
    if (source.disabled || source.value === baseline) return;
    event.preventDefault();
    event.returnValue = "";
  });

  load();
})();
