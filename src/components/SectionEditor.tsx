import { useState } from 'react';
import { formatClock } from '../models/formatModel';
import type { CustomSegment } from '../models/customPlanModel';
import { ZONE_LEVEL } from '../models/customPlanModel';
import { PATTERNS, applyPattern, type PatternId } from '../models/patternModel';
import { RESISTANCE_ZONES, resistanceColor, type ZoneId } from '../models/resistanceModel';
import {
  RPM_STEP,
  orderedCues,
  parseClock,
  removeCue,
  setCueLabel,
  setCueRpm,
  setCueStart,
  setCueZone,
  setSongRpm,
  shiftAllRpm,
  shiftAllZones,
  shiftCueRpm,
  shiftCueZone,
  splitAt,
} from '../models/sectionEditModel';

interface Props {
  custom: CustomSegment;
  /** Seconds the song plays in the class. */
  duration: number;
  onChange: (custom: CustomSegment) => void;
}

const ZONES: ZoneId[] = RESISTANCE_ZONES.map((z) => z.id);

function zoneName(id: ZoneId): string {
  return RESISTANCE_ZONES.find((z) => z.id === id)?.name ?? id;
}

function ZoneSelect({ value, onChange, label }: { value: ZoneId; onChange: (z: ZoneId) => void; label: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as ZoneId)}>
        {ZONES.map((z) => (
          <option key={z} value={z}>
            {zoneName(z)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Edit the sections of one song: zone, RPM, timing, and preset patterns. */
export function SectionEditor({ custom, duration, onChange }: Props) {
  const cues = orderedCues(custom);
  const [pattern, setPattern] = useState<PatternId>('stepUp');
  const [base, setBase] = useState<ZoneId>('blue');
  const [peak, setPeak] = useState<ZoneId>('red');
  const [stepSec, setStepSec] = useState(30);
  const [addAt, setAddAt] = useState('');
  const info = PATTERNS.find((p) => p.id === pattern) ?? PATTERNS[0];
  const addTime = parseClock(addAt);
  const songRpm = custom.rpm;

  const apply = () =>
    onChange({ ...custom, cues: applyPattern(pattern, { duration, base, peak, stepSec }) });

  return (
    <div className="editor">
      <div className="row wrap editor-top">
        <div className="stepper" aria-label="Song RPM">
          <span className="muted">Song RPM</span>
          <button className="btn icon" onClick={() => onChange(setSongRpm(custom, (songRpm ?? 60) - RPM_STEP))} aria-label="Lower RPM">
            −
          </button>
          <strong>{songRpm ?? 'none'}</strong>
          <button className="btn icon" onClick={() => onChange(setSongRpm(custom, (songRpm ?? 60) + RPM_STEP))} aria-label="Raise RPM">
            +
          </button>
        </div>
        <div className="stepper">
          <span className="muted">Whole song</span>
          <button className="btn" onClick={() => onChange(shiftAllZones(custom, -1))}>
            Easier
          </button>
          <button className="btn" onClick={() => onChange(shiftAllZones(custom, 1))}>
            Harder
          </button>
          <button className="btn" onClick={() => onChange(shiftAllRpm(custom, -RPM_STEP))}>
            RPM −{RPM_STEP}
          </button>
          <button className="btn" onClick={() => onChange(shiftAllRpm(custom, RPM_STEP))}>
            RPM +{RPM_STEP}
          </button>
        </div>
      </div>

      <div className="row wrap editor-pattern">
        <label className="field">
          <span>Pattern</span>
          <select value={pattern} onChange={(e) => setPattern(e.target.value as PatternId)}>
            {PATTERNS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <ZoneSelect value={base} onChange={setBase} label={info.uses.peak ? 'From' : 'Zone'} />
        {info.uses.peak && <ZoneSelect value={peak} onChange={setPeak} label="To" />}
        {info.uses.step && (
          <label className="field">
            <span>Seconds per block</span>
            <input
              type="number"
              min={5}
              max={300}
              step={5}
              value={stepSec}
              onChange={(e) => setStepSec(Math.max(5, Number(e.target.value) || 5))}
            />
          </label>
        )}
        <button className="btn primary" onClick={apply}>
          Apply pattern
        </button>
        <span className="muted small-text">{info.blurb}. This replaces the sections below.</span>
      </div>

      <div className="sections">
        {cues.map((c, i) => {
          const end = i + 1 < cues.length ? cues[i + 1].at : duration;
          return (
            <div className="section" key={`${i}-${c.at}`}>
              <div className="section-time">
                {i === 0 ? (
                  <span>0:00</span>
                ) : (
                  <input
                    type="text"
                    defaultValue={formatClock(c.at)}
                    aria-label="Section start"
                    onBlur={(e) => {
                      const t = parseClock(e.target.value);
                      if (t === null) e.target.value = formatClock(c.at);
                      else onChange(setCueStart(custom, i, t, duration));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                  />
                )}
                <span className="muted small-text">{formatClock(Math.max(0, end - c.at))} long</span>
              </div>
              <div className="zonepick" role="group" aria-label="Zone">
                {ZONES.map((z) => (
                  <button
                    key={z}
                    className={`zonedot${c.zone === z ? ' on' : ''}`}
                    style={{ background: resistanceColor(ZONE_LEVEL[z]) }}
                    onClick={() => onChange(setCueZone(custom, i, z))}
                    aria-label={zoneName(z)}
                    aria-pressed={c.zone === z}
                    title={zoneName(z)}
                  />
                ))}
              </div>
              <div className="row tight">
                <button className="btn icon" onClick={() => onChange(shiftCueZone(custom, i, -1))} aria-label="Easier">
                  ↓
                </button>
                <button className="btn icon" onClick={() => onChange(shiftCueZone(custom, i, 1))} aria-label="Harder">
                  ↑
                </button>
              </div>
              <input
                className="grow section-label"
                type="text"
                value={c.label}
                placeholder="Instruction"
                aria-label="Instruction"
                onChange={(e) => onChange(setCueLabel(custom, i, e.target.value))}
              />
              <div className="stepper">
                <button className="btn icon" onClick={() => onChange(shiftCueRpm(custom, i, -RPM_STEP))} aria-label="Lower RPM">
                  −
                </button>
                <span className={c.rpm ? '' : 'muted'}>{c.rpm ?? songRpm ?? '-'} rpm</span>
                <button className="btn icon" onClick={() => onChange(shiftCueRpm(custom, i, RPM_STEP))} aria-label="Raise RPM">
                  +
                </button>
                {c.rpm !== undefined && (
                  <button className="btn icon" onClick={() => onChange(setCueRpm(custom, i, null))} aria-label="Use the song RPM" title="Use the song RPM">
                    ⟲
                  </button>
                )}
              </div>
              <button
                className="btn icon"
                onClick={() => onChange(removeCue(custom, i))}
                disabled={cues.length <= 1}
                aria-label="Remove section"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      <div className="row wrap">
        <label className="field">
          <span>New section at (m:ss)</span>
          <input type="text" value={addAt} placeholder="1:30" onChange={(e) => setAddAt(e.target.value)} />
        </label>
        <button
          className="btn"
          disabled={addTime === null || addTime <= 0 || addTime >= duration}
          onClick={() => {
            if (addTime === null) return;
            onChange(splitAt(custom, addTime, duration));
            setAddAt('');
          }}
        >
          Add section
        </button>
        <span className="muted small-text">The song is {formatClock(duration)} long. A new section copies the one it lands in.</span>
      </div>
    </div>
  );
}
