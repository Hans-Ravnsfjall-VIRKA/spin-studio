import { detectBpm, mixToMono } from '../models/bpmModel';
import { getAudioContext } from './context';

export async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  const data = await blob.arrayBuffer();
  return getAudioContext().decodeAudioData(data);
}

export interface FileAnalysis {
  duration: number;
  bpm: number;
  beatOffset: number;
  confidence: number;
}

/** Decode, estimate tempo and first beat, then let the decoded audio go. */
export async function analyzeBlob(blob: Blob): Promise<FileAnalysis> {
  const buffer = await decodeBlob(blob);
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
  const result = detectBpm(mixToMono(channels), buffer.sampleRate);
  return {
    duration: buffer.duration,
    bpm: result?.bpm ?? 120,
    beatOffset: result?.offset ?? 0,
    confidence: result?.confidence ?? 0,
  };
}
