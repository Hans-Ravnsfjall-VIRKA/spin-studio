import type { ClassPlan } from '../models/classPlanModel';
import type { Track } from '../models/trackModel';

const TRACKS_KEY = 'spin-studio.tracks.v1';
const CLASSES_KEY = 'spin-studio.classes.v1';
const DRAFT_KEY = 'spin-studio.draft.v1';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked, keep running in memory */
  }
}

export const loadUserTracks = (): Track[] => read<Track[]>(TRACKS_KEY, []);
export const saveUserTracks = (tracks: Track[]): void => write(TRACKS_KEY, tracks);

export const loadClasses = (): ClassPlan[] => read<ClassPlan[]>(CLASSES_KEY, []);
export const saveClasses = (classes: ClassPlan[]): void => write(CLASSES_KEY, classes);

export const loadDraft = (): ClassPlan | null => read<ClassPlan | null>(DRAFT_KEY, null);
export const saveDraft = (plan: ClassPlan): void => write(DRAFT_KEY, plan);

export interface Settings {
  /** Free key from devportal.jamendo.com. */
  jamendoClientId: string;
}

const SETTINGS_KEY = 'spin-studio.settings.v1';
export const loadSettings = (): Settings => ({ jamendoClientId: '', ...read<Partial<Settings>>(SETTINGS_KEY, {}) });
export const saveSettings = (settings: Settings): void => write(SETTINGS_KEY, settings);
