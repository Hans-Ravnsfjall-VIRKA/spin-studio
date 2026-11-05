# Spin Studio

A React + TypeScript app for hosting spinning classes. Music and program live in one app: every song is matched to a segment by cadence and energy, and every segment carries resistance cues, color coded in zones, that change on the bars of the song.

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
- Resistance: levels 1 to 10 in color zones. Climbs ramp up, intervals alternate recover and push, cool downs ramp down.

| Zone | Levels |
| --- | --- |
| White (no resistance) | 1 |
| Blue | 2 to 3 |
| Green | 4 to 5 |
| Yellow | 6 to 7 |
| Red | 8 to 10 |

Zones live in `src/models/resistanceModel.ts`.
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
- Spotify tab (private use only): sign in with your own Spotify Premium account, import your own playlists or search, and play them inside the app through Spotify's Web Playback SDK. Spotify's terms cover personal use, so this is not for teaching other people.
  - One time setup: create an app at developer.spotify.com/dashboard (Web API and Web Playback SDK), add the Redirect URI the Spotify tab shows, add your own account under User Management, paste the Client ID.
  - Spotify gives no tempo data, so imported songs start with an unknown tempo. Play the song from the Music tab and press Tap along with the beat (or type the BPM). Songs with no tempo stay out of classes until set.
  - Class songs play one after another through the player. Resistance cues follow the class clock, so they can sit up to about half a second off the music.
  - Desktop browsers only. The Spotify player does not run in phone browsers.
- Files are stored in the browser (IndexedDB). They stay on the device that imported them.

## Written plans

Build tab, Written plan, Load plan. A plan keeps the instructor's own RPM per song and timed color changes (sit, stand, sprint), and can play only part of a song. Songs are found in the library by title and artist, so import the playlist first (Spotify tab, Open a playlist by link). Songs that are not found are picked by hand. Start class stays off until every song is picked. Plans live in `src/data/plans.ts`.

## Editing a class

Build tab, Edit on any song. Each song is split into sections with a zone (white, blue, green, yellow, red), an instruction and an optional own RPM. Use the arrows for a harder or easier section, plus or minus 5 RPM per section or for the whole song, add a section at a time, or apply a pattern: steady, steps up, steps down, pyramid, intervals, sit and stand, finish strong. Import program from PDF reads numbered lines like `1. RPM 62 í bláum (5:15): Artist: Title` with timed lines below them, and saves the plan in this browser.

## iPhone

Safari cannot run Spotify's player. In the Spotify tab, Play on lists your Spotify devices. Open the Spotify app on the phone, play a song for a second, press Refresh and pick it. The page then controls the app. Songs from files and the built-in songs play in the page itself.

## iPhone app (Xcode)

The same code runs as an iPhone app through Capacitor. The Xcode project is in `ios/`.

1. `npm install`, then `npm run ios`. It builds the web app, copies it into the project and opens Xcode.
2. In Xcode, select the App target, Signing & Capabilities, tick Automatically manage signing and choose your Team (your Apple ID works).
3. Plug in the iPhone, pick it at the top of Xcode and press Run. On the phone, trust the developer under Settings, General, VPN & Device Management.
4. In the Spotify developer dashboard add the redirect URI `spinstudio://callback` to your app.

The app keeps the screen on, keeps the class clock running with the screen locked, and mixes with the Spotify app. After changing the web code run `npm run ios` again. A free Apple ID install lasts 7 days, then run it from Xcode again. Icon and splash come from `assets/`; `npm run assets` regenerates them.

## Layout

```
src/models/     pure logic with tests (*Model.ts, *Model.test.ts)
src/audio/      Web Audio engine, synth voices, decoding
src/storage/    localStorage and IndexedDB
src/hooks/      React hooks
src/components/ Music, Build and Ride screens
```

## Spotify inside the iPhone app

The installed app controls the Spotify app through Spotify's iOS SDK (App Remote), using the local plugin in `plugins/spotify-remote`.
In the Spotify developer dashboard, add iOS as an SDK, set Bundle ID `fo.virka.spinstudio` and add the redirect URI `spinstudio://spotify-callback`.
