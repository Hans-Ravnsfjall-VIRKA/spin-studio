import { useEffect, useMemo, useState } from 'react';
import type { Library } from '../hooks/useLibrary';
import { formatClock } from '../models/formatModel';
import { redirectUriFor, redirectUriProblem } from '../models/spotifyAuthModel';
import {
  newSpotifyTracks,
  parseBpmInput,
  parsePlaylistId,
  type SpotifyPlaylistInfo,
  type SpotifyTrackInfo,
} from '../models/spotifyModel';
import { beginLogin } from '../spotify/auth';
import { spotify } from '../spotify/controller';
import { loadClientId } from '../spotify/session';
import { useSpotify } from '../spotify/useSpotify';

interface Props {
  library: Library;
}

export function SpotifyPanel({ library }: Props) {
  const snap = useSpotify();
  const [clientId, setClientId] = useState(() => loadClientId());
  const redirectUri = redirectUriFor(window.location);
  const problem = redirectUriProblem(redirectUri);
  const ready = snap.phase === 'ready';

  const [playlists, setPlaylists] = useState<SpotifyPlaylistInfo[] | null>(null);
  const [playlistsError, setPlaylistsError] = useState<string | null>(null);
  const [open, setOpen] = useState<SpotifyPlaylistInfo | null>(null);
  const [openTracks, setOpenTracks] = useState<SpotifyTrackInfo[]>([]);
  const [openLoading, setOpenLoading] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<SpotifyTrackInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const inLibrary = useMemo(
    () => new Set(library.userTracks.map((t) => t.spotifyUri).filter((u): u is string => !!u)),
    [library.userTracks],
  );

  useEffect(() => {
    if (!ready || playlists !== null) return;
    spotify
      .listPlaylists()
      .then(setPlaylists)
      .catch((e: unknown) => setPlaylistsError(e instanceof Error ? e.message : 'Could not load playlists.'));
  }, [ready, playlists]);

  const connect = () => {
    const id = clientId.trim();
    if (!id) return;
    beginLogin(id).catch((e: unknown) =>
      spotify.reportError(e instanceof Error ? e.message : 'Could not start the Spotify sign-in.'),
    );
  };

  const openPlaylist = async (p: SpotifyPlaylistInfo) => {
    setOpen(p);
    setOpenTracks([]);
    setOpenError(null);
    setOpenLoading(true);
    try {
      setOpenTracks(await spotify.playlistTracks(p.id));
    } catch (e) {
      setOpenError(e instanceof Error ? e.message : 'Could not load this playlist.');
    } finally {
      setOpenLoading(false);
    }
  };

  const [link, setLink] = useState('');
  const openByLink = async () => {
    const id = parsePlaylistId(link);
    if (!id) {
      setOpen(null);
      setOpenError('That is not a Spotify playlist link.');
      return;
    }
    let name = 'Playlist from link';
    try {
      name = await spotify.playlistName(id);
    } catch {
      /* the name is optional; loading the songs reports the real problem */
    }
    await openPlaylist({ id, name, owner: '', trackCount: 0, imageUrl: null });
  };

  const runSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      setFound(await spotify.search(query));
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : 'The search failed.');
      setFound([]);
    } finally {
      setSearching(false);
    }
  };

  const addAll = () => {
    const n = library.addSpotify(openTracks, null);
    setNotice(
      n > 0
        ? `Added ${n} songs. Open the Music tab, play each one and tap along to set its tempo. Songs without a tempo stay out of your classes until then.`
        : 'Everything in this playlist is already in your library.',
    );
  };

  const freshCount = newSpotifyTracks(openTracks, library.userTracks).length;

  return (
    <section className="spotify">
      <div className="panel">
        <h2>Spotify</h2>
        <p className="muted small-text">
          For your own private riding. It needs Spotify Premium and plays through Spotify's own player in this browser
          tab, on a desktop browser. Spotify's terms cover personal use, so do not use this to teach other people.
          Spotify does not share tempo data, so you set each song's BPM by tapping along or typing it.
        </p>

        {ready ? (
          <div className="row between">
            <div>
              Connected{snap.displayName ? ` as ${snap.displayName}` : ''}
            </div>
            <button className="btn" onClick={() => spotify.logout()}>
              Disconnect
            </button>
          </div>
        ) : (
          <>
            {snap.phase === 'connecting' && <div className="notice">{snap.message || 'Connecting...'}</div>}
            {snap.phase === 'error' && <div className="notice warn">{snap.message}</div>}
            <ol className="steps">
              <li>
                Open the{' '}
                <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">
                  Spotify developer dashboard
                </a>{' '}
                and create an app. Tick Web API and Web Playback SDK.
              </li>
              <li>
                Add this as a Redirect URI, exactly as written: <code>{redirectUri}</code>
                {problem && <div className="warn-text">{problem}</div>}
              </li>
              <li>Under User Management, add your own Spotify account (name and email).</li>
              <li>Paste the app's Client ID here and connect.</li>
            </ol>
            <div className="keybox">
              <label className="field grow">
                <span>Spotify Client ID</span>
                <input type="text" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Client ID" />
              </label>
              <button className="btn primary" onClick={connect} disabled={!clientId.trim() || !!problem || snap.phase === 'connecting'}>
                Connect Spotify
              </button>
            </div>
          </>
        )}
      </div>

      {notice && <div className="notice">{notice}</div>}

      {ready && (
        <>
          <div className="panel">
            <h3>My playlists</h3>
            {playlistsError && <div className="notice warn">{playlistsError}</div>}
            {playlists === null && !playlistsError && <p className="muted">Loading your playlists...</p>}
            {playlists?.length === 0 && <p className="muted">No playlists found on this account.</p>}
            <div className="plist">
              {playlists?.map((p) => (
                <button
                  key={p.id}
                  className={`plitem${open?.id === p.id ? ' on' : ''}`}
                  onClick={() => void openPlaylist(p)}
                >
                  <span className="grow">{p.name}</span>
                  <span className="muted">{p.trackCount} songs</span>
                </button>
              ))}
            </div>
          </div>

          <div className="panel">
            <h3>Open a playlist by link</h3>
            <div className="row">
              <input
                className="grow"
                type="text"
                value={link}
                placeholder="https://open.spotify.com/playlist/..."
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void openByLink();
                }}
              />
              <button className="btn" onClick={() => void openByLink()} disabled={!link.trim() || openLoading}>
                Open
              </button>
            </div>
            {open === null && openError && <div className="notice warn">{openError}</div>}
          </div>

          {open && (
            <div className="panel">
              <div className="row between">
                <h3>{open.name}</h3>
                <button className="btn primary" onClick={addAll} disabled={openLoading || freshCount === 0}>
                  {freshCount > 0 ? `Add all ${freshCount} new songs` : 'All added'}
                </button>
              </div>
              {openLoading && <p className="muted">Loading songs...</p>}
              {openError && <div className="notice warn">{openError}</div>}
              <TrackList tracks={openTracks} inLibrary={inLibrary} library={library} onNotice={setNotice} />
            </div>
          )}

          <div className="panel">
            <h3>Search Spotify</h3>
            <div className="row">
              <input
                className="grow"
                type="text"
                value={query}
                placeholder="Song or artist"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void runSearch();
                }}
              />
              <button className="btn" onClick={() => void runSearch()} disabled={searching || !query.trim()}>
                {searching ? 'Searching...' : 'Search'}
              </button>
            </div>
            {searchError && <div className="notice warn">{searchError}</div>}
            <TrackList tracks={found} inLibrary={inLibrary} library={library} onNotice={setNotice} />
          </div>
        </>
      )}
    </section>
  );
}

