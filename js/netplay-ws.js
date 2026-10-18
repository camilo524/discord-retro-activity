// =============================================
//  NETPLAY POR WEBSOCKET (para Discord Activities)
//
//  Por qué existe: Discord NO soporta WebRTC dentro de las Activities
//  ("WebRTC is not supported" en su documentación); solo WebSockets a
//  través de su proxy. El netplay nativo de EmulatorJS 4.3.0-pre usa
//  WebRTC, así que aquí hay un modo propio que usa únicamente el
//  Socket.IO que ya tenemos (netplay.camiloh.co):
//
//   - HOST: corre el juego, captura su canvas (~30 fps, WebP o JPEG con
//     calidad adaptativa; no manda frames repetidos) y lo envía por el
//     servidor (evento "snapshot"). También captura el audio del emulador
//     (PCM mono 22 kHz) y lo envía como data-message {type:"audio"}.
//   - INVITADO: no ejecuta el juego; dibuja los frames que recibe, reproduce
//     el audio con un pequeño buffer y envía sus botones al host (evento
//     "input"). El host los aplica como jugador 2, 3...
//
//  Se activa solo cuando window.NETPLAY_WS.enabled (lo decide netplay.js:
//  dentro de Discord, o con ?netplay=ws para probar en la web).
//  Limitación: hay algo de latencia (el video viaja por el servidor).
//
//  API: window.NetplayWS.onGameStart(game) / onGameExit()
// =============================================
(function () {
  const cfg = window.NETPLAY_WS;
  if (!cfg || !cfg.enabled) {
    window.NetplayWS = { onGameStart() {}, onGameExit() {} };
    return;
  }

  // ---- Parámetros ------------------------------------------------
  const FPS = 30;            // frames por segundo máximos que envía el host
  const MAX_W = 640;         // ancho máximo del frame enviado (px)
  const Q_MIN = 0.55;        // calidad mínima/máxima (se adapta a la conexión)
  const Q_MAX = 0.88;
  const AUDIO_RATE = 22050;  // Hz del audio enviado (mono, Int16)
  const MAX_PLAYERS = 4;

  // ---- Estado ----------------------------------------------------
  let game = null;
  let socket = null;
  let role = null;           // null | "host" | "guest"
  let userId = null;
  let sessionId = null;
  let roomName = "";
  let players = {};          // users-updated
  let slotOf = {};           // host: userid -> slot (1..3); guest: copia recibida
  let mySlot = null;         // guest: su jugador
  let listTimer = null;

  // Host
  let captureTimer = null;
  let captureBusy = false;
  let capVideo = null;
  let capCanvas = null;
  let capCtx = null;
  let quality = 0.8;
  let imgType = "image/webp"; // se cae a JPEG si el navegador no codifica WebP
  let lastSig = null;
  let audioTap = null;       // { proc, mute, nodes, timer }
  let audioAcc = [];         // muestras Int16 pendientes de enviar

  // Invitado
  let guestCanvas = null;
  let guestCtx = null;
  let decoding = false;
  let pendingFrame = null;
  let savedSim = null;       // { hadOwn, fn }
  let savedCanvasVis = "";
  let actx = null;           // AudioContext del invitado
  let audioNext = 0;

  // UI
  let btn = null;
  let panel = null;

  // ---- Utilidades ------------------------------------------------
  function guid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function toB64(buf) {
    const bytes = new Uint8Array(buf);
    let s = "";
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return btoa(s);
  }

  function fromB64(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function emu() {
    return window.EJS_emulator;
  }

  function playerName() {
    const el = document.getElementById("npws-name");
    const typed = el && el.value.trim();
    if (typed) return typed.slice(0, 20);
    return (window.discordUser && window.discordUser.username) || "Jugador";
  }

  // ---- Conexión --------------------------------------------------
  function connect(cb) {
    if (socket && socket.connected) { cb(); return; }
    if (typeof io !== "function") { setStatus("Socket.IO no está disponible todavía."); return; }
    if (!socket) {
      socket = io(cfg.url);
      socket.on("connect_error", (e) => setStatus("Error de conexión: " + e.message));
      socket.on("disconnect", () => { if (role) leaveRoom("Se perdió la conexión con el servidor."); });
      socket.on("users-updated", onUsers);
      socket.on("snapshot", onSnapshot);
      socket.on("input", onInput);
      socket.on("data-message", onData);
    }
    socket.once("connect", cb);
    if (socket.disconnected) socket.connect();
  }

  function fetchRooms() {
    const url = cfg.url + "/list?domain=" + encodeURIComponent(location.host) +
      "&game_id=" + encodeURIComponent(game ? game.id : "");
    return fetch(url).then((r) => r.json()).catch(() => ({}));
  }

  // ---- Crear / unirse / salir ------------------------------------
  function createRoom(name, maxPlayers) {
    if (role) return;
    userId = guid();
    sessionId = guid();
    roomName = name || ((window.discordUser && window.discordUser.username) || "Sala") + " (" + game.name + ")";
    setStatus("Creando sala...");
    connect(() => {
      const extra = {
        domain: location.host,
        game_id: String(game.id),
        room_name: roomName,
        player_name: playerName(),
        userid: userId,
        sessionid: sessionId,
        isHost: true,
      };
      socket.emit("open-room", { extra, maxPlayers, password: "" }, (err) => {
        if (err) { setStatus("No se pudo crear la sala: " + err); return; }
        role = "host";
        players = {};
        players[userId] = extra;
        slotOf = {};
        startHosting();
        renderPanel();
        setStatus("Sala creada. Esperando jugadores...");
      });
    });
  }

  function joinRoom(sid, name) {
    if (role) return;
    userId = guid();
    sessionId = sid;
    roomName = name;
    initGuestAudio(); // dentro del gesto del usuario, para que el navegador permita sonido
    setStatus("Entrando a la sala...");
    connect(() => {
      const extra = {
        domain: location.host,
        game_id: String(game.id),
        room_name: name,
        player_name: playerName(),
        userid: userId,
        sessionid: sid,
        isHost: false,
      };
      socket.emit("join-room", { extra, password: "" }, (err, users) => {
        if (err) { setStatus("No se pudo entrar: " + err); return; }
        role = "guest";
        mySlot = null;
        startGuest();
        onUsers(users || {});
        renderPanel();
        setStatus("Conectado. Esperando video del host...");
      });
    });
  }

  function leaveRoom(message) {
    const wasHost = role === "host";
    if (wasHost && socket && socket.connected) {
      try { socket.emit("data-message", { type: "host-left" }); } catch (e) {}
    }
    stopHosting();
    stopGuest();
    closeGuestAudio();
    if (socket && socket.connected && role) {
      try { socket.emit("leave-room"); } catch (e) {}
    }
    role = null;
    players = {};
    slotOf = {};
    mySlot = null;
    renderPanel();
    if (message) setStatus(message);
  }

  // ---- Mensajes del servidor -------------------------------------
  function onUsers(users) {
    players = users || {};
    if (role === "host") {
      const ids = Object.keys(players).filter((id) => id !== userId);
      // liberar slots de quien se fue
      for (const id of Object.keys(slotOf)) {
        if (!ids.includes(id)) { releaseSlot(slotOf[id]); delete slotOf[id]; }
      }
      // asignar slots a quien llegó
      for (const id of ids) {
        if (slotOf[id] != null) continue;
        const used = new Set(Object.values(slotOf));
        for (let s = 1; s < MAX_PLAYERS; s++) if (!used.has(s)) { slotOf[id] = s; break; }
      }
      try { socket.emit("data-message", { type: "slots", slots: slotOf }); } catch (e) {}
    } else if (role === "guest") {
      const hostHere = Object.values(players).some((p) => p && p.isHost);
      if (!hostHere) { leaveRoom("El host cerró la sala."); return; }
    }
    renderPanel();
  }

  function onData(d) {
    if (!d) return;
    if (d.type === "audio") {
      if (role === "guest") playAudio(d);
    } else if (d.type === "slots" && role === "guest") {
      slotOf = d.slots || {};
      mySlot = slotOf[userId] != null ? slotOf[userId] : null;
      if (mySlot != null) setStatus("Eres el jugador " + (mySlot + 1) + ".");
      renderPanel();
    } else if (d.type === "host-left" && role === "guest") {
      leaveRoom("El host cerró la sala.");
    }
  }

  function onInput(m) {
    if (role !== "host" || !m) return;
    if (slotOf[m.u] !== m.s) return; // solo el slot asignado a ese usuario
    const e = emu();
    if (e && e.gameManager) e.gameManager.simulateInput(m.s, m.i, m.v);
  }

  function releaseSlot(slot) {
    const e = emu();
    if (!e || !e.gameManager) return;
    for (let i = 0; i < 16; i++) { try { e.gameManager.simulateInput(slot, i, 0); } catch (err) {} }
  }

  // ---- HOST: capturar y enviar frames ----------------------------
  function startHosting() {
    const e = emu();
    if (!e || !e.canvas) { setStatus("El emulador todavía no está listo."); return; }
    const canvas = e.canvas;
    try {
      const stream = canvas.captureStream ? canvas.captureStream(FPS) : null;
      if (stream) {
        capVideo = document.createElement("video");
        capVideo.muted = true;
        capVideo.playsInline = true;
        capVideo.srcObject = stream;
        const p = capVideo.play();
        if (p && p.catch) p.catch(() => {});
      }
    } catch (err) { capVideo = null; }
    capCanvas = document.createElement("canvas");
    capCtx = capCanvas.getContext("2d", { willReadFrequently: true });
    lastSig = null;
    captureTimer = setInterval(captureTick, 1000 / FPS);
    startAudioTap();
  }

  function stopHosting() {
    if (captureTimer) { clearInterval(captureTimer); captureTimer = null; }
    if (capVideo) { try { capVideo.srcObject = null; } catch (e) {} capVideo = null; }
    capCanvas = null; capCtx = null; captureBusy = false; lastSig = null;
    stopAudioTap();
  }

  // Firma barata del frame (miniatura 32x24) para no reenviar imágenes idénticas.
  const sigCanvas = document.createElement("canvas");
  sigCanvas.width = 32; sigCanvas.height = 24;
  const sigCtx = sigCanvas.getContext("2d", { willReadFrequently: true });
  function frameSig(src) {
    try {
      sigCtx.drawImage(src, 0, 0, 32, 24);
      const d = sigCtx.getImageData(0, 0, 32, 24).data;
      let h = 0;
      for (let i = 0; i < d.length; i += 4) h = (Math.imul(h, 31) + d[i] + (d[i + 1] << 1) + (d[i + 2] << 2)) | 0;
      return h;
    } catch (e) { return null; }
  }

  // ---- HOST: audio del emulador -> PCM -> data-message ------------
  function findAudio() {
    const e = emu();
    const al = e && e.Module && e.Module.AL && e.Module.AL.currentCtx;
    if (!al || !al.audioCtx) return null;
    return al;
  }

  function startAudioTap() {
    stopAudioTap();
    const al = findAudio();
    if (!al) { setTimeout(() => { if (role === "host" && !audioTap) startAudioTap(); }, 1500); return; }
    const ctx = al.audioCtx;
    try {
      const proc = ctx.createScriptProcessor(2048, 2, 1);
      const mute = ctx.createGain();
      mute.gain.value = 0;               // el procesador debe estar conectado para correr, pero sin sonido propio
      proc.connect(mute); mute.connect(ctx.destination);
      const ratio = ctx.sampleRate / AUDIO_RATE;
      let pos = 0;
      proc.onaudioprocess = (ev) => {
        if (role !== "host" || !socket || !socket.connected || Object.keys(slotOf).length === 0) return;
        const inp = ev.inputBuffer;
        const a = inp.getChannelData(0);
        const b = inp.numberOfChannels > 1 ? inp.getChannelData(1) : a;
        for (; pos < a.length; pos += ratio) {
          const i = pos | 0;
          const v = (a[i] + b[i]) * 0.5;
          audioAcc.push(v < -1 ? -32768 : v > 1 ? 32767 : (v * 32767) | 0);
        }
        pos -= a.length;
        if (audioAcc.length >= 1024) {
          const pcm = new Int16Array(audioAcc);
          audioAcc = [];
          try { socket.emit("data-message", { type: "audio", r: AUDIO_RATE, d: toB64(pcm.buffer) }); } catch (err) {}
        }
      };
      audioTap = { proc, mute, nodes: [], ctx, timer: null };
      // Conectar el audio del juego al procesador (los "sources" de OpenAL pueden aparecer más tarde)
      const hook = () => {
        const cur = findAudio();
        if (!cur || !audioTap) return;
        const list = cur.gain ? [cur.gain] : Object.values(cur.sources || {}).map((s) => s && s.gain).filter(Boolean);
        for (const n of list) {
          if (audioTap.nodes.includes(n)) continue;
          try { n.connect(proc); audioTap.nodes.push(n); } catch (err) {}
        }
      };
      hook();
      audioTap.timer = setInterval(hook, 1000);
    } catch (err) {
      console.warn("[NETPLAY-WS] No se pudo capturar el audio del host:", err);
      audioTap = null;
    }
  }

  function stopAudioTap() {
    if (!audioTap) return;
    clearInterval(audioTap.timer);
    for (const n of audioTap.nodes) { try { n.disconnect(audioTap.proc); } catch (e) {} }
    try { audioTap.proc.onaudioprocess = null; audioTap.proc.disconnect(); audioTap.mute.disconnect(); } catch (e) {}
    audioTap = null; audioAcc = [];
  }

  // ---- INVITADO: reproducir audio ---------------------------------
  function initGuestAudio() {
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state !== "running") actx.resume().catch(() => {});
      audioNext = 0;
    } catch (e) { actx = null; }
  }

  function closeGuestAudio() {
    if (actx) { try { actx.close(); } catch (e) {} actx = null; }
  }

  function playAudio(m) {
    if (!actx || !m.d) return;
    if (actx.state !== "running") actx.resume().catch(() => {});
    const bytes = fromB64(m.d);
    const pcm = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
    if (!pcm.length) return;
    const buf = actx.createBuffer(1, pcm.length, m.r || AUDIO_RATE);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
    const src = actx.createBufferSource();
    src.buffer = buf;
    src.connect(actx.destination);
    const now = actx.currentTime;
    // Colchón de ~120 ms; si nos atrasamos se reinicia, si nos adelantamos demasiado se descarta.
    if (audioNext < now + 0.02) audioNext = now + 0.12;
    else if (audioNext > now + 0.6) return;
    src.start(audioNext);
    audioNext += buf.duration;
  }

  function captureTick() {
    if (role !== "host" || captureBusy || !socket || !socket.connected) return;
    if (Object.keys(slotOf).length === 0) return; // nadie mirando: no gastar CPU/ancho de banda
    const eng = socket.io && socket.io.engine;
    if (eng && eng.writeBuffer && eng.writeBuffer.length > 2) return; // conexión saturada
    const e = emu();
    if (!e || !e.canvas) return;
    const src = capVideo && capVideo.readyState >= 2 ? capVideo : e.canvas;
    const sw = src.videoWidth || src.width;
    const sh = src.videoHeight || src.height;
    if (!sw || !sh) return;
    const scale = Math.min(1, MAX_W / sw);
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    if (capCanvas.width !== w) capCanvas.width = w;
    if (capCanvas.height !== h) capCanvas.height = h;
    const sig = frameSig(src);
    if (sig !== null && sig === lastSig) return; // imagen igual a la anterior
    try { capCtx.drawImage(src, 0, 0, w, h); } catch (err) { return; }
    // Calidad adaptativa: baja si el socket se atasca, sube poco a poco si va holgado
    if (eng && eng.writeBuffer && eng.writeBuffer.length > 0) quality = Math.max(Q_MIN, quality - 0.04);
    else quality = Math.min(Q_MAX, quality + 0.01);
    captureBusy = true;
    capCanvas.toBlob(async (blob) => {
      try {
        if (!blob || role !== "host") return;
        if (imgType === "image/webp" && blob.type !== "image/webp") { imgType = "image/jpeg"; return; } // Safari: sin WebP
        lastSig = sig;
        const buf = await blob.arrayBuffer();
        socket.emit("snapshot", { w, h, t: blob.type, d: toB64(buf) });
      } catch (err) {
        /* se descarta el frame */
      } finally {
        captureBusy = false;
      }
    }, imgType, quality);
  }

  // ---- INVITADO: mostrar frames y mandar botones ------------------
  function startGuest() {
    const e = emu();
    if (!e) return;
    // 1) congelar el emulador local (el juego corre en el host)
    try { if (e.gameManager && e.gameManager.toggleMainLoop) e.gameManager.toggleMainLoop(0); } catch (err) {}
    if (e.canvas) { savedCanvasVis = e.canvas.style.visibility; e.canvas.style.visibility = "hidden"; }
    // 2) lienzo donde se dibuja el video del host
    const parent = (e.elements && e.elements.parent) || document.getElementById("game");
    guestCanvas = document.createElement("canvas");
    guestCanvas.width = 256; guestCanvas.height = 240;
    guestCanvas.style.cssText =
      "position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;" +
      "object-position:center;pointer-events:none;z-index:2;background:#000;image-rendering:pixelated;";
    parent.appendChild(guestCanvas);
    guestCtx = guestCanvas.getContext("2d");
    // 3) los botones locales se envían al host en vez de al core local
    const gm = e.gameManager;
    if (gm) {
      savedSim = { hadOwn: Object.prototype.hasOwnProperty.call(gm, "simulateInput"), fn: gm.simulateInput };
      gm.simulateInput = function (player, index, value) {
        if (player === 0 && mySlot != null && socket && socket.connected) {
          socket.emit("input", { u: userId, s: mySlot, i: index, v: value });
        }
      };
    }
  }

  function stopGuest() {
    const e = emu();
    if (guestCanvas && guestCanvas.parentNode) guestCanvas.parentNode.removeChild(guestCanvas);
    guestCanvas = null; guestCtx = null; pendingFrame = null; decoding = false;
    if (!e) { savedSim = null; return; }
    if (savedSim && e.gameManager) {
      if (savedSim.hadOwn) e.gameManager.simulateInput = savedSim.fn;
      else delete e.gameManager.simulateInput;
    }
    savedSim = null;
    if (role === "guest") {
      if (e.canvas) e.canvas.style.visibility = savedCanvasVis;
      try { if (e.gameManager && e.gameManager.toggleMainLoop) e.gameManager.toggleMainLoop(1); } catch (err) {}
    }
  }

  function onSnapshot(m) {
    if (role !== "guest" || !m || !m.d) return;
    pendingFrame = m;           // solo importa el último
    if (!decoding) decodeLoop();
  }

  async function decodeLoop() {
    decoding = true;
    try {
      while (pendingFrame && role === "guest" && guestCtx) {
        const m = pendingFrame;
        pendingFrame = null;
        const bmp = await createImageBitmap(new Blob([fromB64(m.d)], { type: m.t || "image/jpeg" }));
        if (guestCanvas.width !== bmp.width) guestCanvas.width = bmp.width;
        if (guestCanvas.height !== bmp.height) guestCanvas.height = bmp.height;
        guestCtx.drawImage(bmp, 0, 0);
        if (bmp.close) bmp.close();
      }
    } catch (err) {
      /* frame corrupto: se ignora */
    } finally {
      decoding = false;
    }
  }

  // ---- UI --------------------------------------------------------
  function el(tag, css, text) {
    const n = document.createElement(tag);
    if (css) n.style.cssText = css;
    if (text != null) n.textContent = text;
    return n;
  }

  const BTN_CSS =
    "background:#5865F2;color:#fff;border:0;border-radius:8px;padding:10px 14px;" +
    "font:600 14px system-ui,sans-serif;cursor:pointer;min-height:40px;";

  function ensureUI() {
    if (btn) return;
    // Arriba a la IZQUIERDA, pegado al botón "Cambiar juego" (ver placeUI).
    // El borde derecho se evita a propósito: en Discord móvil esa franja
    // la ocupan los botones de Discord (salir, avatar, etc.) y no se puede tocar.
    btn = el("button", "position:fixed;top:12px;left:190px;z-index:9998;display:none;" +
      "min-width:44px;height:40px;border-radius:10px;border:0;background:rgba(88,101,242,.95);color:#fff;" +
      "font-size:20px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.45);", "🌐");
    btn.title = "Multijugador";
    btn.addEventListener("click", () => {
      placeUI();
      panel.style.display = panel.style.display === "none" ? "block" : "none";
      if (panel.style.display === "block") { renderPanel(); refreshList(); }
    });
    document.body.appendChild(btn);

    panel = el("div", "position:fixed;top:60px;left:12px;z-index:9999;display:none;width:min(340px,calc(100vw - 24px));" +
      "max-height:calc(100vh - 76px);overflow:auto;background:#17181c;color:#fff;border:1px solid #333;" +
      "border-radius:12px;padding:14px;font:14px system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.6);");
    document.body.appendChild(panel);
    window.addEventListener("resize", placeUI);
    renderPanel();
  }

  // Coloca el botón justo a la derecha de "Cambiar juego" y el panel debajo.
  function placeUI() {
    if (!btn || !panel) return;
    const back = document.getElementById("btn-back");
    const r = back && back.getBoundingClientRect();
    const hasBack = r && r.width > 0;
    const top = hasBack ? Math.round(r.top) : 12;
    const h = hasBack ? Math.round(r.height) : 40;
    const left = hasBack ? Math.round(r.right + 8) : 190;
    btn.style.top = top + "px";
    btn.style.left = left + "px";
    btn.style.height = h + "px";
    const pTop = top + h + 8;
    panel.style.top = pTop + "px";
    panel.style.maxHeight = "calc(100vh - " + (pTop + 12) + "px)";
  }

  let statusEl = null;
  function setStatus(t) {
    if (statusEl) statusEl.textContent = t || "";
    console.log("[NETPLAY-WS]", t);
  }

  function renderPanel() {
    if (!panel) return;
    panel.textContent = "";
    const head = el("div", "display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;");
    head.appendChild(el("b", "font-size:16px;", "🌐 Multijugador"));
    const x = el("button", "background:none;border:0;color:#aaa;font-size:20px;cursor:pointer;", "✕");
    x.addEventListener("click", () => { panel.style.display = "none"; });
    head.appendChild(x);
    panel.appendChild(head);

    statusEl = el("div", "font-size:12px;color:#9aa;min-height:16px;margin-bottom:8px;");
    panel.appendChild(statusEl);

    if (!role) {
      const nm = el("input", "width:100%;box-sizing:border-box;padding:9px;border-radius:8px;border:1px solid #444;background:#0f1013;color:#fff;margin-bottom:8px;");
      nm.id = "npws-name";
      nm.placeholder = "Tu nombre";
      nm.value = (window.discordUser && window.discordUser.username) || "";
      panel.appendChild(nm);

      const row = el("div", "display:flex;gap:6px;margin-bottom:12px;");
      const rn = el("input", "flex:1;min-width:0;padding:9px;border-radius:8px;border:1px solid #444;background:#0f1013;color:#fff;");
      rn.placeholder = "Nombre de la sala";
      const mp = el("select", "padding:9px;border-radius:8px;border:1px solid #444;background:#0f1013;color:#fff;");
      for (let n = 2; n <= MAX_PLAYERS; n++) { const o = el("option", null, n + " jug."); o.value = n; mp.appendChild(o); }
      row.appendChild(rn); row.appendChild(mp);
      panel.appendChild(row);
      const create = el("button", BTN_CSS + "width:100%;margin-bottom:14px;", "Crear sala");
      create.addEventListener("click", () => createRoom(rn.value.trim(), parseInt(mp.value, 10)));
      panel.appendChild(create);

      panel.appendChild(el("div", "font-weight:600;margin-bottom:6px;", "Salas disponibles"));
      const list = el("div", "display:flex;flex-direction:column;gap:6px;");
      list.id = "npws-list";
      list.appendChild(el("div", "color:#888;font-size:13px;", "Buscando..."));
      panel.appendChild(list);
    } else {
      panel.appendChild(el("div", "margin-bottom:6px;", "Sala: " + roomName));
      panel.appendChild(el("div", "color:#9aa;font-size:13px;margin-bottom:8px;",
        role === "host" ? "Eres el host (jugador 1). Los demás ven tu pantalla." :
          "Eres invitado: ves la pantalla del host y tus botones controlan al jugador " + (mySlot != null ? mySlot + 1 : "…") + "."));
      const ul = el("div", "margin-bottom:12px;font-size:13px;");
      for (const p of Object.values(players)) {
        ul.appendChild(el("div", null, (p.isHost ? "👑 " : "🎮 ") + (p.player_name || "Jugador")));
      }
      panel.appendChild(ul);
      const leave = el("button", BTN_CSS.replace("#5865F2", "#c0392b") + "width:100%;", "Salir de la sala");
      leave.addEventListener("click", () => leaveRoom("Saliste de la sala."));
      panel.appendChild(leave);
    }
  }

  async function refreshList() {
    const list = document.getElementById("npws-list");
    if (!list || role) return;
    const rooms = await fetchRooms();
    const cur = document.getElementById("npws-list");
    if (!cur) return;
    cur.textContent = "";
    const ids = Object.keys(rooms || {});
    if (!ids.length) { cur.appendChild(el("div", "color:#888;font-size:13px;", "No hay salas abiertas para este juego.")); return; }
    for (const sid of ids) {
      const r = rooms[sid];
      const row = el("div", "display:flex;align-items:center;justify-content:space-between;gap:8px;background:#0f1013;border-radius:8px;padding:8px 10px;");
      const info = el("div", "min-width:0;");
      info.appendChild(el("div", "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;", r.room_name));
      info.appendChild(el("div", "font-size:12px;color:#888;", (r.player_name || "") + " · " + r.current + "/" + r.max));
      row.appendChild(info);
      if (r.current < r.max) {
        const j = el("button", BTN_CSS + "padding:8px 12px;", "Unirse");
        j.addEventListener("click", () => joinRoom(sid, r.room_name));
        row.appendChild(j);
      } else {
        row.appendChild(el("span", "color:#c66;font-size:12px;", "Llena"));
      }
      cur.appendChild(row);
    }
  }

  // ---- Ciclo de vida desde emulator.js ---------------------------
  window.NetplayWS = {
    onGameStart(g) {
      game = g;
      ensureUI();
      btn.style.display = "block";
      placeUI();
      if (!listTimer) listTimer = setInterval(() => { if (panel && panel.style.display === "block") refreshList(); }, 3000);
    },
    onGameExit() {
      leaveRoom();
      if (listTimer) { clearInterval(listTimer); listTimer = null; }
      if (socket) { try { socket.disconnect(); } catch (e) {} socket = null; }
      if (btn) btn.style.display = "none";
      if (panel) panel.style.display = "none";
      game = null;
    },
  };
})();
