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

  // ----- Tarjetas -----
  GAMES.forEach((game) => {
    const card = document.createElement("div");
    card.className = "game-card";
    card.innerHTML = `
      <div class="cover">
        <img src="${game.cover}" alt="${game.name}"
             onerror="this.style.display='none'; this.parentElement.textContent='🎮';" />
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

  // ----- Volver al menú -----
  function backToMenu() {
    const url = new URL(window.location.href);
    url.searchParams.set("t", Date.now());
    window.location.href = url.toString();
  }
  btnBack.addEventListener("click", (e) => { e.preventDefault(); backToMenu(); });
  btnBack.addEventListener("touchend", (e) => { e.preventDefault(); backToMenu(); });

  // ----- Descarga con progreso -----
  async function downloadRomWithProgress(url, sizeMB) {
    progressWrap.style.display = "block";
    progressBar.style.width = "0%";
    loadingText.textContent = "Descargando ROM...";
    progressLabel.textContent = sizeMB ? `0 / ${formatSize(sizeMB)}` : "Conectando...";

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const total = Number(res.headers.get("Content-Length")) || (sizeMB ? sizeMB * 1024 * 1024 : 0);
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
        progressLabel.textContent = `${recMB} MB / ${totMB} MB (${Math.round(pct)}%)`;
      } else {
        const recMB = (received / (1024 * 1024)).toFixed(1);
        progressLabel.textContent = `${recMB} MB descargados...`;
        progressBar.style.width = "50%";
      }
    }

    progressBar.style.width = "100%";
    progressLabel.textContent = "ROM descargada";
    loadingText.textContent = "Preparando juego...";

    const blob = new Blob(chunks);
    return URL.createObjectURL(blob);
  }

  // ----- Iniciar juego -----
  async function startGame(game) {
    menu.style.display = "none";
    loading.style.display = "flex";
    btnBack.style.display = "none";
    gameContainer.style.display = "block";
    progressWrap.style.display = "none";
    progressBar.style.width = "0%";
    progressLabel.textContent = "";
    loadingText.textContent = "Preparando...";

    try {
      // Descargar ROM con barra (sobre todo útil en archivos grandes)
      let romUrl = game.rom;
      const isRemote = game.rom.startsWith("http") || game.rom.startsWith("/files");
      const isLarge = (game.sizeMB || 0) >= 5;

      if (isRemote || isLarge) {
        romUrl = await downloadRomWithProgress(game.rom, game.sizeMB);
      }

      loadingText.textContent = "Cargando emulador...";
      progressLabel.textContent = game.name;

      // Config EmulatorJS
      window.EJS_player = "#game";
      window.EJS_core = game.core;
      window.EJS_gameUrl = romUrl;
      window.EJS_pathtodata = "/emulatorjs/stable/data/";
      window.EJS_startOnLoaded = true;
      window.EJS_color = "#000000";
      window.EJS_gameID = game.id;
      window.EJS_gameName = game.name;

      // Controles por juego
      const layout = CONTROL_LAYOUTS[game.controls] || CONTROL_LAYOUTS.default;
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

      if (window.discordUser?.username) {
        window.EJS_playerName = window.discordUser.username;
      }

      window.EJS_onGameStart = function () {
        loading.style.display = "none";
        btnBack.style.display = "block";
        console.log("✅ Juego iniciado:", game.name);
        setTimeout(fixControlPositions, 400);
        setTimeout(fixControlPositions, 1200);
      };

      if (!window.__ejsLoaded) {
        const script = document.createElement("script");
        script.src = "/emulatorjs/stable/data/loader.js";
        script.onload = () => { window.__ejsLoaded = true; };
        script.onerror = () => {
          loadingText.textContent = "Error cargando el emulador";
          progressLabel.textContent = "Revisa el URL Mapping /emulatorjs";
        };
        document.body.appendChild(script);
      } else {
        const url = new URL(window.location.href);
        url.searchParams.set("t", Date.now());
        window.location.href = url.toString();
      }
    } catch (err) {
      console.error(err);
      loadingText.textContent = "Error al descargar la ROM";
      progressLabel.textContent = String(err.message || err);
      progressWrap.style.display = "none";
    }
  }

  function fixControlPositions() {
    const openBtn = document.querySelector(".ejs_virtualGamepad_open");
    if (openBtn) {
      openBtn.style.top = "auto";
      openBtn.style.bottom = "220px";
      openBtn.style.right = "72px";
      openBtn.style.left = "auto";
      openBtn.style.zIndex = "100";
    }
    const rightPad = document.querySelector(".ejs_virtualGamepad_right");
    if (rightPad) {
      rightPad.style.bottom = "50px";
      rightPad.style.right = "72px";
    }
    const leftPad = document.querySelector(".ejs_virtualGamepad_left");
    if (leftPad) {
      leftPad.style.bottom = "50px";
      leftPad.style.left = "12px";
    }
  }

  window.startGame = startGame;
})();
