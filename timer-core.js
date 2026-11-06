(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PokerTimerCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_LEVELS = [
    { small: 25, big: 50, durationMinutes: 20 },
    { small: 50, big: 100, durationMinutes: 20 },
    { small: 100, big: 200, durationMinutes: 20 },
    { small: 200, big: 400, durationMinutes: 20 },
    { small: 350, big: 700, durationMinutes: 20 },
    { small: 500, big: 1000, durationMinutes: 20 },
    { small: 750, big: 1500, durationMinutes: 15 },
    { small: 1000, big: 2000, durationMinutes: 15 },
    { small: 1500, big: 3000, durationMinutes: 15 }
  ];

  function cloneLevels(levels) {
    return levels.map((level) => ({ ...level }));
  }

  function durationMs(level) {
    return Math.max(1, Number(level.durationMinutes)) * 60 * 1000;
  }

  function createDefaultState(levels = DEFAULT_LEVELS) {
    const safeLevels = cloneLevels(levels);
    return {
      schemaVersion: 1,
      currentLevel: 0,
      remainingMs: durationMs(safeLevels[0]),
      isRunning: false,
      lastStartedAt: null,
      savedAt: Date.now(),
      hasStarted: false,
      levels: safeLevels,
      settings: { soundEnabled: true, volume: 0.75 }
    };
  }

  function remainingAt(state, now) {
    if (!state.isRunning || !state.lastStartedAt) return Math.max(0, state.remainingMs);
    return Math.max(0, state.remainingMs - Math.max(0, now - state.lastStartedAt));
  }

  function pauseAt(state, now) {
    return { ...state, remainingMs: remainingAt(state, now), isRunning: false, lastStartedAt: null, savedAt: now };
  }

  function startAt(state, now) {
    if (state.remainingMs <= 0) return state;
    return { ...state, isRunning: true, lastStartedAt: now, savedAt: now, hasStarted: true };
  }

  function goToLevel(state, targetIndex) {
    const index = Math.max(0, Math.min(state.levels.length - 1, targetIndex));
    return {
      ...state,
      currentLevel: index,
      remainingMs: durationMs(state.levels[index]),
      isRunning: false,
      lastStartedAt: null,
      savedAt: Date.now(),
      hasStarted: state.hasStarted || index > 0
    };
  }

  function advanceExpired(state, now) {
    if (!state.isRunning) return { state, levelsAdvanced: 0, complete: false };
    let overrun = Math.max(0, now - state.lastStartedAt - state.remainingMs);
    if (now - state.lastStartedAt < state.remainingMs) return { state, levelsAdvanced: 0, complete: false };
    let index = state.currentLevel;
    let advanced = 0;
    while (index < state.levels.length - 1) {
      index += 1;
      advanced += 1;
      const nextDuration = durationMs(state.levels[index]);
      if (overrun < nextDuration) {
        return {
          state: { ...state, currentLevel: index, remainingMs: nextDuration - overrun, lastStartedAt: now, savedAt: now, hasStarted: true },
          levelsAdvanced: advanced,
          complete: false
        };
      }
      overrun -= nextDuration;
    }
    return {
      state: { ...state, currentLevel: index, remainingMs: 0, isRunning: false, lastStartedAt: null, savedAt: now, hasStarted: true },
      levelsAdvanced: advanced,
      complete: true
    };
  }

  function formatTime(milliseconds) {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function sanitizeStoredState(raw) {
    const fallback = createDefaultState();
    if (!raw || raw.schemaVersion !== 1 || !Array.isArray(raw.levels) || raw.levels.length === 0) return fallback;
    const levels = raw.levels.map((item, index) => ({
      small: Math.max(1, Number(item.small) || DEFAULT_LEVELS[index]?.small || 1),
      big: Math.max(1, Number(item.big) || DEFAULT_LEVELS[index]?.big || 2),
      durationMinutes: Math.max(1, Math.min(180, Number(item.durationMinutes) || DEFAULT_LEVELS[index]?.durationMinutes || 20))
    }));
    const currentLevel = Math.max(0, Math.min(levels.length - 1, Number(raw.currentLevel) || 0));
    const maxDuration = durationMs(levels[currentLevel]);
    return {
      ...fallback,
      ...raw,
      levels,
      currentLevel,
      remainingMs: Math.max(0, Math.min(maxDuration, Number(raw.remainingMs) || 0)),
      isRunning: Boolean(raw.isRunning),
      lastStartedAt: Number.isFinite(raw.lastStartedAt) ? raw.lastStartedAt : null,
      settings: {
        soundEnabled: raw.settings?.soundEnabled !== false,
        volume: Math.max(0, Math.min(1, Number(raw.settings?.volume ?? 0.75)))
      }
    };
  }

  return { DEFAULT_LEVELS, createDefaultState, durationMs, remainingAt, pauseAt, startAt, goToLevel, advanceExpired, formatTime, sanitizeStoredState };
});
