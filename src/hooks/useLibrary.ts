import { useCallback, useEffect, useMemo, useState } from 'react';
import { analyzeBlob } from '../audio/decode';
import { BUILTIN_TRACKS } from '../data/builtinTracks';
import { newId } from '../lib/id';
import { creditFor, type OnlineTrack } from '../models/onlineSearchModel';
import { newSpotifyTracks, trackFromSpotify, type SpotifyTrackInfo } from '../models/spotifyModel';
import { clampBpm, clampEnergy, trackFromAnalysis, type Track } from '../models/trackModel';
import { DownloadBlockedError, downloadAudio } from '../online/download';
import { deleteAudio, putAudio } from '../storage/audioStore';
import { loadUserTracks, saveUserTracks } from '../storage/libraryStorage';

export interface ImportStatus {
  name: string;
  state: 'working' | 'done' | 'failed';
  message?: string;
}

export interface OnlineImportResult {
  ok: boolean;
  message: string;
  /** Set when the host blocks downloads, so the UI can point to the source page. */
  blocked?: boolean;
}

export interface Library {
  tracks: Track[];
  userTracks: Track[];
  imports: ImportStatus[];
  addFiles: (files: FileList | File[]) => Promise<void>;
  importOnline: (online: OnlineTrack) => Promise<OnlineImportResult>;
  /** Adds Spotify songs that are not in the library yet. A null tempo leaves it to be set later. Returns how many were added. */
  addSpotify: (infos: SpotifyTrackInfo[], bpm: number | null) => number;
  updateTrack: (id: string, patch: Partial<Pick<Track, 'title' | 'artist' | 'bpm' | 'energy' | 'beatOffset'>>) => void;
  removeTrack: (id: string) => Promise<void>;
}

export function useLibrary(): Library {
  const [userTracks, setUserTracks] = useState<Track[]>(() => loadUserTracks());
  const [imports, setImports] = useState<ImportStatus[]>([]);

  useEffect(() => {
    saveUserTracks(userTracks);
  }, [userTracks]);

  const tracks = useMemo(() => [...BUILTIN_TRACKS, ...userTracks], [userTracks]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    for (const file of list) {
      setImports((prev) => [...prev, { name: file.name, state: 'working' }]);
      try {
        const analysis = await analyzeBlob(file);
        const id = newId('file');
        await putAudio(id, file);
        const track = trackFromAnalysis({
          id,
          fileName: file.name,
          duration: analysis.duration,
          bpm: analysis.bpm,
          beatOffset: analysis.beatOffset,
        });
        setUserTracks((prev) => [...prev, track]);
        setImports((prev) =>
          prev.map((p) =>
            p.name === file.name && p.state === 'working'
              ? {
                  ...p,
                  state: 'done',
                  message:
                    analysis.confidence < 0.15
                      ? `Tempo set to ${track.bpm}, please check it`
                      : `Tempo ${track.bpm} BPM`,
                }
              : p,
          ),
        );
      } catch {
        setImports((prev) =>
          prev.map((p) =>
            p.name === file.name && p.state === 'working'
              ? { ...p, state: 'failed', message: 'This file could not be read as audio' }
              : p,
          ),
        );
      }
    }
  }, []);

  const importOnline = useCallback(
    async (online: OnlineTrack): Promise<OnlineImportResult> => {
      if (userTracks.some((t) => t.credit?.sourceUrl === online.sourceUrl && t.title === online.title)) {
        return { ok: true, message: 'Already in your library' };
      }
      try {
        const blob = await downloadAudio(online.audioUrl);
        const analysis = await analyzeBlob(blob);
        const id = newId('web');
        await putAudio(id, blob);
        const track = trackFromAnalysis({
          id,
          fileName: `${online.title}.audio`,
          duration: analysis.duration,
          bpm: analysis.bpm,
          beatOffset: analysis.beatOffset,
          title: online.title,
          artist: online.creator,
          credit: creditFor(online),
        });
        setUserTracks((prev) => [...prev, track]);
        return {
          ok: true,
          message:
            analysis.confidence < 0.15
              ? `Added at ${track.bpm} BPM, please check the tempo in Music`
              : `Added at ${track.bpm} BPM`,
        };
      } catch (err) {
        if (err instanceof DownloadBlockedError) {
          return {
            ok: false,
            blocked: true,
            message: 'This host blocks downloads from a web page. Open the source page, save the file, then add it with Add your music.',
          };
        }
        return {
          ok: false,
          message: err instanceof Error && err.message ? err.message : 'This track could not be added.',
        };
      }
    },
    [userTracks],
  );

  const addSpotify = useCallback<Library['addSpotify']>(
    (infos, bpm) => {
      const fresh = newSpotifyTracks(infos, userTracks);
      if (fresh.length === 0) return 0;
      const added = fresh.map((info) => trackFromSpotify(info, bpm, newId('sp')));
      setUserTracks((prev) => [...prev, ...added]);
      return added.length;
    },
    [userTracks],
  );

  const updateTrack = useCallback<Library['updateTrack']>((id, patch) => {
    setUserTracks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const next = { ...t, ...patch };
        if (patch.bpm !== undefined) next.bpmKnown = true;
        next.bpm = clampBpm(next.bpm);
        next.energy = clampEnergy(next.energy);
        next.beatOffset = Math.max(0, next.beatOffset);
        return next;
      }),
    );
  }, []);

  const removeTrack = useCallback(async (id: string) => {
    setUserTracks((prev) => prev.filter((t) => t.id !== id));
    try {
      await deleteAudio(id);
    } catch {
      /* nothing to clean up */
    }
  }, []);

  return { tracks, userTracks, imports, addFiles, importOnline, addSpotify, updateTrack, removeTrack };
}
