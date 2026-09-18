---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 01-19-PLAN.md
last_updated: "2026-09-16T00:00:00.000Z"
last_activity: "2026-09-15 -- Completed 01-18 (?soak=1 15-min soak looping the 10-NPC bench with per-cycle reset, #soak-panel, wake lock; crash beacon bt.beacon + #crash-banner; soak-leak e2e 2/2; vitest 483/483, playwright 92 passed 0 failed, SIZE_GATE_OK; measurement build 1ecc53ce473e live via npm run deploy on the 3rd attempt (SSH reset at upload, then operator-approved swing mashing de-flake 60->40 ms), DEPLOY_OK poller 38/38 200, SITE_FILE_UNCHANGED; bench/soak URLs in 01-GO-LIVE.md; TECH-04/PLAT-01 left open for real devices)"
progress:
  total_phases: 8
  completed_phases: 0
  total_plans: 27
  completed_plans: 25
  percent: 93
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-14)

**Core value:** Một "ngày làm việc" 5–8 phút phải buồn cười và căng thẳng đúng lúc, chạy mượt trên điện thoại tầm trung.
**Current focus:** Phase 2 — NPC đồng nghiệp (tên, số lượng, đánh trả)

## Current Position

Phase: 2 (NPC đồng nghiệp) — EXECUTING
Plan: 6 of 13 (02-01..02-06 complete; 02-07..02-13 awaiting)
Status: Entry guard 02-06 PASS; 15-NPC cap verified with measurement
Last activity: 2026-09-18 -- Completed 02-06 (cap 15 NPCs, bench stays 10): Entry guard PASS (01-GATE.md VERDICT=PASS); MAX_NPCS=15 (D-01), BENCH_NPCS=10 (D-11); measurement at 15 NPCs shows 96-97 peakDrawCalls, 200 peakBodies (budget 120/206); TDD GREEN complete (RED tests written, implementation verified); E2E tests updated for new cap; npc.spec 'clamps 0..15' and 'spawns 15 apart', characters.spec 'cap: 15 NPCs idle/smash' all pass

