const cache = require("./cache");

const API = "https://lrclib.net/api";
const HEADERS = { "User-Agent": "ukuraoke/0.1" };

const parseLrc = (lrc) =>
  (lrc || "")
    .split("\n")
    .flatMap((row) => {
      const stamps = [...row.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
      const text = row.replace(/\[[^\]]*\]/g, "").trim();
      return stamps.map((m) => ({ time: Number(m[1]) * 60 + Number(m[2]), text }));
    })
    .sort((a, b) => a.time - b.time);

const get = async (path, params) => {
  const res = await fetch(`${API}${path}?${new URLSearchParams(params)}`, { headers: HEADERS });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`lrclib ${res.status}`);
  return res.json();
};

const toLyrics = (r) => ({
  id: r.id,
  track: r.trackName,
  artist: r.artistName,
  album: r.albumName,
  duration: r.duration,
  instrumental: r.instrumental,
  synced: Boolean(r.syncedLyrics),
  plain: r.plainLyrics,
  lines: parseLrc(r.syncedLyrics),
});

const find = cache(async (artist, track, duration) => {
  if (duration) {
    const exact = await get("/get", { artist_name: artist, track_name: track, duration });
    if (exact) return toLyrics(exact);
  }
  const results = (await get("/search", { artist_name: artist, track_name: track })) || [];
  const best = results.find((r) => r.syncedLyrics) || results[0];
  return best ? toLyrics(best) : null;
});

module.exports = { find, parseLrc };
