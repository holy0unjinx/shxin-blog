import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream";
import { constants, createBrotliCompress, createGzip } from "node:zlib";

// 내보낼 자리는 빌드가 쓴 자리와 같아야 한다. 시험이 자기 폴더를 굽고
// 그것을 서빙할 수 있어야, 돌고 있는 미리보기 서버의 dist/를 건드리지 않는다.
const root = resolve(process.cwd(), process.env.OUT_DIR || "dist");
const port = Number(process.env.PORT || 8002);

const TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

const COMPRESSIBLE = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".svg",
  ".txt",
  ".xml",
]);

// 고른 순서가 곧 우선순위다. 빌드가 나란히 놓아둔 파일의 확장자와 여기 적은
// 확장자는 같아야 하며, stream()은 그 파일이 없을 때만 쓰이므로 빌드가 쓰는
// 최고 단계가 아니라 요청 하나를 붙잡지 않을 만큼만 세게 짠다.
const CODECS = [
  {
    encoding: "br",
    extension: ".br",
    accepted: (value) => /\bbr\b/.test(value),
    stream: () =>
      createBrotliCompress({
        params: { [constants.BROTLI_PARAM_QUALITY]: 5 },
      }),
  },
  {
    encoding: "gzip",
    extension: ".gz",
    accepted: (value) => /\bgzip\b/.test(value),
    stream: () => createGzip(),
  },
];

const CSP = [
  "default-src 'self'",
  // The theme bootstrap is inline so it can run before first paint, and KaTeX
  // writes inline styles while rendering.
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
  "font-src 'self' https://cdn.jsdelivr.net",
  "img-src 'self' data: https:",
  "media-src 'self' https:",
  "frame-src https:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = {
  "Content-Security-Policy": CSP,
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Opener-Policy": "same-origin",
};

function resolveFile(url) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  } catch {
    return null; // malformed percent-encoding
  }
  if (pathname.includes("\0")) return null;

  // normalize() collapses any ".." segments while the path is still absolute,
  // then the leading separators are stripped so resolve() cannot escape root.
  const relative = normalize(pathname).replace(/^[/\\]+/, "");
  const file = resolve(root, relative || "index.html");
  // Compare with the separator appended: "dist" must not match "dist-backup".
  if (file !== root && !file.startsWith(root + sep)) return null;
  if (!existsSync(file)) return null;
  return statSync(file).isDirectory() ? join(file, "index.html") : file;
}

// DEV=1 turns every cache off. A build rewrites style.css and app.js in
// place, so the usual hour-long cache is what makes an edit look like it never
// happened until the reader hard-reloads. Revalidation still runs, so an
// unchanged file is one 304 rather than a fresh download.
const DEV = process.env.DEV === "1";

// 쓰기 경로가 붙는 순간, 같은 망의 다른 기계가 이 저장소의 draft/에 파일을
// 쓸 수 있게 된다. 그래서 dev에서는 이 기계 안으로 좁힌다. 휴대폰으로
// 미리보기를 보려면 HOST=0.0.0.0으로 되돌리면 된다 — 고르는 일이어야 한다.
const host = process.env.HOST || (DEV ? "127.0.0.1" : "0.0.0.0");

// 편집기가 쓰는 것들은 DEV일 때만 불러온다. 나가는 서버는 렌더러도
// katex도 읽지 않고, 지금까지와 같은 것만 한다.
const editor = DEV ? await loadEditor() : null;

async function loadEditor() {
  const [{ bake }, { postFrom }, { createSources }, { lintArticle }, { postPage }, render] =
    await Promise.all([
      import("./bake.mjs"),
      import("./post.mjs"),
      import("./sources.mjs"),
      import("./lint.mjs"),
      import("./pages.mjs"),
      import("../render/index.mjs"),
    ]);
  return {
    bake,
    postFrom,
    createSources,
    lintArticle,
    postPage,
    frontmatter: render.frontmatter,
    renderDocument: render.renderDocument,
    slugify: render.slugify,
    // 원고를 둘 자리. 빌드가 읽는 자리와 같아야 저장한 글이 미리보기에 선다.
    draftDir: resolve(process.cwd(), process.env.DRAFT_DIR || "draft"),
  };
}

// 원고 하나가 1MB를 넘으면 그것은 원고가 아니다. 받는 쪽에서 먼저 끊는다.
const BODY_LIMIT = 1024 * 1024;

