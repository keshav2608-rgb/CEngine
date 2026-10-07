/**
 * On-device storage for end-to-end encryption, in IndexedDB:
 *  - identity: this browser's device id and its non-extractable private key, per user
 *  - search:   decrypted text of messages seen on this device, for local search
 *    (the server can't search encrypted messages)
 */

export interface StoredIdentity {
  userId: string;
  deviceId: string;
  privateKey: CryptoKey;
  publicKey: string;
  createdAt: string;
  /** Earlier keys of this browser (replaced after the device was removed or reset). */
  previous?: { deviceId: string; privateKey: CryptoKey }[];
}

export interface SearchEntry {
  id: string;
  userId: string;
  roomId: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: string;
}

const DB_NAME = 'cengine-e2ee';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('identity'))
          db.createObjectStore('identity', { keyPath: 'userId' });
        if (!db.objectStoreNames.contains('search')) {
          const store = db.createObjectStore('search', { keyPath: 'id' });
          store.createIndex('userId', 'userId');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

function run<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T> | void
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req ? (req.result as T) : (undefined as T));
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

export const keystore = {
  getIdentity(userId: string): Promise<StoredIdentity | undefined> {
    return run<StoredIdentity | undefined>('identity', 'readonly', (s) => s.get(userId));
  },
  saveIdentity(identity: StoredIdentity): Promise<void> {
    return run<void>('identity', 'readwrite', (s) => {
      s.put(identity);
    });
  },
  deleteIdentity(userId: string): Promise<void> {
    return run<void>('identity', 'readwrite', (s) => {
      s.delete(userId);
    });
  },

  putSearchEntries(entries: SearchEntry[]): Promise<void> {
    if (!entries.length) return Promise.resolve();
    return run<void>('search', 'readwrite', (s) => {
      entries.forEach((e) => s.put(e));
    });
  },
  removeSearchEntry(id: string): Promise<void> {
    return run<void>('search', 'readwrite', (s) => {
      s.delete(id);
    });
  },
  /** Case-insensitive substring search over this user's locally indexed messages, newest first. */
  async search(userId: string, query: string, limit = 20): Promise<SearchEntry[]> {
    const q = query.toLowerCase();
    const all = await run<SearchEntry[]>('search', 'readonly', (s) =>
      s.index('userId').getAll(userId)
    );
    return all
      .filter((e) => e.text.toLowerCase().includes(q))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  },
  clearSearch(userId: string): Promise<void> {
    return openDb().then(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction('search', 'readwrite');
          const req = tx.objectStore('search').index('userId').openCursor(IDBKeyRange.only(userId));
          req.onsuccess = () => {
            const cursor = req.result;
            if (cursor) {
              cursor.delete();
              cursor.continue();
            }
          };
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        })
    );
  },
};
