export type GenerationRecord = {
  id: string;
  createdAt: string; // ISO string
  prompt: string;
  imageBase64: string; // base64 only (no data:image/png;base64 prefix)
};

const DB_NAME = "carbon_gen_db";
const DB_VERSION = 1;
const STORE = "generations";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbAddGeneration(rec: GenerationRecord): Promise<void> {
  const db = await openDB();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);

    store.put(rec);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };

    tx.onerror = () => {
      const err = tx.error || new Error("IndexedDB write failed");
      db.close();
      reject(err);
    };
  });
}

export async function idbListGenerations(limit = 50): Promise<GenerationRecord[]> {
  const db = await openDB();

  return await new Promise<GenerationRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const idx = store.index("createdAt");

    const results: GenerationRecord[] = [];
    const req = idx.openCursor(null, "prev"); // newest first

    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        db.close();
        resolve(results);
        return;
      }

      results.push(cursor.value as GenerationRecord);

      if (results.length >= limit) {
        db.close();
        resolve(results);
        return;
      }

      cursor.continue();
    };

    req.onerror = () => {
      const err = req.error || new Error("IndexedDB read failed");
      db.close();
      reject(err);
    };
  });
}

export async function idbDeleteGeneration(id: string): Promise<void> {
  const db = await openDB();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);

    store.delete(id);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };

    tx.onerror = () => {
      const err = tx.error || new Error("IndexedDB delete failed");
      db.close();
      reject(err);
    };
  });
}

export async function idbClearAll(): Promise<void> {
  const db = await openDB();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);

    store.clear();

    tx.oncomplete = () => {
      db.close();
      resolve();
    };

    tx.onerror = () => {
      const err = tx.error || new Error("IndexedDB clear failed");
      db.close();
      reject(err);
    };
  });
}
