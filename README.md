# Spin Studio

A React + TypeScript app for hosting spinning classes. Music and program live in one app: every song is matched to a segment by cadence and energy, and every segment carries resistance cues from blue (1) to red (10) that change on the bars of the song.

## Run

```
npm install
npm run dev      # development
npm test         # model tests
npm run build    # static build in dist/
```

`dist/` is a static site with relative paths, so it can be hosted anywhere (Netlify, GitHub Pages, a folder on a tablet).

## How a class works

- Cadence: a rider pedals once per beat, or once per two beats (half time). A 140 BPM song is a 70 RPM climb, a 100 BPM song is a 100 RPM flat. The app picks whichever lands in the segment's range.
- Resistance: levels 1 to 10, colored blue to red. Climbs ramp up, intervals alternate recover and push, cool downs ramp down.
- Cues land on bars: resistance changes happen on whole blocks of bars of the song, using the song's BPM and first beat position.

| Segment | Cadence RPM | Resistance |
| --- | --- | --- |
| Warm up | 70 to 90 | 2 to 4 ramp |
| Endurance | 80 to 95 | 5 steady |
| Flat road | 85 to 100 | 4 and 5 alternate |
| Climb | 60 to 75 | 5 to 9 ramp |
| Intervals | 85 to 110 | 3 recover, 7 push |
| Sprint | 100 to 120 | 3 recover, 5 sprint |
| Cool down | 60 to 80 | 4 down to 1 |

Ranges and levels live in `src/models/segmentModel.ts`.

## Music

- Built in tracks: 38 practice songs generated live with Web Audio (kick on every beat, so riders can always pedal to it). Tempos are chosen to cover every segment.
- Your own songs: add audio files on the Music tab. Tempo and first beat are detected in the browser. If a tempo reads half or double, press the ½ or ×2 button. Set Energy 1 to 5 for how hard the song feels.
- Find music tab: searches free Creative Commons catalogs, previews by streaming, and downloads a song into the app (BPM detected, stored for offline use).
  - Openverse: no key needed.
  - Jamendo: needs a free client ID from devportal.jamendo.com, pasted into the Find music tab.
  - Only CC0, public domain, CC BY and CC BY-SA are listed. Non commercial (NC) and no derivatives (ND) tracks are filtered out. The creator and license are kept with the song and shown on the Ride screen, which is the attribution those licenses require.
  - Some hosts block downloads from a web page (CORS). The row then links to the source page: save the file there and add it with Add your music.
  - Check the terms of each catalog for use in a business, and note that performing rights societies may still claim fees for some artists.
- Files are stored in the browser (IndexedDB). They stay on the device that imported them.

## Layout

```
src/models/     pure logic with tests (*Model.ts, *Model.test.ts)
src/audio/      Web Audio engine, synth voices, decoding
src/storage/    localStorage and IndexedDB
src/hooks/      React hooks
src/components/ Music, Build and Ride screens
```
