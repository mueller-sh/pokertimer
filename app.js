(function () {
  "use strict";

  const Core = window.PokerTimerCore;
  const STORAGE_KEY = "poker-tournament-clock-v1";
  const SAVE_INTERVAL_MS = 500;
  const elements = {};
  let state;
  let animationFrame = null;
  let saveInterval = null;
  let audioContext = null;
  let toastTimer = null;

  const ids = [
    "statusPill", "statusText", "saveStatus", "levelNumber", "levelCount", "smallBlind", "bigBlind", "countdown", "progressFill",
    "nextLevelContent", "nextSmallBlind", "nextBigBlind", "nextDuration", "tournamentComplete", "previousButton", "playPauseButton",
    "playIcon", "playLabel", "nextButton", "resetButton", "settingsButton", "fullscreenButton", "settingsDialog", "settingsForm",
    "soundEnabledInput", "volumeInput", "volumeOutput", "testSoundButton", "levelsEditor", "resetDialog", "confirmResetButton",
    "restoreBanner", "restoreContinueButton", "restoreCloseButton", "toast"
  ];

  function cacheElements() {
    ids.forEach((id) => { elements[id] = document.getElementById(id); });
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { state: Core.createDefaultState(), restored: false };
      const loaded = Core.sanitizeStoredState(JSON.parse(raw));
      const wasActive = loaded.isRunning || loaded.hasStarted || loaded.currentLevel > 0 || loaded.remainingMs < Core.durationMs(loaded.levels[loaded.currentLevel]);
      // Closed time is deliberately ignored. A recovered session always resumes paused
      // from its most recently persisted snapshot, preventing accidental catch-up.
      loaded.isRunning = false;
      loaded.lastStartedAt = null;
      loaded.savedAt = Date.now();
      return { state: loaded, restored: wasActive };
    } catch (error) {
      console.warn("Gespeicherter Turnierstand konnte nicht gelesen werden.", error);
      return { state: Core.createDefaultState(), restored: false };
    }
  }

  function persist(now = Date.now(), forcePaused = false) {
    try {
      let snapshot = { ...state };
      if (snapshot.isRunning) {
        snapshot.remainingMs = Core.remainingAt(snapshot, now);
        snapshot.lastStartedAt = forcePaused ? null : now;
        snapshot.isRunning = forcePaused ? false : true;
      }
      snapshot.savedAt = now;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      elements.saveStatus.textContent = `Gespeichert · ${new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(now)}`;
      return true;
    } catch (error) {
      elements.saveStatus.textContent = "Speichern fehlgeschlagen";
      console.warn("Turnierstand konnte nicht gespeichert werden.", error);
      return false;
    }
  }

  function syncRunningState(now = Date.now()) {
    if (!state.isRunning) return;
    state.remainingMs = Core.remainingAt(state, now);
    state.lastStartedAt = now;
    state.savedAt = now;
  }

  function updateView(now = Date.now()) {
    const level = state.levels[state.currentLevel];
    const shownRemaining = state.isRunning ? Core.remainingAt(state, now) : state.remainingMs;
    const duration = Core.durationMs(level);
    const next = state.levels[state.currentLevel + 1];

    elements.levelNumber.textContent = state.currentLevel + 1;
    elements.levelCount.textContent = state.levels.length;
    elements.smallBlind.textContent = formatChips(level.small);
    elements.bigBlind.textContent = formatChips(level.big);
    elements.countdown.textContent = Core.formatTime(shownRemaining);
    elements.countdown.classList.toggle("urgent", shownRemaining > 0 && shownRemaining <= 60_000);
    elements.progressFill.style.width = `${Math.max(0, Math.min(100, (shownRemaining / duration) * 100))}%`;
    elements.previousButton.disabled = state.currentLevel === 0;
    elements.nextButton.disabled = state.currentLevel === state.levels.length - 1;

    if (next) {
      elements.nextLevelContent.hidden = false;
      elements.tournamentComplete.hidden = true;
      elements.nextSmallBlind.textContent = formatChips(next.small);
      elements.nextBigBlind.textContent = formatChips(next.big);
      elements.nextDuration.textContent = next.durationMinutes;
    } else {
      elements.nextLevelContent.hidden = true;
      elements.tournamentComplete.hidden = false;
    }

    if (state.isRunning) {
      elements.statusPill.classList.add("running");
      elements.statusText.textContent = "Läuft";
      elements.playIcon.textContent = "Ⅱ";
      elements.playLabel.textContent = "Pause";
    } else {
      elements.statusPill.classList.remove("running");
      elements.statusText.textContent = state.hasStarted ? "Pausiert" : "Bereit";
      elements.playIcon.textContent = "▶";
      elements.playLabel.textContent = state.hasStarted ? "Fortsetzen" : "Start";
    }
  }

  function formatChips(value) {
    return new Intl.NumberFormat("de-DE").format(value);
  }

  function frame() {
    const now = Date.now();
    if (state.isRunning) {
      const transition = Core.advanceExpired(state, now);
      if (transition.levelsAdvanced > 0 || transition.complete) {
        state = transition.state;
        playGong();
        showToast(transition.complete ? "Turnierplan beendet" : `Level ${state.currentLevel + 1}: ${formatChips(state.levels[state.currentLevel].small)} / ${formatChips(state.levels[state.currentLevel].big)}`);
        persist(now);
      }
    }
    updateView(now);
    animationFrame = requestAnimationFrame(frame);
  }

  function toggleTimer() {
    const now = Date.now();
    if (state.isRunning) {
      state = Core.pauseAt(state, now);
      showToast("Timer pausiert");
    } else {
      if (state.remainingMs <= 0 && state.currentLevel === state.levels.length - 1) return;
      state = Core.startAt(state, now);
      unlockAudio();
      elements.restoreBanner.hidden = true;
    }
    persist(now);
    updateView(now);
  }

  function changeLevel(delta) {
    if (state.isRunning) syncRunningState();
    const target = state.currentLevel + delta;
    if (target < 0 || target >= state.levels.length) return;
    state = Core.goToLevel(state, target);
    persist();
    updateView();
    showToast(`Level ${state.currentLevel + 1}`);
  }

  function resetTournament() {
    const settings = { ...state.settings };
    const levels = state.levels.map((level) => ({ ...level }));
    state = Core.createDefaultState(levels);
    state.settings = settings;
    localStorage.removeItem(STORAGE_KEY);
    persist();
    elements.restoreBanner.hidden = true;
    updateView();
    showToast("Turnier wurde neu gestartet");
  }

  function unlockAudio() {
    if (!audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) audioContext = new AudioCtx();
    }
    if (audioContext?.state === "suspended") audioContext.resume();
  }

  function playGong() {
    if (!state.settings.soundEnabled || state.settings.volume <= 0) return;
    unlockAudio();
    if (!audioContext) return;
    const now = audioContext.currentTime;
    const master = audioContext.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(Math.max(0.001, state.settings.volume * 0.48), now + 0.025);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 2.7);
    master.connect(audioContext.destination);
    [196, 293.66, 392, 587.33].forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = index < 2 ? "sine" : "triangle";
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.detune.setValueAtTime(index * 2.5, now);
      gain.gain.setValueAtTime(1 / (index + 1.2), now);
      oscillator.connect(gain).connect(master);
      oscillator.start(now + index * 0.018);
      oscillator.stop(now + 2.8);
    });
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2300);
  }

  function openSettings() {
    elements.soundEnabledInput.checked = state.settings.soundEnabled;
    elements.volumeInput.value = state.settings.volume;
    elements.volumeOutput.textContent = `${Math.round(state.settings.volume * 100)} %`;
    elements.levelsEditor.replaceChildren();
    state.levels.forEach((level, index) => {
      const row = document.createElement("div");
      row.className = "level-editor-row";
      row.innerHTML = `<span>${index + 1}</span><input inputmode="numeric" type="number" min="1" max="1000000" value="${level.small}" aria-label="Level ${index + 1} Small Blind"><span>/</span><input inputmode="numeric" type="number" min="1" max="1000000" value="${level.big}" aria-label="Level ${index + 1} Big Blind"><input inputmode="numeric" type="number" min="1" max="180" value="${level.durationMinutes}" aria-label="Level ${index + 1} Dauer in Minuten">`;
      elements.levelsEditor.appendChild(row);
    });
    elements.settingsDialog.showModal();
  }

  function saveSettings(event) {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    const rows = [...elements.levelsEditor.querySelectorAll(".level-editor-row")];
    const levels = rows.map((row) => {
      const inputs = row.querySelectorAll("input");
      return { small: Number(inputs[0].value), big: Number(inputs[1].value), durationMinutes: Number(inputs[2].value) };
    });
    if (levels.some((level) => !Number.isFinite(level.small) || !Number.isFinite(level.big) || !Number.isFinite(level.durationMinutes) || level.small < 1 || level.big < 1 || level.durationMinutes < 1 || level.durationMinutes > 180)) {
      showToast("Bitte alle Werte prüfen");
      return;
    }
    if (state.isRunning) syncRunningState();
    state.levels = levels;
    state.settings = { soundEnabled: elements.soundEnabledInput.checked, volume: Number(elements.volumeInput.value) };
    state.remainingMs = Math.min(state.remainingMs, Core.durationMs(state.levels[state.currentLevel]));
    persist();
    updateView();
    elements.settingsDialog.close();
    showToast("Einstellungen gespeichert");
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (error) {
      showToast("Vollbild ist in diesem Browser nicht verfügbar");
    }
  }

  function bindEvents() {
    elements.playPauseButton.addEventListener("click", toggleTimer);
    elements.previousButton.addEventListener("click", () => changeLevel(-1));
    elements.nextButton.addEventListener("click", () => changeLevel(1));
    elements.settingsButton.addEventListener("click", openSettings);
    elements.fullscreenButton.addEventListener("click", toggleFullscreen);
    elements.resetButton.addEventListener("click", () => elements.resetDialog.showModal());
    elements.confirmResetButton.addEventListener("click", resetTournament);
    elements.settingsForm.addEventListener("submit", saveSettings);
    elements.volumeInput.addEventListener("input", () => { elements.volumeOutput.textContent = `${Math.round(Number(elements.volumeInput.value) * 100)} %`; });
    elements.testSoundButton.addEventListener("click", () => {
      const previous = state.settings;
      state.settings = { soundEnabled: elements.soundEnabledInput.checked, volume: Number(elements.volumeInput.value) };
      playGong();
      state.settings = previous;
    });
    elements.restoreContinueButton.addEventListener("click", toggleTimer);
    elements.restoreCloseButton.addEventListener("click", () => { elements.restoreBanner.hidden = true; });
    document.addEventListener("keydown", (event) => {
      if (document.querySelector("dialog[open]") || ["INPUT", "BUTTON"].includes(document.activeElement?.tagName)) return;
      if (event.code === "Space") { event.preventDefault(); toggleTimer(); }
      if (event.code === "ArrowLeft") { event.preventDefault(); changeLevel(-1); }
      if (event.code === "ArrowRight") { event.preventDefault(); changeLevel(1); }
    });
    window.addEventListener("pagehide", () => persist(Date.now(), true));
    window.addEventListener("beforeunload", () => persist(Date.now(), true));
    window.addEventListener("storage", (event) => {
      if (event.key === STORAGE_KEY && event.newValue && !state.isRunning) {
        state = Core.sanitizeStoredState(JSON.parse(event.newValue));
        state.isRunning = false;
        state.lastStartedAt = null;
        updateView();
      }
    });
  }

  function init() {
    cacheElements();
    const loaded = loadState();
    state = loaded.state;
    bindEvents();
    updateView();
    persist();
    if (loaded.restored) elements.restoreBanner.hidden = false;
    animationFrame = requestAnimationFrame(frame);
    saveInterval = setInterval(() => {
      if (state.isRunning) {
        syncRunningState();
        persist();
      }
    }, SAVE_INTERVAL_MS);
  }

  init();
})();
