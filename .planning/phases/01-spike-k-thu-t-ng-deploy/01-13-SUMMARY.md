---
phase: 01-spike-k-thu-t-ng-deploy
plan: 13
subsystem: audio
tags: [web-audio, sfx, mp3, ios-unlock, play-gate, playwright, vitest, tdd]
requires:
  - "01-05: 11 MP3 SFX in src/assets/sfx (ffmpeg-static pipeline)"
  - "01-09: onPlayGesture fullscreen registration in main.ts, lazy post-detect imports"
  - "01-02/01-10: LoadTask, runLoadTasks, fetchWithProgress, registerDebug"
provides:
  - "src/logic/sfxNames.ts: sfxNameFromPath(p), variantsOf(names, prefix), pickVariant(names, prefix, rng)"
  - "src/audio/sfx.ts: unlockFromGesture(), sfxLoadTask() (id 'sfx', weight 5), playSfx(name, { gain, rate }), sfxNames(), audioState()"
  - "window.__bt.audio: { state, decoded, requests, played (last 20 started), failed, names }"
  - "Start cue drop-soft-0 at gain 0.6 after unlock"
affects: [01-15, 01-16]
tech-stack:
  added: []
  patterns:
    - "Fetch MP3 ArrayBuffers during loading, create the AudioContext and decode only after the Chơi gesture (no context before the gesture, so no autoplay warning)"
    - "resume() + 1-sample silent buffer run before any await inside the play-gate click"
    - "Per-play BufferSource + GainNode, disconnected on 'ended'; decoded buffers shared"
key-files:
  created: [src/logic/sfxNames.ts, src/audio/sfx.ts, tests/unit/sfxNames.test.ts, tests/e2e/audio.spec.ts]
  modified: [src/main.ts]
decisions:
  - "01-13: variantsOf matches only `${prefix}-<digits>` sorted numerically, so 'drop' matches nothing and 'break-glass' never includes 'break-ceramic-*'"
  - "01-13: __bt.audio.requests counts every playSfx call; played lists only sounds actually started (last 20), so a locked/suspended request never looks like sound"
  - "01-13: unlockFromGesture is registered BEFORE requestFullscreenIfSupported; the fullscreen request may consume transient activation"
  - "01-13: a failed SFX fetch/decode warns and counts in __bt.audio.failed instead of failing boot; audio e2e requires decoded >= 10"
  - "01-13: the sfx module is a lazy import next to loading/assets/playGate (own 3.95 KB chunk), so the index chunk and the unsupported path stay free of it"
metrics:
  duration: "~15 min (07:32Z to 07:47Z)"
  completed: 2026-09-15
  tasks: 2
  files: 5
---

# Phase 1 Plan 13: Audio unlock on Chơi + MP3 SFX module Summary

Tapping Chơi now unlocks Web Audio with hand-rolled code and no library. Inside the click handler, before any `await`, it creates the AudioContext, calls `resume()` and starts a 1-sample silent buffer. It then decodes the 11 MP3 SFX that were fetched as ArrayBuffers during loading and plays `drop-soft-0` at gain 0.6 as the start cue. The context suspends when the tab hides and resumes when it becomes visible again, or on the next pointer gesture after an `interrupted`/`suspended` state. The Safari audio session type is never touched. Under `?autoplay=1` no context is ever created, so the state stays `locked`.

Full local suite after the last task commit:

- `npx tsc --noEmit`: rc 0, 0 bytes of output
- Vitest: **230/230** (20 files; 01-11 had 214, this plan adds 16)
- `npm run build`: rc 0
- Playwright: **46 passed / 30 skipped / 0 failed** (01-11 had 43 passed; this plan adds 3 audio tests)
- `npm run size`: `SIZE_GATE_OK totalRaw=6813274 files=32`, audio group 11 files at 62.9 KB raw
- First load: **3,274,320 bytes (3.3 MB)**, up from 3,207,354. The +66,966 bytes are the 11 MP3s plus the 3.95 KB `sfx-*.js` chunk, all fetched before Chơi as the plan requires.

## Task 1: SFX name helpers (commits 3bcd56a RED, 3f34f0d GREEN + failing e2e)

- `tests/unit/sfxNames.test.ts` has 16 cases:
  - the path forms from the plan, plus query/hash, backslashes and a bare name
  - numeric sort (`slap-10` after `slap-2`), literal regex characters in the prefix, no mutation of the input
  - `break-glass` excludes `break-ceramic-0`, and a partial prefix (`drop`, `sla`) matches nothing
  - pickVariant with rng 0 → first, 0.999 → last, 0.5 → middle, and 1 / -0.2 / NaN clamped; an unknown prefix returns null
- RED: vitest rc 1 because `src/logic/sfxNames` could not be resolved. Committed as `test(01-13)`.
- GREEN verify script output: `UNIT_RC=0` (16 passed), `BUILD_RC=0`, `UNIT_GREEN`, `E2E_RC=1`, 3 failed, `E2E_RED`. The failures were the expected missing `__bt.audio` assertions, not "No tests found". `grep -c "from 'three'\|document\." src/logic/sfxNames.ts` printed 0.
- `tests/e2e/audio.spec.ts` (desktop only) has 3 tests:
  1. `./?npcs=0` checks `locked` and `decoded 0` before Chơi, with at least 10 MP3 requests already made. After the click it polls for up to 1000 ms until `running`, `decoded >= 10` and `played` contains `drop-soft-0`. Every MP3 URL must be same-origin, and `offOrigin`/`errors` must be empty.
  2. `./?autoplay=1` reaches `playing` and waits 500 ms more. The state must be `locked`, `decoded 0`, `played []` and `requests` a number, with no errors.
  3. After Chơi, overriding `visibilityState`/`hidden` to hidden and dispatching `visibilitychange` gives `suspended`; setting visible again gives `running`.

