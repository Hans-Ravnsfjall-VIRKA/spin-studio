import { phraseBars, synthDuration, type Track } from '../models/trackModel';

function synth(
  id: string,
  title: string,
  bpm: number,
  energy: number,
  synthRoot: number,
  minutes = 4,
): Track {
  const bars = phraseBars(bpm, minutes);
  return {
    id: `synth-${id}`,
    title,
    artist: 'Spin Studio',
    bpm,
    duration: synthDuration(bars, bpm),
    beatOffset: 0,
    energy,
    source: 'synth',
    synthRoot,
  };
}

/**
 * Built in practice tracks, generated live in the browser so the app works with
 * no audio files. Tempos are chosen so every segment type has several good
 * matches, including half time options for climbs (a 140 BPM song is a 70 RPM climb).
 */
export const BUILTIN_TRACKS: Track[] = [
  // Warm up: 70 to 90 RPM
  synth('sunrise', 'Sunrise Spin', 84, 1, 40),
  synth('morning-legs', 'Morning Legs', 80, 1, 42),
  synth('first-mile', 'First Mile', 78, 1, 45),
  synth('gear-up', 'Gear Up', 156, 2, 43, 3.5),

  // Flat road: 85 to 100 RPM
  synth('easy-roll', 'Easy Roll', 96, 2, 42),
  synth('open-road', 'Open Road', 100, 2, 45),
  synth('tailwind', 'Tailwind', 92, 2, 44),
  synth('pace-line', 'Pace Line', 98, 2, 41),
  synth('cruise-control', 'Cruise Control', 94, 2, 47),
  synth('tempo-tide', 'Tempo Tide', 88, 2, 43),

  // Endurance: 80 to 95 RPM
  synth('steady-state', 'Steady State', 90, 3, 41),
  synth('long-haul', 'Long Haul', 86, 3, 40),
  synth('metronome', 'Metronome', 89, 3, 44),
  synth('grindstone', 'Grindstone', 94, 3, 42),
  synth('deep-water', 'Deep Water', 82, 3, 45),

  // Climbs: 60 to 75 RPM, played as half time of 120 to 150 BPM
  synth('foothill', 'Foothill', 140, 3, 43),
  synth('switchback', 'Switchback', 132, 4, 45),
  synth('alpine', 'Alpine', 136, 4, 42),
  synth('summit-push', 'Summit Push', 128, 5, 40),
  synth('ridge-line', 'Ridge Line', 144, 4, 44),
  synth('hairpin', 'Hairpin', 124, 4, 41),
  synth('steep-grade', 'Steep Grade', 138, 4, 47),
  synth('mountain-pass', 'Mountain Pass', 126, 5, 43),

  // Intervals: 85 to 110 RPM
  synth('attack', 'Attack', 108, 4, 44),
  synth('breakaway', 'Breakaway', 104, 4, 47),
  synth('pulse-check', 'Pulse Check', 106, 4, 42),
  synth('on-off', 'On Off', 102, 4, 45),
  synth('burst', 'Burst', 110, 4, 41),

  // Sprints: 100 to 120 RPM
  synth('red-zone', 'Red Zone', 112, 5, 41),
  synth('final-kick', 'Final Kick', 118, 5, 43),
  synth('full-gas', 'Full Gas', 114, 5, 45),
  synth('lightning-lap', 'Lightning Lap', 120, 5, 40),
  synth('overdrive', 'Overdrive', 116, 5, 42),
  synth('finish-line', 'Finish Line', 110, 5, 44),

  // Cool down: 60 to 80 RPM
  synth('slow-fade', 'Slow Fade', 70, 1, 40),
  synth('soft-landing', 'Soft Landing', 76, 1, 42),
  synth('wind-down', 'Wind Down', 72, 1, 45),
  synth('last-mile', 'Last Mile', 66, 1, 41),
];
