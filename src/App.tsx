import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClassEngine } from './audio/engine';
import { loadTrackBuffer } from './audio/loader';
import { Builder } from './components/Builder';
import { Discover } from './components/Discover';
import { Library } from './components/Library';
import { Ride } from './components/Ride';
import { SpotifyPanel } from './components/SpotifyPanel';
import { BUILTIN_TRACKS } from './data/builtinTracks';
import { useEngineStatus } from './hooks/useEngineClock';
import { useLibrary } from './hooks/useLibrary';
import { newId } from './lib/id';
import {
  autoBuildClass,
  buildTimeline,
  type ClassPlan,
  type PlanItem,
  type TimelineEntry,
} from './models/classPlanModel';
import { usesExternalPlayer } from './models/externalPlayModel';
import type { SegmentType } from './models/segmentModel';
import type { Track } from './models/trackModel';
import { finishLoginFromUrl } from './spotify/auth';
import { spotify } from './spotify/controller';
import { loadClasses, loadDraft, saveClasses, saveDraft } from './storage/libraryStorage';

type View = 'library' | 'find' | 'spotify' | 'build' | 'ride';

const SPOTIFY_NEEDED = 'This class has Spotify songs. Open the Spotify tab and connect first.';

const TAB_LABELS: Record<View, string> = {
  library: 'Music',
  find: 'Find music',
  spotify: 'Spotify',
  build: 'Build',
  ride: 'Ride',
};

function makeInitialDraft(): ClassPlan {
  return {
    id: newId('class'),
    name: 'Mixed ride 45',
    createdAt: Date.now(),
    items: autoBuildClass(BUILTIN_TRACKS, 'mixed', 45, { seed: 7, newId: () => newId('seg') }),
  };
}

