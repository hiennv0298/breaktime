---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 01-08-PLAN.md
last_updated: "2026-09-15T05:32:51.010Z"
last_activity: 2026-09-15 -- Completed 01-08 (floating joystick left half + context button multi-touch + Escape/Space/pause-button pause with menu and hidden-tab auto-pause; Vitest 163/163, Playwright 24 passed 0 failed, size gate OK)
progress:
  total_phases: 8
  completed_phases: 0
  total_plans: 21
  completed_plans: 8
  percent: 38
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-14)

**Core value:** Một "ngày làm việc" 5–8 phút phải buồn cười và căng thẳng đúng lúc, chạy mượt trên điện thoại tầm trung.
**Current focus:** Phase 1 — Spike kỹ thuật & đường deploy

## Current Position

Phase: 1 (Spike kỹ thuật & đường deploy) — EXECUTING
Plan: 9 of 21
Status: Ready to execute
Last activity: 2026-09-15 -- Completed 01-08 (floating joystick left half + context button multi-touch + Escape/Space/pause-button pause with menu and hidden-tab auto-pause; Vitest 163/163, Playwright 24 passed 0 failed, size gate OK)

Progress: [████░░░░░░] 38%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

*Updated after each plan completion*
| Phase 01 P01 | 6min | 3 tasks | 16 files |
| Phase 01 P02 | 18min | 2 tasks | 17 files |
| Phase 01 P04 | 35min | 3 tasks | 13 files |
| Phase 01 P05 | 8min | 2 tasks | 35 files |
| Phase 01 P03 | 10min | 2 tasks | 10 files |
| Phase 01 P06 | 16min | 2 tasks | 10 files |
| Phase 01 P07 | 23min | 2 tasks | 9 files |
| Phase 01 P08 | 17min | 3 tasks | 14 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Init]: Three.js + Rapier, không Unity — chờ Phase 1 đo thật trên máy
- [Init]: Solo dev + Claude, asset CC0, CrazyGames Basic Launch là đích đầu
- [Init]: Deploy thử là static site sau Caddy của stack `doibung` trên VPS `ssh doibung`
- [Phase 01]: 01-01: operator approved all 11 pinned packages incl. vitest@5.0.0, ffmpeg-static@5.3.0 (GPL dev-only, D-25) and @types/node@22.20.2 before install; RESEARCH audit Rejected row for ffmpeg-static superseded
- [Phase 01]: 01-01: buildInfo reads __BUILD_SHA__ via typeof guard so testHook imports in Vitest/Node; e2e proves real sha in bundle
- [Phase 01]: 01-01: window.__bt is a non-configurable null-prototype object with getter-only keys; testHook declines HMR
- [Phase 01]: 01-02: csp.spec waits for ready-to-play instead of booting (boot leaves booting synchronously); the wait also proves Rapier WASM instantiates under the CSP
- [Phase 01]: 01-02: three, Rapier and loading/playGate are dynamic imports after detect(); unsupported path downloads only index JS + CSS (3 requests measured)
- [Phase 01]: 01-02: SIMD Rapier module cast to RapierApi (typeof rapier3d-compat); identical .d.ts but nominally distinct classes
- [Phase 01]: 01-04: apply nonce is taken with atomic mv before comparison, so any attempt burns it and concurrent applies cannot share it
- [Phase 01]: 01-04: rollback approval code binds NEED_* to ROLLBACK:<dir>, so an apply code can never approve a rollback (shared nonce file)
- [Phase 01]: 01-04: preflight also fails when caddy image tag moved off the running image or nodb compose does not render; recreate adds --pull never
- [Phase 01]: 01-04: auto-rollback only when doibung.com is not 200 within 60 s; other post-recreate failures exit 6 with the token-gated rollback command
- [Phase 01]: 01-05: asset-map.json paths are relative to each pack folder; 6 Furniture Kit substitutions (kitchenCoffeeMachine, kitchenFridge, kitchenCabinet, plantSmall1, bookcaseClosed, cardboardBoxClosed) recorded in _notes
- [Phase 01]: 01-05: office-index.json keeps Kenney root node names (desk(Clone)…); build fails when a role root is missing or not unique in the output GLB
- [Phase 01]: 01-05: meshopt quantization puts each character/office mesh on an unnamed child of the named node; animations still target named parts, so look up parts by name and do not expect .isMesh on them
- [Phase 01]: 01-03: PlayerBody.move(desired, dt) takes the horizontal step translation in metres; dt only drives internal gravity (reset when computedGrounded)
- [Phase 01]: 01-03: camera distance 11 / pitch 55 kept as planned (01-09 pins them) although 1280x720 frames nearly the full room width, not half; flagged for end-of-phase human check
- [Phase 01]: 01-03: facing yaw convention direction (-sin yaw, -cos yaw) = moveMath forward; push impulse 4*m along facing + 1.5*m up within 1.5 m XZ
- [Phase 01]: 01-06: release.sh cleanup exits 7 (__CURRENT_MOVED__) when current moved; it skips symlinked names and paths that resolve to the current target
- [Phase 01]: 01-06: first-load spec stops at ready-to-play (3,099,063 bytes); about 0.54 MB of three/renderer chunks load after Chơi and are not counted
- [Phase 01]: 01-06: SIZE-REASON.md must contain the first-load total as x.y MB or exact bytes to turn >8 MB into warn
- [Phase 01]: 01-07: DNS preflight strict — every resolver must return only 187.53.128.67; an extra A record fails
- [Phase 01]: 01-07: deploy clean-tree guard also covers public/ and tests/ (--untracked-files=all); HEAD re-checked before upload; dist/version.json sha must equal HEAD
- [Phase 01]: 01-07: failure after activation (steps 13-17) exits 1 but leaves the new release current; no automatic rollback
- [Phase 01]: 01-08: pauseFor(r) overwrites the reason; resume only via menu, Escape/Space or pause button (returning to a visible tab stays paused); interact queued while paused is dropped
- [Phase 01]: 01-08: #touch-zone covers the canvas, so desktop click-on-object (D-20) must listen on #touch-zone or window, not the canvas
- [Phase 01]: 01-08: CDP touchEnd releases every finger; e2e helper lifts one of several fingers with a touchMove that omits it

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 1] **Model máy đo chưa ghi**: operator có Android tầm trung + iPhone (01-CONTEXT D-06) — phải ghi model/OS/trình duyệt trước lần đo đầu
- [Phase 1] **DNS `A breaktime → 187.53.128.67`** là việc tay của operator, phải xong trước khi deploy lần đầu (D-01)
- [Phase 1] Gắn game vào Caddy: sửa **trực tiếp trên VPS qua `ssh doibung`**, không sửa repo `d:\whattoeat` (D-02) + recreate caddy doibung 1 lần — kiểm doibung.com trả 200 trước/sau
- [Phase 1] Deploy whattoeat kế tiếp (`rsync --delete`) sẽ ghi đè dòng `import` trong Caddyfile trên server → `npm run deploy` của break-time phải tự phát hiện và báo
- VPS chỉ **1 vCPU / 3,6 GB RAM** (đo 14/09/2026) và đang chạy cả Postgres của doibung. Static site thì không sao, nhưng **không build game trên VPS**: build ở máy local rồi đẩy `dist/` lên

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-09-15T05:32:50.999Z
Stopped at: Completed 01-08-PLAN.md
Resume file: None
