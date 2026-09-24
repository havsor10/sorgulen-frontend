(() => {
  "use strict";

  const DB_NAME = "sorgulen-feltadmin";
  const DB_VERSION = 1;
  const MUTATION_STORE = "mutations";
  const CACHE_STORE = "cache";
  const listeners = new Set();
  let dbPromise = null;
  let flushing = false;

  function supported() {
    return typeof indexedDB !== "undefined";
  }

  function openDb() {
    if (!supported()) return Promise.reject(new Error("Lokal lagring støttes ikke på denne enheten."));
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(MUTATION_STORE)) {
          const store = db.createObjectStore(MUTATION_STORE, { keyPath: "id" });
          store.createIndex("createdAt", "createdAt", { unique: false });
          store.createIndex("status", "status", { unique: false });
        }
        if (!db.objectStoreNames.contains(CACHE_STORE)) {
          db.createObjectStore(CACHE_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Kunne ikke åpne lokal feltlagring."));
      request.onblocked = () => reject(new Error("Lokal feltlagring er låst av ein annan fane."));
    });
    return dbPromise;
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Lokal lagring feilet."));
    });
  }

  async function withStore(storeName, mode, callback) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let result;
      try {
        result = callback(store);
      } catch (error) {
        reject(error);
        return;
      }
      tx.oncomplete = async () => {
        try {
          resolve(result instanceof IDBRequest ? await requestResult(result) : await result);
        } catch (error) {
          reject(error);
        }
      };
      tx.onerror = () => reject(tx.error || new Error("Lokal lagring feilet."));
      tx.onabort = () => reject(tx.error || new Error("Lokal lagring blei avbrutt."));
    });
  }

  async function list() {
    const rows = await withStore(MUTATION_STORE, "readonly", (store) => requestResult(store.getAll()));
    return (rows || []).sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  }

  async function summary() {
    const rows = await list();
    const result = { total: rows.length, pending: 0, error: 0, syncing: 0, items: rows };
    rows.forEach((item) => {
      if (item.status === "error") result.error += 1;
      else if (item.status === "syncing") result.syncing += 1;
      else result.pending += 1;
    });
    return result;
  }

  async function notify() {
    const data = await summary().catch(() => ({ total: 0, pending: 0, error: 0, syncing: 0, items: [] }));
    listeners.forEach((listener) => {
      try { listener(data); } catch (_) {}
    });
    return data;
  }

  function onChange(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    notify();
    return () => listeners.delete(listener);
  }

  async function add(item) {
    if (!item || !item.id || !item.endpoint || !item.method) throw new Error("Ugyldig offline-registrering.");
    const row = {
      id: String(item.id),
      type: String(item.type || "field"),
      label: String(item.label || "Feltregistrering").slice(0, 160),
      endpoint: String(item.endpoint),
      method: String(item.method || "POST").toUpperCase(),
      body: item.body == null ? null : item.body,
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "pending",
      attempts: Number(item.attempts || 0),
      lastError: "",
    };
    await withStore(MUTATION_STORE, "readwrite", (store) => requestResult(store.put(row)));
    await notify();
    return row;
  }

  async function patch(id, changes = {}) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(MUTATION_STORE, "readwrite");
      const store = tx.objectStore(MUTATION_STORE);
      const get = store.get(String(id));
      get.onsuccess = () => {
        const current = get.result;
        if (!current) return;
        store.put({ ...current, ...changes, id: current.id, updatedAt: new Date().toISOString() });
      };
      get.onerror = () => reject(get.error || new Error("Kunne ikke oppdatere lokal kø."));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("Kunne ikke oppdatere lokal kø."));
    });
    await notify();
  }

  async function remove(id) {
    await withStore(MUTATION_STORE, "readwrite", (store) => requestResult(store.delete(String(id))));
    await notify();
  }

  async function retryErrors() {
    const rows = await list();
    for (const item of rows) {
      if (item.status === "error") {
        await patch(item.id, { status: "pending", lastError: "" });
      }
    }
    return notify();
  }

  async function flush(sender) {
    if (flushing || typeof sender !== "function") return summary();
    if (typeof navigator !== "undefined" && navigator.onLine === false) return summary();

    flushing = true;
    try {
      const rows = await list();
      for (const item of rows) {
        if (item.status === "error") continue;
        await patch(item.id, { status: "syncing" });
        try {
          await sender(item);
          await remove(item.id);
        } catch (error) {
          const permanent = error?.permanent === true;
          await patch(item.id, {
            status: permanent ? "error" : "pending",
            attempts: Number(item.attempts || 0) + 1,
            lastError: String(error?.message || "Synk feilet").slice(0, 500),
          });
          if (!permanent) break;
        }
      }
    } finally {
      flushing = false;
    }
    return notify();
  }

  async function setCache(key, value) {
    if (!key) return;
    await withStore(CACHE_STORE, "readwrite", (store) => requestResult(store.put({
      key: String(key),
      value,
      savedAt: new Date().toISOString(),
    })));
  }

  async function getCache(key) {
    if (!key) return null;
    const row = await withStore(CACHE_STORE, "readonly", (store) => requestResult(store.get(String(key))));
    return row || null;
  }

  window.SorgulenFieldOffline = {
    supported,
    add,
    list,
    summary,
    remove,
    retryErrors,
    flush,
    onChange,
    setCache,
    getCache,
  };
})();