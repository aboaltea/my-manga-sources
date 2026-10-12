// Harbor source plugin. Runs with `harbor` provided by the host.
// Network: harbor.http only. HTML: harbor.parseHtml only.
const BASE = "https://hijala.com";
const SOURCE_ID = "hijala-ar";
const SOURCE_NAME = "Hijala Manga";

async function getDoc(path) {
  const res = await harbor.http(BASE + path, { responseType: "text" });
  if (!res.ok) throw new Error("HTTP " + res.status + " for " + path);
  return harbor.parseHtml(res.body);
}
function abs(url) {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("/")) return BASE + url;
  return BASE + "/" + url;
}
function first(el, selectors) {
  for (const s of selectors) {
    const found = el.querySelector(s);
    if (found) return found;
  }
  return null;
}
function attr(el, names) {
  if (!el) return undefined;
  for (const n of names) {
    const v = el.attr(n);
    if (v) return v;
  }
  return undefined;
}
function txt(el) { return (el?.text?.() || "").trim(); }
function summaryFrom(el) {
  const a = first(el, ["a.cover", ".thumb a", ".poster a", "a[href*='/manga/']", "a[href*='/series/']", "a[href*='/comic/']", "a"]);
  if (!a) return null;
  const img = first(el, ["img"]);
  const href = attr(a, ["href"]);
  if (!href) return null;
  const title = attr(a, ["title", "aria-label"]) || txt(first(el, [".title", ".post-title", ".manga-title", "h3", "h2"])) || txt(a);
  if (!title) return null;
  return {
    id: href.replace(BASE, "").replace(/^\/|\/$/g, ""),
    title,
    cover: abs(attr(img, ["data-src", "data-lazy-src", "data-original", "src"]))
  };
}
function cards(doc) {
  const selectors = [".manga-item", ".bs", ".utao", ".page-item-detail", ".c-tabs-item", ".post-item", ".manga", ".comic-item", ".item"];
  for (const s of selectors) {
    const els = doc.querySelectorAll(s);
    if (els && els.length) {
      const rows = els.map(summaryFrom).filter(Boolean);
      if (rows.length) return rows;
    }
  }
  return doc.querySelectorAll("article").map(summaryFrom).filter(Boolean);
}
function cleanId(id) { return String(id || "").replace(/^\/+|\/+$/g, ""); }
function urlForId(id) { return BASE + "/" + cleanId(id); }

const plugin = {
  id: SOURCE_ID,
  name: SOURCE_NAME,
  async popular(offset = 0, tagId) {
    const page = Math.floor(offset / 24) + 1;
    const path = page === 1 ? "/" : "/page/" + page + "/";
    const doc = await getDoc(path);
    return cards(doc).slice(0, 24);
  },
  async search(query, offset = 0, tagId) {
    const page = Math.floor(offset / 24) + 1;
    const path = "/?s=" + encodeURIComponent(query) + (page > 1 ? "&paged=" + page : "");
    const doc = await getDoc(path);
    return cards(doc).slice(0, 24);
  },
  async detail(id) {
    const doc = await getDoc("/" + cleanId(id));
    const root = first(doc, [".site-content", ".profile-manga", ".postbody", ".manga-info", ".series", "article"]) || doc;
    const titleEl = first(root, ["h1", ".entry-title", ".post-title", ".manga-title"]);
    const coverEl = first(root, [".summary_image img", ".thumb img", ".poster img", ".manga-cover img", "img"]);
    const descEl = first(root, [".description", ".summary__content", ".entry-content", ".manga-excerpt", ".content p"]);
    const statusEl = first(root, [".post-status", ".status", ".manga-status"]);
    const authorEl = first(root, [".author", ".author-content", ".manga-author"]);
    const ch = first(root, [".chapter-list a", ".wp-manga-chapter a", ".chapters a", ".eplister a"]);
    return {
      id: cleanId(id),
      title: txt(titleEl) || cleanId(id),
      cover: abs(attr(coverEl, ["data-src", "data-lazy-src", "src"])),
      description: txt(descEl),
      status: txt(statusEl) || undefined,
      author: txt(authorEl) || undefined,
      lastChapter: txt(ch) || undefined
    };
  },
  async chapters(id) {
    const doc = await getDoc("/" + cleanId(id));
    const selectors = [".wp-manga-chapter a", ".chapter-list a", ".eplister a", ".listing-chapters_wrap a", ".chapters a", "a[href*='chapter']"];
    let links = [];
    for (const s of selectors) {
      links = doc.querySelectorAll(s);
      if (links && links.length) break;
    }
    return links.map((a, i) => {
      const href = attr(a, ["href"]) || "";
      const label = txt(a) || attr(a, ["title"]) || ("Chapter " + (i + 1));
      const match = label.match(/(?:chapter|ch\.?|الفصل)\s*([0-9]+(?:\.[0-9]+)?)/i) || href.match(/chapter[-/ ]?([0-9]+(?:\.[0-9]+)?)/i);
      return {
        id: (() => {
          try {
            const u = new URL(href, BASE);
            return u.pathname.replace(/^\/+|\/+$/g, "");
          } catch (_) {
            return String(href).replace(BASE, "").replace(/^\/+|\/+$/g, "");
          }
        })(),
        chapter: match ? match[1] : null,
        title: label,
        pages: 0,
        language: "ar"
      };
    }).filter(c => c.id);
  },
  async pageUrls(chapterId) {
    const doc = await getDoc("/" + cleanId(chapterId));
    // Hijala's reader markup can vary; scan all image elements and prefer lazy-load
    // attributes before src. Keep chapter URLs unchanged and de-duplicate image URLs.
    const imgs = doc.querySelectorAll("img");
    const seen = new Set();
    return imgs.map(img => abs(attr(img, [
      "data-src", "data-lazy-src", "data-original", "data-cfsrc",
      "data-echo", "data-url", "src"
    ]))).filter(url => {
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  }
};
