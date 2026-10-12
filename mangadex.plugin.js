// MangaDex source using its public API. English source.
const API = "https://api.mangadex.org";
const SOURCE_ID = "mangadex-en";
const SOURCE_NAME = "MangaDex (English)";

async function api(path) {
  const res = await harbor.http(API + path, { responseType: "json" });
  if (!res || res.errors || (res.ok === false)) throw new Error("MangaDex API request failed");
  return res;
}
function titleOf(m) {
  const t = m.attributes?.title || {};
  return t.en || Object.values(t)[0] || "Untitled";
}
function coverOf(m) {
  const rel = (m.relationships || []).find(r => r.type === "cover_art");
  return rel?.attributes?.fileName ? "https://uploads.mangadex.org/covers/" + m.id + "/" + rel.attributes.fileName + ".256.jpg" : undefined;
}
function mangaSummary(m) {
  return { id: m.id, title: titleOf(m), cover: coverOf(m) };
}
const plugin = {
  id: SOURCE_ID,
  name: SOURCE_NAME,
  async popular(offset = 0) {
    const data = await api("/manga?limit=24&offset=" + offset + "&order[followedCount]=desc&availableTranslatedLanguage[]=en&includes[]=cover_art");
    return (data.data || []).map(mangaSummary);
  },
  async search(query, offset = 0) {
    const data = await api("/manga?limit=24&offset=" + offset + "&title=" + encodeURIComponent(query) + "&order[relevance]=desc&availableTranslatedLanguage[]=en&includes[]=cover_art");
    return (data.data || []).map(mangaSummary);
  },
  async detail(id) {
    const data = await api("/manga/" + encodeURIComponent(id) + "?includes[]=cover_art&includes[]=author&includes[]=artist");
    const m = data.data;
    if (!m) return null;
    const rel = m.relationships || [];
    const desc = m.attributes?.description || {};
    const author = rel.filter(r => r.type === "author" || r.type === "artist").map(r => r.attributes?.name).filter(Boolean).join(", ");
    return {
      id: m.id, title: titleOf(m), altTitle: Object.values(m.attributes?.altTitles?.[0] || {})[0],
      cover: coverOf(m), description: desc.en || Object.values(desc)[0] || "",
      status: m.attributes?.status || undefined, author: author || undefined
    };
  },
  async chapters(id, offset = 0) {
    const data = await api("/manga/" + encodeURIComponent(id) + "/feed?limit=100&offset=" + offset + "&translatedLanguage[]=en&order[chapter]=desc&order[volume]=desc");
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
    const data = await api("/at-home/server/" + encodeURIComponent(chapterId));
    const ch = data.chapter;
    if (!data.baseUrl || !ch?.hash || !Array.isArray(ch.data)) return [];
    return ch.data.map(file => data.baseUrl + "/data/" + ch.hash + "/" + file);
  }
};
