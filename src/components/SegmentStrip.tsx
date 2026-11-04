import type { MouseEvent } from 'react';
import { totalDuration, type TimelineEntry } from '../models/classPlanModel';
import { resistanceColor } from '../models/resistanceModel';

interface Props {
  timeline: TimelineEntry[];
  /** Seconds. Draws a playhead when set. */
  elapsed?: number;
  onSeek?: (seconds: number) => void;
  height?: number;
}

/** Elevation style profile of the class: bar height and color both follow resistance. */
export function SegmentStrip({ timeline, elapsed, onSeek, height = 64 }: Props) {
  const total = totalDuration(timeline);
  if (total <= 0) return <div className="strip strip-empty" style={{ height }} />;

  const handle = (e: MouseEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(ratio * total);
  };

  return (
    <div
      className={`strip${onSeek ? ' strip-seek' : ''}`}
      style={{ height }}
      onClick={handle}
      role={onSeek ? 'slider' : 'img'}
      aria-label="Class profile"
      aria-valuemin={0}
      aria-valuemax={Math.round(total)}
      aria-valuenow={elapsed !== undefined ? Math.round(elapsed) : undefined}
    >
      {timeline.map((entry) => (
        <div key={entry.item.id} className="strip-seg" style={{ left: `${(entry.start / total) * 100}%` }} />
      ))}
      {timeline.flatMap((entry) =>
        entry.cues.map((cue, i) => (
          <div
            key={`${entry.item.id}-${i}`}
            className="strip-cue"
            title={`${entry.track.title}: ${cue.label}, level ${cue.resistance}`}
            style={{
              left: `${(cue.start / total) * 100}%`,
              width: `${((cue.end - cue.start) / total) * 100}%`,
              height: `${18 + cue.resistance * 8.2}%`,
              background: resistanceColor(cue.resistance),
            }}
          />
        )),
      )}
      {elapsed !== undefined && (
        <>
          <div className="strip-done" style={{ width: `${Math.min(100, (elapsed / total) * 100)}%` }} />
          <div className="strip-head" style={{ left: `${Math.min(100, (elapsed / total) * 100)}%` }} />
        </>
      )}
    </div>
  );
}
