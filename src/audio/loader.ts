import type { Track } from '../models/trackModel';
import { getAudio } from '../storage/audioStore';
import { decodeBlob } from './decode';

/** Reads a stored file and decodes it. Used by the engine just before a song is needed. */
export async function loadTrackBuffer(track: Track): Promise<AudioBuffer | null> {
  if (track.source !== 'file') return null;
  const blob = await getAudio(track.id);
  if (!blob) return null;
  return decodeBlob(blob);
}
