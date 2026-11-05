import { useCallback, useEffect, useState } from 'react';
import type { ClassEngine } from '../audio/engine';
import { useEngineClock } from '../hooks/useEngineClock';
import { changeAhead, pedalPhaseAt, stateAt, type TimelineEntry } from '../models/classPlanModel';
import { formatClock } from '../models/formatModel';
import { creditLine } from '../models/onlineSearchModel';
import type { TrackCredit } from '../models/trackModel';
import { resistanceColor, resistanceName } from '../models/resistanceModel';
import { SEGMENT_SPECS, resistanceSpan } from '../models/segmentModel';
import { BeatPulse } from './BeatPulse';
import { ResistanceScale } from './ResistanceScale';
import { SegmentStrip } from './SegmentStrip';

interface Props {
  engine: ClassEngine;
  timeline: TimelineEntry[];
  error: string | null;
  onBuild: () => void;
}

type WakeLockSentinelLike = { release: () => Promise<void> };

export function Ride({ engine, timeline, error, onBuild }: Props) {
  const clock = useEngineClock(engine);
  const [volume, setVolume] = useState(0.9);
  const [pauseBetween, setPauseBetween] = useState(engine.pauseBetween);
  const [flash, setFlash] = useState<{ key: number; label: string; zone: string; color: string } | null>(null);
  const state = stateAt(timeline, clock.elapsed);
  const { status } = clock;
  const cueKey = state.entry && state.cue ? `${state.entryIndex}:${state.cueIndex}` : '';
  const holding = engine.isHolding();

  // Flash the new instruction when a zone changes.
  const [lastCue, setLastCue] = useState({ key: '', zone: '' });
  useEffect(() => {
    if (status !== 'playing' || !state.cue) return;
    const zone = resistanceName(state.cue.resistance);
    if (lastCue.key !== '' && lastCue.key !== cueKey && lastCue.zone !== zone) {
      setFlash({ key: Date.now(), label: state.cue.label, zone, color: resistanceColor(state.cue.resistance) });
    }
    if (lastCue.key !== cueKey) setLastCue({ key: cueKey, zone });
  }, [cueKey, status, state.cue, lastCue]);
  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), 2500);
    return () => window.clearTimeout(id);
  }, [flash]);

  // Keep the screen awake while a class is running.
  useEffect(() => {
    if (status !== 'playing') return;
    let lock: WakeLockSentinelLike | null = null;
    let cancelled = false;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
    };
    nav.wakeLock
      ?.request('screen')
      .then((l) => {
        if (cancelled) void l.release();
        else lock = l;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (lock) void lock.release().catch(() => undefined);
    };
  }, [status]);

  const toggle = useCallback(() => {
    void engine.toggle();
  }, [engine]);

  const jumpTo = useCallback(
    (index: number) => {
      const target = timeline[Math.max(0, Math.min(timeline.length - 1, index))];
      if (target) void engine.seek(target.start);
    },
    [engine, timeline],
  );

  const next = useCallback(() => {
    const cur = stateAt(timeline, engine.elapsed);
    if (cur.entryIndex >= 0 && cur.entryIndex < timeline.length - 1) jumpTo(cur.entryIndex + 1);
  }, [engine, timeline, jumpTo]);

  const prev = useCallback(() => {
    const cur = stateAt(timeline, engine.elapsed);
    if (cur.entryIndex < 0) return;
    jumpTo(cur.entryElapsed > 4 ? cur.entryIndex : cur.entryIndex - 1);
  }, [engine, timeline, jumpTo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        toggle();
      } else if (e.code === 'ArrowRight') next();
      else if (e.code === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, next, prev]);

  const phase = useCallback((): number | null => {
    if (engine.getStatus() !== 'playing') return null;
    const cur = stateAt(engine.getTimeline(), engine.elapsed);
    return cur.entry ? pedalPhaseAt(cur.entry, engine.elapsed) : null;
  }, [engine]);

  if (timeline.length === 0) {
    return (
      <section className="panel empty">
        <h2>No class loaded</h2>
        <p>Build a class first, then press Start class.</p>
        <button className="btn primary" onClick={onBuild}>
          Go to Build
        </button>
      </section>
    );
  }

  const entry = state.entry;
  const cue = state.cue;
  const level = cue?.resistance ?? 1;
  const color = resistanceColor(level);
  const nextLevel = state.nextCue?.resistance ?? null;
  const upcoming = timeline.slice((state.entryIndex < 0 ? timeline.length : state.entryIndex) + 1, (state.entryIndex < 0 ? timeline.length : state.entryIndex) + 4);

  if (status === 'finished' || (state.finished && status !== 'idle')) {
    return (
      <section className="panel empty">
        <h2>Class complete</h2>
        <p>
          {timeline.length} songs, {formatClock(state.total)}. Great ride.
        </p>
        <div className="row">
          <button className="btn primary" onClick={() => void engine.play(0)}>
            Ride it again
          </button>
          <button className="btn" onClick={onBuild}>
            Back to Build
          </button>
        </div>
      </section>
    );
  }

  const cadenceNote = entry?.item.custom
    ? entry.item.custom.rpm
      ? 'RPM from your plan'
      : 'Free pace, no set RPM'
    : entry && entry.pedalFactor === 0.5
      ? 'Half time: one pedal stroke every 2 beats'
      : 'One pedal stroke on every beat';

  return (
    <section className="ride" style={{ ['--rc' as string]: color }}>
      {flash && (
        <div className="changeflash" key={flash.key} style={{ background: flash.color }} aria-live="assertive">
          <span className="changeflash-zone">{flash.zone}</span>
          <span className="changeflash-label">{flash.label}</span>
        </div>
      )}
      {holding && (
        <div className="holdbar">
          <strong>Song finished.</strong>{' '}
          {state.entry ? `Next: ${state.entry.track.title}. ` : ''}Press play when the class is ready.
        </div>
      )}
      <div className="ride-top">
        <div className="ride-seg">
          <span className="chip">{entry ? SEGMENT_SPECS[entry.item.type].label : 'Ready'}</span>
          <span className="ride-count">
            {entry ? `Song ${entry.index + 1} of ${timeline.length}` : `${timeline.length} songs`}
          </span>
        </div>
        <div className="ride-song">
          <div className="ride-title">{entry ? entry.track.title : timeline[0].track.title}</div>
          <div className="ride-artist">{entry ? entry.track.artist : timeline[0].track.artist}</div>
          {(entry ?? timeline[0]).track.credit && (
            <div className="ride-credit">{creditLine((entry ?? timeline[0]).track.credit as TrackCredit)}</div>
          )}
        </div>
      </div>

      <div className="ride-main">
        <div className="ride-level" style={{ background: `linear-gradient(160deg, ${resistanceColor(level, 6)}, ${resistanceColor(level, -8)})` }}>
          <div className="ride-level-label">Resistance</div>
          {cue?.zone ? (
            <div className="ride-level-value word">{resistanceName(level)}</div>
          ) : (
            <>
              <div className="ride-level-value">{level}</div>
              <div className="ride-level-name">{resistanceName(level)}</div>
            </>
          )}
          <div className="ride-cue">{cue?.label ?? 'Press start'}</div>
        </div>

        <BeatPulse
          getPhase={phase}
          color={color}
          label={(entry ?? timeline[0]).cadence > 0 ? String(Math.round((entry ?? timeline[0]).cadence)) : '-'}
          sublabel={cadenceNote}
        />
      </div>

      {(() => {
        const ahead = status === 'playing' ? changeAhead(state, 5) : null;
        return ahead ? (
          <div className="warning" style={{ background: resistanceColor(ahead.cue.resistance) }}>
            <span className="warning-count">{Math.max(1, Math.ceil(ahead.seconds))}</span>
            <span>
              {resistanceName(ahead.cue.resistance)}: {ahead.cue.label}
            </span>
          </div>
        ) : null;
      })()}

      <ResistanceScale level={level} nextLevel={nextLevel} large />

      <div className="ride-next">
        {state.nextCue && cue ? (
          <>
            <div>
              <span className="muted">Next change</span>{' '}
              <strong>{state.nextCue.label}</strong>{' '}
              <span className="lvl" style={{ background: resistanceColor(state.nextCue.resistance) }}>
                {state.nextCue.zone ? resistanceName(state.nextCue.resistance) : state.nextCue.resistance}
              </span>
            </div>
            <div className="countdown">{formatClock(state.cueRemaining)}</div>
          </>
        ) : (
          <div className="muted">Last cue of the class</div>
        )}
      </div>

      <SegmentStrip timeline={timeline} elapsed={clock.elapsed} onSeek={(s) => void engine.seek(s)} height={72} />
      <div className="ride-times">
        <span>{formatClock(state.elapsed)}</span>
        <span>{formatClock(Math.max(0, state.total - state.elapsed))} left</span>
      </div>

      <div className="controls">
        <button className="btn round" onClick={prev} aria-label="Previous song" disabled={status === 'idle'}>
          ⏮
        </button>
        <button className="btn round big primary" onClick={toggle} aria-label={status === 'playing' ? 'Pause' : 'Play'}>
          {status === 'playing' ? '⏸' : '▶'}
        </button>
        <button className="btn round" onClick={next} aria-label="Next song" disabled={status === 'idle'}>
          ⏭
        </button>
        <label className="vol">
          Volume
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => {
              const v = Number(e.target.value);
              setVolume(v);
              engine.setVolume(v);
            }}
          />
        </label>
        <label className="vol">
          <input
            type="checkbox"
            checked={pauseBetween}
            onChange={(e) => {
              setPauseBetween(e.target.checked);
              engine.setPauseBetween(e.target.checked);
            }}
          />{' '}
          Stop between songs
        </label>
        <button
          className="btn"
          onClick={() => void engine.stop()}
          disabled={status === 'idle'}
        >
          Stop
        </button>
      </div>

      {error && <div className="notice warn">{error}</div>}

      {upcoming.length > 0 && (
        <div className="upnext">
          <h3>Up next</h3>
          {upcoming.map((u) => {
            const span = resistanceSpan(u.cues);
            return (
              <div className="upnext-row" key={u.item.id}>
                <span className="chip small">{SEGMENT_SPECS[u.item.type].label}</span>
                <span className="grow">{u.track.title}</span>
                <span className="muted">{u.cadence > 0 ? `${Math.round(u.cadence)} rpm` : 'free pace'}</span>
                <span className="lvl" style={{ background: resistanceColor(span.low) }}>
                  {u.item.custom ? resistanceName(span.low) : span.low}
                </span>
                {span.low !== span.high && (
                  <>
                    <span className="muted">to</span>
                    <span className="lvl" style={{ background: resistanceColor(span.high) }}>
                      {u.item.custom ? resistanceName(span.high) : span.high}
                    </span>
                  </>
                )}
                <span className="muted">{formatClock(u.start - state.elapsed)}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
