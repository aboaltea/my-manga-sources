// MangaDex source for Harbor.
// Uses the official MangaDex API. Includes backoff for rate limits and
// asks for up to 500 chapters so older translated chapters are not truncated.
const API = "https://api.mangadex.org";
const SOURCE_ID = "mangadex-en";
const SOURCE_NAME = "MangaDex (English)";

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
async function request(path, attempts = 4) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await harbor.http(API + path, { responseType: "json" });
      // Some Harbor builds return parsed JSON without a status field.
      if (res && !res.errors && res.data !== undefined) return res;
      const status = res?.status;
      if (status && status !== 200 && status !== 429 && status < 500) {
        throw new Error("MangaDex HTTP " + status);
      }
      lastError = new Error("MangaDex returned an invalid response");
    } catch (e) {
      lastError = e;
    }
    if (attempt + 1 < attempts) await wait(700 * (attempt + 1));
  }
  throw lastError || new Error("MangaDex request failed");
}
function titleOf(m) {
  const t = m.attributes?.title || {};
  return t.en || Object.values(t)[0] || "Untitled";
}
function coverOf(m) {
  const rel = (m.relationships || []).find(r => r.type === "cover_art");
  const file = rel?.attributes?.fileName;
  return file ? "https://uploads.mangadex.org/covers/" + m.id + "/" + file + ".256.jpg" : undefined;
}
function summary(m) {
  return { id: m.id, title: titleOf(m), cover: coverOf(m) };
}
const plugin = {
  id: SOURCE_ID,
  name: SOURCE_NAME,
  async popular(offset = 0) {
    const data = await request("/manga?limit=24&offset=" + Math.max(0, offset) +
      "&order[followedCount]=desc&availableTranslatedLanguage[]=en&includes[]=cover_art");
    return (data.data || []).map(summary);
  },
  async search(query, offset = 0) {
    const data = await request("/manga?limit=24&offset=" + Math.max(0, offset) +
      "&title=" + encodeURIComponent(query) +
      "&order[relevance]=desc&availableTranslatedLanguage[]=en&includes[]=cover_art");
    return (data.data || []).map(summary);
  },
  async detail(id) {
    const data = await request("/manga/" + encodeURIComponent(id) +
      "?includes[]=cover_art&includes[]=author&includes[]=artist");
    const m = data.data;
    if (!m) return null;
    const rel = m.relationships || [];
    const desc = m.attributes?.description || {};
    const author = rel.filter(r => r.type === "author" || r.type === "artist")
      .map(r => r.attributes?.name).filter(Boolean).join(", ");
    return {
      id: m.id,
      title: titleOf(m),
      altTitle: Object.values(m.attributes?.altTitles?.[0] || {})[0],
      cover: coverOf(m),
      description: desc.en || Object.values(desc)[0] || "",
      status: m.attributes?.status || undefined,
      author: author || undefined
    };
  },
  async chapters(id) {
    // MangaDex's maximum feed limit is 500; requesting 500 avoids returning
    // only a recent subset. Only English-translated chapters hosted on MangaDex
    // are requested; chapters in other languages/external sites may not appear.
    const data = await request("/manga/" + encodeURIComponent(id) +
      "/feed?limit=500&offset=0&translatedLanguage[]=en&includeExternalUrl=0" +
      "&order[chapter]=desc&order[volume]=desc");
    return (data.data || []).map(c => ({
      id: c.id,
      chapter: c.attributes?.chapter || null,
      title: c.attributes?.title || undefined,
      volume: c.attributes?.volume || null,
      pages: c.attributes?.pages || 0,
      language: "en",
      publishAt: c.attributes?.publishAt || undefined
    }));
  },
  async pageUrls(chapterId) {
    const data = await request("/at-home/server/" + encodeURIComponent(chapterId));
    const ch = data.chapter;
    if (!data.baseUrl || !ch?.hash || !Array.isArray(ch.data)) return [];
    // Use data-saver to reduce image payload and lower the chance of partial loads.
    return ch.data.map(file => data.baseUrl + "/data-saver/" + ch.hash + "/" + file);
  }
};
