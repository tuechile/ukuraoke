const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const api = async (path, query) => {
  const res = await fetch(`/api/${path}?${new URLSearchParams(query)}`);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error);
  return body;
};
const esc = (s) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLATS = { Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#", Cb: "B", Fb: "E" };
const shift = (note, n) => NOTES[(NOTES.indexOf(FLATS[note] || note) + n + 120) % 12] || note;
const transpose = (chord, n) => (n ? chord.replace(/[A-G][#b]?/g, (m) => shift(m, n)) : chord);

const saved = (k, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? fallback;
  } catch {
    return fallback;
  }
};
const save = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};

const state = { song: null, key: 0, offset: 0, player: null, active: -1, diagrams: saved("diagrams", true), autoscroll: saved("autoscroll", true) };

const chordHtml = (name) => `<span class="chord">${Uke.svg(name)}<i>${esc(name)}</i></span>`;

const renderLine = (line, attr) => {
  const groups = [];
  for (const c of line.chords) {
    let at = Math.min(c.at, line.text.length);
    while (at < line.text.length && /\s/.test(line.text[at]) && /\S/.test(line.text.slice(at))) at++;
    while (at > 0 && /\S/.test(line.text[at - 1]) && /\S/.test(line.text[at] || " ")) at--;
    const last = groups[groups.length - 1];
    if (last && last.at === at) last.chords.push(c.chord);
    else groups.push({ at, chords: [c.chord] });
  }
  const cuts = [0, ...groups.map((g) => g.at).filter((a) => a > 0)];
  const segs = cuts.map((start, k) => {
    const end = cuts[k + 1] ?? line.text.length;
    const g = groups.find((x) => x.at === start);
    const chords = g ? g.chords.map((c) => chordHtml(transpose(c, state.key))).join("") : "";
    return `<span class="seg"><b>${chords}</b>${esc(line.text.slice(start, end) || " ")}</span>`;
  });
  const plain = line.chords.length ? "" : " plain";
  return `<div class="line${plain}" ${attr}>${segs.join("")}</div>`;
};

const render = () => {
  const s = state.song;
  $("#key").textContent = state.key > 0 ? `+${state.key}` : state.key;
  $("#lines").innerHTML = s.lines.length
    ? s.lines.map((l, i) => renderLine(l, `data-i="${i}"`)).join("")
    : `<p class="empty">No synced lyrics found. Showing the chord sheet instead.</p>`;
  $("#sheet").innerHTML = s.sections
    .map((sec, si) => `<h3>${esc(sec.name)}</h3>` + sec.lines.map((l, li) => renderLine(l, `data-s="${si}-${li}"`)).join(""))
    .join("");
  if (!s.lines.length) showSheet(true);
  state.active = -1;
};

const showSheet = (on) => {
  $("#sheet").hidden = !on;
  $("#lines").hidden = on;
  $("#view").textContent = on ? "Karaoke" : "Sheet";
  state.active = -1;
};

const toggles = () => {
  document.body.classList.toggle("no-diagrams", !state.diagrams);
  $("#diagrams").classList.toggle("on", state.diagrams);
  $("#autoscroll").classList.toggle("on", state.autoscroll);
};

const loadYouTubeApi = new Promise((resolve) => {
  window.onYouTubeIframeAPIReady = resolve;
  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.append(tag);
});

const youtubePlayer = async (id) => {
  await loadYouTubeApi;
  $("#yt").replaceWith(Object.assign(document.createElement("div"), { id: "yt" }));
  const yt = new YT.Player("yt", { videoId: id, playerVars: { playsinline: 1 } });
  return { time: () => yt.getCurrentTime?.() ?? 0, seek: (t) => (yt.seekTo(t, true), yt.playVideo()) };
};

const filePlayer = () => {
  const audio = $("#audio");
  return { time: () => audio.currentTime, seek: (t) => ((audio.currentTime = t), audio.play()) };
};

const useSource = async (source) => {
  document.querySelectorAll("[data-source]").forEach((b) => b.classList.toggle("on", b.dataset.source === source));
  $("#youtube-source").hidden = source !== "youtube";
  $("#file-source").hidden = source !== "file";
  if (source === "file") {
    state.player = filePlayer();
  } else {
    $("#audio").pause();
    const id = state.song.youtube?.id;
    state.player = id ? await youtubePlayer(id) : null;
  }
};

const tick = () => {
  requestAnimationFrame(tick);
  if (!state.player || !state.song?.lines.length) return;
  const t = state.player.time() + state.offset;
  let i = -1;
  for (let k = 0; k < state.song.lines.length && state.song.lines[k].time <= t; k++) i = k;
  if (i === state.active) return;
  state.active = i;
  document.querySelectorAll(".line.active").forEach((el) => el.classList.remove("active"));
  const ref = state.song.lines.slice(0, i + 1).reverse().find((l) => l.sheet)?.sheet;
  const karaoke = document.querySelector(`#lines [data-i="${i}"]`);
  const sheet = ref && document.querySelector(`#sheet [data-s="${ref.join("-")}"]`);
  karaoke?.classList.add("active");
  sheet?.classList.add("active");
  const target = $("#sheet").hidden ? karaoke : sheet;
  if (state.autoscroll && target && i >= 0 && state.player.time() > 0) target.scrollIntoView({ block: "center", behavior: "smooth" });
};

const openSong = async (url, artist, track) => {
  $("#results").innerHTML = `<p class="empty">Loading ${esc(track)}…</p>`;
  try {
    state.song = await api("song", { url, artist, track });
  } catch (e) {
    $("#results").innerHTML = `<p class="empty">${esc(e.message)}</p>`;
    return;
  }
  $("#results").innerHTML = "";
  $("#song").hidden = false;
  $("#title").textContent = track;
  $("#by").textContent = artist;
  $("#by").href = `?${new URLSearchParams({ artist })}`;
  const s = state.song;
  remember({ song: track, artist, url, cover: s.youtube ? `https://i.ytimg.com/vi/${s.youtube.id}/mqdefault.jpg` : null });
  $("#meta").textContent = [s.capo ? `Capo ${s.capo}` : "", s.lyrics?.synced ? "Synced lyrics" : "No synced lyrics", s.youtube ? `Video: ${s.youtube.title}` : ""]
    .filter(Boolean)
    .join(" · ");
  document.title = `${track} — Ukuraoke`;
  render();
  useSource("youtube");
  tick();
};

const songHref = (s) => `?${new URLSearchParams({ url: s.url, artist: s.artist, track: s.song })}`;
const art = (s) => (s.cover ? `<img src="${esc(s.cover)}" alt="" loading="lazy">` : `<span class="noart">♪</span>`);
const tags = (s) =>
  [s.ukulele ? "Uke" : s.ukulele === false ? "Chords" : "", s.difficulty === "novice" ? "Easy" : "", s.versions > 1 ? `${s.versions} versions` : "", s.rating ? `★ ${s.rating.toFixed(1)}` : ""]
    .filter(Boolean)
    .map((t) => `<i>${t}</i>`)
    .join("");
const card = (s) => `<a class="card" href="${esc(songHref(s))}">${art(s)}<b>${esc(s.song)}</b><small>${esc(s.artist)}</small></a>`;
const row = (s) => `<a class="row${s.ukulele ? " uke" : ""}" href="${esc(songHref(s))}">${art(s)}<span><b>${esc(s.song)}</b><small>${esc(s.artist)}</small><span class="tags">${tags(s)}</span></span></a>`;
const artistLink = (name) => `<a class="chip" href="?${esc(new URLSearchParams({ artist: name }).toString())}">${esc(name)}</a>`;
const shelfHtml = (title, songs) => (songs.length ? `<h2>${title}</h2><div class="shelf">${songs.map(card).join("")}</div>` : "");

const remember = (song) => save("recent", [song, ...saved("recent", []).filter((r) => r.url !== song.url)].slice(0, 12));

const home = async () => {
  $("#home").hidden = false;
  const recent = shelfHtml("Pick up where you left off", saved("recent", []));
  $("#shelves").innerHTML = recent + `<p class="empty">Loading recommendations…</p>`;
  try {
    const s = await api("shelves", {});
    $("#shelves").innerHTML =
      recent + shelfHtml("Trending today", s.trending) + shelfHtml("Easy for beginners", s.beginner) + shelfHtml("Throwbacks", s.throwback);
  } catch {
    $("#shelves").innerHTML = recent;
  }
};

const search = async (q, artist) => {
  $("#results").innerHTML = `<p class="empty">Searching…</p>`;
  try {
    const r = await api("search", Object.fromEntries(Object.entries({ q, artist }).filter(([, v]) => v)));
    if (r.artist) document.title = `${r.artist} — Ukuraoke`;
    const heading = r.artist
      ? `<h2>${esc(r.artist)} <small>${r.songs.length} songs</small></h2>`
      : `${r.artists.length ? `<div class="chips">Artists ${r.artists.map((a) => artistLink(a.name)).join("")}</div>` : ""}<h2>Songs <small>${r.songs.length}</small></h2>`;
    const filter = r.songs.some((s) => !s.ukulele) ? `<label class="filter"><input type="checkbox" id="uke-only"> Ukulele versions only</label>` : "";
    $("#results").innerHTML = r.songs.length ? heading + filter + `<div class="rows">${r.songs.map(row).join("")}</div>` : `<p class="empty">Nothing found. Try just the song or just the artist.</p>`;
    $("#uke-only")?.addEventListener("change", (e) => $(".rows").classList.toggle("uke-only", e.target.checked));
  } catch (e) {
    $("#results").innerHTML = `<p class="empty">${esc(e.message)}</p>`;
  }
};

$("#search").onsubmit = (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const query = [...f].filter(([, v]) => v.trim());
  if (query.length) location.search = new URLSearchParams(query);
};
document.querySelectorAll("[data-source]").forEach((b) => (b.onclick = () => useSource(b.dataset.source)));
$("#file").onchange = (e) => {
  const file = e.target.files[0];
  if (file) $("#audio").src = URL.createObjectURL(file);
};
$("#yt-link").onchange = async (e) => {
  const id = e.target.value.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/)?.[1];
  if (id) state.player = await youtubePlayer(id);
};
$("#up").onclick = () => ((state.key += 1), render());
$("#down").onclick = () => ((state.key -= 1), render());
const nudge = (d) => {
  state.offset = Math.round((state.offset + d) * 10) / 10;
  $("#offset").textContent = `${state.offset > 0 ? "+" : ""}${state.offset.toFixed(1)}s`;
};
$("#earlier").onclick = () => nudge(-0.5);
$("#later").onclick = () => nudge(0.5);
$("#view").onclick = () => showSheet($("#sheet").hidden);
$("#diagrams").onclick = () => {
  state.diagrams = !state.diagrams;
  save("diagrams", state.diagrams);
  toggles();
};
$("#autoscroll").onclick = () => {
  state.autoscroll = !state.autoscroll;
  save("autoscroll", state.autoscroll);
  state.active = -1;
  toggles();
};
toggles();
$("#lines").onclick = (e) => {
  const line = e.target.closest(".line");
  if (line && state.player) state.player.seek(Math.max(0, state.song.lines[line.dataset.i].time - state.offset));
};

if (params.get("url")) openSong(params.get("url"), params.get("artist"), params.get("track"));
else if (params.get("q") || params.get("artist")) {
  $("#search").q.value = params.get("q") || "";
  $("#search").artist.value = params.get("artist") || "";
  document.title = `${[params.get("q"), params.get("artist")].filter(Boolean).join(" — ")} — Ukuraoke`;
  search(params.get("q") || "", params.get("artist") || "");
} else home();
