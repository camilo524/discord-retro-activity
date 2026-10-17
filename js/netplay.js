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
  const NETPLAY_SERVER = "https://netplay.emulatorjs.org";

  const inDiscord =
    location.hostname.endsWith("discordsays.com") ||
    location.hostname.endsWith("discordapigateway.com");

  // Dentro de una Activity, el cliente hace io(url). Si url tuviera
  // una ruta (ej. /netplay), Socket.IO la tomaría como *namespace* y
  // NO como prefijo, así que no sirve un prefijo tipo "/netplay".
  // En su lugar se usa el origen de la Activity y se mapean en el
  // Developer Portal las dos rutas que el cliente pide:
  //     /socket.io  ->  host del servidor de netplay
  //     /list       ->  host del servidor de netplay
  function netplayUrl() {
    return inDiscord ? location.origin : NETPLAY_SERVER;
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
