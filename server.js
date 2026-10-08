const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const chords = require("./src/chords");
const lyrics = require("./src/lyrics");
const youtube = require("./src/youtube");
const { merge } = require("./src/merge");

const PORT = process.env.PORT || 3000;

const need = (params, ...keys) => {
  for (const k of keys) if (!params.get(k)) throw Object.assign(new Error(`missing ${k}`), { status: 400 });
  return keys.map((k) => params.get(k));
};

const routes = {
  "/api/search": (p) => {
    if (!p.get("q") && !p.get("artist")) throw Object.assign(new Error("missing q or artist"), { status: 400 });
    return chords.search(p.get("q") || "", p.get("artist") || "");
  },
  "/api/shelves": () => chords.shelves(),
  "/api/chords": (p) => chords.sheet(...need(p, "url")),
  "/api/lyrics": (p) => lyrics.find(...need(p, "artist", "track"), p.get("duration")),
  "/api/youtube": (p) => youtube.search(...need(p, "q")),
  "/api/song": async (p) => {
    const [url, artist, track] = need(p, "url", "artist", "track");
    const [sheet, found] = await Promise.all([chords.sheet(url), lyrics.find(artist, track, p.get("duration"))]);
    const video = await youtube.best(artist, track, found?.duration).catch(() => null);
    return {
      artist,
      track,
      capo: sheet.capo,
      header: sheet.header,
      sections: sheet.sections,
      lyrics: found && { id: found.id, duration: found.duration, synced: found.synced, plain: found.plain },
      lines: found ? merge(sheet, found.lines) : [],
      youtube: video,
    };
  },
};

const PUBLIC = path.join(__dirname, "public");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };

const serve = async (res, pathname) => {
  const file = path.join(PUBLIC, pathname === "/" ? "index.html" : path.normalize(pathname));
  if (!file.startsWith(PUBLIC)) return send(res, 403, { error: "forbidden" });
  try {
    const body = await fs.readFile(file);
    res.writeHead(200, { "Content-Type": `${TYPES[path.extname(file)] || "application/octet-stream"}; charset=utf-8` });
    res.end(body);
  } catch {
    send(res, 404, { error: "not found" });
  }
};

const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(body));
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const route = routes[url.pathname];
    if (!route) return url.pathname.startsWith("/api/") ? send(res, 404, { error: "not found" }) : serve(res, url.pathname);
    try {
      send(res, 200, await route(url.searchParams));
    } catch (e) {
      send(res, e.status || 502, { error: e.message });
    }
  })
  .listen(PORT, () => console.log(`http://localhost:${PORT}`));
