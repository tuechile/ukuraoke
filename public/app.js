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
state.sidebar = saved("sidebar", !state.diagrams);

const chordHtml = (name) => `<span class="chord" data-chord="${esc(name)}" title="Play ${esc(name)}">${Uke.svg(name)}<i>${esc(name)}</i></span>`;
const isTab = (text) => /^\s*[A-Ga-g][#b]?\s*\|.*-/.test(text);

const renderLine = (line, attr) => {
  const text = line.text || "";
  if (isTab(text)) {
    const names = line.chords.reduce((row, c) => row.padEnd(c.at) + transpose(c.chord, state.key) + " ", "");
    return `<pre class="line tab" ${attr}>${esc(names.trimEnd() ? names + "\n" : "")}${esc(text)}</pre>`;
  }
  const groups = new Map();
  for (const c of line.chords) {
    let at = Math.min(c.at, text.length);
    while (at < text.length && /\s/.test(text[at]) && /\S/.test(text.slice(at))) at++;
    while (at > 0 && /\S/.test(text[at - 1]) && /\S/.test(text[at] || " ")) at--;
    groups.set(at, [...(groups.get(at) || []), transpose(c.chord, state.key)]);
  }
  const words = [...text.matchAll(/\S+/g)].map((m) => ({ at: m.index, word: m[0] }));
  const tail = [...groups.keys()].filter((at) => !words.some((w) => w.at === at));
  for (const at of tail) words.push({ at, word: "" });
  words.sort((a, b) => a.at - b.at);
  if (!words.length) words.push({ at: 0, word: "" });
  const html = words.map((w) => `<span class="w"><b>${(groups.get(w.at) || []).map(chordHtml).join("")}</b>${esc(w.word) || "&nbsp;"}</span>`);
  return `<div class="line${line.chords.length ? "" : " plain"}" ${attr}>${html.join(" ")}</div>`;
};

const spread = () => {
  for (const line of document.querySelectorAll("#lines .line, #sheet .line")) {
    if (!line.offsetParent) continue;
    let prev = null;
    for (const b of line.querySelectorAll(".w b")) {
      b.style.translate = "";
      if (!b.firstChild) continue;
      const box = b.getBoundingClientRect();
      if (prev && Math.abs(box.top - prev.top) < 4 && box.left < prev.right + 6) b.style.translate = `${prev.right + 6 - box.left}px`;
      const left = b.getBoundingClientRect().left;
      prev = { top: box.top, right: left + b.scrollWidth };
    }
  }
};

const sidebar = () => {
  const names = [...new Set(state.song.sections.flatMap((s) => s.lines.flatMap((l) => l.chords.map((c) => c.chord))))];
  $("#chordbar").hidden = !names.length;
  $("#chordlist").innerHTML = names.map((n) => chordHtml(transpose(n, state.key))).join("");
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
  sidebar();
  state.active = -1;
  requestAnimationFrame(spread);
};

const showSheet = (on) => {
  $("#sheet").hidden = !on;
  $("#lines").hidden = on;
  $("#view").textContent = on ? "Karaoke" : "Sheet";
  state.active = -1;
  requestAnimationFrame(spread);
};

const toggles = () => {
  document.body.classList.toggle("no-diagrams", !state.diagrams);
  $("#diagrams").classList.toggle("on", state.diagrams);
  $("#autoscroll").classList.toggle("on", state.autoscroll);
  $("#chordbar").classList.toggle("collapsed", !state.sidebar);
  $("#chordbar-toggle").textContent = state.sidebar ? "◂ Chords" : "Chords ▸";
  $("#chordbar-toggle").title = state.sidebar ? "Hide chord reference" : "Show chord reference";
  requestAnimationFrame(spread);
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
  const yt = new YT.Player("yt", { videoId: id, playerVars: { playsinline: 1 }, events: { onError: nextVideo } });
  return {
    time: () => yt.getCurrentTime?.() ?? 0,
    duration: () => yt.getDuration?.() || 0,
    playing: () => yt.getPlayerState?.() === 1,
    play: () => yt.playVideo?.(),
    pause: () => yt.pauseVideo?.(),
    seek: (t) => (yt.seekTo(t, true), yt.playVideo()),
  };
};

const filePlayer = () => {
  const audio = $("#audio");
  return {
    time: () => audio.currentTime,
    duration: () => audio.duration || 0,
    playing: () => !audio.paused,
    play: () => audio.src && audio.play(),
    pause: () => audio.pause(),
    seek: (t) => ((audio.currentTime = t), audio.play()),
  };
};

const playVideo = async (index) => {
  state.video = index;
  const v = state.song.videos[index];
  $("#videos").value = index;
  state.player = v ? await youtubePlayer(v.id) : null;
};

const nextVideo = () => {
  if (state.video + 1 < state.song.videos.length) playVideo(state.video + 1);
};

const useSource = async (source) => {
  document.querySelectorAll("[data-source]").forEach((b) => b.classList.toggle("on", b.dataset.source === source));
  $("#youtube-source").hidden = source !== "youtube";
  $("#file-source").hidden = source !== "file";
  if (source === "file") {
    state.player?.pause();
    state.player = filePlayer();
  } else {
    $("#audio").pause();
    await playVideo(state.video || 0);
  }
};

const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

const playbar = () => {
  const p = state.player;
  const d = p?.duration() || 0;
  const t = p?.time() || 0;
  $("#play").textContent = p?.playing() ? "❚❚" : "▶";
  $("#now").textContent = clock(t);
  $("#total").textContent = clock(d);
  if (!state.dragging) {
    $("#seek").max = d || 1;
    $("#seek").value = t;
  }
};

const tick = () => {
  requestAnimationFrame(tick);
  if (state.song) playbar();
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
  $("#meta").textContent = [s.capo ? `Capo ${s.capo}` : "", s.lyrics?.synced ? "Synced lyrics" : "No synced lyrics for this song, showing the chord sheet"]
    .filter(Boolean)
    .join(" · ");
  $("#videos").innerHTML = s.videos.length
    ? s.videos.map((v, i) => `<option value="${i}">${esc(v.title)} · ${esc(v.channel || "")} · ${clock(v.duration)}</option>`).join("")
    : `<option>No video found, paste a link below</option>`;
  $("#np").textContent = `${track} — ${artist}`;
  $("#playbar").hidden = false;
  document.body.classList.add("playing-song");
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
  state.sidebar = !state.diagrams;
  save("diagrams", state.diagrams);
  save("sidebar", state.sidebar);
  toggles();
};
$("#chordbar-toggle").onclick = () => {
  state.sidebar = !state.sidebar;
  save("sidebar", state.sidebar);
  toggles();
};
$("#autoscroll").onclick = () => {
  state.autoscroll = !state.autoscroll;
  save("autoscroll", state.autoscroll);
  state.active = -1;
  toggles();
};
toggles();
$("#videos").onchange = (e) => playVideo(Number(e.target.value));
$("#play").onclick = () => (state.player?.playing() ? state.player.pause() : state.player?.play());
$("#back").onclick = () => state.player?.seek(Math.max(0, state.player.time() - 5));
$("#fwd").onclick = () => state.player?.seek(state.player.time() + 5);
$("#seek").onpointerdown = () => (state.dragging = true);
$("#seek").onchange = (e) => {
  state.dragging = false;
  state.player?.seek(Number(e.target.value));
};
document.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || !state.player || e.target.closest("input, select, textarea, button")) return;
  e.preventDefault();
  $("#play").click();
});
document.addEventListener("click", (e) => {
  const chord = e.target.closest(".chord");
  if (!chord) return;
  e.stopPropagation();
  state.player?.pause();
  Uke.strum(chord.dataset.chord);
  chord.classList.remove("ring");
  void chord.offsetWidth;
  chord.classList.add("ring");
}, true);
addEventListener("resize", () => requestAnimationFrame(spread));
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
