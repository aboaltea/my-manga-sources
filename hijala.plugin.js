// Hijala Manga source for Harbor.
// Hijala is WordPress-like but its home page mixes series cards and latest-chapter posts.
// IDs are stored as relative paths so they round-trip through detail/chapters/pageUrls.
const BASE = "https://hijala.com";
const SOURCE_ID = "hijala-ar";
const SOURCE_NAME = "Hijala Manga";

async function getDoc(path) {
  const res = await harbor.http(BASE + path, { responseType: "text" });
  if (!res || res.ok === false) throw new Error("Hijala HTTP " + (res?.status || "error"));
  return harbor.parseHtml(res.body);
}
function abs(url) {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("/")) return BASE + url;
  return BASE + "/" + url;
}
function attr(el, names) {
  if (!el) return "";
  for (const n of names) {
    const v = el.attr(n);
    if (v) return v;
  }
  return "";
}
function text(el) { return (el?.text?.() || "").replace(/\s+/g, " ").trim(); }
function pathId(href) {
  if (!href) return "";
  try {
    const path = href.startsWith("http") ? new URL(href).pathname : href;
    return path.replace(/^\/+|\/+$/g, "");
  } catch (_) {
    return href.replace(BASE, "").replace(/^\/+|\/+$/g, "");
  }
}
function first(el, selectors) {
  for (const s of selectors) {
    const found = el.querySelector(s);
    if (found) return found;
  }
  return null;
}
function toSummary(el) {
  const a = first(el, ["a.manga-title", "a.cover", ".post-title a", ".entry-title a", "h3 a", "h2 a", "a[href]"]);
  const img = first(el, ["img"]);
  if (!a || !attr(a, ["href"])) return null;
  const href = attr(a, ["href"]);
  const title = attr(a, ["title", "aria-label"]) || text(first(el, [".post-title", ".entry-title", ".title", "h3", "h2"])) || text(a);
  if (!title) return null;
  return {
    id: pathId(href),
    title,
    cover: abs(attr(img, ["data-src", "data-lazy-src", "data-original", "src"]))
  };
}
function collectCards(doc) {
  const selectors = [".c-tabs-item", ".page-item-detail", ".bs", ".manga-item", ".post-item", ".manga", ".item", "article"];
  for (const selector of selectors) {
    const items = doc.querySelectorAll(selector);
    if (items && items.length) {
      const results = items.map(toSummary).filter(x => x && x.id && x.title);
      if (results.length) return results;
    }
  }
  return [];
}
function cleanChapterLabel(label, href) {
  let s = (label || "").replace(/\s+/g, " ").trim();
  // Never expose the site's unrendered recent-reading template as a chapter.
  if (/\{\{\s*(?:number|date)\s*\}\}/i.test(s)) return "";
  s = s.replace(/\b(?:just now|seconds? ago|minutes? ago|hours? ago|days? ago|weeks? ago|months? ago|years? ago)\b/ig, "");
  s = s.replace(/(?:منذ\s*)?\d+\s*(?:ثانية|ثوانٍ|دقيقة|دقائق|ساعة|ساعات|يوم|أيام|أسبوع|أسابيع|شهر|أشهر|سنة|سنوات)/ig, "");
  s = s.replace(/\s{2,}/g, " ").trim();
  if (!s || /\{\{|\}\}/.test(s)) return "";
  if (!/(?:الفصل|فصل|chapter|ch\.?)[\s#：:-]*\d+/i.test(s)) {
    const m = (href || "").match(/(?:chapter|ch)[-_/ ]*(\d+(?:\.\d+)?)/i) || (href || "").match(/[-_/](\d+(?:\.\d+)?)(?:\/?(?:\?.*)?)$/i);
    if (m) s = "الفصل " + m[1];
  }
  return s;
}
function isRealChapterLink(a) {
  const href = attr(a, ["href"]);
  const label = text(a);
  if (!href || !label || /\{\{|\}\}/.test(label)) return false;
  if (/^(?:#|javascript:)/i.test(href)) return false;
  // Hijala chapter URLs include a chapter number in either the URL or visible label.
  return /(?:الفصل|فصل|chapter|ch\.?)[\s#：:-]*\d+/i.test(label) || /(?:chapter|ch)[-_/ ]*\d+|[-_/]\d+(?:\.\d+)?\/?(?:\?.*)?$/i.test(href);
}
const plugin = {
  id: SOURCE_ID,
  name: SOURCE_NAME,
  async popular(offset = 0, tagId) {
    const page = Math.floor(Math.max(0, offset) / 24) + 1;
    const path = page === 1 ? "/" : "/page/" + page + "/";
    const doc = await getDoc(path);
    return collectCards(doc).slice(0, 24);
  },
  async search(query, offset = 0) {
    const page = Math.floor(Math.max(0, offset) / 24) + 1;
    const path = "/?s=" + encodeURIComponent(query) + (page > 1 ? "&paged=" + page : "");
    const doc = await getDoc(path);
    return collectCards(doc).slice(0, 24);
  },
  async detail(id) {
    const doc = await getDoc("/" + String(id).replace(/^\/+|\/+$/g, "") + "/");
    const titleEl = first(doc, ["h1.entry-title", "h1", ".post-title"]);
    const coverEl = first(doc, [".summary_image img", ".thumb img", ".poster img", "article img"]);
    const descEl = first(doc, [".description", ".summary__content", ".entry-content p", ".manga-excerpt"]);
    const chapterLinks = doc.querySelectorAll(".wp-manga-chapter a, .listing-chapters_wrap a, .chapter-list a, a[href*='chapter']");
    const chapterLink = chapterLinks.find(isRealChapterLink);
    return {
      id: String(id).replace(/^\/+|\/+$/g, ""),
      title: text(titleEl) || String(id),
      cover: abs(attr(coverEl, ["data-src", "data-lazy-src", "src"])),
      description: text(descEl),
      lastChapter: chapterLink ? cleanChapterLabel(text(chapterLink), attr(chapterLink, ["href"])) || undefined : undefined
    };
  },
  async chapters(id) {
    const seriesId = String(id).replace(/^\/+|\/+$/g, "");
    const doc = await getDoc("/" + seriesId + "/");
    // Hijala chapter links use series-slug-number URLs (for example /lookism-628/).
    // Scan all anchors rather than relying on theme-specific class names.
    const anchors = doc.querySelectorAll("a[href]");
    const seen = new Set();
    const out = [];
    for (const a of anchors) {
      const href = attr(a, ["href"]);
      const rawLabel = text(a);
      if (!href || !rawLabel || /\{\{|\}\}/.test(rawLabel)) continue;
      if (/^(?:#|javascript:|mailto:)/i.test(href)) continue;

      const labelMatch = rawLabel.match(/(?:الفصل|فصل)\s*#?\s*([0-9]+(?:\.[0-9]+)?)/i) ||
                         rawLabel.match(/chapter\s*#?\s*([0-9]+(?:\.[0-9]+)?)/i);
      if (!labelMatch) continue;

      const chapterId = pathId(href);
      if (!chapterId || seen.has(chapterId)) continue;

      // Restrict to chapter URLs belonging to this series. This avoids picking up
      // recommendations or the unrendered "last read" template from other widgets.
      const slug = seriesId.split("/").pop().toLowerCase();
      const chapterSlug = chapterId.toLowerCase().split("/").pop();
      const urlNumber = chapterSlug.match(new RegExp("^" + slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "-([0-9]+(?:\\.[0-9]+)?)$"));
      if (!urlNumber && !chapterSlug.includes("chapter") && !chapterSlug.includes("ch-")) continue;

      const cleaned = cleanChapterLabel(rawLabel, href);
      if (!cleaned) continue;
      seen.add(chapterId);
      out.push({
        id: chapterId,
        chapter: labelMatch[1] || (urlNumber ? urlNumber[1] : null),
        title: cleaned,
        pages: 0,
        language: "ar"
      });
    }
    return out;
  },
  async pageUrls(chapterId) {
    const doc = await getDoc("/" + String(chapterId).replace(/^\/+|\/+$/g, "") + "/");
    let imgs = [];
    for (const selector of [".reading-content img", ".reader-area img", ".chapter-content img", ".page-break img", ".reader img", "article img", "img[data-src]", "img[data-lazy-src]"]) {
      const found = doc.querySelectorAll(selector);
      if (found && found.length) imgs = imgs.concat(found);
    }
    const seen = new Set();
    return imgs.map(img => abs(attr(img, ["data-src", "data-lazy-src", "data-original", "src"])))
      .filter(url => url && !seen.has(url) && seen.add(url));
  }
};
