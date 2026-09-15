---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 01-26-PLAN.md
last_updated: "2026-09-15T13:13:43.473Z"
last_activity: "2026-09-15 -- Completed 01-26 (saved bt.npcs count 0-10 + names applied at start; names NFC, control/bidi/zero-width stripped, <= 16 code points; textContent tags over heads follow walking and ragdoll NPCs; corrupt/oversized/throwing storage falls back to 3 unnamed; forcedNpcCount > ?npcs > stored > 3; no network; vitest 439/439, playwright 79 passed 0 failed, SIZE_GATE_OK; CTRL-07/TECH-06 left open)"
progress:
  total_phases: 8
  completed_phases: 0
  total_plans: 27
  completed_plans: 21
  percent: 78
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-14)

**Core value:** Một "ngày làm việc" 5–8 phút phải buồn cười và căng thẳng đúng lúc, chạy mượt trên điện thoại tầm trung.
**Current focus:** Phase 1 — Spike kỹ thuật & đường deploy

## Current Position

Phase: 1 (Spike kỹ thuật & đường deploy) — EXECUTING
Plan: 22 of 27 (01-01..01-16, 01-22..01-26 complete; next 01-27, then 01-17)
Status: Ready to execute
Last activity: 2026-09-15 -- Completed 01-26 (saved bt.npcs count 0-10 + names applied at start; names NFC, control/bidi/zero-width stripped, <= 16 code points; textContent tags over heads follow walking and ragdoll NPCs; corrupt/oversized/throwing storage falls back to 3 unnamed; forcedNpcCount > ?npcs > stored > 3; no network; vitest 439/439, playwright 79 passed 0 failed, SIZE_GATE_OK; CTRL-07/TECH-06 left open)

