/** Thrown when the audio host does not let a web page read the file. */
export class DownloadBlockedError extends Error {
  constructor() {
    super('This host does not allow downloads from a web page.');
    this.name = 'DownloadBlockedError';
  }
}

const MAX_BYTES = 80 * 1024 * 1024;

/** Fetches an audio file into memory so it can be analyzed and stored for offline use. */
export async function downloadAudio(url: string): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(url, { mode: 'cors' });
  } catch {
    throw new DownloadBlockedError();
  }
  if (!res.ok) throw new Error(`The file could not be fetched (${res.status}).`);
  const length = Number(res.headers.get('content-length') ?? 0);
  if (length > MAX_BYTES) throw new Error('The file is too large (over 80 MB).');
  const blob = await res.blob();
  if (blob.size > MAX_BYTES) throw new Error('The file is too large (over 80 MB).');
  if (blob.size === 0) throw new Error('The file was empty.');
  return blob;
}
