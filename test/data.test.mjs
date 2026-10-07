import assert from "node:assert/strict";
import test from "node:test";

import {
  delimiterFor,
  grid,
  parseDelimited,
  pickColumns,
  sliceRows,
} from "../render/data.mjs";

test("a plain csv becomes a grid of trimmed fields", () => {
  assert.deepEqual(parseDelimited("a, b ,c\n1,2,3\n"), [
    ["a", "b", "c"],
    ["1", "2", "3"],
  ]);
});

test("a quoted field keeps its commas, newlines and doubled quotes", () => {
  assert.deepEqual(
    parseDelimited('"a,b","line\nbreak","say ""hi"""\n'),
    [["a,b", "line\nbreak", 'say "hi"']],
  );
});

test("a quoted field keeps the spaces a bare field would lose", () => {
  assert.deepEqual(parseDelimited('" pad ", pad \n'), [[" pad ", "pad"]]);
});

test("comment lines and blank lines carry no row", () => {
  assert.deepEqual(parseDelimited("# note\n\na,b\n\n# tail\n"), [["a", "b"]]);
});

test("a file with no trailing newline still ends its row", () => {
  assert.deepEqual(parseDelimited("a,b\nc,d"), [
    ["a", "b"],
    ["c", "d"],
  ]);
});

test("an empty field stays a field", () => {
  assert.deepEqual(parseDelimited("a,,c\n"), [["a", "", "c"]]);
});

test("tabs separate a tsv", () => {
  assert.equal(delimiterFor("x/y.tsv"), "\t");
  assert.equal(delimiterFor("x/y.CSV"), ",");
  assert.equal(delimiterFor("x/y.json"), null);
  assert.deepEqual(parseDelimited("a\tb\n1\t2\n", "\t"), [
    ["a", "b"],
    ["1", "2"],
  ]);
});

test("a row range counts from one and an open end runs to the last row", () => {
  const rows = [["1"], ["2"], ["3"], ["4"]];
  assert.deepEqual(sliceRows(rows, "2:3"), [["2"], ["3"]]);
  assert.deepEqual(sliceRows(rows, "3:"), [["3"], ["4"]]);
  assert.deepEqual(sliceRows(rows, ":2"), [["1"], ["2"]]);
  assert.deepEqual(sliceRows(rows, ""), rows);
});

test("a nonsense range leaves the rows alone rather than emptying them", () => {
  const rows = [["1"], ["2"]];
  assert.deepEqual(sliceRows(rows, "sideways"), rows);
  assert.deepEqual(sliceRows(rows, "5:2"), rows);
});

test("columns are kept in the order they are asked for", () => {
  const rows = [["a", "b", "c"], ["1", "2", "3"]];
  assert.deepEqual(pickColumns(rows, "3,1"), [
    ["c", "a"],
    ["3", "1"],
  ]);
  assert.deepEqual(pickColumns(rows, "nope"), rows);
});

test("a missing column comes back empty instead of undefined", () => {
  assert.deepEqual(pickColumns([["a"]], "1,2"), [["a", ""]]);
});

test("grid declines a format it does not read", () => {
  assert.equal(grid("x.json", "{}"), null);
  assert.equal(grid("x.csv", null), null);
  assert.equal(grid("x.csv", "# only a comment\n"), null);
});

test("grid applies the range and the column list together", () => {
  const text = "year,ko,en\n2023,1,2\n2024,3,4\n2025,5,6\n";
  assert.deepEqual(grid("d.csv", text, { rows: "2:3", columns: "1,3" }), [
    ["2023", "2"],
    ["2024", "4"],
  ]);
});
