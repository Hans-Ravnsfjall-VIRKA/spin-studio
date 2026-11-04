import {
  RESISTANCE_LEVELS,
  RESISTANCE_ZONES,
  resistanceColor,
  resistanceGradient,
  resistancePercent,
} from '../models/resistanceModel';

interface Props {
  level: number;
  nextLevel?: number | null;
  large?: boolean;
}

/** The white, blue, green, yellow and red scale with a marker for the current level and a ghost for what comes next. */
export function ResistanceScale({ level, nextLevel, large }: Props) {
  return (
    <div className={`rscale${large ? ' rscale-large' : ''}`} aria-label={`Resistance level ${level} of 10`}>
      <div className="rscale-bar" style={{ background: resistanceGradient() }}>
        {nextLevel != null && nextLevel !== level && (
          <span
            className="rscale-ghost"
            style={{ left: `${resistancePercent(nextLevel)}%`, borderColor: resistanceColor(nextLevel, 6) }}
          />
        )}
        <span
          className="rscale-marker"
          style={{ left: `${resistancePercent(level)}%`, background: resistanceColor(level) }}
        />
      </div>
      <div className="rscale-ticks">
        {RESISTANCE_LEVELS.map((l) => (
          <span key={l} className={l === level ? 'on' : ''}>
            {l}
          </span>
        ))}
      </div>
      <div className="rscale-zones">
        {RESISTANCE_ZONES.map((z) => (
          <span key={z.id} style={{ gridColumn: `${z.from} / ${z.to + 1}` }}>
            {z.name}
          </span>
        ))}
      </div>
    </div>
  );
}