function readJson(request) {
  return new Promise((done, fail) => {
    const type = request.headers["content-type"] || "";
    if (!type.includes("application/json")) {
      fail({ status: 415, message: "application/json이 아니다" });
      return;
    }
    let size = 0;
    let over = false;
    const chunks = [];
    request.on("data", (chunk) => {
      if (over) return;
      size += chunk.length;
      if (size > BODY_LIMIT) {
        // 여기서 request.destroy()를 부르면 답까지 함께 끊긴다 — 보내는
        // 쪽은 413이 아니라 "연결이 끊겼다"를 본다. 받기만 그만두고
        // 소켓은 답이 나간 뒤에 node가 닫게 둔다.
        over = true;
        chunks.length = 0;
        fail({ status: 413, message: "원고가 1MB를 넘는다" });
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (over) return;
      try {
        done(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        fail({ status: 400, message: "JSON을 읽지 못했다" });
      }
    });
    request.on("error", () => fail({ status: 400, message: "본문이 끊겼다" }));
  });
}

function sendJson(response, status, value, { close = false } = {}) {
  const body = Buffer.from(JSON.stringify(value), "utf8");
  response.writeHead(status, {
    ...SECURITY_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    // 다 읽지 않은 요청 위에서 답할 때는 이어 쓰지 않는다. 남은 본문이
    // 다음 요청의 첫 줄로 읽히면 안 된다.
    ...(close ? { Connection: "close" } : {}),
  });
  response.end(body);
}

// 빌드가 낸 주소 전부. lint가 "없는 주소를 가리킨다"를 답하는 데 쓴다.
// 굽는 중이면 dist/가 반쪽이므로, 못 읽으면 null로 물러나 나머지 검사만
// 돌린다 — 미리보기가 빌드 타이밍 때문에 거짓 오류를 내면 안 된다.
function siteRoutes() {
  const found = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name));
      else if (entry.name === "index.html") {
        const at = relative(root, dir).split(sep).join("/");
        found.add(at ? `/${at}/` : "/");
      }
    }
  };
  try {
    walk(root);
  } catch {
    return null;
  }
  return found.size ? found : null;
}

/** 저장소 안의 파일인지. lint가 그림 주소에 대해 묻는다. */
function assetExists(path) {
  const full = resolve(process.cwd(), String(path).replace(/^\/+/, ""));
  const cwd = process.cwd();
  if (full !== cwd && !full.startsWith(cwd + sep)) return false;
  return existsSync(full);
}

/**
 * 타자를 치고 있는 원고 하나. 빌드가 글 하나에 하는 것과 같은 순서다 —
 * 앞머리를 읽고, 렌더하고, 굽고, 조판하고, lint한다. 같은 함수를 타므로
 * 미리보기와 나갈 글이 어긋날 자리가 없다.
 */
async function preview(source) {
  const { data, body } = editor.frontmatter(String(source ?? ""));
  const post = editor.postFrom({
    data,
    body,
    slug: data.slug || "preview",
    draft: true,
  });
  // 요청마다 새로 만든다. 서버는 계속 살아 있어서, 캐시를 들고 있으면
  // data/*.csv를 고쳐도 옛 내용을 계속 그린다.
  const sources = editor.createSources(process.cwd());
  const document = editor.renderDocument(post.body, {
    resolve: sources.readText,
    measure: sources.measureImage,
    bib: sources.readBib(post.bib),
  });
  const baked = await editor.bake(document.html);
  const whole = { ...document, html: baked.html };
  const findings = editor.lintArticle(
    { post, document: whole, html: baked.html },
    { routes: siteRoutes(), fileExists: assetExists },
  );
  for (const failure of baked.failed)
    findings.push({
      level: "error",
      slug: post.slug,
      message: `수식을 읽지 못했다 — ${failure.reason}`,
    });
  for (const language of baked.unknown)
    findings.push({
      level: "warn",
      slug: post.slug,
      message: `모르는 언어라 강조하지 않았다 — ${language}`,
    });
  return {
    ok: true,
    content: editor.postPage(post, whole, {}),
    math: baked.math,
    title: post.title,
    slug: post.slug,
    lint: findings.map(({ level, message }) => ({ level, message })),
  };
}

/** 원고를 draft/에 쓴다. 이름은 우리가 정한 꼴로만 받는다. */
async function saveDraft({ slug, source }) {
  // slugify는 빈 글자에 "uncategorized"를 돌려준다. 이름이 비었는데 그
  // 이름으로 파일이 생기면 안 되므로, 다듬기 전에 먼저 막는다.
  if (!String(slug ?? "").trim())
    throw { status: 400, message: "이름(slug)이 비었다" };
  // 다듬은 이름만 받는다 — "../../etc/passwd"는 "etc-passwd"가 되고, 자리
  // 구분자가 살아남지 않으므로 draft/ 밖을 가리킬 수 없다. 아래 검사는 그
  // 성질에 기대지 않는 두 번째 자물쇠다.
  const safe = editor.slugify(String(slug));
  if (!safe) throw { status: 400, message: "쓸 수 있는 이름이 아니다" };
  const file = resolve(editor.draftDir, `${safe}.md`);
  // 자리를 붙여 비교해야 "draft-backup"이 "draft"에 걸리지 않는다.
  if (!file.startsWith(editor.draftDir + sep))
    throw { status: 400, message: "draft/ 밖으로는 쓰지 않는다" };
  if (typeof source !== "string")
    throw { status: 400, message: "원고가 글이 아니다" };
  await writeFile(file, source, "utf8");
  return { path: `${relative(process.cwd(), file).split(sep).join("/")}`, slug: safe };
}

