const Uke = (() => {
  const PITCH = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const STRINGS = [7, 0, 4, 9];
  const QUALITIES = {
    "": [0, 4, 7], M: [0, 4, 7], maj: [0, 4, 7], m: [0, 3, 7], min: [0, 3, 7], "-": [0, 3, 7],
    5: [0, 7], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9], 7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], M7: [0, 4, 7, 11],
    m7: [0, 3, 7, 10], min7: [0, 3, 7, 10], mmaj7: [0, 3, 7, 11], dim: [0, 3, 6], "°": [0, 3, 6], dim7: [0, 3, 6, 9],
    m7b5: [0, 3, 6, 10], "ø": [0, 3, 6, 10], aug: [0, 4, 8], "+": [0, 4, 8], sus: [0, 5, 7], sus4: [0, 5, 7],
    sus2: [0, 2, 7], "7sus4": [0, 5, 7, 10], "7sus2": [0, 2, 7, 10], add9: [0, 4, 7, 2], add2: [0, 4, 7, 2],
    madd9: [0, 3, 7, 2], 9: [0, 4, 7, 10, 2], maj9: [0, 4, 7, 11, 2], m9: [0, 3, 7, 10, 2], 11: [0, 4, 7, 10, 5],
    13: [0, 4, 7, 10, 9], "7b9": [0, 4, 7, 10, 1], "7#9": [0, 4, 7, 10, 3], "7#5": [0, 4, 8, 10], "7b5": [0, 4, 6, 10],
  };
  const cache = new Map([["Em", [0, 4, 3, 2]]]);

  const parse = (name) => {
    const m = name.match(/^([A-G])([#b]?)([^/]*)/);
    if (!m) return null;
    const root = (PITCH[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + 12) % 12;
    let q = m[3];
    while (!(q in QUALITIES)) q = q.slice(0, -1);
    return QUALITIES[q].map((i) => (root + i) % 12).filter((n, i, a) => a.indexOf(n) === i);
  };

  const score = (frets) => {
    const pressed = frets.filter((f) => f > 0);
    const max = Math.max(0, ...frets);
    const span = pressed.length ? max - Math.min(...pressed) : 0;
    return max * 3 + span * 2 + pressed.length + pressed.filter((f) => f > 4).length * 5 + frets.reduce((a, b) => a + b, 0) * 0.1;
  };

  const shape = (name) => {
    if (cache.has(name)) return cache.get(name);
    const tones = parse(name);
    let best = null;
    if (tones) {
      const fifth = (tones[0] + 7) % 12;
      const required = tones.length > 4 || (tones.length === 4 && tones.includes(fifth)) ? tones.filter((t) => t !== fifth) : tones;
      const options = STRINGS.map((open) => [...Array(13).keys()].filter((f) => tones.includes((open + f) % 12)));
      for (const a of options[0]) for (const b of options[1]) for (const c of options[2]) for (const d of options[3]) {
        const frets = [a, b, c, d];
        const pressed = frets.filter((f) => f > 0);
        if (pressed.length && Math.max(...pressed) - Math.min(...pressed) > 3) continue;
        const notes = frets.map((f, i) => (STRINGS[i] + f) % 12);
        if (!required.every((t) => notes.includes(t))) continue;
        if (!best || score(frets) < score(best)) best = frets;
      }
    }
    cache.set(name, best);
    return best;
  };

  const svg = (name) => {
    const frets = shape(name);
    if (!frets) return "";
    const pressed = frets.filter((f) => f > 0);
    const top = Math.max(...frets) <= 4 ? 1 : Math.min(...pressed);
    const x = (i) => 8 + i * 10;
    const y = (f) => 8 + (f - top) * 11 + 5.5;
    const grid = [0, 1, 2, 3].map((i) => `<line x1="${x(i)}" y1="8" x2="${x(i)}" y2="52"/>`).join("")
      + [0, 1, 2, 3, 4].map((k) => `<line x1="8" y1="${8 + k * 11}" x2="38" y2="${8 + k * 11}"/>`).join("");
    const nut = top === 1 ? `<line class="nut" x1="7" y1="8" x2="39" y2="8"/>` : `<text x="40" y="${y(top) + 3}">${top}</text>`;
    const marks = frets
      .map((f, i) => (f === 0 ? `<circle class="open" cx="${x(i)}" cy="3.5" r="2.3"/>` : `<circle cx="${x(i)}" cy="${y(f)}" r="3.6"/>`))
      .join("");
    return `<svg class="diagram" viewBox="0 0 48 56" role="img" aria-label="${name} ${frets.join("")}">${grid}${nut}${marks}</svg>`;
  };

  return { shape, svg };
})();
