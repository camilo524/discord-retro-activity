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

  function isInDiscord() {
    const h = location.hostname;
    return (
      h.includes("discordsays.com") ||
      h.includes("discordapigateway.com") ||
      h.endsWith("discord.com")
    );
  }

  function resolveFileUrl(pathOrUrl) {
    if (!pathOrUrl) return "";

    if (/^https?:\/\//i.test(pathOrUrl)) {
      if (isInDiscord() && pathOrUrl.includes("files.camiloh.co")) {
        const name = pathOrUrl.split("/").pop().split("?")[0];
        return `/files/${name}?v=${VERSION}`;
      }
      return pathOrUrl;
    }

    const name = pathOrUrl
      .replace(/^\/files\//, "")
      .replace(/^\//, "")
      .split("?")[0];

    if (isInDiscord()) {
      return `/files/${name}?v=${VERSION}`;
    }
    return `https://files.camiloh.co/${name}?v=${VERSION}`;
  }

  function fileNameFromPath(pathOrUrl) {
    return String(pathOrUrl).split("?")[0].split("/").pop() || "game.bin";
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
  //  VOLVER AL MENÚ
  // =============================================
  function backToMenu() {
    if (loadTimeout) {
      clearTimeout(loadTimeout);
      loadTimeout = null;
    }

    const gameDiv = document.getElementById("game");
    if (gameDiv) gameDiv.innerHTML = "";

    if (window.__currentBlobUrl) {
      try {
        URL.revokeObjectURL(window.__currentBlobUrl);
      } catch (e) {}
      window.__currentBlobUrl = null;
    }

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
  async function downloadRomWithProgress(url, sizeMB, fileName) {
    progressWrap.style.display = "block";
    progressBar.style.width = "0%";
    setStatus(
      "Descargando ROM...",
      sizeMB ? `0 / ${formatSize(sizeMB)}` : "Conectando..."
    );

    const res = await fetch(url, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store"
    });
    if (!res.ok) {
      throw new Error(`No se pudo descargar (HTTP ${res.status})`);
    }

    const ct = (res.headers.get("Content-Type") || "").toLowerCase();
    if (ct.includes("text/html")) {
      throw new Error(
        "La URL devolvió HTML en lugar del ROM. Revisa /files vs files.camiloh.co"
      );
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
    const name = fileName || "game.bin";
    const file = new File([blob], name, {
      type: "application/octet-stream"
    });
    return URL.createObjectURL(file);
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
      const resolvedRom = resolveFileUrl(game.rom);
      const resolvedBios = game.bios ? resolveFileUrl(game.bios) : "";
      let romUrl = resolvedRom;

      // PSX / muy grandes: URL directa (no blob en RAM)
      const isHuge =
        game.core === "psx" ||
        game.core === "psp" ||
        (game.sizeMB || 0) >= 80;

      const needsDownload =
        !isHuge &&
        (resolvedRom.startsWith("http") ||
          resolvedRom.startsWith("/files") ||
          (game.sizeMB || 0) >= 2);

      if (needsDownload) {
        setStatus("Descargando ROM...", game.name);
        await sleep(50);
        const fname = fileNameFromPath(game.rom);
        romUrl = await downloadRomWithProgress(
          resolvedRom,
          game.sizeMB,
          fname
        );
        window.__currentBlobUrl = romUrl;
      } else {
        setStatus(
          isHuge ? "ROM grande: carga directa..." : "Cargando ROM...",
          formatSize(game.sizeMB) || game.name
        );
        progressBar.style.width = "45%";
        await sleep(150);
        romUrl = resolvedRom;
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

      const timeoutMs = game.core === "psx" ? 180000 : 60000;
      if (loadTimeout) clearTimeout(loadTimeout);
      loadTimeout = setTimeout(() => {
        showError(
          "El emulador se quedó cargando",
          game.core === "psx"
            ? "PSX en móvil suele fallar con ROMs grandes. Prueba en PC o un .chd más ligero."
            : "Tiempo de espera agotado. Vuelve al menú e inténtalo de nuevo."
        );
      }, timeoutMs);

      const EJS_BASE =
        location.hostname.endsWith("discordsays.com") ||
        location.hostname.endsWith("discordapigateway.com")
          ? "/emulatorjs/stable/data/"
          : "https://cdn.emulatorjs.org/stable/data/";

      window.EJS_player = "#game";
      window.EJS_core = game.core;
      window.EJS_gameUrl = romUrl;
      window.EJS_biosUrl = resolvedBios;
      window.EJS_pathtodata = EJS_BASE;
      window.EJS_startOnLoaded = true;
      window.EJS_color = "#000000";
      window.EJS_gameID = game.id;
      window.EJS_gameName = game.name;

      const layout =
        typeof CONTROL_LAYOUTS !== "undefined"
          ? CONTROL_LAYOUTS[game.controls] || CONTROL_LAYOUTS.default
          : null;

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

      if (window.discordUser && window.discordUser.username) {
        window.EJS_playerName = window.discordUser.username;
      }

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
      script.src = `${EJS_BASE}loader.js?v=${VERSION}`;
      script.setAttribute("data-ejs", "1");
      script.onload = function () {
        window.__ejsLoaded = true;
        setStatus("Núcleo cargado", "Arrancando " + game.name + "...");
        progressBar.style.width = "85%";
      };
      script.onerror = function () {
        showError(
          "No se pudo cargar EmulatorJS",
          "Revisa el URL Mapping de /emulatorjs o la conexión al CDN"
        );
      };
      document.body.appendChild(script);
    } catch (err) {
      console.error(err);
      showError("Error al preparar el juego", String(err.message || err));
    }
  }

  // =============================================
  //  CONTROLES MÓVILES
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
