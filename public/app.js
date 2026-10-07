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

const state = { song: null, key: 0, offset: 0, player: null, active: -1 };

const renderLine = (line, i) => {
  const groups = [];
  for (const c of line.chords) {
    const last = groups[groups.length - 1];
    if (last && last.at === c.at) last.chords.push(c.chord);
    else groups.push({ at: c.at, chords: [c.chord] });
  }
  const cuts = [0, ...groups.map((g) => g.at).filter((a) => a > 0)];
  const segs = cuts.map((start, k) => {
    const end = cuts[k + 1] ?? line.text.length;
    const g = groups.find((x) => x.at === start);
    const chords = g ? g.chords.map((c) => transpose(c, state.key)).join(" ") : "";
    return `<span class="seg"><b>${esc(chords)}</b>${esc(line.text.slice(start, end) || " ")}</span>`;
  });
  const plain = line.chords.length ? "" : " plain";
  return `<div class="line${plain}" data-i="${i ?? ""}">${segs.join("")}</div>`;
};

const render = () => {
  const s = state.song;
  $("#key").textContent = state.key > 0 ? `+${state.key}` : state.key;
  $("#lines").innerHTML = s.lines.length
    ? s.lines.map((l, i) => renderLine(l, i)).join("")
    : `<p class="empty">No synced lyrics found. Showing the chord sheet instead.</p>`;
  $("#sheet").innerHTML = s.sections
    .map((sec) => `<h3>${esc(sec.name)}</h3>` + sec.lines.map((l) => renderLine(l)).join(""))
    .join("");
  if (!s.lines.length) showSheet(true);
  state.active = -1;
};

const showSheet = (on) => {
  $("#sheet").hidden = !on;
  $("#lines").hidden = on;
  $("#view").textContent = on ? "Karaoke" : "Sheet";
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
  document.querySelector(".line.active")?.classList.remove("active");
  const el = document.querySelector(`#lines [data-i="${i}"]`);
  el?.classList.add("active");
  el?.scrollIntoView({ block: "center", behavior: "smooth" });
  state.active = i;
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
  $("#title").textContent = `${track} — ${artist}`;
  const s = state.song;
  $("#meta").textContent = [s.capo ? `Capo ${s.capo}` : "", s.lyrics?.synced ? "Synced lyrics" : "No synced lyrics", s.youtube ? `Video: ${s.youtube.title}` : ""]
    .filter(Boolean)
    .join(" · ");
  document.title = `${track} — Ukuraoke`;
  render();
  useSource("youtube");
  tick();
};

const search = async (q, artist) => {
  $("#song").hidden = true;
  $("#results").innerHTML = `<p class="empty">Searching…</p>`;
  try {
    const results = await api("search", artist ? { q, artist } : { q });
    $("#results").innerHTML = results.length
      ? results
          .map((r) => {
            const href = `?${new URLSearchParams({ url: r.url, artist: r.artist, track: r.song })}`;
            return `<a class="result" href="${esc(href)}">${esc(r.song)} — ${esc(r.artist)}<br><small>${esc(r.type)} · v${r.version} · ★ ${r.rating.toFixed(1)} · ${r.votes} votes</small></a>`;
          })
          .join("")
      : `<p class="empty">Nothing found.</p>`;
  } catch (e) {
    $("#results").innerHTML = `<p class="empty">${esc(e.message)}</p>`;
  }
};

$("#search").onsubmit = (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  location.search = new URLSearchParams({ q: f.get("q"), artist: f.get("artist") });
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
$("#lines").onclick = (e) => {
  const line = e.target.closest(".line");
  if (line && state.player) state.player.seek(Math.max(0, state.song.lines[line.dataset.i].time - state.offset));
};

if (params.get("url")) openSong(params.get("url"), params.get("artist"), params.get("track"));
else if (params.get("q")) {
  $("#search").q.value = params.get("q");
  $("#search").artist.value = params.get("artist") || "";
  search(params.get("q"), params.get("artist"));
}
