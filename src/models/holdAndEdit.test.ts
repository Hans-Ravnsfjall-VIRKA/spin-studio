import { describe, expect, it } from 'vitest';
import { PATTERNS, applyPattern } from './patternModel';
import { isIos } from './platformModel';
import {
  parseClock,
  removeCue,
  setCueRpm,
  setCueStart,
  setSongRpm,
  shiftAllRpm,
  shiftAllZones,
  shiftCueRpm,
  shiftCueZone,
  shiftZone,
  splitAt,
  toCustom,
} from './sectionEditModel';
import { buildTimeline } from './classPlanModel';
import { customCuesToCues, type CustomSegment } from './customPlanModel';
import type { Track } from './trackModel';

const seg: CustomSegment = {
  rpm: 70,
  cues: [
    { at: 0, zone: 'blue', label: 'a' },
    { at: 60, zone: 'green', label: 'b' },
  ],
};

describe('zone and rpm edits', () => {
  it('shifts one zone up and down and stops at the ends', () => {
    expect(shiftZone('blue', 1)).toBe('green');
    expect(shiftZone('red', 1)).toBe('red');
    expect(shiftZone('white', -1)).toBe('white');
    expect(shiftCueZone(seg, 1, 2).cues[1].zone).toBe('red');
    expect(shiftCueZone(seg, 0, -1).cues[0].zone).toBe('white');
  });

  it('gives a section its own RPM and clears it again', () => {
    const up = shiftCueRpm(seg, 1, 5);
    expect(up.cues[1].rpm).toBe(75);
    expect(up.cues[0].rpm).toBeUndefined();
    expect(setCueRpm(up, 1, null).cues[1].rpm).toBeUndefined();
    expect(setCueRpm(seg, 0, 500).cues[0].rpm).toBe(140);
  });

  it('moves the whole song', () => {
    expect(shiftAllZones(seg, 1).cues.map((c) => c.zone)).toEqual(['green', 'yellow']);
    expect(shiftAllRpm(shiftCueRpm(seg, 1, 5), -10)).toMatchObject({ rpm: 60 });
    expect(shiftAllRpm(shiftCueRpm(seg, 1, 5), -10).cues[1].rpm).toBe(65);
    expect(setSongRpm(seg, null).rpm).toBeUndefined();
  });

  it('shows the cue RPM on the timeline', () => {
    const cues = customCuesToCues(shiftCueRpm(seg, 1, 10).cues, 120);
    expect(cues[0].rpm).toBeUndefined();
    expect(cues[1].rpm).toBe(80);
  });
});

describe('sections', () => {
  it('splits at a time, copying the section it lands in', () => {
    const s = splitAt(seg, 90, 200);
    expect(s.cues.map((c) => [c.at, c.zone])).toEqual([[0, 'blue'], [60, 'green'], [90, 'green']]);
    expect(splitAt(seg, 60, 200)).toBe(seg);
    expect(splitAt(seg, 0, 200)).toBe(seg);
    expect(splitAt(seg, 200, 200)).toBe(seg);
  });

  it('removes sections but keeps one, and keeps the first at zero', () => {
    expect(removeCue(seg, 1).cues).toHaveLength(1);
    expect(removeCue(removeCue(seg, 1), 0).cues).toHaveLength(1);
    expect(setCueStart(seg, 0, 10, 200)).toBe(seg);
    expect(setCueStart(seg, 1, 75, 200).cues[1].at).toBe(75);
    expect(setCueStart(seg, 1, 0, 200).cues[1].at).toBe(1);
  });

  it('reads times', () => {
    expect(parseClock('1:25')).toBe(85);
    expect(parseClock('85')).toBe(85);
    expect(parseClock('1:75')).toBeNull();
    expect(parseClock('abc')).toBeNull();
  });

  it('turns a generated song into the same sections', () => {
    const t: Track = {
      id: 'a', title: 'a', artist: 'x', bpm: 120, duration: 200, beatOffset: 0, energy: 3, source: 'spotify', spotifyUri: 'u', bpmKnown: true,
    };
    const tl = buildTimeline([{ id: '1', trackId: 'a', type: 'climb' }], [t]);
    const custom = toCustom(tl[0]);
    expect(custom.cues.length).toBe(tl[0].cues.length);
    expect(custom.cues[0].at).toBe(0);
    expect(custom.rpm).toBe(Math.round(tl[0].cadence));
    const again = buildTimeline([{ id: '1', trackId: 'a', type: 'climb', custom }], [t]);
    expect(again[0].cues.length).toBe(tl[0].cues.length);
  });
});

describe('patterns', () => {
  const p = { duration: 180, base: 'blue', peak: 'red', stepSec: 30 } as const;
  const zones = (id: Parameters<typeof applyPattern>[0]) => applyPattern(id, p).map((c) => c.zone);

  it('has every pattern produce cues that start at 0 and rise in time', () => {
    for (const info of PATTERNS) {
      const cues = applyPattern(info.id, p);
      expect(cues[0].at, info.id).toBe(0);
      const ats = cues.map((c) => c.at);
      expect(ats, info.id).toEqual([...ats].sort((a, b) => a - b));
      expect(new Set(ats).size, info.id).toBe(ats.length);
      expect(ats[ats.length - 1], info.id).toBeLessThan(p.duration);
    }
  });

  it('steps up and down one zone at a time', () => {
    expect(zones('stepUp')).toEqual(['blue', 'green', 'yellow', 'red']);
    expect(zones('stepDown')).toEqual(['red', 'yellow', 'green', 'blue']);
    expect(applyPattern('stepUp', p).map((c) => c.at)).toEqual([0, 45, 90, 135]);
  });

  it('makes a pyramid, intervals, sit and stand and a strong finish', () => {
    expect(zones('pyramid')).toEqual(['blue', 'green', 'yellow', 'red', 'yellow', 'green', 'blue']);
    expect(zones('intervals').slice(0, 4)).toEqual(['blue', 'red', 'blue', 'red']);
    expect(applyPattern('sitStand', p).map((c) => c.label.split(' ')[0]).slice(0, 3)).toEqual(['Sita', 'Standa', 'Sita']);
    expect(zones('surge')).toEqual(['blue', 'red']);
    expect(applyPattern('surge', p)[1].at).toBe(150);
    expect(zones('steady')).toEqual(['blue']);
  });

  it('copes with a short song and with base above peak', () => {
    expect(applyPattern('stepUp', { ...p, duration: 12 }).length).toBeLessThanOrEqual(2);
    expect(applyPattern('stepUp', { ...p, base: 'red', peak: 'blue' }).map((c) => c.zone)).toEqual(['red', 'yellow', 'green', 'blue']);
  });
});

describe('isIos', () => {
  it('spots iPhone, iPad and iPadOS in desktop mode', () => {
    expect(isIos('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'iPhone', 5)).toBe(true);
    expect(isIos('Mozilla/5.0 (Macintosh)', 'MacIntel', 5)).toBe(true);
    expect(isIos('Mozilla/5.0 (Macintosh)', 'MacIntel', 0)).toBe(false);
    expect(isIos('Mozilla/5.0 (Windows NT 10.0)', 'Win32', 0)).toBe(false);
  });
});
