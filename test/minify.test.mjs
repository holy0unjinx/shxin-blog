import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { minifyCss, stripJsComments } from "../site/minify.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("css comments go and whitespace collapses", () => {
  const out = minifyCss(`
/* 설명 */
.a {
  color: red;
  margin: 0 0 4px;
}
`);
  assert.equal(out, ".a{color:red;margin:0 0 4px}");
});

test("a comment inside a css string or url survives", () => {
  assert.equal(
    minifyCss(`.a{background:url("i/*not*/.png")}`),
    `.a{background:url("i/*not*/.png")}`,
  );
  assert.equal(
    minifyCss(`.a::after{content:"/* 글자 */"}`),
    `.a::after{content:"/* 글자 */"}`,
  );
});

test("css combinators and value spaces are kept", () => {
  assert.equal(minifyCss(".a > .b .c{margin:0 auto}"), ".a>.b .c{margin:0 auto}");
  // `a :hover`는 자손, `a:hover`는 그 요소 자신이다. 앞의 칸을 지우면
  // 가리키는 것이 달라지므로 남긴다.
  assert.equal(minifyCss(".a :hover{color:red}"), ".a :hover{color:red}");
});

test("css at-rules and nesting survive", () => {
  assert.equal(
    minifyCss("@media (min-width: 40px) {\n  .a {\n    color: red;\n  }\n}"),
    // 선언과 미디어 특성에서 `:` 뒤의 칸은 뜻이 없다.
    "@media (min-width:40px){.a{color:red}}",
  );
});

test("js comments go and code is left alone", () => {
  assert.equal(
    stripJsComments("// 설명\nconst a = 1; // 뒤\n/* 여러\n줄 */\nconst b = 2;\n"),
    "const a = 1;\nconst b = 2;",
  );
});

test("a comment-looking string is not a comment", () => {
  for (const line of [
    `const a = "// 아님";`,
    `const a = '/* 아님 */';`,
    "const a = `/* 아님 */`;",
    `const a = "\\"// 아님";`,
  ])
    assert.equal(stripJsComments(line), line, line);
});

test("a regular expression holding slashes is not a comment", () => {
  for (const line of [
    `const a = /\\/\\//.test(b);`,
    `const a = /[/*]/.test(b);`,
    `const a = b.replace(/a//* 지워짐 */, "c");`,
  ])
    assert.doesNotMatch(stripJsComments(line), /지워짐/);
  assert.equal(stripJsComments(`const a = /[/*]/.test(b);`), `const a = /[/*]/.test(b);`);
});

test("division is not a regular expression", () => {
  assert.equal(stripJsComments("const a = b / c; // 뒤"), "const a = b / c;");
  assert.equal(stripJsComments("const a = (b) / 2;"), "const a = (b) / 2;");
  assert.equal(stripJsComments("const a = b[0] / 2;"), "const a = b[0] / 2;");
});

test("the real stylesheet and script still parse after minifying", () => {
  const css = readFileSync(join(root, "style.css"), "utf8");
  const small = minifyCss(css);
  assert.ok(small.length < css.length * 0.75, "축소가 거의 안 되었다");
  // 중괄호 짝과 규칙 수가 그대로여야 한다.
  const braces = (text) => [...text].reduce((n, c) => n + (c === "{") - (c === "}"), 0);
  assert.equal(braces(small), 0, "중괄호 짝이 깨졌다");
  assert.equal(
    (small.match(/@media/g) || []).length,
    (css.match(/@media/g) || []).length,
  );
  assert.doesNotMatch(small, /\/\*/, "주석이 남았다");

  const js = readFileSync(join(root, "app.js"), "utf8");
  const stripped = stripJsComments(js);
  assert.ok(stripped.length < js.length, "축소가 안 되었다");
  // 함수로 만들어 보면 문법이 깨졌는지 그 자리에서 드러난다.
  new Function(stripped);
  // 문자열 안의 마크업과 정규식이 살아 있는지 몇 군데 짚어 본다.
  assert.match(stripped, /class="search-box"/);
  assert.match(stripped, /a\[href\^='#'\]/);
  assert.match(stripped, /paper-blog-theme/);
  assert.match(stripped, /toc-progress/);
});

test("a data url keeps its own punctuation", () => {
  const css = `.a{background:url(data:image/svg+xml;base64,AA==) no-repeat}`;
  assert.equal(minifyCss(css), css);
});
