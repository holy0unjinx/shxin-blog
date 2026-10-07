// HTML and SVG text escaping. It lives on its own so the chart renderer can
// reach it without importing the Markdown renderer, which imports the chart
// renderer in turn.

export function esc(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "'":
        return "&#39;";
      default:
        return "&quot;";
    }
  });
}
