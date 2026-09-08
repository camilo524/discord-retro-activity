// =============================================
//  MÚSICA DE MENÚ
//  Suena en la pantalla de selección de juegos,
//  se detiene al entrar a un juego y vuelve a
//  sonar al regresar al menú.
//
//  Música: 4RM0R
//
//  Módulo separado de emulator.js a propósito:
//  esto solo sabe de audio, no de juegos ni de
//  Discord. emulator.js solo lo invoca.
// =============================================
(function () {
  const audio = document.getElementById("menu-music");
  if (!audio) return;

  let unlocked = false;

  function tryPlay() {
    // Los navegadores bloquean el audio con sonido hasta que haya
    // una interacción real del usuario (clic, tap, tecla). Si el
    // intento falla en silencio (autoplay bloqueado), no pasa nada:
    // se reintenta en el primer gesto real más abajo.
    const p = audio.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  }

  function playMenuMusic() {
    if (audio.paused) tryPlay();
  }

  function stopMenuMusic() {
    audio.pause();
    audio.currentTime = 0;
  }

  // Primer gesto del usuario en toda la página: es el momento en que
  // los navegadores SÍ permiten empezar a reproducir audio con sonido.
  function unlockOnce() {
    if (unlocked) return;
    unlocked = true;
    const menu = document.getElementById("menu");
    // Solo arranca si en ese momento seguimos en el menú (el usuario
    // no le dio clic todavía a ningún juego).
    if (menu && menu.style.display !== "none") {
      tryPlay();
    }
  }
  document.addEventListener("pointerdown", unlockOnce, { once: true });
  document.addEventListener("keydown", unlockOnce, { once: true });

  // Intento inmediato: en algunos navegadores/contextos puede que sí
  // se permita. Si no, no truena error, simplemente espera el gesto.
  tryPlay();

  window.playMenuMusic = playMenuMusic;
  window.stopMenuMusic = stopMenuMusic;
})();
