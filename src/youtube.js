const cache = require("./cache");

const seconds = (text) => (text || "").split(":").reduce((t, n) => t * 60 + Number(n), 0);

const collect = (node, out) => {
  if (!node || typeof node !== "object") return out;
  if (node.videoRenderer) {
    const v = node.videoRenderer;
    out.push({
      id: v.videoId,
      title: v.title?.runs?.[0]?.text,
      channel: v.ownerText?.runs?.[0]?.text,
      duration: seconds(v.lengthText?.simpleText),
    });
    return out;
  }
  for (const key in node) collect(node[key], out);
  return out;
};

const search = cache(async (query) => {
  const res = await fetch(`https://www.youtube.com/results?${new URLSearchParams({ search_query: query })}`, {
    headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en" },
  });
  if (!res.ok) throw new Error(`youtube ${res.status}`);
  const match = (await res.text()).match(/var ytInitialData = (\{.*?\});<\/script>/s);
  return match ? collect(JSON.parse(match[1]), []).filter((v) => v.duration) : [];
});

const embeddable = async (id) => {
  const res = await fetch(`https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${id}`).catch(() => null);
  return !res || res.ok;
};

const pick = async (artist, track, duration) => {
  const videos = (await search(`${artist} ${track} audio`)).slice(0, 8);
  if (duration) videos.sort((a, b) => Math.abs(a.duration - duration) - Math.abs(b.duration - duration));
  const ok = await Promise.all(videos.map((v) => embeddable(v.id)));
  return videos.filter((v, i) => ok[i]).slice(0, 5);
};

module.exports = { search, pick };
