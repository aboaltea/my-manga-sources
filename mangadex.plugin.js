// MangaDex source for Harbor — corrected API response handling and chapter pagination.
const API = "https://api.mangadex.org";
const SOURCE_ID = "mangadex-en";
const SOURCE_NAME = "MangaDex (English)";

async function pause(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
async function request(path, attempts = 4) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const result = await harbor.http(API + path, { responseType: "json" });
      // API endpoints have different valid response shapes: lists use `data`,
      // while /at-home/server returns `baseUrl` and `chapter`.
      if (result && !result.errors && (
        result.data !== undefined ||
        result.chapter !== undefined ||
        result.baseUrl !== undefined
      )) return result;
      lastError = new Error("Unexpected MangaDex API response");
    } catch (e) {
      lastError = e;
    }
    if (i < attempts - 1) await pause(800 * (i + 1));
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
    const result = await request("/manga/" + encodeURIComponent(id) +
      "?includes[]=cover_art&includes[]=author&includes[]=artist");
    const m = result.data;
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
    // MangaDex feed limit is 500 per request. Continue with offsets to retrieve
    // additional English chapters for long-running series.
    const all = [];
    const seen = new Set();
    const pageSize = 500;
    for (let offset = 0; offset < 5000; offset += pageSize) {
      const result = await request("/manga/" + encodeURIComponent(id) +
        "/feed?limit=" + pageSize + "&offset=" + offset +
        "&translatedLanguage[]=en&includeExternalUrl=0" +
        "&order[chapter]=desc&order[volume]=desc");
      const batch = result.data || [];
      if (!batch.length) break;
      for (const c of batch) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        all.push({
          id: c.id,
          chapter: c.attributes?.chapter || null,
          title: c.attributes?.title || undefined,
          volume: c.attributes?.volume || null,
          pages: c.attributes?.pages || 0,
          language: "en",
          publishAt: c.attributes?.publishAt || undefined
        });
      }
      if (batch.length < pageSize) break;
      await pause(300);
    }
    return all;
  },
  async pageUrls(chapterId) {
    const result = await request("/at-home/server/" + encodeURIComponent(chapterId));
    const ch = result.chapter;
    if (!result.baseUrl || !ch?.hash) return [];
    // data-saver filenames can differ from original-quality filenames.
    const files = Array.isArray(ch.dataSaver) && ch.dataSaver.length ? ch.dataSaver : ch.data;
    if (!Array.isArray(files)) return [];
    const quality = files === ch.dataSaver ? "data-saver" : "data";
    return files.map(file => result.baseUrl + "/" + quality + "/" + ch.hash + "/" + file);
  }
};