Progress: [████████░░] 78%

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
| Phase 01 P09 | 18min | 3 tasks | 12 files |
| Phase 01 P10 | 24min | 3 tasks | 15 files |
| Phase 01 P11 | 50min | 2 tasks | 12 files |
| Phase 01 P13 | 15min | 2 tasks | 5 files |
| Phase 01 P14 | 33min | 3 tasks | 10 files |
| Phase 01 P15 | 32min | 2 tasks | 17 files |
| Phase 01 P12 | 34min | 3 tasks | 5 files |
| Phase 01 P16 | 36min | 2 tasks | 10 files |
| Phase 01 P22 | 12min | 2 tasks | 9 files |
| Phase 01 P23 | 19min | 3 tasks | 8 files |
| Phase 01 P24 | 14min | 2 tasks | 7 files |
| Phase 01 P25 | 10min | 2 tasks | 7 files |
| Phase 01 P26 | 15min | 2 tasks | 7 files |

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
- [Phase 01]: 01-09: KeyC / ArrowRight / rotate-right button = +90 deg yaw (W then walks world -X); KeyZ / ArrowLeft = -90; E never rotates
- [Phase 01]: 01-09: renderer.setSize(w, h, false): CSS (100vw x 100dvh) owns the canvas box, the 100 ms debounced guard owns only backbuffer + camera.aspect; body.portrait toggles immediately
- [Phase 01]: 01-09: camera input modules import three, so main.ts loads them with the renderer (dynamic import) to keep the index chunk three-free
- [Phase 01]: 01-09: framing 11 m/55 deg (landscape) and 15 m/60 deg (portrait) still shows the whole room, not ~1/2 (D-19); kept as pinned, flagged for end-of-phase phone check
- [Phase 01]: 01-10: Kenney Furniture Kit is ~half real size; layout.ts ROLE_SCALE (furniture x2, mug x0.4, counter [3,2,2]) and bottom-centred cloneProp; Placement.on for desk-top y
- [Phase 01]: 01-10: createGame is async (main.ts awaits); GLBs fetched before Choi as ArrayBuffers, parsed after the play gesture so three.js stays out of first load
- [Phase 01]: 01-10: mouse pick ignored while paused or on HUD/menu; queued pick pushes only if it still matches the current target; __bt screen projections are lazy getters
- [Phase 01]: 01-11: Start tier precedence is ?q= (forced) > stored manual (bt.quality) > auto (Vừa coarse / Cao desktop); forced ?q= never reads or overwrites the stored choice
- [Phase 01]: 01-11: Auto-tier is fed only unpaused frames; tier DPR changes go through the resize guard without counting as a resize
- [Phase 01]: 01-11: Context loss = preventDefault + pause + #context-lost reload prompt; webglcontextrestored not handled (reload is the path)
- [Phase 01]: 01-13: variantsOf matches only prefix-<digits> sorted numerically ('drop' matches nothing; 'break-glass' never includes 'break-ceramic-*')
- [Phase 01]: 01-13: __bt.audio.requests counts every playSfx call; played lists only sounds actually started (last 20)
- [Phase 01]: 01-13: onPlayGesture(unlockFromGesture) registered before fullscreen (fullscreen may consume transient activation); no AudioContext before the gesture
- [Phase 01]: 01-13: SFX fetch/decode failure warns and counts __bt.audio.failed instead of failing boot; sfx module is its own lazy chunk (3.95 KB)
- [Phase 01]: 01-14: Character textures mirror the GLB sampler (RepeatWrapping, LinearFilter, no mipmaps); Blocky UVs lie outside [0,1] and TextureLoader's default clamp painted edge texels
- [Phase 01]: 01-14: NPC routes run via a west column + north lane derived from DESKS, desk stop +1.6 and fridge stop (-0.4,0.75); plan points clipped desk d2, the counter corner, chair backs and crossed the spawn/test-box corridor; waypoints.test.ts enforces 0.35 m clearance
- [Phase 01]: 01-14: 8 NPCs = 134 draw calls at yaw 0 (121-127 at yaw 90), over the 120 bench budget; each Blocky character is 6 draws, fix is D-07 step 3 (one SkinnedMesh per character) in 01-20
- [Phase 01]: 15/09/2026: gộp mesh nhân vật (6 → 1 draw call) chuyển từ lever D-07 ở 01-20 sang plan 01-23, làm trước benchmark 01-17 (bench 10 NPC, D-11/D-29)
- [Phase 01]: 01-15: Slap kick deferred until torso.mass() > 0 — a Rapier 0.20 body created disabled has mass 0 until the first world step after setEnabled(true), so a same-call impulse is silently lost
- [Phase 01]: 01-15: Slap impulse = total ragdoll mass x (9 dir + 5 up) on the torso; ragdoll lands ~8.8 m away from the e2e spot, gets up ~3 s later
- [Phase 01]: 01-15: __bt.audio.requested lists requested SFX names (audio is locked under ?autoplay, so played stays empty)
- [Phase 01]: 01-15: Hit-stop freezes sim steps and animation dt on performance.now(); camera shake runs through the freeze but waits while paused
- [Phase 01]: 01-15: 6 pooled ragdoll bodies per NPC count in world.bodies.len() (HUD bodies 56 with 3 NPCs, 91 with 8); draw calls unchanged during ragdoll (104 / 134)
- [Phase 01]: 01-12: go-live on game.doibung.com (internal name breaktime) ran after 01-13..15 by operator choice; infra applied only with the operator-typed token APPROVE-CADDY-4ebe4eba (two earlier non-matching replies refused), backup /root/breaktime-infra-backup/20260915T094249Z
- [Phase 01]: 01-12: only a site-file change reloads Caddy; the first-time reload coincided with one ~1 s fetch failed on doibung.com (step 16 fail), the operator-approved re-run skipped the reload (SITE_FILE_UNCHANGED) and passed DEPLOY_OK 3d3cb78f560f with non200=0
- [Phase 01]: 01-16: break/drop forces in N per kg of the prop (density-1 props: mug off desk 0.50 N but ~255 N/kg); BREAK_FORCE mug 96 / plantSmall 112 / pottedPlant 144 / monitor 160 N/kg, event threshold 8 N/kg x mass, drop SFX min 60 N/kg in play
- [Phase 01]: 01-16: ?scenario=smash arms breakables at 0.5x threshold (unarmed 10/11 at 8 NPCs, armed 11/11); broken props are disabled not removed; shard tint sampled from palette texel
- [Phase 01]: 01-22: key bindings are pure data in src/logic/keyMap.ts (classifyKey / axisFromHeld / createCtrlTap / isTypingTarget / KEY_HINTS); keyboard.ts, cameraKeys.ts and debugHud.ts all read it
- [Phase 01]: 01-22: any key with Ctrl/Meta/Alt held is not a game key and is never default-prevented; a Control keydown itself stays 'ctrl'; lone Ctrl tap is disarmed by any other keydown, pointerdown (capture) or wheel, reset on blur/hidden
- [Phase 01]: 01-22: typing targets (text-like INPUT, TEXTAREA, SELECT, contenteditable) are ignored by movement/action/rotate/HUD/pause; only Escape passes in keyboard.ts; keyup always releases held codes
- [Phase 01]: 01-23: each Blocky character is one rigid SkinnedMesh (6 identity bones under the part nodes, weight 1.0 per part) built at spawn in the bind pose; merged geometry cached per asset.scene, only the Skeleton is per character; frustumCulled false (ragdoll parts fly far)
- [Phase 01]: 01-23: part meshes stay as hidden children so ragdoll collider sizing and pointer pick are unchanged; player.ts, npc.ts, ragdoll.ts, highlight.ts untouched
- [Phase 01]: 01-23: NPCs 1-8 keep routes i % 3 / offsets floor(i/3); NPC 9 -> route 3 (desk d2 <-> counter east end), NPC 10 -> route 4 (east window <-> storage boxes), planned coordinates unchanged; MAX_NPCS = 10
- [Phase 01]: 01-23: measured 3 NPCs 84 draws idle / 85 smash peak, 116 bodies; 10 NPCs 91 idle / 92 smash peak, 165 bodies (budget 120 / 200) — draw calls no longer block the 01-17 bench
- [Phase 01]: 01-24: every action press (Space, E, #btn-context, game-area left-click) passes one pure SwingGate (SWING_COOLDOWN_MS = 350) and always swings; a key/context press hits the current target, a click hits only when its ray hit the object that is still the target; otherwise swing only (D-30)
- [Phase 01]: 01-24: a press inside the cooldown is dropped (not queued, does not extend the cooldown) and counted in __bt.swing.dropped; slap.ts / loop.ts unchanged, the 01-17 bench still calls performSlap outside the gate
- [Phase 01]: 01-24: pointerPick never swings for clicks inside [data-hud-button], [data-hud-panel], #pause-menu, button, input, textarea, select (panel contract for 01-25); context icon still 'none' with nothing in range (planner note #7, check on the phones)
- [Phase 01]: 01-25: key hint panel (#key-hints, bottom-left, z 150) renders KEY_HINTS from keyMap.ts, dims to 0.3 after KEY_HINT_DIM_MS = 4000 with CSS-only hover restore; #key-hints-toggle in the pause menu persists bt.keyHints, where only the literal '0' means off (try/catch, session fallback when storage throws)
- [Phase 01]: 01-25: touch hint (#touch-hint, right half, pointer-events none) is decided once at loop start, bt.touchHintSeen = '1' is written when it is shown, and it hides after TOUCH_HINT_MS = 6000 or on the first touch; [data-hud-button] opacity 0.6 (0.95 while :active); suppressKeyHints(on) is the bench/soak hook for 01-17/01-18
- [Phase 01]: 01-26: NPC start count precedence is finite createGame opts.forcedNpcCount > ?npcs= > valid stored bt.npcs ({"v":1,"count","names"[10]}, raw <= 4096) > 3; forced/query report source 'query' and still take names from the stored record
- [Phase 01]: 01-26: sanitizeNpcName = slice 256 units, NFC, tab/CR/LF to space, strip C0/C1, U+00AD, U+061C, U+180E, U+200B-200F, U+2028-202E, U+2060-206F, U+FEFF, collapse whitespace, trim, 16 code points; npcCountFromQuery now lives in src/logic/npcSettings.ts and returns null when absent
- [Phase 01]: 01-26: name tags are a DOM layer #npc-labels (z 90, pointer-events none, textContent only) projected in frameUpdate after cameraView.update (camera.updateMatrixWorld first); anchor foot + 1.85 m, ragdoll torso + 0.9 m; D-31 real-name content risk accepted for the play-test only, review before Phase 8

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 1] **Model máy đo chưa ghi**: operator có Android tầm trung + iPhone (01-CONTEXT D-06) — phải ghi model/OS/trình duyệt trước lần đo đầu
- [Phase 1] Deploy whattoeat kế tiếp (`rsync --delete`) sẽ ghi đè dòng `import` trong Caddyfile trên server → `npm run deploy` của break-time phải tự phát hiện và báo
- VPS chỉ **1 vCPU / 3,6 GB RAM** (đo 14/09/2026) và đang chạy cả Postgres của doibung. Static site thì không sao, nhưng **không build game trên VPS**: build ở máy local rồi đẩy `dist/` lên

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| - | None | - | - |

## Session Continuity

Last session: 2026-09-15T13:13:43.460Z
Stopped at: Completed 01-26-PLAN.md
Resume file: None
