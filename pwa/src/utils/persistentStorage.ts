/**
 * AEROKIN Resilient Storage for iOS Safari & Standalone PWA
 *
 * Persists critical device identity and pairing credentials in BOTH
 * localStorage and IndexedDB. On startup or when either store is cleared by iOS
 * storage eviction, automatically repairs whichever copy is missing.
 *
 * Requests navigator.storage.persist() on first run to protect against eviction.
 */

const DB_NAME = 'aerokin_storage_db';
const DB_VERSION = 1;
const STORE_NAME = 'keyval';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function getDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

export async function idbGet(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function idbSet(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function idbDelete(key: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Requests persistent storage from the browser to reduce risk of iOS eviction.
 */
export async function requestStoragePersistence(): Promise<boolean> {
  if (
    typeof navigator !== 'undefined' &&
    navigator.storage &&
    typeof navigator.storage.persist === 'function'
  ) {
    try {
      const isPersisted = await navigator.storage.persisted();
      if (!isPersisted) {
        return await navigator.storage.persist();
      }
      return isPersisted;
    } catch {
      return false;
    }
  }
  return false;
}

const CRITICAL_KEYS = [
  'aerokin_device_id',
  'aerokin_device_credential',
  'aerokin_device_name',
  'aerokin_saved_pcs',
  'aerokin_active_pc_id',
];

/**
 * Bi-directional sync between localStorage and IndexedDB.
 * If either storage engine loses data, repairs it immediately from the other.
 */
export async function repairAndSyncStorage(): Promise<{
  repairedFromIdb: boolean;
  repairedFromLocalStorage: boolean;
  hasCredentials: boolean;
}> {
  if (typeof window === 'undefined') {
    return { repairedFromIdb: false, repairedFromLocalStorage: false, hasCredentials: false };
  }

  // Request persistence in background
  requestStoragePersistence().catch(() => {});

  let repairedFromIdb = false;
  let repairedFromLocalStorage = false;

  for (const key of CRITICAL_KEYS) {
    let localVal: string | null = null;
    try {
      localVal = localStorage.getItem(key);
    } catch {}

    const idbVal = await idbGet(key);

    if (localVal && !idbVal) {
      // LocalStorage exists, IDB was cleared or first run -> sync to IDB
      await idbSet(key, localVal);
      repairedFromLocalStorage = true;
    } else if (!localVal && idbVal) {
      // LocalStorage was cleared (e.g. 7-day Safari tab wipe), IDB survived -> repair localStorage
      try {
        localStorage.setItem(key, idbVal);
        repairedFromIdb = true;
      } catch {}
    }
  }

  const hasCredentials = Boolean(
    localStorage.getItem('aerokin_device_id') && localStorage.getItem('aerokin_device_credential')
  );

  return { repairedFromIdb, repairedFromLocalStorage, hasCredentials };
}

/**
 * Saves a key-value pair to both localStorage and IndexedDB synchronously/asynchronously.
 */
export function setPersistentItem(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {}
  idbSet(key, value).catch(() => {});
}

/**
 * Removes a key-value pair from both localStorage and IndexedDB.
 */
export function removePersistentItem(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch {}
  idbDelete(key).catch(() => {});
}
