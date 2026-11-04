import { useEffect, useRef, useState } from 'react';
import type { Library } from '../hooks/useLibrary';
import { formatClock } from '../models/formatModel';
import { licenseLabel, licenseUrl } from '../models/licenseModel';
import {
  GENRE_PRESETS,
  JAMENDO_SPEEDS,
  type JamendoSpeed,
  type OnlineProvider,
  type OnlineTrack,
} from '../models/onlineSearchModel';
import { searchJamendo, searchOpenverse } from '../online/search';
import { loadSettings, saveSettings } from '../storage/libraryStorage';

interface Props {
  library: Library;
  /** True while a class is running, so previews do not talk over it. */
  previewDisabled: boolean;
}

interface RowState {
  state: 'adding' | 'added' | 'failed';
  message: string;
  blocked?: boolean;
}

export function Discover({ library, previewDisabled }: Props) {
  const [provider, setProvider] = useState<OnlineProvider>('openverse');
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState('electronic');
  const [speed, setSpeed] = useState<JamendoSpeed | ''>('');
  const [clientId, setClientId] = useState(() => loadSettings().jamendoClientId);
  const [keyDraft, setKeyDraft] = useState(clientId);
  const [results, setResults] = useState<OnlineTrack[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  const needsKey = provider === 'jamendo' && clientId.trim().length === 0;

  const stopPreview = () => {
    const a = audio.current;
    if (a) {
      a.pause();
      a.removeAttribute('src');
      a.load();
    }
    setPreviewKey(null);
  };

  useEffect(() => () => stopPreview(), []);

  useEffect(() => {
    if (previewDisabled) stopPreview();
  }, [previewDisabled]);

  const run = async (nextPage: number) => {
    stopPreview();
    setLoading(true);
    setError(null);
    try {
      const input = { query, genre, page: nextPage };
      const found =
        provider === 'openverse'
          ? await searchOpenverse(input)
          : await searchJamendo({ ...input, clientId: clientId.trim(), speed });
      setResults(found);
      setPage(nextPage);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The search failed.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const togglePreview = (t: OnlineTrack) => {
    if (previewKey === t.key) {
      stopPreview();
      return;
    }
    if (!audio.current) audio.current = new Audio();
    const a = audio.current;
    a.src = t.audioUrl;
    a.onended = () => setPreviewKey(null);
    a.onerror = () => {
      setPreviewKey(null);
      setError('That preview could not be played.');
    };
    setPreviewKey(t.key);
    void a.play().catch(() => setPreviewKey(null));
  };

  const add = async (t: OnlineTrack) => {
    setRows((r) => ({ ...r, [t.key]: { state: 'adding', message: 'Downloading and detecting tempo...' } }));
    const result = await library.importOnline(t);
    setRows((r) => ({
      ...r,
      [t.key]: { state: result.ok ? 'added' : 'failed', message: result.message, blocked: result.blocked },
    }));
  };

  return (
    <section className="discover">
      <div className="panel">
        <h2>Find free music</h2>
        <p className="muted small-text">
          Searches Creative Commons catalogs. Only licenses that allow commercial use are shown (CC0, public domain, CC BY
          and CC BY-SA). The artist credit is kept with each song and shown on the ride screen, as those licenses
          require. Songs are saved in this browser so classes also work offline.
        </p>

        <div className="row wrap">
          <label className="field">
            <span>Source</span>
            <select value={provider} onChange={(e) => setProvider(e.target.value as OnlineProvider)}>
              <option value="openverse">Openverse (no key needed)</option>
              <option value="jamendo">Jamendo (free key)</option>
            </select>
          </label>
          <label className="field grow">
            <span>Search</span>
            <input
              type="text"
              value={query}
              placeholder="Artist, title or mood, for example workout"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !needsKey) void run(1);
              }}
            />
          </label>
          <label className="field">
            <span>Genre</span>
            <select value={genre} onChange={(e) => setGenre(e.target.value)}>
              <option value="">Any</option>
              {GENRE_PRESETS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          {provider === 'jamendo' && (
            <label className="field">
              <span>Speed</span>
              <select value={speed} onChange={(e) => setSpeed(e.target.value as JamendoSpeed | '')}>
                <option value="">Any</option>
                {JAMENDO_SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button className="btn primary" onClick={() => void run(1)} disabled={loading || needsKey}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>

        {provider === 'jamendo' && (
          <div className="keybox">
            <label className="field grow">
              <span>Jamendo client ID (free at devportal.jamendo.com)</span>
              <input
                type="text"
                value={keyDraft}
                placeholder="Paste your client ID"
                onChange={(e) => setKeyDraft(e.target.value)}
              />
            </label>
            <button
              className="btn"
              onClick={() => {
                const id = keyDraft.trim();
                setClientId(id);
                saveSettings({ jamendoClientId: id });
              }}
              disabled={keyDraft.trim() === clientId.trim()}
            >
              Save key
            </button>
          </div>
        )}
        {needsKey && <p className="muted small-text">Paste a Jamendo client ID above to search Jamendo.</p>}
      </div>

      {error && <div className="notice warn">{error}</div>}

      <div className="panel">
        {!searched && !loading && <p className="muted">Search to see free songs. Tempo is detected when you add one.</p>}
        {searched && results.length === 0 && !loading && (
          <p className="muted">No commercial-safe songs found. Try another word or genre.</p>
        )}
        {results.map((t) => {
          const row = rows[t.key];
          const url = licenseUrl(t.license);
          return (
            <div className="trow" key={t.key}>
              <button
                className="btn icon"
                onClick={() => togglePreview(t)}
                disabled={previewDisabled}
                aria-label={previewKey === t.key ? 'Stop preview' : `Preview ${t.title}`}
              >
                {previewKey === t.key ? '■' : '▶'}
              </button>
              <div className="tinfo">
                <div className="ttitle">{t.title}</div>
                <div className="muted small-text">
                  {t.creator}
                  {t.durationSec !== null ? ` · ${formatClock(t.durationSec)}` : ''}
                  {' · '}
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer">
                      {licenseLabel(t.license)}
                    </a>
                  ) : (
                    licenseLabel(t.license)
                  )}
                  {' · '}
                  <a href={t.sourceUrl} target="_blank" rel="noreferrer">
                    Source page
                  </a>
                </div>
                {t.tags.length > 0 && (
                  <div className="chips">
                    {t.tags.slice(0, 4).map((tag) => (
                      <span className="chip small dim" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {row && (
                  <div className={`rowmsg ${row.state}`}>
                    {row.message}
                    {row.blocked && (
                      <>
                        {' '}
                        <a href={t.sourceUrl} target="_blank" rel="noreferrer">
                          Open source page
                        </a>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="tcontrols">
                <button
                  className="btn"
                  onClick={() => void add(t)}
                  disabled={row?.state === 'adding' || row?.state === 'added'}
                >
                  {row?.state === 'added' ? 'Added' : row?.state === 'adding' ? 'Adding...' : 'Add to library'}
                </button>
              </div>
            </div>
          );
        })}
        {results.length > 0 && (
          <div className="row pager">
            <button className="btn" onClick={() => void run(page - 1)} disabled={loading || page <= 1}>
              Previous
            </button>
            <span className="muted">Page {page}</span>
            <button className="btn" onClick={() => void run(page + 1)} disabled={loading}>
              Next
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