## Task 2: Web Audio module and boot wiring (commit 74a11b7)

- The plan's verify command (typecheck, vitest, vite build, then Playwright audio + smoke + csp + camera + controls) returned rc 0: 30 passed, 16 skipped, 0 lines containing " failed". The audio tests took 728 ms / 1.3 s / 500 ms.
- Acceptance checks:
  - `grep -c audioSession src/audio/sfx.ts` gives 0. The first run printed 1 because a header comment named the API, so the comment was reworded before the commit.
  - `new Audio(` in src gives 0, and `.ogg` in src gives 0.
  - `onPlayGesture(unlockFromGesture` is at main.ts:59.
  - The check for `game/assets.ts|game/game.ts|game/loop.ts` in the task commit gives 0.
- **Mutation check** (temporary): the start cue was renamed to a missing name and the hide handler was replaced by a no-op, then the app was rebuilt and the audio spec run. Test 1 failed (`Expected "drop-soft-0", Received []`), test 3 failed (`Expected "suspended", Received "running"`), and test 2 passed. The file was then restored from backup, confirmed identical with `cmp`, and rebuilt.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correctness] Audio unlock registered before fullscreen, not after it**
- **Found during:** Task 2
- **Issue:** The plan says to register the unlock "next to the fullscreen registration". `requestFullscreen` may consume the transient user activation, and the iOS unlock must happen inside that gesture.
- **Fix:** `onPlayGesture(unlockFromGesture)` is registered right before `onPlayGesture(requestFullscreenIfSupported)`. Both still run synchronously in the same click.
- **Files modified:** src/main.ts
- **Commit:** 74a11b7

**2. [Rule 3 - Blocking] sfx module loaded lazily**
- **Issue:** A static import in main.ts would put the module into the index chunk and onto the unsupported path (carry-forward rule from 01-02/01-09).
- **Fix:** It joins the existing `Promise.all` of loading/assets/playGate and gets its own 3.95 KB chunk. The index chunk is 7.48 KB.
- **Commit:** 74a11b7

**3. [Rule 2 - Robustness] Additions beyond the spec**
- A failed SFX fetch or decode logs `console.warn` and counts in `__bt.audio.failed`. It never rejects the load task, because a missing sound should not block the game. The e2e still requires at least 10 decoded files.
- `played` records only sounds that actually started, while `requests` counts every call. The plan's wording ("records the name… and silently returns") could have let a locked request show up in `played`.
- `playSfx` clamps gain to [0, 2] and rate to [0.25, 4], and ignores unknown or undecoded names.
- The context falls back to `webkitAudioContext`. Without either API it logs a warning and stays `locked`.
- The resume-on-gesture listener covers both `pointerdown` and `pointerup`, because iOS counts touch-end as activation. It does nothing while the tab is hidden.
- `__bt.audio` also exposes `names` for the slap and breakables plans.
- **Commit:** 74a11b7

**4. [Test addition]** Test 1 also asserts `locked`/`decoded 0` before the tap, which proves nothing is decoded or unlocked before the gesture. The unit tests include numeric-sort, regex-literal and clamping cases.

## Observations for the verifier / end-of-phase human check

- `?npcs=0` is used as the plan specifies, but no code reads it yet (NPCs arrive in 01-15). It is harmless.
- Headless Chromium runs the context muted, so the e2e proves state, decoding and start calls but not audible output. Audible output, the silent switch, and the `interrupted` recovery after a call or backgrounding exist only on a real iPhone.
- The start cue waits for all 11 decodes and for `resume()`. If Safari is still resuming when decoding ends, `playSfx` drops the cue silently by design. If the operator hears no thud on the iPhone while `__bt.audio.state` is `running`, look here first.
- Returning to a visible tab resumes audio while the game itself stays paused (01-08 rule). No sounds play while paused, because nothing calls `playSfx` yet.

## Human check (deferred, human_verify_mode end-of-phase)

On the iPhone (Safari, silent switch OFF) and the Android phone, open the deployed URL and tap Chơi, then switch apps and come back. Expected: a soft thud right after Chơi, nothing before the tap, and sound still working after returning. **TECH-01 and TECH-06 stay open** (shared requirements / real devices), as the operator instructed.

## Known Stubs

None. `playSfx` has no gameplay callers yet by design; plans 01-15 (slap) and 01-16 (breakables) will call `playSfx` / `pickVariant`.

## Threat Flags

None. The only new surface is output-only Web Audio playing same-origin committed MP3s. The plan's threats are handled as follows:

- **T-01-13-01:** mitigated. No microphone or capture API is used.
- **T-01-13-02:** mitigated. Nodes are created per play and disconnected on `ended`, and each buffer is decoded once (its ArrayBuffer is dropped from the pending map).
- **T-01-13-03:** accepted. URLs come only from `import.meta.glob` build output, and CSP `connect-src 'self'` applies.

## TDD Gate Compliance

RED `test(01-13)` 3bcd56a, then GREEN `feat(01-13)` 3f34f0d (helpers, failing e2e) and 74a11b7 (audio module, e2e green). No refactor commit was needed.

## Self-Check: PASSED

- Created files exist: src/logic/sfxNames.ts, src/audio/sfx.ts, tests/unit/sfxNames.test.ts, tests/e2e/audio.spec.ts. Modified: src/main.ts.
- Commits 3bcd56a, 3f34f0d and 74a11b7 appear in `git log`.
- The mutation backup was restored and confirmed identical with `cmp`. The working tree was clean after the full suite.