export default function App() {
  const library = useLibrary();
  const [view, setView] = useState<View>('build');
  const [draft, setDraft] = useState<ClassPlan>(() => loadDraft() ?? makeInitialDraft());
  const [classes, setClasses] = useState<ClassPlan[]>(() => loadClasses());
  const [classEngine] = useState(() => new ClassEngine());
  const [previewEngine] = useState(() => new ClassEngine());
  const classStatus = useEngineStatus(classEngine);
  const [rideTimeline, setRideTimeline] = useState<TimelineEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  const classActive = classStatus === 'playing' || classStatus === 'paused';

  useEffect(() => saveDraft(draft), [draft]);
  useEffect(() => saveClasses(classes), [classes]);

  // Drop segments whose song was removed from the library.
  useEffect(() => {
    const ids = new Set(library.tracks.map((t) => t.id));
    setDraft((d) => {
      const kept = d.items.filter((i) => ids.has(i.trackId));
      return kept.length === d.items.length ? d : { ...d, items: kept };
    });
  }, [library.tracks]);

  useEffect(() => {
    classEngine.onError = setError;
    previewEngine.onError = setError;
    classEngine.setExternal(spotify);
    previewEngine.setExternal(spotify);
  }, [classEngine, previewEngine]);

  // Complete a Spotify sign-in when Spotify sent the browser back here, or reconnect a saved one.
  useEffect(() => {
    void finishLoginFromUrl().then((result) => {
      if (result.kind === 'connected') {
        setView('spotify');
        void spotify.start();
      } else if (result.kind === 'error') {
        setView('spotify');
        spotify.reportError(result.message);
      } else {
        spotify.resumeIfSignedIn();
      }
    });
  }, []);

  const trackById = useMemo(() => new Map(library.tracks.map((t) => [t.id, t])), [library.tracks]);

  const stopPreview = useCallback(async () => {
    await previewEngine.stop();
    setPreviewingId(null);
  }, [previewEngine]);

  const preview = useCallback(
    async (key: string, track: Track, type: SegmentType) => {
      if (previewingId === key) {
        await stopPreview();
        return;
      }
      await previewEngine.stop();
      const item: PlanItem = { id: 'preview', trackId: track.id, type };
      const single = buildTimeline([item], [track]);
      if (usesExternalPlayer(single)) {
        if (!spotify.isReady()) {
          setError(SPOTIFY_NEEDED);
          return;
        }
        spotify.activate();
      }
      previewEngine.load(single, loadTrackBuffer);
      previewEngine.onFinished = () => setPreviewingId(null);
      setPreviewingId(key);
      setError(null);
      try {
        await previewEngine.play(track.duration > 90 ? 20 : 0);
      } catch {
        setPreviewingId(null);
        setError('Audio could not start. Tap the screen and try again.');
      }
    },
    [previewEngine, previewingId, stopPreview],
  );

  const startClass = useCallback(async () => {
    const timeline = buildTimeline(draft.items, library.tracks);
    if (timeline.length === 0) return;
    if (usesExternalPlayer(timeline)) {
      if (!spotify.isReady()) {
        setError(SPOTIFY_NEEDED);
        return;
      }
      // Runs inside the click, which is what lets the browser play Spotify audio later.
      spotify.activate();
    }
    await stopPreview();
    await classEngine.stop();
    classEngine.load(timeline, loadTrackBuffer);
    setRideTimeline(timeline);
    setError(null);
    setView('ride');
  }, [classEngine, draft.items, library.tracks, stopPreview]);

  const patchDraft = useCallback((patch: Partial<ClassPlan>) => {
    setDraft((d) => ({ ...d, ...patch }));
  }, []);

  const saveCurrent = useCallback(() => {
    setClasses((prev) => {
      const saved: ClassPlan = { ...draft, name: draft.name.trim() || 'Untitled class' };
      return prev.some((c) => c.id === saved.id)
        ? prev.map((c) => (c.id === saved.id ? saved : c))
        : [...prev, saved];
    });
  }, [draft]);

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="brand-mark" />
          Spin Studio
        </div>
        <nav className="tabs" aria-label="Sections">
          {(['library', 'find', 'spotify', 'build', 'ride'] as View[]).map((v) => (
            <button key={v} className={`tab${view === v ? ' on' : ''}`} onClick={() => setView(v)}>
              {TAB_LABELS[v]}
              {v === 'ride' && classStatus === 'playing' && <span className="live" />}
            </button>
          ))}
        </nav>
      </header>

      {classActive && view !== 'ride' && (
        <button className="miniplayer" onClick={() => setView('ride')}>
          <span className="live" /> Class {classStatus === 'playing' ? 'is playing' : 'is paused'}. Tap to open the ride screen.
        </button>
      )}

      {error && view !== 'ride' && <div className="notice warn">{error}</div>}

      <main>
        {view === 'library' && (
          <Library
            library={library}
            onPreview={(t) => void preview(`lib-${t.id}`, t, 'flat')}
            previewingId={previewingId}
            previewDisabled={classActive}
          />
        )}
        {view === 'find' && <Discover library={library} previewDisabled={classActive} />}
        {view === 'spotify' && <SpotifyPanel library={library} />}
        {view === 'build' && (
          <Builder
            tracks={library.tracks}
            draft={draft}
            onChange={patchDraft}
            classes={classes}
            onSave={saveCurrent}
            onLoad={(id) => {
              const found = classes.find((c) => c.id === id);
              if (found) setDraft({ ...found, items: found.items.map((i) => ({ ...i })) });
            }}
            onDelete={(id) => setClasses((prev) => prev.filter((c) => c.id !== id))}
            onStart={() => void startClass()}
            onPreview={(itemId, trackId, type) => {
              const track = trackById.get(trackId);
              if (track) void preview(itemId, track, type);
            }}
            previewingId={previewingId}
            previewDisabled={classActive}
          />
        )}
        {view === 'ride' && (
          <Ride engine={classEngine} timeline={rideTimeline} error={error} onBuild={() => setView('build')} />
        )}
      </main>
    </div>
  );
}
