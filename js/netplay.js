// =============================================
//  NETPLAY (multiplayer) — EmulatorJS 4.3.0-pre
//  Módulo separado de emulator.js a propósito:
//  toda la configuración de multiplayer vive acá,
//  emulator.js solo la invoca.
//
//  Dos modos:
//   - Web (WebRTC): netplay nativo de EmulatorJS 4.3.0-pre. El botón solo
//     aparece si EJS_gameID es un NÚMERO, hay EJS_netplayServer y el core
//     soporta save states. Socket.IO solo hace de señalización (salas) y
//     el video/audio/inputs van por WebRTC entre jugadores.
//   - Discord / sin WebRTC: modo WebSocket propio (js/netplay-ws.js).
// =============================================
(function () {
  // Servidor propio (carpeta netplay-server/). El servidor público de
  // EmulatorJS ya no existe.
  const NETPLAY_SERVER = "https://netplay.camiloh.co";

  const inDiscord =
    location.hostname.endsWith("discordsays.com") ||
    location.hostname.endsWith("discordapigateway.com");

  // Dentro de una Activity todo pasa por el proxy de Discord, que solo
  // deja salir hacia los hosts mapeados en el Developer Portal.
  // Se usa UN solo mapeo (el prefijo no admite puntos, por eso no sirve
  // "/socket.io"):
  //     /netplay  ->  netplay.camiloh.co
  // El cliente de EmulatorJS hace io(url) y fetch(url + "/list"). Con
  // url = <origen>/netplay, Socket.IO tomaría "/netplay" como namespace,
  // así que más abajo se envuelve io() para convertir esa ruta en la
  // opción `path` (/netplay/socket.io), que es lo que Discord mapea.
  function netplayUrl() {
    return inDiscord ? location.origin + "/netplay" : NETPLAY_SERVER;
  }

  // Discord no soporta WebRTC (lo dice su documentación), así que allí el
  // netplay nativo de EmulatorJS no puede funcionar. En ese caso se usa el
  // modo por WebSocket de js/netplay-ws.js. También se puede probar en la
  // web añadiendo ?netplay=ws a la URL.
  const forcedWs = new URLSearchParams(location.search).get("netplay") === "ws";
  const wsMode = inDiscord || forcedWs || typeof window.RTCPeerConnection !== "function";
  window.NETPLAY_WS = { enabled: wsMode, url: netplayUrl() };

  function wrapIo(realIo) {
    if (typeof realIo !== "function" || realIo.__camuladorWrapped) return realIo;
    function io(uri, opts) {
      if (inDiscord && typeof uri === "string") {
        try {
          const u = new URL(uri, location.origin);
          const prefix = u.pathname.replace(/\/+$/, "");
          if (prefix) {
            opts = Object.assign({}, opts, { path: prefix + "/socket.io" });
            uri = u.origin;
          }
        } catch (e) {}
      }
      return realIo.call(this, uri, opts);
    }
    Object.assign(io, realIo);
    io.__camuladorWrapped = true;
    return io;
  }

  // socket.io.min.js se carga después (lo importa emulator.js de
  // EmulatorJS) y define window.io; se intercepta esa asignación.
  if (inDiscord) {
    if (typeof window.io === "function") {
      window.io = wrapIo(window.io);
    } else {
      let _io;
      Object.defineProperty(window, "io", {
        configurable: true,
        get() { return _io; },
        set(v) { _io = wrapIo(v); },
      });
    }
  }

  const NETPLAY_ICE_SERVERS = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

  // Se llama desde startGame() en emulator.js, antes de inyectar el
  // loader.js de EmulatorJS, para que las variables EJS_* ya estén
  // listas cuando el core arranque.
  function applyNetplayConfig(game) {
    if (wsMode) {
      delete window.EJS_netplayServer; // sin servidor => EmulatorJS no muestra su botón
    } else {
      window.EJS_netplayServer = netplayUrl();
      window.EJS_netplayICEServers = NETPLAY_ICE_SERVERS;
    }

    if (window.discordUser && window.discordUser.username) {
      window.EJS_playerName = window.discordUser.username;
    }
  }

  window.applyNetplayConfig = applyNetplayConfig;
})();
