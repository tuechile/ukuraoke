# Ukuraoke

Ukulele chords and lyrics, karaoke style, so you can sing at home.

Like hopamchuan.com, but ukulele-first with a cleaner layout: chords sit above the lyrics, and in karaoke mode the current line highlights in time with the song playing in the background.

## Features

- Search songs and get ukulele chord sheets (falls back to regular chords)
- Time-synced lyrics that follow the music
- Chords attached to each synced line so you can play along
- Play your own audio file or a YouTube video in the background
- Offset control to fix lyric drift

## Data sources

- Chords: [Ultimate Guitar](https://www.ultimate-guitar.com) via [`ultimate-guitar`](https://github.com/RyannKim327/UltimateGuitar-Project)
- Audio: your own file, or YouTube
- Lyrics: [LRCLIB](https://lrclib.net), the open synced-lyrics database behind [LRCGET](https://github.com/tranxuanthang/lrcget)

## Getting started

Requires Node 24+.

```bash
npm install
npm start
```

The API runs on http://localhost:3000.

| Route | Does |
| --- | --- |
| `/api/search?q=&artist=` | Find chord sheets, ukulele first |
| `/api/chords?url=` | Parsed chord sheet |
| `/api/lyrics?artist=&track=` | Time-synced lyrics |
| `/api/youtube?q=` | YouTube videos for background audio |
| `/api/song?url=&artist=&track=` | Everything merged: timed lines with chords, plus a matching YouTube video |

`npm run cli` runs the original command-line prototype.

## Roadmap

1. ~~Backend: search, chords, lyrics, YouTube and merged-song endpoints~~
2. ~~Chord parsing and alignment with timed lyrics~~
3. Simple frontend: search, chord sheet view, karaoke view with audio player
4. Transpose, chord diagrams, caching
