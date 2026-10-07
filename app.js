// Progressive enhancement only. Every page arrives fully rendered from the
// build step — formulas and syntax highlighting included — so this file adds
// copy buttons, the theme toggle, footnote and tooltip boxes, the contents
// rail and search on top of markup that already works without JavaScript.
(() => {
  const STORAGE_KEY = "paper-blog-theme";
  const root = document.documentElement;

  // Private-mode browsers throw on localStorage access, so every touch is
  // wrapped: a failure degrades to "theme is not remembered", never to a
  // broken page.
  const storage = {
    read() {
      try {
        return localStorage.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
    },
    write(value) {
      try {
        localStorage.setItem(STORAGE_KEY, value);
      } catch {
        /* storage unavailable */
      }
    },
  };

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
  }

  // The reading a reference carries. The note is already in the markup as
  // data-note, so this only decides where to put it: one shared box, fixed to
  // the viewport and clamped to it, so a reference at the end of a line can
  // never push the page sideways. Without this file the reference is still a
  // link to the printed list, which is the reading that matters.
  const NOTE_REF = ".footnote-ref[data-note], .tooltip[data-note]";
  const tip = document.createElement("div");
  tip.className = "note-tip";
  tip.hidden = true;

  // A tooltip ships its reading in `title` as well, which is what a reader
  // without this file sees. With the file here that box is redundant and
  // would sit on top of ours, so the attribute goes.
  for (const word of document.querySelectorAll(".tooltip[title]"))
    word.removeAttribute("title");

  function showNote(ref) {
    const note = ref.dataset.note;
    if (!note) return;
    tip.textContent = note;
    tip.hidden = false;
    if (!tip.isConnected) document.body.append(tip);

    const GAP = 8;
    // Measured from the left edge: a fixed box with a large left offset has
    // only the rest of the window to lay out in, and would report a width
    // narrowed by wherever the previous reference happened to be.
    tip.style.left = "0px";
    tip.style.top = "0px";
    const anchor = ref.getBoundingClientRect();
    const box = tip.getBoundingClientRect();
    const room = document.documentElement.clientWidth;
    const left = Math.min(
      Math.max(GAP, anchor.left + anchor.width / 2 - box.width / 2),
      Math.max(GAP, room - box.width - GAP),
    );
    // Above the reference, or below it when the top of the window is closer
    // than the box is tall.
    const above = anchor.top - GAP - box.height;
    tip.style.left = `${left}px`;
    tip.style.top = `${above >= GAP ? above : anchor.bottom + GAP}px`;
  }

  function hideNote() {
    pinned = null;
    tip.classList.remove("is-pinned");
    tip.hidden = true;
  }

  // A footnote number is a link into the printed list, so a reader with no
  // hover still has somewhere to go. A tooltip is not: its reading lives only
  // in this box, and `title` was removed above. Tapping one pins the box open
  // so a touch screen can read it, and a tap anywhere else puts it away.
  let pinned = null;

  document.addEventListener("pointerover", (event) => {
    const ref = event.target.closest?.(NOTE_REF);
    if (ref) showNote(ref);
    else if (!pinned && !tip.hidden) hideNote();
  });
  // Keyboard reaches the reference through its link, so the box follows focus
  // as well as the pointer.
  document.addEventListener("focusin", (event) => {
    const ref = event.target.closest?.(NOTE_REF);
    if (ref) showNote(ref);
    else if (!pinned) hideNote();
  });
  document.addEventListener("focusout", () => {
    if (!pinned) hideNote();
  });
  // A pinned box belongs to a word that moves with the page, so it is moved
  // rather than dropped.
  window.addEventListener(
    "scroll",
    () => {
      if (pinned) showNote(pinned);
      else hideNote();
    },
    { passive: true },
  );

  // 제목을 누르면 주소가 그 절을 가리킨다. 제목 안의 링크나 툴팁을 누른
  // 것이라면 그쪽이 먼저이므로 비켜 준다.
  const HEADING = ".prose h2, .prose h3, .prose h4, .prose h5, .prose h6";
  document.addEventListener("click", (event) => {
    if (event.target.closest("a, .tooltip, .notes-title")) return;
    const heading = event.target.closest(HEADING);
    if (heading?.id) location.hash = heading.id;
  });

  document.addEventListener("click", async (event) => {
    // 붙잡힌 상자 안을 누른 것은 바깥을 누른 것이 아니다. 긴 각주를
    // 고르거나 복사하는 동안 상자가 닫히면 안 된다.
    if (event.target.closest(".note-tip")) return;

    const tooltip = event.target.closest(".tooltip[data-note]");
    if (tooltip) {
      if (pinned === tooltip) hideNote();
      else {
        pinned = tooltip;
        tip.classList.add("is-pinned");
        showNote(tooltip);
      }
      return;
    }
    if (pinned) hideNote();

    const toggle = event.target.closest(".theme-toggle");
    if (toggle) {
      const theme = root.dataset.theme === "dark" ? "light" : "dark";
      root.dataset.theme = theme;
      storage.write(theme);
      return;
    }

    const button = event.target.closest(".copy-code");
    if (!button) return;
    const code = button.closest(".code-block")?.querySelector("code");
    if (!code) return;
    await copy(code.textContent);
    button.textContent = "Copied!";
    setTimeout(() => {
      button.textContent = "Copy";
    }, 1500);
  });

  // Keep a stored preference authoritative if the pre-paint script could not
  // reach storage for any reason.
  const saved = storage.read();
  if (saved && saved !== root.dataset.theme) root.dataset.theme = saved;

  // ── 목차: 읽고 있는 절과 진행 정도 ──────────────────────────────────────
  // The list itself already works as links without this. What is added here
  // is which entry is being read, and how far into the article the reader is
  // — drawn as ink filling the rule beside the contents rather than as a bar
  // across the top, which would not belong on a page set as a paper.
  function tableOfContents() {
    const toc = document.querySelector(".toc");
    if (!toc) return;
    const fold = toc.querySelector(".toc-fold");
    const progress = toc.querySelector(".toc-progress");
    const prose = document.querySelector(".prose");
    const entries = [...toc.querySelectorAll("a[href^='#']")]
      .map((link) => {
        let id = link.getAttribute("href").slice(1);
        try {
          id = decodeURIComponent(id);
        } catch {
          /* href was not encoded */
        }
        return { link, heading: document.getElementById(id) };
      })
      .filter((entry) => entry.heading);
    if (!entries.length) return;

    // The section being read is the last one whose heading has passed this
    // line, not the topmost one on screen: a long section keeps the mark
    // while its heading is far above the window.
    const READ_LINE = 120;
    const rail = toc.querySelector(".toc-rail");
    const clamp = (value) => Math.min(Math.max(value, 0), 1);
    const middle = (element) => {
      const box = element.getBoundingClientRect();
      return box.top + box.height / 2;
    };

    // A heading followed straight by a subheading holds no text between them,
    // so it is a few pixels wide in the article and a whole row tall in the
    // contents. Reading the ink off that section alone would send it down a
    // full row within those few pixels of scrolling, which is the lurch. Such
    // a run of headings is therefore folded into one point, and the ink
    // crosses the rows it covers over the section that does hold text. A
    // section shorter than this holds no paragraph.
    const FOLD = 160;
    // 문서에서의 자리 d를 자 위의 자리 r로 옮기는 표. 두 값 모두 늘기만
    // 하므로 먹은 뒤로 물러나지 않는다.
    let map = [];

    function build() {
      if (!rail || !rail.offsetHeight || !prose) {
        map = [];
        return;
      }
      const box = prose.getBoundingClientRect();
      const railBox = rail.getBoundingClientRect();
      if (box.height <= 0 || railBox.height <= 0) {
        map = [];
        return;
      }
      map = [{ d: 0, r: 0 }];
      for (const entry of entries) {
        const point = {
          d: entry.heading.getBoundingClientRect().top - box.top,
          // 그 줄의 가운데. li의 상자는 하위 절까지 감싸므로 부모 항목에서는
          // 제 줄을 가리키지 않는다.
          r: middle(entry.link) - railBox.top,
        };
        // 앞 자리와 너무 붙었으면 같은 묶음이므로 새 자리를 두지 않는다.
        // 첫 항목은 늘 둔다: 글 맨 위에 있어 원점과 붙어 있을 뿐이다.
        if (map.length > 1 && point.d - map[map.length - 1].d < FOLD) continue;
        map.push(point);
      }
      map.push({ d: box.height, r: railBox.height });
    }

    function ink(at) {
      if (map.length < 2) return 0;
      if (at <= map[0].d) return map[0].r;
      for (let i = 1; i < map.length; i++) {
        const from = map[i - 1];
        const to = map[i];
        if (at > to.d) continue;
        const span = to.d - from.d;
        const through = span > 0 ? (at - from.d) / span : 1;
        return from.r + (to.r - from.r) * through;
      }
      return map[map.length - 1].r;
    }

    // A long contents runs past the 74vh the rule is given and scrolls inside
    // it, which can carry the row being read out of sight. Only the contents
    // are moved — never the page — so this cannot fight the reader's scroll.
    function reveal(link) {
      if (toc.scrollHeight <= toc.clientHeight) return;
      const row = link.getBoundingClientRect();
      const frame = toc.getBoundingClientRect();
      const EDGE = 10;
      if (row.top < frame.top + EDGE)
        toc.scrollTop -= frame.top + EDGE - row.top;
      else if (row.bottom > frame.bottom - EDGE)
        toc.scrollTop += row.bottom - frame.bottom + EDGE;
    }

    let current = null;
    let read = -2;

    function update() {
      const room = document.documentElement.scrollHeight - window.innerHeight;
      const scrolled = room > 0 ? clamp(window.scrollY / room) : 1;
      const atEnd = room <= 0 || window.scrollY >= room - 1;
      let found = null;
      for (const entry of entries)
        if (entry.heading.getBoundingClientRect().top <= READ_LINE)
          found = entry;
      // 맨 아래까지 내렸으면 읽고 있는 절은 마지막 절이다. 창이 높으면
      // 마지막 제목이 읽는 선까지 올라오지 못해, 그대로 두면 표시가 앞 절에
      // 머물고 그 구간의 상한이 먹까지 붙잡는다.
      if (atEnd) found = entries[entries.length - 1];
      const marked = found || entries[0];
      if (marked !== current) {
        current?.link.classList.remove("is-current");
        marked.link.classList.add("is-current");
        current = marked;
        reveal(marked.link);
      }
      // 지나온 절과 아직 안 본 절을 눈금의 진하기로 가른다. 자에 차오르는
      // 먹과 같은 이야기를 눈금 쪽에서 하는 것이므로, 접힌 자만 보고도 어디까지
      // 읽었는지 읽힌다. 줄마다 손대는 것은 그 경계가 옮겨갔을 때뿐이다.
      const passed = found ? entries.indexOf(found) : -1;
      if (passed !== read) {
        entries.forEach((entry, index) =>
          entry.link.classList.toggle("is-read", index <= passed),
        );
        read = passed;
      }
      // The rule is drawn only where there is a margin to draw it in.
      if (!progress || !rail || !rail.offsetHeight || !prose) return;
      const box = prose.getBoundingClientRect();
      if (box.height <= 0) return;
      const railBox = rail.getBoundingClientRect();
      // The ink is poured by how far the page has been scrolled, not by the
      // reading line: at the foot of the page there is still article below
      // that line, so a position taken from it could never reach the end and
      // the rule would stop short of full.
      // Folding a run of headings leaves the ink to cross their rows over the
      // section that follows, which lets it run a row ahead of the mark. The
      // two sit beside each other, so the ink is held inside the band of the
      // section being read: it may travel anywhere between this row and the
      // next, and never past a row the reader has not reached.
      const rowAt = (entry) =>
        entry ? middle(entry.link) - railBox.top : railBox.height;
      const index = found ? entries.indexOf(found) : -1;
      const floor = found ? rowAt(found) : 0;
      const ceiling = rowAt(entries[index + 1]);
      const at = ink(scrolled * box.height);
      progress.style.height = `${Math.min(Math.max(at, floor), ceiling)}px`;
    }

    let queued = false;
    function schedule() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        update();
      });
    }
    function relayout() {
      build();
      update();
    }
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", relayout, { passive: true });
    // The rule may scroll inside itself when the contents run long, which
    // moves the rows the table was built against.
    toc.addEventListener("scroll", relayout, { passive: true });
    // 여백의 자로 들어낼 창에서는 접힌 차례가 있을 수 없다. 좁은 창에서
    // 접어 둔 채 창을 넓히면 자리는 잡혀 있는데 줄이 없는 자가 남으므로,
    // 그 경계를 넘는 순간 펼친다. 좁은 창으로 돌아갈 때는 건드리지 않는다.
    // 경계값은 stylesheet의 목차 규칙과 같은 값이어야 한다.
    if (fold) {
      const wide = window.matchMedia("(min-width: 1240px)");
      const unfold = () => {
        if (wide.matches) fold.open = true;
      };
      wide.addEventListener("change", unfold);
      unfold();
      // 접고 펴면 자와 줄의 자리가 달라진다.
      fold.addEventListener("toggle", relayout);
    }
    // The table is built off the laid-out article, so a web font arriving
    // after this runs would leave it measuring the page as it was.
    document.fonts?.ready.then(relayout);
    relayout();
  }

  // ── 검색 ────────────────────────────────────────────────────────────────
  // 목록(posts.json)은 이미 site index로 지어져 있고, 본문(search.json)은
  // 검색만 쓰는 두 번째 파일이다. 둘 다 검색창을 처음 열 때 한 번 받아서
  // 들고 있는다. 본문을 따로 둔 것은, 검색을 열지 않는 사람이 글 전체를
  // 받는 일이 없게 하려는 것이다.
  const CHOSUNG = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";

  // "ㅇㄹ"로 "인류"를 찾는다. 한글 음절은 첫소리를 정해진 자리에 두므로
  // 사전 없이 제목의 초성을 읽어 낼 수 있다.
  //
  // 굵게 칠 자리를 제목에서 되짚어야 하므로 글자마다 시작 위치를 함께
  // 적는다. 초성 문자열은 코드 포인트 하나를 반드시 한 칸으로 쓰고,
  // 두 칸짜리 글자는 자리표로 바꾼다 — 초성 질의에는 자음만 오니 자리표가
  // 걸리는 일은 없다.
  function foldInitials(value) {
    let text = "";
    const offsets = [];
    let at = 0;
    for (const character of value) {
      offsets.push(at);
      const code = character.codePointAt(0) - 0xac00;
      text +=
        code >= 0 && code <= 11171
          ? CHOSUNG[Math.floor(code / 588)]
          : character.length > 1
            ? "￼"
            : character;
      at += character.length;
    }
    offsets.push(at);
    return { text, offsets };
  }

  const isInitialsQuery = (query) =>
    query.length > 0 && [...query].every((character) => CHOSUNG.includes(character));

  // 찾은 자리를 [시작, 끝]으로 모은다.
  function ranges(text, query) {
    const found = [];
    if (!query) return found;
    const hay = text.toLowerCase();
    let from = 0;
    for (;;) {
      const at = hay.indexOf(query, from);
      if (at < 0) return found;
      found.push([at, at + query.length]);
      from = at + query.length;
    }
  }

  // 글을 넣으면서 찾은 자리만 굵게 낸다. 글은 반드시 글자로만 넣는다 —
  // 여기서 markup을 지으면 글 안의 태그가 그대로 살아난다.
  function paint(target, text, spans) {
    target.textContent = "";
    let from = 0;
    for (const [start, end] of spans) {
      if (start < from) continue;
      if (start > from) target.append(text.slice(from, start));
      const bold = document.createElement("b");
      bold.textContent = text.slice(start, end);
      target.append(bold);
      from = end;
    }
    target.append(text.slice(from));
  }

  // 본문에서 걸린 글은 왜 걸렸는지가 화면에 없다. 맞은 자리 앞뒤를 잘라
  // 붙여 보인다.
  //
  // 앞뒤를 같은 길이로 잡으면 맞은 자리가 조각 한가운데에 놓이는데, 좁은
  // 화면에서 조각이 접히면 그 한가운데가 잘려 나간다. 앞은 자리를 잡을 만큼만
  // 두고 뒤를 길게 잡아, 굵게 칠한 자리가 늘 첫 줄에 오게 한다.
  const LEAD = 24;
  const TRAIL = 120;
  function snippet(text, query) {
    const at = text.toLowerCase().indexOf(query);
    if (at < 0) return null;
    const from = Math.max(0, at - LEAD);
    const to = Math.min(text.length, at + query.length + TRAIL);
    return (
      (from > 0 ? "… " : "") +
      text.slice(from, to) +
      (to < text.length ? " …" : "")
    );
  }

  function search() {
    const opener = document.querySelector(".search-open");
    if (!opener) return;
    // The button does nothing without this file, so the markup ships it
    // hidden and it is revealed only once there is something behind it.
    opener.hidden = false;

    const panel = document.createElement("div");
    panel.className = "search";
    panel.hidden = true;
    panel.innerHTML =
      '<div class="search-box" role="dialog" aria-modal="true" aria-label="글 검색">' +
      '<input class="search-input" type="search" autocomplete="off" placeholder="제목 · 초록 · 본문 검색" aria-label="검색어">' +
      '<ul class="search-results" role="listbox"></ul>' +
      '<p class="search-hint">↑↓ Move · Enter Open · Esc Close</p>' +
      "</div>";
    document.body.append(panel);

    const input = panel.querySelector(".search-input");
    const list = panel.querySelector(".search-results");
    let posts = null;
    let matches = [];
    let cursor = 0;
    let restoreFocus = null;

    async function load() {
      if (posts) return posts;
      try {
        const [index, bodies] = await Promise.all([
          fetch("/posts.json").then((response) => response.json()),
          // 본문이 없어도 검색은 돌아간다. 이쪽만 실패하면 제목과 초록까지로
          // 좁혀서 그대로 쓴다.
          fetch("/search.json")
            .then((response) => response.json())
            .catch(() => []),
        ]);
        const bodyText = new Map(
          bodies.map((entry) => [entry.slug, entry.text || ""]),
        );
        posts = index.map((post) => ({
          ...post,
          haystack: [post.title, post.description, post.category, ...(post.keywords || [])]
            .join(" ")
            .toLowerCase(),
          initials: foldInitials(post.title),
          text: bodyText.get(post.slug) || "",
        }));
        return posts;
      } catch {
        posts = [];
      }
      return posts;
    }

    function draw() {
      if (!matches.length) {
        list.innerHTML = `<li class="search-empty">${
          input.value.trim() ? "찾는 글이 없습니다." : "검색어를 입력하세요."
        }</li>`;
        return;
      }
      list.innerHTML = matches
        .map(
          (post, index) =>
            `<li role="option" aria-selected="${index === cursor}"><a href="/${encodeURIComponent(
              post.slug,
            )}/"><strong></strong><small></small><span class="search-snippet"></span></a></li>`,
        )
        .join("");
      // Titles and abstracts are written by hand and go in as text, never as
      // markup, so a post that happens to contain a tag cannot inject it.
      const query = input.value.trim().toLowerCase();
      const initialsQuery = isInitialsQuery(query);
      [...list.querySelectorAll("li")].forEach((item, index) => {
        const post = matches[index];
        // 초성으로 찾았으면 제목에는 그 글자가 없다. 초성 문자열에서 맞은
        // 자리를 제목의 자리로 되돌려 굵게 낸다.
        const titleSpans = initialsQuery
          ? ranges(post.initials.text, query).map(([start, end]) => [
              post.initials.offsets[start],
              post.initials.offsets[end],
            ])
          : ranges(post.title, query);
        paint(item.querySelector("strong"), post.title, titleSpans);

        // A hit on a keyword is otherwise invisible: neither the title nor
        // the abstract shows why the post came up. The keywords that carried
        // the match are named on the line.
        const hits = initialsQuery
          ? []
          : (post.keywords || []).filter((word) =>
              word.toLowerCase().includes(query),
            );
        const meta = [post.category, post.date, hits.join(" · ")]
          .filter(Boolean)
          .join(" · ");
        paint(item.querySelector("small"), meta, initialsQuery ? [] : ranges(meta, query));

        // 제목에도 초록에도 없으면 본문에서 걸린 것이다. 그 대목을 보인다.
        const line =
          initialsQuery || post.haystack.includes(query)
            ? null
            : snippet(post.text, query);
        const box = item.querySelector(".search-snippet");
        if (line) paint(box, line, ranges(line, query));
        else box.remove();
      });
    }

    function run() {
      const query = input.value.trim().toLowerCase();
      if (!posts || !query) {
        matches = [];
        cursor = 0;
        draw();
        return;
      }
      if (isInitialsQuery(query)) {
        matches = posts.filter((post) => post.initials.text.includes(query));
      } else {
        // 제목·초록·분류·키워드에서 걸린 글이 먼저고, 본문에서만 걸린 글이
        // 그 뒤에 붙는다. 본문은 넓게 걸리므로 뒤로 두지 않으면 손으로 쓴
        // 제목이 묻힌다.
        const named = [];
        const inBody = [];
        for (const post of posts) {
          if (post.haystack.includes(query)) named.push(post);
          else if (post.text.toLowerCase().includes(query)) inBody.push(post);
        }
        matches = named.concat(inBody);
      }
      cursor = 0;
      draw();
    }

    function move(step) {
      if (!matches.length) return;
      cursor = (cursor + step + matches.length) % matches.length;
      draw();
      list.children[cursor]?.scrollIntoView({ block: "nearest" });
    }

    async function open() {
      restoreFocus = document.activeElement;
      panel.hidden = false;
      input.value = "";
      matches = [];
      draw();
      input.focus();
      await load();
      run();
    }

    function close() {
      panel.hidden = true;
      restoreFocus?.focus?.();
    }

    opener.addEventListener("click", open);
    input.addEventListener("input", run);
    panel.addEventListener("click", (event) => {
      if (event.target === panel) close();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        move(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        move(-1);
      } else if (event.key === "Enter") {
        const href = list.children[cursor]?.querySelector("a")?.href;
        if (href) {
          event.preventDefault();
          location.href = href;
        }
      }
    });

    // "/" is the shortcut a reader expects on a page of text, and Cmd/Ctrl+K
    // is the one they bring from everywhere else. Neither may fire while
    // something is already being typed into.
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (!panel.hidden) close();
        else hideNote();
        return;
      }
      const typing =
        event.target.closest?.("input, textarea, select, [contenteditable]");
      if (typing) return;
      if (event.key === "/" || ((event.metaKey || event.ctrlKey) && event.key === "k")) {
        event.preventDefault();
        open();
      }
    });
  }

  tableOfContents();
  search();
})();
