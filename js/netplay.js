// =============================================
//  NETPLAY (multiplayer)
//  Módulo separado de emulator.js a propósito:
//  toda la configuración de multiplayer vive acá,
//  emulator.js solo la invoca.
// =============================================
(function () {
  // Mismo patrón que romUrlFor() en emulator.js: si estamos dentro de
  // una Discord Activity, la conexión al relay de netplay debe pasar
  // por el proxy (URL Mapping /netplay -> netplay.emulatorjs.org).
  // Fuera de Discord, se usa el dominio público tal cual.
  function netplayUrlFor(rawUrl) {
    if (!rawUrl || !rawUrl.startsWith("http")) return rawUrl;
    if (
      location.hostname.endsWith("discordsays.com") ||
      location.hostname.endsWith("discordapigateway.com")
    ) {
      return rawUrl.replace("https://netplay.emulatorjs.org/", "/netplay/");
    }
    return rawUrl;
  }

  const NETPLAY_ICE_SERVERS = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

  // Se llama desde startGame() en emulator.js, antes de inyectar el
  // loader.js de EmulatorJS, para que las variables EJS_* ya estén
  // listas cuando el core arranque.
  function applyNetplayConfig(game) {
    window.EJS_netplayServer = netplayUrlFor("https://netplay.emulatorjs.org/");
    window.EJS_netplayICEServers = NETPLAY_ICE_SERVERS;

    if (window.discordUser && window.discordUser.username) {
      window.EJS_playerName = window.discordUser.username;
    }
  }

  window.applyNetplayConfig = applyNetplayConfig;
})();
