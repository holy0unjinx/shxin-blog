import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const port = 8123;
const base = `http://127.0.0.1:${port}`;
// 자기 폴더를 굽고 그것을 서빙한다. 예전에는 저장소의 dist/를 그대로 구웠고,
// 그러면 미리보기 서버가 보고 있던 dist/가 시험 한 번에 날아갔다.
const dist = mkdtempSync(join(tmpdir(), "shxin-serve-"));
let server;

// 편집기는 DEV일 때만 있다. 나가는 서버가 지금까지와 똑같다는 것을 위의
// 스위트가 지키고, 편집기가 실제로 도는지는 이 두 번째 서버가 본다.
// port + 1은 위의 "a development server caches nothing in place"가 이미
// 쓰고 있다. 같은 자리를 잡으면 그쪽 서버가 뜨지 못한다.
const devPort = port + 2;
const devBase = `http://127.0.0.1:${devPort}`;
const devDist = mkdtempSync(join(tmpdir(), "shxin-serve-dev-"));
// 진짜 draft/를 건드리지 않는다 — 시험이 저장소에 파일을 쓰면 안 된다.
const drafts = mkdtempSync(join(tmpdir(), "shxin-drafts-"));
let devServer;

const post = (path, body, base = devBase) =>
  fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

before(async () => {
  const build = spawnSync(process.execPath, ["site/build.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, OUT_DIR: dist },
  });
  assert.equal(build.status, 0, build.stderr);

  server = spawn(process.execPath, ["site/server.mjs"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), OUT_DIR: dist },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    server.stdout.once("data", resolve);
    server.once("error", reject);
  });

  const devBuild = spawnSync(process.execPath, ["site/build.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, DEV: "1", OUT_DIR: devDist, DRAFT_DIR: drafts },
  });
  assert.equal(devBuild.status, 0, devBuild.stderr);

  devServer = spawn(process.execPath, ["site/server.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      DEV: "1",
      PORT: String(devPort),
      OUT_DIR: devDist,
      DRAFT_DIR: drafts,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    devServer.stdout.once("data", resolve);
    devServer.once("error", reject);
    devServer.once("exit", (code) => reject(new Error(`dev server exited ${code}`)));
  });
});

after(() => {
  server?.kill();
  devServer?.kill();
  for (const dir of [dist, devDist, drafts])
    rmSync(dir, { recursive: true, force: true });
});

test("serves the home page with security headers", async () => {
  const response = await fetch(base + "/");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
  assert.match(await response.text(), /<header class="site-head">/);
});

test("directory routes resolve to their index.html", async () => {
  const response = await fetch(base + "/the-first-thing/");
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<div class="prose">/);
});

test("path traversal cannot escape dist", async () => {
  for (const path of [
    "/../package.json",
    "/../../etc/passwd",
    "/%2e%2e/package.json",
    "/..%2f..%2fpackage.json",
  ]) {
    const response = await fetch(base + path, { redirect: "manual" });
    assert.notEqual(response.status, 200, `${path} was served`);
  }
});

test("missing pages return the styled 404", async () => {
  const response = await fetch(base + "/nope/");
  assert.equal(response.status, 404);
  assert.match(await response.text(), /ERROR 404/);
});

// The stylesheet is served under its content hash, so the test asks the page
// which URL that is rather than hard-coding one.
async function styleUrl() {
  const html = await (await fetch(base + "/")).text();
  return "/" + html.match(/href="\/(style\.[0-9a-f]{8}\.css)"/)[1];
}

// 글꼴도 내용 지문으로 이름이 붙으므로 같은 방식으로 물어본다.
async function fontUrl() {
  const html = await (await fetch(base + "/")).text();
  return html.match(/href="(\/fonts\/sm-base\.[0-9a-f]{8}\.woff2)"/)[1];
}

test("unchanged files answer with 304", async () => {
  const style = await styleUrl();
  const first = await fetch(base + style);
  const etag = first.headers.get("etag");
  assert.ok(etag);
  const second = await fetch(base + style, {
    headers: { "If-None-Match": etag },
  });
  assert.equal(second.status, 304);
});

test("cache policy differs by asset class", async () => {
  const font = await fetch(base + (await fontUrl()));
  assert.match(font.headers.get("cache-control"), /immutable/);
  // A fingerprinted file never changes under its own name, so it is safe to
  // keep for a year; the page that points at it is not.
  const css = await fetch(base + (await styleUrl()));
  assert.match(css.headers.get("cache-control"), /immutable/);
  const page = await fetch(base + "/");
  assert.equal(page.headers.get("cache-control"), "no-cache");
});

