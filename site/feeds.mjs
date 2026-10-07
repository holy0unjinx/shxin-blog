// Feed and crawler files. Everything here is generated from the same post list
// that produces the HTML pages, so the three can never drift apart.

import { esc } from "../render/index.mjs";

const HEADER = '<?xml version="1.0" encoding="UTF-8"?>';

function rfc822(date) {
  return new Date(`${date}T00:00:00Z`).toUTCString();
}

// Feed readers resolve relative URLs against their own origin, so links and
// images in the exported HTML are made absolute.
function absolute(html, siteUrl) {
  return html.replace(/(href|src)="\/([^"]*)"/g, `$1="${siteUrl}/$2"`);
}

function cdata(text) {
  // A literal "]]>" would close the section early.
  return `<![CDATA[${text.split("]]>").join("]]]]><![CDATA[>")}]]>`;
}

export function rss({ posts, rendered, siteUrl, title, description, buildDate }) {
  const items = posts
    .map((post) => {
      const url = `${siteUrl}/${encodeURIComponent(post.slug)}/`;
      const body = rendered.get(post.slug);
      return `    <item>
      <title>${esc(post.title)}</title>
      <link>${esc(url)}</link>
      <guid isPermaLink="true">${esc(url)}</guid>
      ${post.date ? `<pubDate>${rfc822(post.date)}</pubDate>` : ""}
      <category>${esc(post.category)}</category>
      <description>${esc(post.description)}</description>
      <content:encoded>${cdata(absolute(body, siteUrl))}</content:encoded>
    </item>`;
    })
    .join("\n");

  return `${HEADER}
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${esc(title)}</title>
    <link>${esc(siteUrl)}/</link>
    <description>${esc(description)}</description>
    <language>ko</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <atom:link href="${esc(siteUrl)}/rss.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;
}

export function sitemap({ entries, siteUrl }) {
  const urls = entries
    .map(
      ({ path, lastmod }) =>
        `  <url>
    <loc>${esc(siteUrl)}${esc(path)}</loc>${lastmod ? `\n    <lastmod>${esc(lastmod)}</lastmod>` : ""}
  </url>`,
    )
    .join("\n");
  return `${HEADER}
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

export function robots(siteUrl) {
  return `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`;
}
