import type { TimelineEntry } from './classPlanModel';
import type { CustomCue, CustomSegment } from './customPlanModel';
import { resistanceZone, type ZoneId } from './resistanceModel';

export const ZONE_ORDER: ZoneId[] = ['white', 'blue', 'green', 'yellow', 'red'];
export const MIN_RPM = 30;
export const MAX_RPM = 140;
export const RPM_STEP = 5;

export function shiftZone(zone: ZoneId, delta: number): ZoneId {
  const i = ZONE_ORDER.indexOf(zone) + delta;
  return ZONE_ORDER[Math.max(0, Math.min(ZONE_ORDER.length - 1, i))];
}

export function clampRpm(rpm: number): number {
  return Math.max(MIN_RPM, Math.min(MAX_RPM, Math.round(rpm)));
}

function sorted(cues: CustomCue[]): CustomCue[] {
  return [...cues].sort((a, b) => a.at - b.at);
}

/** Cue list in time order. The editor always works on this order. */
export function orderedCues(custom: CustomSegment): CustomCue[] {
  return sorted(custom.cues);
}

function withCues(custom: CustomSegment, cues: CustomCue[]): CustomSegment {
  return { ...custom, cues: sorted(cues) };
}

function replaceAt(custom: CustomSegment, index: number, patch: Partial<CustomCue>): CustomSegment {
  const cues = orderedCues(custom);
  if (index < 0 || index >= cues.length) return custom;
  cues[index] = { ...cues[index], ...patch };
  return withCues(custom, cues);
}

export function setCueZone(custom: CustomSegment, index: number, zone: ZoneId): CustomSegment {
  return replaceAt(custom, index, { zone });
}

export function shiftCueZone(custom: CustomSegment, index: number, delta: number): CustomSegment {
  const cue = orderedCues(custom)[index];
  return cue ? replaceAt(custom, index, { zone: shiftZone(cue.zone, delta) }) : custom;
}

export function setCueLabel(custom: CustomSegment, index: number, label: string): CustomSegment {
  return replaceAt(custom, index, { label });
}

/** Sets the RPM of one section. Pass null to follow the song's RPM again. */
export function setCueRpm(custom: CustomSegment, index: number, rpm: number | null): CustomSegment {
  const cues = orderedCues(custom);
  if (index < 0 || index >= cues.length) return custom;
  const { rpm: _old, ...rest } = cues[index];
  void _old;
  cues[index] = rpm === null ? rest : { ...rest, rpm: clampRpm(rpm) };
  return withCues(custom, cues);
}

export function shiftCueRpm(custom: CustomSegment, index: number, delta: number): CustomSegment {
  const cue = orderedCues(custom)[index];
  if (!cue) return custom;
  const base = cue.rpm ?? custom.rpm ?? 60;
  return setCueRpm(custom, index, base + delta);
}

export function setSongRpm(custom: CustomSegment, rpm: number | null): CustomSegment {
  const { rpm: _old, ...rest } = custom;
  void _old;
  return rpm === null ? rest : { ...rest, rpm: clampRpm(rpm) };
}

/** Moves the whole song up or down one step in zone and RPM. Sections with their own RPM move too. */
export function shiftAllZones(custom: CustomSegment, delta: number): CustomSegment {
  return withCues(
    custom,
    custom.cues.map((c) => ({ ...c, zone: shiftZone(c.zone, delta) })),
  );
}

export function shiftAllRpm(custom: CustomSegment, delta: number): CustomSegment {
  const song = custom.rpm !== undefined ? clampRpm(custom.rpm + delta) : undefined;
  return {
    ...custom,
    ...(song !== undefined ? { rpm: song } : {}),
    cues: custom.cues.map((c) => (c.rpm !== undefined ? { ...c, rpm: clampRpm(c.rpm + delta) } : c)),
  };
}

/** Starts a new section at `at` seconds. It copies the zone, RPM and label of the section it splits. */
export function splitAt(custom: CustomSegment, at: number, duration: number): CustomSegment {
  const t = Math.round(at);
  if (!Number.isFinite(t) || t <= 0 || t >= duration) return custom;
  const cues = orderedCues(custom);
  if (cues.some((c) => c.at === t)) return custom;
  let host = cues[0];
  for (const c of cues) if (c.at <= t) host = c;
  const copy: CustomCue = host ? { ...host, at: t } : { at: t, zone: 'white', label: '' };
  return withCues(custom, [...cues, copy]);
}

export function removeCue(custom: CustomSegment, index: number): CustomSegment {
  const cues = orderedCues(custom);
  if (cues.length <= 1 || index < 0 || index >= cues.length) return custom;
  cues.splice(index, 1);
  return withCues(custom, cues);
}

/** Moves a section start. The first section always stays at 0. */
export function setCueStart(custom: CustomSegment, index: number, at: number, duration: number): CustomSegment {
  const cues = orderedCues(custom);
  if (index <= 0 || index >= cues.length) return custom;
  const t = Math.max(1, Math.min(Math.round(duration) - 1, Math.round(at)));
  if (!Number.isFinite(t) || cues.some((c, i) => i !== index && c.at === t)) return custom;
  cues[index] = { ...cues[index], at: t };
  return withCues(custom, cues);
}

/** "1:25", "85" or "1:05:00" to seconds. Null when it is not a time. */
export function parseClock(text: string): number | null {
  const s = text.trim();
  if (!/^\d+(:\d{1,2}){0,2}$/.test(s)) return null;
  const parts = s.split(':').map(Number);
  if (parts.slice(1).some((p) => p > 59)) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

/** Turns a generated song into editable sections that look and behave the same. */
export function toCustom(entry: TimelineEntry): CustomSegment {
  if (entry.item.custom) return entry.item.custom;
  return {
    rpm: clampRpm(entry.cadence),
    cues: entry.cues.map((c) => ({
      at: Math.round(c.start - entry.start),
      zone: resistanceZone(c.resistance).id,
      label: c.label,
    })),
  };
}
