const cache = require("./cache");
const { norm } = require("./merge");

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

const get = async (path, params, tries = 4) => {
  const res = await fetch(`${API}${path}?${new URLSearchParams(params)}`, { headers: HEADERS });
  if (res.status === 404) return null;
  if ((res.status === 429 || res.status >= 500) && tries > 1) {
    await new Promise((r) => setTimeout(r, (5 - tries) * 1000));
    return get(path, params, tries - 1);
  }
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

const clean = (artist, track) => {
  const misc = /^misc\b/i.test(artist);
  const title = (misc ? track.split(" - ").pop() : track).replace(/\((feat|ft|with)[^)]*\)|\[[^\]]*\]/gi, "").trim();
  return { artist: misc ? "" : artist, track: title };
};

const rank = (artist, track) => (r) => {
  const t = norm(r.trackName || "");
  const a = norm(r.artistName || "");
  const nt = norm(track);
  const na = norm(artist);
  return (r.syncedLyrics ? 4 : 0) + (t === nt ? 3 : t.includes(nt) || nt.includes(t) ? 1 : 0) + (na && (a.includes(na) || na.includes(a)) ? 2 : 0);
};

const candidates = cache(async (rawArtist, rawTrack, duration) => {
  const { artist, track } = clean(rawArtist, rawTrack);
  const score = rank(artist, track);
  const found = new Map();
  if (duration && artist) {
    const exact = await get("/get", { artist_name: artist, track_name: track, duration });
    if (exact?.syncedLyrics) found.set(exact.id, exact);
  }
  const attempts = [
    artist && { track_name: track, artist_name: artist },
    artist && { q: `${track} ${artist}` },
    { q: track },
  ].filter(Boolean);
  for (const params of attempts) {
    for (const r of (await get("/search", params)) || []) if (score(r) >= 4) found.set(r.id, r);
    if ([...found.values()].some((r) => score(r) >= 9)) break;
  }
  return [...found.values()]
    .sort((a, b) => score(b) - score(a))
    .slice(0, 8)
    .map((r) => ({ ...toLyrics(r), score: score(r) }));
});

const find = async (artist, track, duration) => (await candidates(artist, track, duration))[0] || null;

module.exports = { find, candidates, parseLrc };