test("a development server caches nothing in place", async () => {
  // A rebuild rewrites style.css where it stands, so an hour-long cache is
  // what turns an edit into "nothing happened until you hard reload".
  const devPort = port + 1;
  const dev = spawn(process.execPath, ["site/server.mjs"], {
    cwd: root,
    env: { ...process.env, PORT: String(devPort), DEV: "1", OUT_DIR: dist },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await new Promise((resolve, reject) => {
      dev.stdout.once("data", resolve);
      dev.once("error", reject);
    });
    const devBase = `http://127.0.0.1:${devPort}`;
    const style = await styleUrl();
    for (const path of [style, "/fonts/sm.woff2", "/"]) {
      const response = await fetch(devBase + path);
      assert.equal(
        response.headers.get("cache-control"),
        "no-cache",
        path,
      );
    }
    // Revalidation still works, so an unchanged file costs one 304.
    const first = await fetch(devBase + style);
    const again = await fetch(devBase + style, {
      headers: { "If-None-Match": first.headers.get("etag") },
    });
    assert.equal(again.status, 304);
  } finally {
    dev.kill();
  }
});

test("text responses are compressed when accepted", async () => {
  const response = await fetch(base + "/posts.json", {
    headers: { "Accept-Encoding": "gzip" },
  });
  assert.equal(response.headers.get("content-encoding"), "gzip");
  assert.ok(Array.isArray(await response.json()));
});

test("feed and crawler files are served with the right type", async () => {
  const expected = {
    "/rss.xml": "application/xml; charset=utf-8",
    "/sitemap.xml": "application/xml; charset=utf-8",
    "/robots.txt": "text/plain; charset=utf-8",
  };
  for (const [path, type] of Object.entries(expected)) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, `${path} is not served`);
    assert.equal(response.headers.get("content-type"), type);
  }
});

test("brotli is offered first and gzip stays for those who cannot take it", async () => {
  const style = await styleUrl();
  const brotli = await fetch(base + style, {
    headers: { "Accept-Encoding": "br, gzip" },
  });
  assert.equal(brotli.headers.get("content-encoding"), "br");
  // brotli를 못 받는다고 하면 gzip이 그대로 남는다.
  const gzip = await fetch(base + style, {
    headers: { "Accept-Encoding": "gzip" },
  });
  assert.equal(gzip.headers.get("content-encoding"), "gzip");
  // 먼저 묻는 이유가 크기이므로, 실제로 더 적게 나가야 한다.
  assert.ok(
    Number(brotli.headers.get("content-length")) <
      Number(gzip.headers.get("content-length")),
  );
  // 어느 쪽으로 받아도 같은 글이다.
  assert.equal(await brotli.text(), await gzip.text());
});

test("the search body index is served as json", async () => {
  const response = await fetch(base + "/search.json", {
    headers: { "Accept-Encoding": "br" },
  });
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("content-type"),
    "application/json; charset=utf-8",
  );
  assert.equal(response.headers.get("content-encoding"), "br");
  const bodies = await response.json();
  assert.ok(Array.isArray(bodies));
  assert.ok(bodies.every((entry) => entry.slug && typeof entry.text === "string"));
});

test("write methods are rejected", async () => {
  const response = await fetch(base + "/", { method: "POST" });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, HEAD");
});

test("a pre-compressed copy is served as it was built", async () => {
  // 빌드가 옆에 놓아둔 .gz를 그대로 흘려보내므로, 요청마다 다시 압축하는
  // 일이 없다. 압축본이 있을 때는 길이도 함께 알려 줄 수 있다.
  const style = await styleUrl();
  const packed = await fetch(base + style, {
    headers: { "Accept-Encoding": "gzip" },
  });
  assert.equal(packed.headers.get("content-encoding"), "gzip");
  assert.ok(Number(packed.headers.get("content-length")) > 0);
  assert.equal(packed.headers.get("vary"), "Accept-Encoding");
  // 같은 파일을 압축 없이 달라고 하면 원본 길이가 온다.
  const plain = await fetch(base + style, {
    headers: { "Accept-Encoding": "identity" },
  });
  assert.equal(plain.headers.get("content-encoding"), null);
  assert.ok(
    Number(plain.headers.get("content-length")) >
      Number(packed.headers.get("content-length")),
  );
  // 몸통은 어느 쪽으로 받아도 같은 글이다.
  assert.equal(await packed.text(), await plain.text());
});


// ── dev 전용 편집기 ─────────────────────────────────────────

test("편집기 페이지는 dev 빌드에만 선다", async () => {
  assert.equal((await fetch(devBase + "/write/")).status, 200);
  const html = await (await fetch(devBase + "/write/")).text();
  assert.match(html, /<textarea class="write-text"/);
  assert.match(html, /src="\/editor\.js"/);
  assert.match(html, /href="\/editor\.css"/);
  // 나가는 빌드에는 없다.
  assert.equal((await fetch(base + "/write/")).status, 404);
});

test("나가는 서버에는 편집기 경로가 없다", async () => {
  for (const path of ["/api/render", "/api/draft"]) {
    const response = await post(path, { source: "x" }, base);
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "GET, HEAD");
  }
});

