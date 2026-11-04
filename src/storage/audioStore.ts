const DB_NAME = 'spin-studio-audio';
const STORE = 'files';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export function putAudio(id: string, blob: Blob): Promise<IDBValidKey> {
  return run('readwrite', (s) => s.put(blob, id));
}

export async function getAudio(id: string): Promise<Blob | null> {
  const result = await run<Blob | undefined>('readonly', (s) => s.get(id));
  return result ?? null;
}

export function deleteAudio(id: string): Promise<undefined> {
  return run('readwrite', (s) => s.delete(id));
}
