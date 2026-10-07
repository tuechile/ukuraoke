const { guitar } = require("ultimate-guitar");
const cache = require("./cache");

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

const toResult = (r) => ({
  id: r.id,
  song: r.song_name,
  artist: r.artist_name,
  type: r.type,
  version: r.version,
  rating: r.rating,
  votes: r.votes,
  key: r.tonality_name,
  chords: r.unique_chords,
  url: r.tab_url,
});

const searchType = async (title, artist, category) => {
  const r = await ug.search(title, artist, category);
  return r.status === 200 && Array.isArray(r.responses) ? r.responses : [];
};

const search = cache(async (title, artist) => {
  const [uke, chords] = await Promise.all([
    searchType(title, artist, ug.category.UKULELE),
    searchType(title, artist, ug.category.CHORDS),
  ]);
  const byVotes = (a, b) => b.votes - a.votes;
  return [...uke.sort(byVotes), ...chords.sort(byVotes)].map(toResult);
});

const sheet = cache(async (url) => {
  if (!/(^|\.)ultimate-guitar\.com$/.test(new URL(url).hostname)) throw Object.assign(new Error("url must be an ultimate-guitar.com tab"), { status: 400 });
  const r = await ug.fetch(url);
  if (r.status !== 200 || typeof r.response !== "string") throw Object.assign(new Error("tab not found"), { status: 404 });
  return { url, ...parseSheet(r.response) };
});

module.exports = { search, sheet, parseSheet };