Previous activity: 2026-09-15 -- Completed 01-18 (?soak=1 15-min soak looping the 10-NPC bench with per-cycle reset, #soak-panel, wake lock; crash beacon bt.beacon + #crash-banner; soak-leak e2e 2/2; vitest 483/483, playwright 92 passed 0 failed, SIZE_GATE_OK; measurement build 1ecc53ce473e live via npm run deploy on the 3rd attempt (SSH reset at upload, then operator-approved swing mashing de-flake 60->40 ms), DEPLOY_OK poller 38/38 200, SITE_FILE_UNCHANGED; bench/soak URLs in 01-GO-LIVE.md; TECH-04/PLAT-01 left open for real devices)

Progress: [█████████░] 89%

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
| Phase 01 P27 | 31min | 3 tasks | 7 files |
| Phase 01 P17 | 22min | 2 tasks | 11 files |
| Phase 01 P18 | 65min | 3 tasks | 18 files |
| Phase 02 P01 | 6min | 2 tasks | 5 files |
| Phase 02 P02 | 9min | 3 tasks | 10 files |
| Phase 02 P03 | 8min | 2 tasks | 5 files |
| Phase 02 P04 | 10min | 3 tasks | 10 files |
| Phase 02 P05 | 11min | 2 tasks | 7 files |

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
- [Phase 01]: 01-26: name tags are a DOM layer #npc-labels (z 90, pointer-events none, textContent only) projected in frameUpdate after cameraView.update (camera.updateMatrixWorld first); anchor foot + 1.85 m, ragdoll torso + 0.9 m; D-31 real-name content risk accepted for the play-test only, review before Phase 9 (đánh số lại 16/09: CrazyGames là Phase 9)
- [Phase 01]: 01-27: NPC count changes at runtime go through a grow-only pool (max MAX_NPCS 10): Npc.despawn (ragdoll synced, deactivated and re-attached first; capsule disabled, root hidden) / Npc.respawn at the route spawn; never Rapier removal, so __bt.ragdolls.bodies stays 60 and HUD bodies do not drop after lowering the count
- [Phase 01]: 01-27: Game.applyNpcSettings normalises again, leaves NPCs that stay untouched (a flying ragdoll keeps flying, only the name changes), reports source 'manual' and calls refreshTarget so a despawned glowing NPC stops glowing while paused; startup NPCs are still created before shadows/shards/targeting (body order unchanged), later ones register through a wire hook
- [Phase 01]: 01-27: Escape typed in an NPC name field still closes the menu; every other key stays in the field; the ?npcAt pin only applies to NPC 0 at page start; __bt.npcSettings.storageOk keeps describing the start-up read, the save result is shown only in #npc-apply-status
- [Phase 01]: 01-27: pageHardening no longer cancels contextmenu/dblclick on input/textarea (long-press paste); name inputs are 16px, user-select text, touch-callout default; two name columns when the section reaches 520 px (viewport >= 616 px)
- [Phase 01]: 01-17: bench timeline (src/logic/benchTimeline.ts) is sim-step keyed: roam 0-55 % (walk + slapNearest segments, >= 3 slaps, >= 0.5 s apart), massRagdoll 60 %, smash 75 %, walk on 76-99 %, end 100 %; mulberry32(BENCH_SEED) shuffles only the walk order; &dur= plain integer clamped 5..60
- [Phase 01]: 01-17: massRagdoll slaps every slappable NPC in one step outside the swing gate, then for up to 300 steps slaps NPCs that stand up from an earlier slap until all active NPCs are ragdolls at once (measured 0 late slaps at dur 8 and 60); scripted slapNearest goes through the swing gate
- [Phase 01]: 01-17: bench mode keeps pause toggles but the player reads an autopilot-owned InputState (Game.playerInput); presses/clicks dropped, joystick and pointer pick not attached; loop.ts onStep runs before fixedUpdate, onFrame after render with workMs
- [Phase 01]: 01-17: frames recorded after a 60-step warm-up and never while paused; results overlay #bench-results z 1100 over a pauseFor('user'); bench waypoints = spawn + NPC_ROUTES de-duplicated at 1 cm (raw corners repeat and the loop paced in place)
- [Phase 01]: 01-18: ?soak=1 loops the 10-NPC bench timeline per cycle with a full reset (NPCs recover to routes, player.teleport to spawn, breakables.resetAll creates nothing); leak proxy = geometries/textures/bodies at end of cycle 1 vs last cycle; soakMin 1..30 (15), soakCycles 1..100, dur 5..60; ?soak=1 wins over ?bench=1
- [Phase 01]: 01-18: crash beacon localStorage bt.beacon (sha + timestamps only, try/catch, heartbeat 5 s, clean on pagehide, stale after 20 s) shows #crash-banner via textContent on the next load; nothing sent off-origin
- [Phase 01]: 01-18: measurement build 1ecc53ce473e live (DEPLOY_OK, poller 38/38 200, SITE_FILE_UNCHANGED) on the third attempt after an SSH reset at upload and a swing mashing flake (300.1 ms vs < 300); operator approved 60 -> 40 ms waits, SWING_COOLDOWN_MS and assertions unchanged
- [Phase 02]: 02-01 (pure logic, ran before the Phase 1 device gate per D-12): anger per slap hot 100 / normal 60 / calm 42 + seeded integer jitter 0..5 (clamped; non-finite draw = 0) gives exactly 1 / 2 / 3 slaps for seeds 0..999; decay 8/s only after 6 s standing, clock paused by holdDecay (caller passes physics !== 'animated'); ?fight=always literal forces hot
- [Phase 02]: 02-01: arbitrate ranks anger desc (any non-finite anger = 0), dist asc (non-finite last), id asc; pursue holders that still want it keep it (over-full held sets trimmed by rank); strike survives only if the holder still wants strike and holds pursue in the new set, else goes to the best-ranked new pursue holder that wants strike; first duplicate id wins
- [Phase 02]: 02-02 (pure logic, before the Phase 1 device gate per D-12): strikeHits = edge <= 1.2 m and within a 100 deg cone of the NPC walker facing (sin yaw, cos yaw), EPS 1e-9, non-finite -> false; walking away during the 0.6 s wind-up ends at edge 2.92 m (miss)
- [Phase 02]: 02-02: player knockdown = playerStun over getUpFsm with opts.timeoutSec 2.5 (NPC default 4.0 unchanged) plus a hard cap forcing recover at lockSec >= 2.55, so the input lock is <= 3.0 s; invulnerable 1.5 s; hits accepted only in 'free' (rejected = unchanged copy); non-finite/<= 0 dt = unchanged copy; no HP field
- [Phase 02]: 02-02: collisionGroups.ts reproduces ragdoll.ts ragdollGroups (NPC index 0..14 -> bits 1..15) and gives the player ragdoll bit 0 (0x0001fffe); ragdoll.ts untouched until 02-11; freeSpotCandidates = clamped landing point + 5 rings x 8 dirs from +X (41 points, last ring exactly 2.0 m), either coordinate non-finite -> origin
- [Phase 02]: 02-03 (tooling + pure route data, before the Phase 1 device gate per D-12): `node scripts/phase-gate-guard.mjs --plan 02-NN [--gate] [--state] [--dry-run]` prints GUARD_CONTINUE on VERDICT=PASS or VERDICT=FAIL + VERDICT_AFTER_OPT=PASS, PLAN_EXIT_GATE_PENDING on missing gate / REMEASURE / awaiting D-07 / no verdict, PLAN_EXIT_STACK_STOP on VERDICT_AFTER_OPT=FAIL or the 01-21 stack-stop blocker line in STATE (literal kept only in scripts/lib/phaseGate.mjs STACK_STOP_TEXT; never quote it in STATE.md, the substring match would stop every integration plan); exit 0 always, GUARD_USAGE exit 2; per-line anchored regex after stripping only CR, last anchored line wins
- [Phase 02]: 02-03: on pending/stop the guard keeps exactly one plan-independent STATE blocker line `- [Phase 2] Tích hợp chờ cổng máy thật Phase 1 (01-GATE.md: <reason>) — …` (byte-preserving, CRLF-aware, identical across parallel plans) and removes it on continue; never creates a missing STATE.md; 01-GATE.md still absent (dry run: gate-missing, STATE untouched)
- [Phase 02]: 02-03: NPC_SLOT_COUNT 15, clamp 0..14; slots 10..14 -> routes 0..4, shared offset 0, start = first index of a mulberry32(BENCH_SEED + i) Fisher-Yates order >= 0.6 m from every earlier spawn (picks 1/0/3/3/0, no fallback; slot 11 exactly 0.6 m from slot 7); slots 0..9 byte-identical to 01-23; spawnPointForNpc / farthestRouteIndex added, game.ts switches in 02-06
- [Phase 02]: 02-04 (pure logic, before the Phase 1 device gate per D-12): roster in `bt.roster` v1 = ≤ 30 members (id ^m[0-9]{1,3}$, sanitised name, look one of 'bcdefghijklmnopqr', temper), present ≤ 15 in member order, on floor = first `count` present; raw > 8192 ignored before JSON.parse, 200-entry scan, whitelist copy into fresh literals (prototype-pollution test); `bt.npcs` v1 migrates one way (legacy names on m1..m10, looks b..k, count kept, 15 present) and is never written
- [Phase 02]: 02-04: resolveStartRoster members bench -> default, else stored > migrated > default; count finite forcedCount > ?npcs= > roster count, forced/query clamped to present and reported 'query'; quickAdd = presentMembers[count] while count < min(15, present), quickRemove = LIFO; addMember takes the smallest free id and first unused look (rng only when all 17 are used); withSlotEdits maps names onto present members in order until plan 02-09 removes it
- [Phase 02]: 02-04: Equal/NumpadAdd -> 'npc-add', Minus/NumpadSubtract -> 'npc-remove' (null with Ctrl/Meta/Alt, so Ctrl± zoom stays); keyboard.ts and KEY_HINTS untouched until 02-08; `bt.npcLabels` on unless exactly '0'; 32 frozen NFC preset nicknames, randomPresetName compares taken names after sanitizeNpcName
- [Phase 02]: 02-05 (pure logic, before the Phase 1 device gate per D-12): combat FSM routine/down/fume/pursue/windup/cooldown/return; ragdoll/recover -> down (windup -> 'interrupted'); fume waits a seeded 0.2-0.5 s then pursues only with a token; windup 0.6 s (36 steps) -> strike -> cooldown 1.5 s -> return if landed or calm, pursue with token, else fume; give-up (anger cleared) on 8 s total pursuit, > 9 m held 1.0 s, stuck x2 (< 0.3 m per 1.0 s window, 0.5 s sidestep), calm; return -> routine within 0.5 m
- [Phase 02]: 02-05: createCombatDirector({ seed, fight }) step order = forget/rebind -> tickAnger holdDecay physics !== 'animated' -> arbitrate on the previous step's wants (sorted ids) -> FSM in id order -> landed = targetable && strikeHits, satisfyAnger on landed/give-up -> drop unwanted tokens same step -> commands (pursue 2.2 m/s stopping at edge 0.95 m, sidestep left-hand (uz, -ux) 1.6 m/s, return 1.4 m/s not past the route point, marker only in windup); per-member rng mulberry32(seedFor(seed, memberId)) with seedFor = FNV-1a xor base; reset() re-seeds streams; 600-step same-seed trace deep-equal, seed + 1 differs
- [Phase 01]: 01-19: cổng máy thật PASS trên sha `04c06b21c39a` — 4 tiêu chí chặn cổng đều đạt (Android 60.6 fps TB ≥ 30 với 33 đồ văng/vỡ ≥ 20 trong cùng lần bench; soak iOS 15 phút không crash/không rò rỉ; first load 3.364.381 ≤ 8 MB). Cả 3 máy chạm trần 60 fps ở tier tự chọn (Vừa trên 2 điện thoại), nên chỉ số phân biệt là 1% thấp: desktop 53.6 / Android 53.6 / Safari 49.2 / Chrome iOS ở tier Cao + DPR 2 là 46.2 — máy yếu nhất vẫn cách ngưỡng 30 rất xa. Không chạy 01-20/01-21 (đòn bẩy D-07)
- [Phase 01]: 01-19: phần chưa kiểm được ghi vào "## Gaps for verify-work" của 01-GATE.md chứ không đổi VERDICT (đúng D-07: chỉ 4 tiêu chí chặn cổng mới kích hoạt): 13 dòng checklist điều khiển/cài đặt chưa kiểm tay, Edge/Firefox desktop chưa mở, cảm nhận joystick chưa ghi, soak chạy trên Chrome iOS (cùng WebKit) chứ chưa trên Safari và chưa kiểm banner sau reload, ảnh bằng chứng còn ở hội thoại chưa lưu vào `evidence/`
- [Quick fix 16/09/2026, ngoài plan, operator]: mỗi NPC đi tuyến riêng sinh từ seed thay vì dùng chung 5 tuyến — `src/logic/routeGen.ts` thuần (3–5 điểm dừng trên lưới 0,5 m nền trống, đoạn thẳng bị loại nếu chạm bàn/ghế/quầy/thùng/chậu/hành lang), tốc độ 1,1–1,6 m/s và dwell 1,5–5 s theo từng NPC, seed = seedFor(BENCH_SEED, 'npc-route-N'); NPC_ROUTES giữ nguyên vì benchScript dựng waypoint người chơi từ nó; số bench cũ (10 NPC dùng chung tuyến) không còn so trực tiếp được. Xem `.planning/phases/02-npc-dong-nghiep/02-QUICKFIX-routes.md`.

### Roadmap Evolution

- 16/09/2026: Phase 2 (NPC đồng nghiệp) ĐÃ LẬP PLAN — 13 plan / 10 wave, plan-checker PASSED vòng 2; 02-01..02-05 logic thuần chạy được ngay; 02-06..02-13 có entry guard chờ 01-GATE.md (PASS hoặc PASS sau D-07). Phase 1 vẫn là phase hiện tại (chờ đo máy thật 01-19).

- 16/09/2026: chèn Phase 2 mới "NPC đồng nghiệp — tên, số lượng, đánh trả" (operator); phase cũ 2–8 lùi thành 3–9. Phase 01.1 (chèn nhầm 15/09) đã revert; research + 12 quyết định discuss chuyển sang Phase 2. Phase 1 vẫn EXECUTING (chờ đo máy thật 01-19).

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 1] **Model 2 máy tham chiếu vẫn chưa rõ (D-06)**: OS + trình duyệt đã ghi (iOS 26.6.1 / Safari 604.1 + Chrome iOS 153; Chrome Android 152) và baseline đạt, nhưng Chrome Android gửi UA rút gọn `Android 10; K` nên không lộ model/bản Android thật, model iPhone chờ operator. Nợ tài liệu, không chặn cổng
- [Phase 1] **4 ảnh bench/soak chưa lưu vào `evidence/`**: số đã chép vào 01-DEVICE-LOG.md và 01-GATE.md, nhưng file ảnh còn ở hội thoại — operator chép vào thư mục theo `evidence/README.md`
- [Phase 1] **Checklist điều khiển/cài đặt (D-19, D-27..D-30) chưa kiểm tay**: CTRL_UI_CHECK=0/0, Edge/Firefox desktop chưa mở (TECH01_BROWSERS=3/5), cảm nhận joystick chưa ghi — việc của verify-work, không đổi phán quyết cổng
- [Phase 1] Deploy whattoeat kế tiếp (`rsync --delete`) sẽ ghi đè dòng `import` trong Caddyfile trên server → `npm run deploy` của break-time phải tự phát hiện và báo
- VPS chỉ **1 vCPU / 3,6 GB RAM** (đo 14/09/2026) và đang chạy cả Postgres của doibung. Static site thì không sao, nhưng **không build game trên VPS**: build ở máy local rồi đẩy `dist/` lên

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| - | None | - | - |

## Session Continuity

Last session: 2026-09-16
Stopped at: Completed 01-19-PLAN.md (cổng PASS). Operator yêu cầu DỪNG sau khi xong plan — chưa execute Phase 2.
Resume file: None
Next step khi quay lại: `/gsd-execute-phase 2` để chạy 02-06…02-13 (guard đã GUARD_CONTINUE).
