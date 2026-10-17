// =============================================
//  NETPLAY (multiplayer) — EmulatorJS 4.3.0-pre
//  Módulo separado de emulator.js a propósito:
//  toda la configuración de multiplayer vive acá,
//  emulator.js solo la invoca.
//
//  Cómo funciona el cliente de la 4.3.0-pre (leído del código):
//   - El botón de netplay solo aparece si EJS_gameID es un NÚMERO,
//     hay EJS_netplayServer y el core soporta save states.
//   - Se conecta con Socket.IO:  io(EJS_netplayServer)  y además
//     pide  GET <server>/list?domain=...&game_id=...
//   - El video/audio/inputs van por WebRTC entre jugadores; el
//     servidor solo hace de señalización (salas).
// =============================================
(function () {
  // Servidor de señalización. Por ahora el público de EmulatorJS;
  // si no responde con el protocolo nuevo, cámbialo por uno propio
  // (repo EmulatorJS/EmulatorJS-Netplay) y pon aquí su URL.
  // El servidor publico de EmulatorJS ya no existe. Cambia esta URL por la de tu servidor (carpeta netplay-server/).
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
    window.EJS_netplayServer = netplayUrl();
    window.EJS_netplayICEServers = NETPLAY_ICE_SERVERS;

    if (window.discordUser && window.discordUser.username) {
      window.EJS_playerName = window.discordUser.username;
    }
  }

  window.applyNetplayConfig = applyNetplayConfig;
})();
