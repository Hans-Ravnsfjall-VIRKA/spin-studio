import {
  jamendoError,
  jamendoSearchUrl,
  keepUsable,
  normalizeJamendo,
  normalizeOpenverse,
  openverseSearchUrl,
  type JamendoSpeed,
  type OnlineTrack,
} from '../models/onlineSearchModel';

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 429) throw new Error('Too many searches for now. Wait a minute and try again.');
  if (!res.ok) throw new Error(`The music service answered with an error (${res.status}).`);
  return res.json();
}

let jsonpCounter = 0;

/** Fallback for browsers that block a cross origin request. Jamendo supports a callback parameter. */
function jsonp(buildUrl: (callback: string) => string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const name = `__spinJsonp${Date.now()}_${jsonpCounter++}`;
    const win = window as unknown as Record<string, unknown>;
    const script = document.createElement('script');
    const cleanup = () => {
      delete win[name];
      script.remove();
      window.clearTimeout(timer);
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('The music service did not answer in time.'));
    }, 12000);
    win[name] = (data: unknown) => {
      cleanup();
      resolve(data);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error('Could not reach the music service.'));
    };
    script.src = buildUrl(name);
    document.head.appendChild(script);
  });
}

export interface SearchInput {
  query: string;
  genre: string;
  page: number;
}

export async function searchOpenverse(input: SearchInput): Promise<OnlineTrack[]> {
  const json = await getJson(openverseSearchUrl({ query: input.query, genre: input.genre, page: input.page }));
  return keepUsable(normalizeOpenverse(json));
}

export async function searchJamendo(
  input: SearchInput & { clientId: string; speed: JamendoSpeed | '' },
): Promise<OnlineTrack[]> {
  const base = { clientId: input.clientId, query: input.query, genre: input.genre, speed: input.speed, page: input.page };
  let json: unknown;
  try {
    json = await getJson(jamendoSearchUrl(base));
  } catch (err) {
    // A TypeError from fetch means the request was blocked before an answer came back.
    if (!(err instanceof TypeError)) throw err;
    json = await jsonp((callback) => jamendoSearchUrl({ ...base, callback }));
  }
  const problem = jamendoError(json);
  if (problem) throw new Error(problem);
  return keepUsable(normalizeJamendo(json));
}
