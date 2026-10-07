const norm = (w) => w.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]/g, "");

const words = (text) =>
  [...text.matchAll(/\S+/g)].map((m) => ({ word: norm(m[0]), start: m.index, end: m.index + m[0].length })).filter((w) => w.word);

const stream = (sheet) =>
  sheet.sections.flatMap((section) =>
    section.lines.flatMap((line) => {
      const ws = words(line.text);
      const out = ws.map((w) => ({ word: w.word, chords: [] }));
      for (const c of line.chords) {
        const i = ws.findIndex((w) => c.at < w.end);
        if (i >= 0) out[i].chords.push(c.chord);
        else if (out.length) out[out.length - 1].chords.push(c.chord);
      }
      return out;
    })
  );

const score = (flat, start, target) => target.reduce((s, w, i) => s + (flat[start + i]?.word === w.word ? 1 : 0), 0);

const locate = (flat, target, from, to) => {
  let best = { start: -1, hits: 0 };
  for (let s = Math.max(0, from); s < Math.min(flat.length, to); s++) {
    const hits = score(flat, s, target);
    if (hits > best.hits) best = { start: s, hits };
  }
  return best;
};

const merge = (sheet, lines) => {
  const flat = stream(sheet);
  let cursor = 0;
  return lines.map((line) => {
    const target = words(line.text);
    if (!target.length) return { ...line, chords: [] };
    const enough = Math.max(1, Math.ceil(target.length / 2));
    let found = locate(flat, target, cursor - 2, cursor + 40);
    if (found.hits < enough) found = locate(flat, target, 0, flat.length);
    if (found.hits < enough) return { ...line, chords: [] };
    cursor = found.start + target.length;
    const chords = target.flatMap((w, i) => (flat[found.start + i]?.chords || []).map((chord) => ({ chord, at: w.start })));
    return { ...line, chords };
  });
};

module.exports = { merge };
