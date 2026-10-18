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

  // ---- Diagnóstico WebRTC --------------------------------------
  // Escribe en la consola ([RTC]) el estado de ICE y los tipos de
  // candidatos (host / srflx / relay), para depurar conexiones WebRTC.
  // No cambia el comportamiento del netplay.
  function rtcLog(...a) {
    console.log("[RTC]", ...a);
  }

  function installRtcDiagnostics() {
    const Native = window.RTCPeerConnection;
    if (typeof Native !== "function") {
      rtcLog("RTCPeerConnection NO disponible en este entorno (" + (inDiscord ? "Discord" : "web") + ")");
      return;
    }
    if (Native.__camuladorDiag) return;
    function Wrapped(cfg, ...rest) {
      const pc = new Native(cfg, ...rest);
      const id = Math.random().toString(36).slice(2, 6);
      try {
        const servers = ((cfg && cfg.iceServers) || []).map((x) => [].concat(x.urls).join(","));
        rtcLog(id, "nueva conexión; iceServers:", servers.join(" | ") || "(ninguno)");
      } catch (e) {}
      const seen = {};
      pc.addEventListener("icecandidate", (e) => {
        if (!e.candidate) { rtcLog(id, "candidatos:", JSON.stringify(seen)); return; }
        const t = e.candidate.type || (/ typ (\w+)/.exec(e.candidate.candidate) || [])[1] || "?";
        seen[t] = (seen[t] || 0) + 1;
      });
      pc.addEventListener("icecandidateerror", (e) => rtcLog(id, "icecandidateerror", e.errorCode, e.errorText, e.url));
      pc.addEventListener("iceconnectionstatechange", () => rtcLog(id, "ice:", pc.iceConnectionState));
      pc.addEventListener("connectionstatechange", () => rtcLog(id, "conexión:", pc.connectionState));
      pc.addEventListener("track", (e) => rtcLog(id, "track recibido:", e.track && e.track.kind));
      return pc;
    }
    Wrapped.prototype = Native.prototype;
    Object.setPrototypeOf(Wrapped, Native);
    Wrapped.__camuladorDiag = true;
    window.RTCPeerConnection = Wrapped;
    rtcLog("RTCPeerConnection disponible; entorno:", inDiscord ? "Discord" : "web");
  }
  installRtcDiagnostics();

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
