// =============================================
//  GUARDADO AUTOMÁTICO DE PARTIDAS
//  Captura el estado del juego (gameManager.getState())
//  al salir al menú, y lo restaura al volver a abrir el
//  mismo juego. Guardado en IndexedDB, por juego (game.id).
//
//  Módulo separado de emulator.js a propósito: esto solo
//  sabe de guardar/leer bytes en IndexedDB. emulator.js es
//  quien decide CUÁNDO llamarlo (al salir / al iniciar).
// =============================================
(function () {
  const DB_NAME = "camulador-saves";
  const DB_VERSION = 1;
  const STORE_NAME = "states";

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

  // Devuelve el estado guardado (Uint8Array) para ese juego, o null
  // si no hay nada guardado o algo falla. Nunca lanza: si no hay
  // guardado, el juego simplemente arranca desde cero, como siempre.
  async function getState(gameId) {
    try {
      const db = await openDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get(String(gameId));
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn("SaveStates: no se pudo leer el guardado:", e);
      return null;
    }
  }

  // Guarda el estado (Uint8Array) para ese juego. Si falla, solo
  // avisa por consola — no interrumpe el flujo de salir al menú.
  async function saveState(gameId, data) {
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(data, String(gameId));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn("SaveStates: no se pudo guardar la partida:", e);
    }
  }

  // Borra el guardado de un juego puntual (por si algún día agregamos
  // un botón "empezar de cero").
  async function removeState(gameId) {
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(String(gameId));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn("SaveStates: no se pudo borrar el guardado:", e);
    }
  }

  window.SaveStates = { get: getState, save: saveState, remove: removeState };
})();