function TrackList({
  tracks,
  inLibrary,
  library,
  onNotice,
}: {
  tracks: SpotifyTrackInfo[];
  inLibrary: Set<string>;
  library: Library;
  onNotice: (message: string | null) => void;
}) {
  const [bpmText, setBpmText] = useState<Record<string, string>>({});

  return (
    <div>
      {tracks.map((t) => {
        const added = inLibrary.has(t.uri);
        const text = bpmText[t.uri] ?? '';
        const bpm = text.trim() === '' ? null : parseBpmInput(text);
        const badTempo = text.trim() !== '' && bpm === null;
        return (
          <div className="trow" key={t.uri}>
            <div className="tinfo">
              <div className="ttitle">{t.title}</div>
              <div className="muted small-text">
                {t.artist} · {formatClock(t.durationSec)}
                {' · '}
                <a href={t.url} target="_blank" rel="noreferrer">
                  Open in Spotify
                </a>
              </div>
            </div>
            <div className="tcontrols">
              {added ? (
                <span className="muted">In your library</span>
              ) : (
                <>
                  <input
                    className={`bpmin${badTempo ? ' bad' : ''}`}
                    type="text"
                    inputMode="decimal"
                    placeholder="BPM (optional)"
                    value={text}
                    aria-label={`Tempo for ${t.title}`}
                    onChange={(e) => setBpmText((m) => ({ ...m, [t.uri]: e.target.value }))}
                  />
                  <button
                    className="btn"
                    disabled={badTempo}
                    onClick={() => {
                      library.addSpotify([t], bpm);
                      onNotice(
                        bpm === null
                          ? `Added "${t.title}". Set its tempo in the Music tab before using it in a class.`
                          : `Added "${t.title}" at ${bpm} BPM.`,
                      );
                    }}
                  >
                    Add
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
