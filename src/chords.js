const { guitar } = require("ultimate-guitar");
const cache = require("./cache");
const { norm } = require("./merge");

const ug = guitar();
const CHORD = /^\(?[A-G][#b]?(m|maj|min|dim|aug|sus|add|M|\+|°|ø)?\d*(sus\d*|add\d+|maj\d*|[#b]\d+|\d+)*(\/[A-G][#b]?)?\)?$/;
const FILLER = /^(x\d+|\|+|-+|\.+|%)$/;

const isChordLine = (line) => {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  return tokens.some((t) => CHORD.test(t)) && tokens.every((t) => CHORD.test(t) || FILLER.test(t));
};

const chordsIn = (line) =>
  [...line.matchAll(/\S+/g)].filter((m) => CHORD.test(m[0])).map((m) => ({ chord: m[0].replace(/[()]/g, ""), at: m.index }));

const parseSheet = (text) => {
  const rows = text.replace(/\r/g, "").replace(/\[\/?ch\]|\[\/?tab\]/g, "").split("\n");
  const header = [];
  const sections = [];
  let section = null;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].replace(/\s+$/, "");
    const name = row.trim().match(/^\[(.+)\]$/);
    if (name) {
      section = { name: name[1], lines: [] };
      sections.push(section);
      continue;
    }
    if (!section) {
      if (row.trim()) header.push(row.trim());
      continue;
    }
    if (!row.trim()) continue;
    if (isChordLine(row)) {
      const next = rows[i + 1]?.replace(/\r|\s+$/g, "") ?? "";
      const pairs = next.trim() && !isChordLine(next) && !/^\[.+\]$/.test(next.trim());
      section.lines.push({ chords: chordsIn(row), text: pairs ? next : "" });
      if (pairs) i++;
    } else {
      section.lines.push({ chords: [], text: row });
    }
  }
  const capo = header.join(" ").match(/capo[^\d]{0,12}(\d+)/i);
  return { header, capo: capo ? Number(capo[1]) : 0, sections };
};

const ENTITIES = { "&quot;": '"', "&#039;": "'", "&lt;": "<", "&gt;": ">", "&amp;": "&" };
const TYPES = ["Ukulele Chords", "Chords"];
const SHELVES = {
  trending: "order=hitsdailygroup_desc",
  beginner: "order=hitstotal_desc&difficulty[]=2",
  throwback: "order=hitstotal_desc&decade[]=1960&decade[]=1970&decade[]=1980&decade[]=1990",
};

let scraper;
const page = async (path) => {
  scraper ??= (await import("got-scraping")).gotScraping;
  const html = (await scraper.get(`https://www.ultimate-guitar.com${path}`)).body;
  const match = html.match(/class="js-store" data-content="([^"]*)"/);
  if (!match) throw new Error("ultimate guitar page changed");
  return JSON.parse(match[1].replace(/&(quot|#039|lt|gt|amp);/g, (e) => ENTITIES[e])).store.page.data;
};

const group = (rows) => {
  const songs = new Map();
  for (const r of rows) {
    if (!TYPES.includes(r.type)) continue;
    const key = `${norm(r.song_name)}|${norm(r.artist_name)}`;
    if (!songs.has(key)) songs.set(key, []);
    if (!songs.get(key).some((v) => v.id === r.id)) songs.get(key).push(r);
  }
  return [...songs.values()].map((versions) => {
    versions.sort((a, b) => (b.type === "Ukulele Chords") - (a.type === "Ukulele Chords") || b.votes - a.votes);
    const best = versions[0];
    return {
      song: best.song_name,
      artist: best.artist_name,
      url: best.tab_url,
      type: best.type,
      rating: best.rating,
      votes: versions.reduce((t, v) => t + v.votes, 0),
      versions: versions.length,
      ukulele: best.type === "Ukulele Chords",
      difficulty: best.difficulty,
      chords: best.unique_chords,
      cover: best.album_cover?.web_album_cover?.small || best.artist_cover?.web_artist_cover?.small || null,
    };
  });
};

const artistSongs = cache(async (path) => {
  const first = await page(path);
  const rest = await Promise.all((first.pagination?.pages || []).slice(1).map((p) => page(p.url).catch(() => null)));
  return group([first, ...rest].flatMap((d) => [...(d?.album_tabs || []), ...(d?.other_tabs || [])])).sort((a, b) => b.votes - a.votes);
}, 24 * 3600 * 1000);

const search = cache(async (q = "", artist = "") => {
  const value = `${q} ${artist}`.trim();
  const pages = await Promise.all(
    [1, 2].map((p) => page(`/search.php?search_type=title&value=${encodeURIComponent(value)}&page=${p}`).catch(() => null))
  );
  const rows = pages.flatMap((d) => d?.results || []);
  const nq = norm(q);
  const na = norm(artist);
  const named = rows.find((r) => r.artist_url && norm(r.artist_name) === (na || nq)) || (na && rows.find((r) => r.artist_url && norm(r.artist_name).includes(na)));
  if (named && (!nq || norm(named.artist_name) === nq)) {
    const songs = await artistSongs(named.artist_url);
    return { artist: named.artist_name, artists: [{ name: named.artist_name, songs: songs.length }], songs };
  }
  const score = (s) => {
    const title = norm(s.song);
    const by = norm(s.artist);
    return (nq && title === nq ? 4 : nq && title.includes(nq) ? 2 : 0) + (nq && by.includes(nq) ? 2 : 0) + (na && by === na ? 1 : 0);
  };
  let songs = group(rows);
  if (na) songs = songs.filter((s) => norm(s.artist).includes(na));
  if (nq && songs.some((s) => score(s) > 0)) songs = songs.filter((s) => score(s) > 0);
  songs.sort((a, b) => score(b) - score(a) || b.votes - a.votes);
  const artists = new Map();
  for (const s of songs) {
    const by = norm(s.artist);
    if ((nq && by.includes(nq)) || (na && by.includes(na))) artists.set(s.artist, (artists.get(s.artist) || 0) + 1);
  }
  return { artists: [...artists].map(([name, songs]) => ({ name, songs })), songs };
});

const shelf = cache(async (name) => group((await page(`/explore?type[]=Ukulele%20Chords&${SHELVES[name]}`)).data.tabs), 6 * 3600 * 1000);

const shelves = async () => {
  const names = Object.keys(SHELVES);
  const lists = await Promise.all(names.map((n) => shelf(n).catch(() => [])));
  const seen = new Set();
  return Object.fromEntries(names.map((n, i) => [n, lists[i].filter((s) => !seen.has(s.url) && seen.add(s.url)).slice(0, 16)]));
};

const sheet = cache(async (url) => {
  if (!/(^|\.)ultimate-guitar\.com$/.test(new URL(url).hostname)) throw Object.assign(new Error("url must be an ultimate-guitar.com tab"), { status: 400 });
  const r = await ug.fetch(url);
  if (r.status !== 200 || typeof r.response !== "string") throw Object.assign(new Error("tab not found"), { status: 404 });
  return { url, ...parseSheet(r.response) };
});

module.exports = { search, shelves, sheet, parseSheet };
