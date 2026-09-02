const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const { guitar } = require("ultimate-guitar");
const ug = guitar();

function ask(question) {
    return new Promise((resolve) => rl.question(question, resolve));
}

async function findLyrics(song, artist) {
    const q = artist ? `${song} ${artist}` : song;
    const response = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`);
    if (!response.ok) throw new Error(`lrclib error: ${response.status} ${response.statusText}`);
    const data = await response.json();
    return data[0] || null; // best match
}

async function findChords(song, artist) {
    const result = await ug.search(song, artist, ug.category.CHORDS);
    if (result.status !== 200 || !Array.isArray(result.responses) || result.responses.length === 0) {
        return null;
    }
    const best = result.responses[0]; // highest-ranked hit
    const chords = await ug.fetch(best);
    return { meta: best, content: chords.response };
}

async function main() {
    const song = await ask('Enter a song name: ');
    const artist = await ask('Enter an artist (optional, press enter to skip): ');

    try {
        const [lyrics, chords] = await Promise.all([
            findLyrics(song, artist || undefined),
            findChords(song, artist || undefined)
        ]);

        if (chords) {
            console.log(`\n=== ${chords.meta.song_name} — ${chords.meta.artist_name} (chords) ===\n`);
            console.log(chords.content);
        } else {
            console.log('\nNo chords found on Ultimate Guitar for that song.');
        }

        if (lyrics) {
            console.log(`\n=== Plain lyrics (lrclib) ===\n`);
            console.log(lyrics.plainLyrics || '(no plain lyrics available)');
        } else {
            console.log('\nNo lyrics found on lrclib for that song.');
        }
    } catch (err) {
        console.error(err);
    } finally {
        rl.close();
    }
}

main();