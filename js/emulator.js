(function () {
  const grid = document.getElementById("games-grid");
  const loading = document.getElementById("loading");
  const loadingText = document.getElementById("loading-text");
  const progressWrap = document.querySelector(".progress-wrap");
  const progressBar = document.getElementById("progress-bar");
  const progressLabel = document.getElementById("progress-label");
  const btnBack = document.getElementById("btn-back");
  const menu = document.getElementById("menu");
  const gameContainer = document.getElementById("game-container");

  let loadTimeout = null;

  // ----- Tarjetas -----
  GAMES.forEach((game) => {
    const card = document.createElement("div");
    card.className = "game-card";

    // Ruta de cover más segura
    const coverSrc = game.cover || "";

    card.innerHTML = `
      <div class="cover">
        ${coverSrc
          ? `<img src="${coverSrc}" alt="${game.name}" loading="lazy"
                 onerror="this.onerror=null; this.src=''; this.parentElement.innerHTML='🎮';" />`
          : `<span style="font-size:2.4rem">🎮</span>`
        }
      </div>
      <div class="name">${game.name}</div>
      <div class="meta">
        <span>${game.core}</span>
        <span>${formatSize(game.sizeMB)}</span>
      </div>
    `;
    card.addEventListener("click", () => startGame(game));
    grid.appendChild(card);
  });

  function formatSize(mb) {
    if (mb == null) return "";
    if (mb < 1) return `${Math.round(mb * 1024)} KB`;
    if (mb >= 100) return `${Math.round(mb)} MB`;
    return `${mb.toFixed(1)} MB`;
  }

  function setStatus(title, detail = "") {
    loadingText.textContent = title;
    progressLabel.textContent = detail;
  }

  function showError(title, detail) {
    if (loadTimeout) clearTimeout(loadTimeout);
    progressWrap.style.display = "none";
    loading.querySelector(".spinner").style.display = "none";
    loadingText.textContent = title;
    progressLabel.textContent = detail;
    progressLabel.style.color = "#f87171";

    // Botón para volver
    if (!document.getElementById("btn-error-back")) {
      const b = document.createElement("button");
      b.id = "btn-error-back";
      b.textContent = "← Volver al menú";
      b.style.cssText =
        "margin-top:16px;padding:10px 16px;border:none;border-radius:8px;background:#5865f2;color:#fff;font-weight:600;cursor:pointer";
      b.onclick = backToMenu;
      loading.appendChild(b);
    }
  }

  function backToMenu() {
    // NO usar location.href ni reload → Discord móvil cierra la Activity
  
    if (loadTimeout) {
      clearTimeout(loadTimeout);
      loadTimeout = null;
    }
  
    // Parar / limpiar el emulador
    const gameDiv = document.getElementById("game");
    gameDiv.innerHTML = "";
  
    // Liberar blob de ROMs grandes si existe
    if (window.__currentBlobUrl) {
      try {
        URL.revokeObjectURL(window.__currentBlobUrl);
      } catch (e) {}
      window.__currentBlobUrl = null;
    }
  
    // Restaurar UI
    gameContainer.style.display = "none";
    loading.style.display = "none";
    btnBack.style.display = "none";
    progressWrap.style.display = "none";
    progressBar.style.width = "0%";
    progressLabel.textContent = "";
    progressLabel.style.color = "#94a3b8";
    loading.querySelector(".spinner").style.display = "block";
  
    const errBtn = document.getElementById("btn-error-back");
    if (errBtn) errBtn.remove();
  
    menu.style.display = "flex";
  
    // Permitir cargar EmulatorJS de nuevo en el próximo juego
    window.__ejsLoaded = false;
  
    // Quitar scripts viejos del loader (evita conflictos)
    document.querySelectorAll("script[data-ejs]").forEach((s) => s.remove());
  }

  // ----- Descarga con progreso -----
  async function downloadRomWithProgress(url, sizeMB) {
    progressWrap.style.display = "block";
    progressBar.style.width = "0%";
    setStatus("Descargando ROM...", sizeMB ? `0 / ${formatSize(sizeMB)}` : "Conectando...");

    const res = await fetch(url);
    if (!res.ok) throw new Error(`No se pudo descargar (HTTP ${res.status})`);

    const total =
      Number(res.headers.get("Content-Length")) ||
      (sizeMB ? sizeMB * 1024 * 1024 : 0);

    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;

      if (total > 0) {
        const pct = Math.min(100, (received / total) * 100);
        progressBar.style.width = pct + "%";
        const recMB = (received / (1024 * 1024)).toFixed(1);
        const totMB = (total / (1024 * 1024)).toFixed(1);
        progressLabel.textContent = `${recMB} / ${totMB} MB (${Math.round(pct)}%)`;
      } else {
        progressBar.style.width = Math.min(90, received / 1e6) + "%";
        progressLabel.textContent = `${(received / 1e6).toFixed(1)} MB...`;
      }
    }

    progressBar.style.width = "100%";
    setStatus("ROM descargada", "Creando archivo en memoria...");

    const blob = new Blob(chunks);
    const blobUrl = URL.createObjectURL(blob);
    return blobUrl;
  }

  // ----- Iniciar juego -----
  async function startGame(game) {
    menu.style.display = "none";
    loading.style.display = "flex";
    loading.querySelector(".spinner").style.display = "block";
    btnBack.style.display = "none";
    gameContainer.style.display = "block";
    progressWrap.style.display = "none";
    progressBar.style.width = "0%";
    progressLabel.style.color = "#94a3b8";
    setStatus("Preparando...", game.name);

    const errBtn = document.getElementById("btn-error-back");
    if (errBtn) errBtn.remove();

    try {
      let romUrl = game.rom;
      const isRemote =
        game.rom.startsWith("http") ||
        game.rom.startsWith("/files") ||
        game.rom.startsWith("/roms");
      const isLarge = (game.sizeMB || 0) >= 5;

      if (isRemote || isLarge) {
        setStatus("Descargando ROM...", game.name);
        romUrl = await downloadRomWithProgress(game.rom, game.sizeMB);
      }

      // ---- Pasos después de la descarga ----
      setStatus("ROM lista", "Configurando emulador...");
      await sleep(200);

      setStatus("Cargando núcleo " + game.core.toUpperCase() + "...", "Esto puede tardar en móviles");
      progressWrap.style.display = "block";
      progressBar.style.width = "15%";

      // Timeout de seguridad (móvil + PSX puede tardar mucho)
      const timeoutMs = game.core === "psx" ? 120000 : 60000;
      loadTimeout = setTimeout(() => {
        showError(
          "El emulador se quedó cargando",
          game.core === "psx"
            ? "PSX en móvil suele fallar con ROMs grandes (memoria). Prueba en PC o usa una ROM más ligera (.chd)."
            : "Revisa la consola o prueba de nuevo."
        );
      }, timeoutMs);

      window.EJS_player = "#game";
      window.EJS_core = game.core;
      window.EJS_gameUrl = romUrl;
      window.EJS_pathtodata = "/emulatorjs/stable/data/";
      window.EJS_startOnLoaded = true;
      window.EJS_color = "#000000";
      window.EJS_gameID = game.id;
      window.EJS_gameName = game.name;

      // BIOS PSX (si la tienes)
      // window.EJS_biosUrl = "/files/scph5501.bin";

      const layout = CONTROL_LAYOUTS[game.controls] || CONTROL_LAYOUTS.default;
      if (layout) {
        window.EJS_VirtualGamepadSettings = layout;
      } else {
        delete window.EJS_VirtualGamepadSettings;
      }

      window.EJS_netplayServer = "https://netplay.emulatorjs.org/";
      window.EJS_netplayICEServers = [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
      ];

      if (window.discordUser?.username) {
        window.EJS_playerName = window.discordUser.username;
      }

      // Callbacks de estado
      window.EJS_onGameStart = function () {
        if (loadTimeout) clearTimeout(loadTimeout);
        loading.style.display = "none";
        btnBack.style.display = "block";
        console.log("✅ Juego iniciado:", game.name);
        setTimeout(fixControlPositions, 400);
        setTimeout(fixControlPositions, 1200);
      };

      // Si EmulatorJS expone errores por consola, al menos lo vemos
      window.addEventListener("error", onGlobalError);
      window.addEventListener("unhandledrejection", onUnhandled);

      setStatus("Iniciando emulador...", "Cargando scripts y WASM");
      progressBar.style.width = "35%";

      if (!window.__ejsLoaded) {
        const script = document.createElement("script");
        script.src = "/emulatorjs/stable/data/loader.js";
        script.onload = () => {
          window.__ejsLoaded = true;
          setStatus("Núcleo cargado", "Arrancando juego... (puede tardar)");
          progressBar.style.width = "60%";
        };
        script.onerror = () => {
          showError(
            "No se pudo cargar EmulatorJS",
            "Revisa el URL Mapping de /emulatorjs"
          );
        };
        document.body.appendChild(script);
      } else {
        setStatus("Reiniciando emulador...", "");
        const url = new URL(window.location.href);
        url.searchParams.set("t", Date.now());
        window.location.href = url.toString();
      }
    } catch (err) {
      console.error(err);
      showError("Error al preparar el juego", String(err.message || err));
    }
  }

  function onGlobalError(e) {
    console.error("Error global:", e);
  }
  function onUnhandled(e) {
    console.error("Promise rechazada:", e.reason);
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function fixControlPositions() {
    const openBtn = document.querySelector(".ejs_virtualGamepad_open");
    if (openBtn) {
      openBtn.style.top = "auto";
      openBtn.style.bottom = "230px";
      openBtn.style.right = "88px";
      openBtn.style.left = "auto";
      openBtn.style.zIndex = "100";
    }
    const rightPad = document.querySelector(".ejs_virtualGamepad_right");
    if (rightPad) {
      rightPad.style.bottom = "55px";
      rightPad.style.right = "88px";
    }
    const leftPad = document.querySelector(".ejs_virtualGamepad_left");
    if (leftPad) {
      leftPad.style.bottom = "55px";
      leftPad.style.left = "12px";
    }
  }

  window.startGame = startGame;
})();