function cacheControl(file) {
  if (DEV) return "no-cache";
  const relative = file.slice(root.length + 1).split(sep).join("/");
  // Fonts and assets are content that changes under a new name, not in place.
  // katex/ holds the same kind of thing: every file in it is fingerprinted by
  // the build, so the file behind one of those URLs never changes.
  if (
    relative.startsWith("fonts/") ||
    relative.startsWith("assets/") ||
    relative.startsWith("katex/")
  )
    return "public, max-age=31536000, immutable";
  // style.<hash>.css and app.<hash>.js are built under a name that changes
  // with their contents, so the file behind one of these URLs never does.
  if (/\.[0-9a-f]{8}\.(css|js)$/.test(relative))
    return "public, max-age=31536000, immutable";
  const extension = extname(file).toLowerCase();
  if (extension === ".css" || extension === ".js")
    return "public, max-age=3600";
  return "no-cache";
}

function send(request, response, status, file) {
  const stats = statSync(file);
  const extension = extname(file).toLowerCase();
  const etag = `W/"${stats.size.toString(16)}-${stats.mtimeMs.toString(16)}"`;

  const headers = {
    ...SECURITY_HEADERS,
    "Content-Type": TYPES[extension] || "application/octet-stream",
    "Cache-Control": cacheControl(file),
    ETag: etag,
    "Last-Modified": stats.mtime.toUTCString(),
    Vary: "Accept-Encoding",
  };

  if (request.headers["if-none-match"] === etag) {
    response.writeHead(304, headers);
    response.end();
    return;
  }

  // brotli가 gzip보다 확실히 작아서 먼저 묻는다. 못 받는 상대에게는 gzip이
  // 그대로 남고, 둘 다 아니면 압축하지 않는다.
  const accepts = request.headers["accept-encoding"] || "";
  const codec = COMPRESSIBLE.has(extension)
    ? CODECS.find((candidate) => candidate.accepted(accepts))
    : undefined;

  // 빌드가 옆에 놓아둔 압축본. 있으면 그것을 그대로 흘려보낸다. 요청마다
  // 다시 압축하지 않으니 CPU가 들지 않고, 한 번만 치르는 값이라 빌드는 가장
  // 센 단계를 쓸 수 있다. 없으면 그 자리에서 압축한다 — 개발 서버는 압축본
  // 없이 dist/를 보고 있을 수 있다.
  const packed = codec ? `${file}${codec.extension}` : "";
  const ready = packed && existsSync(packed);
  let body = file;
  if (codec) {
    headers["Content-Encoding"] = codec.encoding;
    if (ready) {
      body = packed;
      headers["Content-Length"] = statSync(packed).size;
    }
  } else {
    headers["Content-Length"] = stats.size;
  }

  response.writeHead(status, headers);
  if (request.method === "HEAD") {
    response.end();
    return;
  }

  const source = createReadStream(body);
  const stages =
    codec && !ready ? [source, codec.stream(), response] : [source, response];
  pipeline(...stages, (error) => {
    if (error) response.destroy();
  });
}

createServer(async (request, response) => {
  // 편집기의 두 경로. DEV가 아니면 이 자리가 통째로 없으므로, 나가는 서버는
  // 지금까지와 똑같이 아래의 405로 떨어진다.
  if (editor && request.method === "POST") {
    const { pathname } = new URL(request.url, "http://localhost");
    if (pathname === "/api/render" || pathname === "/api/draft") {
      try {
        const sent = await readJson(request);
        if (pathname === "/api/render") {
          // 원고는 늘 반쪽인 순간을 지난다. 그 순간마다 500이 오면 화면이
          // 깜빡이므로, 무엇이 터지든 200에 담아 보내고 클라이언트가 마지막
          // 성공 화면을 유지하게 한다.
          try {
            sendJson(response, 200, await preview(sent.source));
          } catch (error) {
            sendJson(response, 200, { ok: false, message: String(error?.message || error) });
          }
        } else {
          sendJson(response, 200, { ok: true, ...(await saveDraft(sent)) });
        }
      } catch (error) {
        const status = Number(error?.status) || 500;
        if (!response.headersSent)
          sendJson(
            response,
            status,
            { ok: false, message: error?.message || "실패" },
            // 본문을 끝까지 읽지 않고 답하는 자리다.
            { close: status === 413 || status === 415 },
          );
      }
      return;
    }
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, {
      ...SECURITY_HEADERS,
      Allow: "GET, HEAD",
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end("405 Method Not Allowed");
    return;
  }

  const file = resolveFile(request.url);
  if (file) {
    send(request, response, 200, file);
    return;
  }

  const notFound = join(root, "404.html");
  if (existsSync(notFound)) {
    send(request, response, 404, notFound);
    return;
  }
  response.writeHead(404, {
    ...SECURITY_HEADERS,
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end("404 Not Found");
}).listen(port, host, () => {
  console.log(
    `Paper Blog is running at http://localhost:${port}${
      DEV ? ` (dev: no caching, 편집기 /write/)` : ""
    }`,
  );
});
