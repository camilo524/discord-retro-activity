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

  // =============================================
  //  TARJETAS DEL MENÚ
  // =============================================
  GAMES.forEach((game) => {
    const card = document.createElement("div");
    card.className = "game-card";

    const coverSrc = game.cover || "";

    card.innerHTML = `
      <div class="cover">
        ${
          coverSrc
            ? `<img src="${coverSrc}" alt="${game.name}" loading="lazy"
                 onerror="this.onerror=null; this.remove(); this.parentElement.innerHTML='🎮';" />`
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

  // =============================================
  //  HELPERS
  // =============================================
  function formatSize(mb) {
    if (mb == null || mb === "") return "";
    if (mb < 1) return `${Math.round(mb * 1024)} KB`;
    if (mb >= 100) return `${Math.round(mb)} MB`;
    return `${mb.toFixed(1)} MB`;
  }

  function setStatus(title, detail = "") {
    loadingText.textContent = title;
    progressLabel.textContent = detail;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function showError(title, detail) {
    if (loadTimeout) {
      clearTimeout(loadTimeout);
      loadTimeout = null;
    }
    progressWrap.style.display = "none";
    const spinner = loading.querySelector(".spinner");
    if (spinner) spinner.style.display = "none";
    loadingText.textContent = title;
    progressLabel.textContent = detail;
    progressLabel.style.color = "#f87171";

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

  // =============================================
  //  VOLVER AL MENÚ (SIN RELOAD — importante en móvil)
  // =============================================
  function backToMenu() {
    if (loadTimeout) {
      clearTimeout(loadTimeout);
      loadTimeout = null;
    }

    // Limpiar canvas / DOM del emulador
    const gameDiv = document.getElementById("game");
    if (gameDiv) gameDiv.innerHTML = "";

    // Liberar blob de ROMs grandes
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

    const spinner = loading.querySelector(".spinner");
    if (spinner) spinner.style.display = "block";

    const errBtn = document.getElementById("btn-error-back");
    if (errBtn) errBtn.remove();

    menu.style.display = "flex";

    // Permitir recargar EmulatorJS en el próximo juego
    window.__ejsLoaded = false;
    document.querySelectorAll("script[data-ejs]").forEach((s) => s.remove());
  }

  btnBack.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    backToMenu();
  });
  btnBack.addEventListener("touchend", (e) => {
    e.preventDefault();
    e.stopPropagation();
    backToMenu();
  });

  // =============================================
  //  DESCARGA CON PROGRESO
  // =============================================
  async function downloadRomWithProgress(url, sizeMB) {
    progressWrap.style.display = "block";
    progressBar.style.width = "0%";
    setStatus(
      "Descargando ROM...",
      sizeMB ? `0 / ${formatSize(sizeMB)}` : "Conectando..."
    );

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`No se pudo descargar (HTTP ${res.status})`);
    }

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
        const recMB = (received / (1024 * 1024)).toFixed(1);
        progressLabel.textContent = `${recMB} MB descargados...`;
        progressBar.style.width = Math.min(90, received / 1e6) + "%";
      }
    }

    progressBar.style.width = "100%";
    setStatus("ROM descargada", "Creando archivo en memoria...");
    await sleep(80);

    const blob = new Blob(chunks);
    return URL.createObjectURL(blob);
  }

  // =============================================
  //  INICIAR JUEGO
  // =============================================
  async function startGame(game) {
    menu.style.display = "none";
    loading.style.display = "flex";
    const spinner = loading.querySelector(".spinner");
    if (spinner) spinner.style.display = "block";
    btnBack.style.display = "none";
    gameContainer.style.display = "block";
    progressWrap.style.display = "block";
    progressBar.style.width = "5%";
    progressLabel.style.color = "#94a3b8";
    setStatus("Preparando...", game.name);

    const errBtn = document.getElementById("btn-error-back");
    if (errBtn) errBtn.remove();

    // Limpiar partida anterior
    const gameDiv = document.getElementById("game");
    if (gameDiv) gameDiv.innerHTML = "";
    if (window.__currentBlobUrl) {
      try {
        URL.revokeObjectURL(window.__currentBlobUrl);
      } catch (e) {}
      window.__currentBlobUrl = null;
    }
    document.querySelectorAll("script[data-ejs]").forEach((s) => s.remove());
    window.__ejsLoaded = false;

    try {
      let romUrl = game.rom;

      const needsDownload =
        game.rom.startsWith("http") ||
        game.rom.startsWith("/files") ||
        (game.sizeMB || 0) >= 2;

      if (needsDownload) {
        setStatus("Descargando ROM...", game.name);
        await sleep(50);
        romUrl = await downloadRomWithProgress(game.rom, game.sizeMB);
        window.__currentBlobUrl = romUrl;
      } else {
        setStatus("Cargando ROM local...", formatSize(game.sizeMB) || game.name);
        progressBar.style.width = "40%";
        await sleep(150);
      }

      setStatus("ROM lista", "Configurando emulador...");
      progressBar.style.width = "50%";
      await sleep(100);

      setStatus(
        "Cargando núcleo " + String(game.core).toUpperCase() + "...",
        "En móvil puede tardar varios segundos"
      );
      progressBar.style.width = "55%";
      await sleep(100);

      const timeoutMs = game.core === "psx" ? 120000 : 60000;
      if (loadTimeout) clearTimeout(loadTimeout);
      loadTimeout = setTimeout(() => {
        showError(
          "El emulador se quedó cargando",
          game.core === "psx"
            ? "PSX en móvil suele fallar con ROMs grandes por memoria. Prueba en PC o usa una ROM .chd más ligera."
            : "Tiempo de espera agotado. Vuelve al menú e inténtalo de nuevo."
        );
      }, timeoutMs);

      // Configuración EmulatorJS
      window.EJS_player = "#game";
      window.EJS_core = game.core;
      window.EJS_gameUrl = romUrl;
      window.EJS_pathtodata = "/emulatorjs/stable/data/";
      window.EJS_startOnLoaded = true;
      window.EJS_color = "#000000";
      window.EJS_gameID = game.id;
      window.EJS_gameName = game.name;

      // Controles por juego
      const layout =
        typeof CONTROL_LAYOUTS !== "undefined"
          ? CONTROL_LAYOUTS[game.controls] || CONTROL_LAYOUTS.default
          : null;

      if (layout) {
        window.EJS_VirtualGamepadSettings = layout;
      } else {
        delete window.EJS_VirtualGamepadSettings;
      }

      // Netplay manual
      window.EJS_netplayServer = "https://netplay.emulatorjs.org/";
      window.EJS_netplayICEServers = [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
      ];

      if (window.discordUser && window.discordUser.username) {
        window.EJS_playerName = window.discordUser.username;
      }

      // Cuando el juego arranca de verdad
      window.EJS_onGameStart = function () {
        if (loadTimeout) {
          clearTimeout(loadTimeout);
          loadTimeout = null;
        }
        loading.style.display = "none";
        btnBack.style.display = "block";
        console.log("✅ Juego iniciado:", game.name);
        setTimeout(fixControlPositions, 400);
        setTimeout(fixControlPositions, 1200);
      };

      setStatus("Iniciando emulador...", "Cargando scripts y WASM");
      progressBar.style.width = "65%";
      await sleep(50);

      const script = document.createElement("script");
      script.src = `/emulatorjs/stable/data/loader.js?v=${VERSION}`;
      script.setAttribute("data-ejs", "1");
      script.onload = function () {
        window.__ejsLoaded = true;
        setStatus("Núcleo cargado", "Arrancando " + game.name + "...");
        progressBar.style.width = "85%";
      };
      script.onerror = function () {
        showError(
          "No se pudo cargar EmulatorJS",
          "Revisa el URL Mapping de /emulatorjs"
        );
      };
      document.body.appendChild(script);
    } catch (err) {
      console.error(err);
      showError("Error al preparar el juego", String(err.message || err));
    }
  }

  // =============================================
  //  POSICIÓN CONTROLES MÓVILES
  // =============================================
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
  window.backToMenu = backToMenu;
})();