test("원고가 실제 글과 같은 조판으로 돌아온다", async () => {
  const source = [
    "---",
    'title: "미리보기"',
    "date: 2026-09-11",
    "category: test",
    'description: "한 줄 요약."',
    "---",
    "",
    "본문입니다.",
    "",
    "```chart {type=bar}",
    ": {#fig:막대} 막대",
    "| 분기 | 1Q | 2Q |",
    "| 신규 | 12 | 18 |",
    "```",
    "",
    "$$",
    "E = mc^2",
    "$$",
  ].join("\n");
  const answer = await (await post("/api/render", { source })).json();
  assert.equal(answer.ok, true);
  assert.equal(answer.title, "미리보기");
  assert.match(answer.content, /<div class="prose">/);
  assert.match(answer.content, /<h1>미리보기<\/h1>/);
  // 그래프는 SVG가 되고 수식은 구워져서 온다 — 읽는 쪽이 다시 그릴 것이 없다.
  assert.match(answer.content, /<svg/);
  assert.equal(answer.math, true);
  assert.match(answer.content, /katex/);
  assert.deepEqual(answer.lint, []);
});

test("틀린 문법이 lint로 돌아온다", async () => {
  const answer = await (
    await post("/api/render", {
      source: "---\ntitle: t\ndate: 2026-09-11\ndescription: d\n---\n\n[@fig:없음]\n",
    })
  ).json();
  assert.equal(answer.ok, true);
  assert.ok(
    answer.lint.some((item) => item.message.includes("[@fig:없음]")),
    JSON.stringify(answer.lint),
  );
});

test("본문이 반쪽이어도 500이 되지 않는다", async () => {
  // 원고는 늘 반쪽인 순간을 지난다. 그때마다 화면이 깜빡이면 쓸 수 없다.
  for (const source of ["", "```chart {type=", "| 표 |", "$$"]) {
    const response = await post("/api/render", { source });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
  }
});

test("원고를 draft/에 쓴다", async () => {
  const source = "---\ntitle: 저장 시험\ndate: 2026-09-11\n---\n\n본문.\n";
  const answer = await (
    await post("/api/draft", { slug: "saved-here", source })
  ).json();
  assert.equal(answer.ok, true);
  assert.equal(answer.slug, "saved-here");
  assert.match(answer.path, /\/saved-here\.md$/);
  assert.equal(readFileSync(join(drafts, "saved-here.md"), "utf8"), source);
});

test("이름 없는 원고는 쓰지 않는다", async () => {
  // slugify는 빈 글자에 "uncategorized"를 돌려준다. 그 이름으로 파일이
  // 조용히 생기면, 저장한 줄 알았던 글이 엉뚱한 데 가 있다.
  for (const slug of ["", "   ", null]) {
    const response = await post("/api/draft", { slug, source: "x" });
    assert.equal(response.status, 400, `${JSON.stringify(slug)}가 통과했다`);
    assert.equal((await response.json()).ok, false);
  }
  assert.equal(existsSync(join(drafts, "uncategorized.md")), false);
});

test("이름이 어떻든 draft/ 밖으로는 쓰지 않는다", async () => {
  // 자리 구분자는 이름에서 살아남지 못한다 — "../../etc/passwd"는
  // "etc-passwd"가 되어 draft/ 안에 앉는다.
  for (const slug of ["../../etc/passwd", "/etc/passwd", "a/b", "....//x"]) {
    const response = await post("/api/draft", { slug, source: "x" });
    assert.equal(response.status, 200, slug);
    const answer = await response.json();
    assert.doesNotMatch(answer.slug, /[/\\]/, `${slug} → ${answer.slug}`);
    assert.ok(existsSync(join(drafts, `${answer.slug}.md`)), answer.slug);
  }
  // draft/ 안에 있는 것이 전부다 — 위로 올라간 파일이 하나도 없다.
  assert.deepEqual(readdirSync(drafts).sort(), [
    "a-b.md",
    "etc-passwd.md",
    "saved-here.md",
    "x.md",
  ]);
});

test("원고가 글이 아니면 쓰지 않는다", async () => {
  const response = await post("/api/draft", { slug: "not-text", source: 42 });
  assert.equal(response.status, 400);
  assert.equal(existsSync(join(drafts, "not-text.md")), false);
});

test("1MB를 넘는 원고는 받지 않는다", async () => {
  const response = await fetch(devBase + "/api/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: "가".repeat(600_000) }),
  });
  assert.equal(response.status, 413);
});

test("JSON이 아니면 받지 않는다", async () => {
  const plain = await fetch(devBase + "/api/render", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "source=x",
  });
  assert.equal(plain.status, 415);
  const broken = await fetch(devBase + "/api/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(broken.status, 400);
});

test("편집기 응답에도 보안 머리글이 붙는다", async () => {
  const response = await post("/api/render", { source: "x" });
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
});
