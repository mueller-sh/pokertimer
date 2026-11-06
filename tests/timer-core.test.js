const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../timer-core.js");

test("uses the requested nine blind levels", () => {
  const state = Core.createDefaultState();
  assert.equal(state.levels.length, 9);
  assert.deepEqual(state.levels.map(({ small, big, durationMinutes }) => [small, big, durationMinutes]), [
    [25, 50, 20], [50, 100, 20], [100, 200, 20], [200, 400, 20], [350, 700, 20], [500, 1000, 20],
    [750, 1500, 15], [1000, 2000, 15], [1500, 3000, 15]
  ]);
});

test("running timer is timestamp based", () => {
  const start = 1_000_000;
  const state = Core.startAt(Core.createDefaultState(), start);
  assert.equal(Core.remainingAt(state, start + 12_345), 1_200_000 - 12_345);
});

test("pause captures exact remaining time", () => {
  const start = 10_000;
  const state = Core.startAt(Core.createDefaultState(), start);
  const paused = Core.pauseAt(state, start + 30_000);
  assert.equal(paused.remainingMs, 1_170_000);
  assert.equal(paused.isRunning, false);
  assert.equal(paused.lastStartedAt, null);
});

test("expired timer advances and preserves overrun", () => {
  const start = 1000;
  const running = Core.startAt(Core.createDefaultState(), start);
  const result = Core.advanceExpired(running, start + 1_200_000 + 15_000);
  assert.equal(result.levelsAdvanced, 1);
  assert.equal(result.state.currentLevel, 1);
  assert.equal(result.state.remainingMs, 1_185_000);
  assert.equal(result.state.isRunning, true);
});

test("long background gap advances across multiple levels", () => {
  const start = 2000;
  const running = Core.startAt(Core.createDefaultState(), start);
  const result = Core.advanceExpired(running, start + 2_400_000 + 42_000);
  assert.equal(result.levelsAdvanced, 2);
  assert.equal(result.state.currentLevel, 2);
  assert.equal(result.state.remainingMs, 1_158_000);
});

test("final level ends at zero without wrapping", () => {
  let state = Core.goToLevel(Core.createDefaultState(), 8);
  state = Core.startAt(state, 5000);
  const result = Core.advanceExpired(state, 5000 + 900_001);
  assert.equal(result.complete, true);
  assert.equal(result.state.currentLevel, 8);
  assert.equal(result.state.remainingMs, 0);
  assert.equal(result.state.isRunning, false);
});

test("stored state is clamped and sanitized", () => {
  const raw = Core.createDefaultState();
  raw.currentLevel = 99;
  raw.remainingMs = 999_999_999;
  raw.settings.volume = 4;
  const state = Core.sanitizeStoredState(raw);
  assert.equal(state.currentLevel, 8);
  assert.equal(state.remainingMs, 900_000);
  assert.equal(state.settings.volume, 1);
});

test("time display rounds up partial seconds", () => {
  assert.equal(Core.formatTime(1_199_100), "20:00");
  assert.equal(Core.formatTime(1_198_999), "19:59");
  assert.equal(Core.formatTime(0), "00:00");
});
