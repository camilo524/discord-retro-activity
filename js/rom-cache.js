// =============================================
//  CACHÉ DE ROMs (IndexedDB)
//  Módulo separado de emulator.js a propósito:
//  esto solo guarda y lee blobs de ROMs ya
//  descargadas. No sabe nada de juegos, de
//  progreso en pantalla, ni de Discord.
// =============================================
(function () {
  const DB_NAME = "camulador-cache";
  const DB_VERSION = 1;
  const STORE_NAME = "roms";

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // Devuelve el Blob cacheado, o null si no existe o algo falla.
  // Nunca lanza: si IndexedDB no está disponible (modo incógnito
  // estricto, storage lleno, etc.) simplemente se comporta como
  // si no hubiera caché, para no romper la carga del juego.
  async function getCachedRom(key) {
    try {
      const db = await openDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn("RomCache: no se pudo leer la caché:", e);
      return null;
    }
  }

  // Guarda el Blob bajo esa key. Si falla (storage lleno, etc.),
  // solo avisa por consola — el juego ya cargó igual, la caché
  // es una optimización, no algo crítico.
  async function saveCachedRom(key, blob) {
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(blob, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn("RomCache: no se pudo guardar en caché:", e);
    }
  }

  // Borra una entrada puntual (útil si un juego se actualiza).
  async function removeCachedRom(key) {
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn("RomCache: no se pudo borrar la entrada:", e);
    }
  }

  // Borra toda la caché (para un futuro botón "Liberar espacio").
  async function clearAllCache() {
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn("RomCache: no se pudo limpiar la caché:", e);
    }
  }

  window.RomCache = {
    get: getCachedRom,
    save: saveCachedRom,
    remove: removeCachedRom,
    clear: clearAllCache,
  };
})();
