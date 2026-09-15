# Phase 2: NPC đồng nghiệp — tên, số lượng, đánh trả - Research

> **Ghi chú 16/09/2026:** research này viết ngày 15/09 khi phase còn bị lập nhầm là "01.1". Mọi chỗ "01.1" bên dưới = **Phase 2** này. Sau khi đánh số lại: "Phase 2 detection/vision" trong file = **Phase 3**, "Phase 4 Rage" = **Phase 5**, "Phase 5 relationship" = **Phase 6**. Quyết định G1–G14 đã chốt trong `02-CONTEXT.md` (tất cả theo khuyến nghị).

**Researched:** 2026-09-15
**Domain:** Browser game AI (anger / pursuit / melee), Rapier 0.20 character control + ragdoll reuse, local roster storage, perf scaling of the existing Three.js r186 + Rapier scene
**Confidence:** MEDIUM overall. Code facts and headless measurements: HIGH. Mobile impact: estimated only (D-24, no real-device data yet, even for 10 NPCs). Game-design patterns: MEDIUM (secondary sources).
**Mode:** research BEFORE discuss-phase. There is no CONTEXT.md yet. Every "Recommended" below is a proposal for `/gsd-discuss-phase`, not a locked decision.

## Tóm tắt cho operator (tiếng Việt)

- **Phần đã có (đừng lập kế hoạch lại):** chọn 0–10 NPC trong settings, tên từng NPC tối đa 16 ký tự (đã làm sạch, hiện bằng textContent), lưu `bt.npcs` v1, pool chỉ tăng, bấm "Áp dụng" là đổi ngay (01-26 và 01-27).
- **Phần thật sự mới:**
  - Thêm/bớt NPC nhanh ngay trong lúc chơi.
  - Danh sách đồng nghiệp: tên + ngoại hình, nhiều người hơn số đang có mặt.
  - NPC giận → đuổi → vung tay → hồi chiêu.
  - Người chơi bị ngã rồi đứng dậy.
  - Token giới hạn số NPC cùng đuổi.
  - FSM thuần có seed.
- **Số đo headless trên máy này (i5-12400, SwiftShader, bản copy trong Temp đã vá trần NPC):**
  - Draw call = 81 + N: 91 ở 10 NPC, 96 ở 15, 101 ở 20, 121 ở 40. Trần 120 → tối đa 39 NPC.
  - Body = 95 + 7N: 165 ở 10 NPC, 200 ở 15, 235 ở 20. Ngân sách ~200 → tối đa ~14–15 NPC.
  - CPU mỗi frame (sim + update + render submit): 1,33 ms ở 10 NPC, 1,81 ms ở 20, 2,55 ms ở 40.
  - Nhãn tên tốn 0,08–0,13 ms/frame.
- **Phát hiện quan trọng nhất về hiệu năng:**
  - Khi mọi NPC cùng đuổi dồn vào người chơi bằng character controller, step vật lý tăng vọt. Ở 30 NPC: trung bình 8–10 ms/step, p99 21–43 ms, ngay trên desktop.
  - Giới hạn **3 NPC được đuổi cùng lúc (token)** thì chỉ còn 0,07–0,16 ms/step, kể cả ở 40 NPC.
  - Nguyên nhân là nhiều capsule chen chúc một chỗ, không phải số NPC.
- **Trần tự nhiên là 15 NPC.** Rapier có 16 bit nhóm va chạm: 15 cho NPC + 1 cho ragdoll người chơi. 15 cũng khớp ngân sách body.
- **Rủi ro lịch:** Phase 1 chưa qua cổng đo máy thật (01-19..01-21). Nếu cổng hỏng và phải đổi stack, phần tích hợp của 01.1 sẽ phải làm lại.
- Danh sách quyết định cần chốt nằm ở **## Gray Areas for Discuss**, mỗi mục có một phương án khuyến nghị.

## Summary

Phase 1 already ships most of the "names and count" half:
- `src/logic/npcSettings.ts`: sanitised names ≤ 16 code points, count clamped 0–10, `bt.npcs` v1.
- `src/ui/npcSettingsSection.ts`: stepper, name fields, Áp dụng.
- `src/game/game.ts`: grow-only pool with `Npc.despawn` / `respawn`.
- `src/ui/npcLabels.ts`: textContent DOM tags.

What is genuinely new is:
1. An in-play add/remove control.
2. A persistent roster (name + one of the 17 NPC textures, more members than are on screen, choose who is present) with a migration off `bt.npcs` v1.
3. A retaliation loop: anger → pursue → telegraphed swing → hit → cooldown/give-up.
4. A player knockdown that reuses the existing pooled ragdoll + `getUpFsm`.
5. An attack/pursuit token budget that keeps physics cost flat.
6. Pure, seeded, Node-testable modules for all of it.

The perf picture is better than the Phase 1 budget suggests on draw calls and worse than it looks on crowding:
- **Draw calls and bodies:** measured exactly linear, draw calls = 81 + N and bodies = 95 + 7N, from 3 to 40 NPCs.
- **Rendering and walking:** CPU cost grows slowly, about 0.03 ms per NPC per frame on desktop.
- **Crowding:** direct-steering pursuit with Rapier's `KinematicCharacterController` is cheap for a few pursuers but blows up when many capsules pile onto one spot. That is a design constraint, not only a perf one. Limiting pursuers to 3 removes it.
- **Hard constraints on the cap:**
  - **Collision groups:** `ragdollGroups()` has 15 usable membership bits (1..15). Bit 0 is free for a player ragdoll, so 15 NPCs + player = every ragdoll distinct.
  - **Texture letters:** `firstNpcLetter + k` throws past letter `r`, i.e. NPC index ≥ 17.
  - **Route mapping:** `waypoints.ts` clamps the NPC index to 9.

There are no new packages. Everything is built from code already in the repo: Rapier queries (`castRay`, `intersectionWithShape`, `KinematicCharacterController`), the pooled ragdoll, `getUpFsm`, `pickNearest`-style reach checks, `hitStop`, `shakeCamera`, the Kenney Impact Sounds pack already downloaded, and `mulberry32`.

**Primary recommendation:** cap at 15 NPCs and add a roster under a new storage key. The anger meter uses a temper trait. Pursuit is KCC direct steering behind a token system (3 pursuers, 1 attacker). The player knockdown reuses the ragdoll + get-up FSM with an invulnerability window. Keep the existing `?bench=1` unchanged and add an opt-in brawl variant. Build the pure logic first; integrate after the Phase 1 device verdict.

## User Constraints

No `01.1-CONTEXT.md` exists yet (operator asked for research before discuss). Constraints that already bind this phase, from `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md` and Phase 1 CONTEXT decisions:

### Locked (inherited)
- PROJECT: TypeScript + Vite + Three.js + Rapier; ≥ 30 fps Android mid-range, 60 desktop; no off-origin requests; localStorage wrapped in try/catch; ≤ PEGI 12; CC0 assets only, credited in `CREDITS.md`; no personal data collected in v1.
- REQUIREMENTS Out of Scope: no blood, no sharp weapons against people (PEGI 12); no accounts/backend; no multiplayer. Exception 15/09/2026: player-typed NPC names stored only on the device, for the play-test build, to be reviewed before Phase 8 (D-31).
- D-11: no navmesh, no schedules (DETECT-07 is Phase 2). D-12: exaggerated slapstick, hit-stop ~60 ms, light shake, ragdoll then gets up by itself, no blood. D-14: no realtime shadow maps. D-18: Space (desktop) / context button (mobile) is the single action; drag/swipe swings are Phase 4 Rage. D-21: quality tiers. D-24: FPS is never measured headless; only real devices count. D-27: arrows/WASD move, Space action, E alias, Ctrl/Esc settings, Z/C rotate. D-29: names ≤ 16 chars, textContent/sprite only, never innerHTML, stored locally, never sent. D-30: swing always plays, 350 ms cooldown. D-31: real-name risk accepted for play-test only.
- ROADMAP Phase 01.1 draft success criteria 1–5 (bản nháp, chốt ở discuss).

### Claude's Discretion
All items in "## Gray Areas for Discuss" until the operator decides.

### Deferred (OUT OF SCOPE for 01.1, owned by later phases)
Vision cones, suspicion meter, noise, hiding, navmesh schedules (Phase 2); prank items, HR strikes (Phase 3); stress, Rage Mode, weapons, damage bill, object HP (Phase 4); relationships −100..100, gossip (Phase 5); coins/shop/outfits (Phase 6); vi/en localisation (Phase 7).

<phase_requirements>
## Phase Requirements

| ID | Description (draft 15/09) | Research Support |
|----|---------------------------|------------------|
| NPC-01 | Add/remove NPCs quickly in play, upper bound from perf measurement | §Measurements (draws 81+N, bodies 95+7N, CPU/frame); §Pattern 6 quick add/remove; Pitfalls 5, 12, 14, 15; Gray Areas G1, G2, G3r |
| NPC-02 | Local roster (name + look from existing characters), choose who is present, survives reload, never sent | §Pattern 7 roster schema + migration; Pitfall 2 (old /b/<sha>/ builds share storage), Pitfall 10 (texture pop); Security; G4, G5, G12 |
| NPC-03 | Slapped NPC may get angry (temper/probability), chase and swing back | §Pattern 1 behaviour layers, §Pattern 2 anger, §Pattern 3 pursuit, §Pattern 4 tokens, §Pattern 5 strike; G6, G8, G9, G10 |
| NPC-04 | Player hit → slapstick stun/fall → gets up; clear SFX/shake/indicator; no blood (PEGI 12) | §Pattern 8 player knockdown via existing ragdoll + getUpFsm; PEGI citations; Pitfalls 4, 6, 9; G7, G11 |
| NPC-05 | Multiple NPCs fighting back keep Phase 1 fps/draw/body budget | §Measurements (crowd vs token3); §Pattern 4; Conflict C2 (body budget definition); G8, G13 |
| NPC-06 | Anger–pursue–attack–cooldown deterministic by seed, unit-tested without browser | §Pattern 9 determinism; Validation Architecture; Pitfall 7, 8 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Stack is TypeScript + Vite + Three.js + Rapier (WASM); no engine swap inside this phase.
- Size target ≤ 8 MB first load, hard cap 20 MB.
- ≥ 30 fps Android mid-range, 60 fps desktop; gameplay in ≤ 10 s on 4G.
- Portal rules:
  - No off-origin requests; works with ad-blockers.
  - localStorage always in try/catch.
  - ESC and Ctrl pause; Space is the action key (D-27) and must not scroll.
  - Cutscenes must be skippable.
- Content ≤ PEGI 12. Assets CC0 or equivalent, credited in `CREDITS.md`. No personal data collection in v1.
- Deploy shares the VPS with doibung.com: never disrupt it. This research did not deploy or touch the VPS.
- GSD workflow: repo edits only through GSD commands (this research only wrote this file).
- Global user rules:
  - Reply to the operator in Vietnamese, identifiers in English.
  - Research, measure and search before recommending ONE option, and do not flip recommendations.
  - Do not re-alarm on already-ruled items.

## Architectural Responsibility Map

Single-tier client game (static site). Tiers below are the in-browser layers.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Anger meter, temper, combat FSM, token arbitration, strike reach test, player stun/invulnerability timers, roster parse/migrate, quick add/remove selection | Pure logic `src/logic/*` (Node-testable) | — | TECH-06 / NPC-06: no three/DOM/Rapier, seeded, deterministic |
| Pursuit movement, obstacle sliding, free-spot search after knockdown, strike line-of-sight | Physics `src/physics/*` + `src/game/npc.ts` (Rapier KCC, `castRay`, `intersectionWithShape`) | Pure steering math in `src/logic` | Rapier owns collision; logic only decides targets |
| NPC/player ragdoll activation and get-up | `src/physics/ragdoll.ts` (pooled) + `src/logic/getUpFsm.ts` | `src/game/player.ts` | Reuse; allocate nothing per hit (T-01-15-02) |
| Wind-up / swing / fume animations, look (texture) swap | Render `src/render/characters.ts` (AnimationMixer, shared materials) | — | 27 clips already in `character.glb` (verified) |
| Anger "!" marker, hit vignette, name tags, quick +/− pill | DOM UI `src/ui/*` (textContent, 0 draw calls) | CSS | Same layer pattern as `#npc-labels` |
| Roster persistence | Browser storage via `src/game/*Store.ts` (try/catch) | Pure parse in `src/logic` | Pattern of `npcSettingsStore.ts` |
| Hotkeys | `src/logic/keyMap.ts` (pure bindings) → `src/input/keyboard.ts` | Touch pill in `src/input/touchButtons.ts` or `src/ui` | D-27 key map is pure data |
| Bench/soak brawl measurement | `src/bench/*` + `src/logic/benchTimeline.ts` | e2e | Keep D-08 comparability |

## Standard Stack

No new dependency. Versions verified from `package.json` in the repo (exact pins, installed).

### Core (already installed)
| Library | Version | Purpose in 01.1 | Why Standard |
|---------|---------|-----------------|--------------|
| three | 0.186.0 | AnimationMixer clips (`sprint`, `emote-no`, `attack-melee-*`, `interact-*`), per-letter shared `MeshLambertMaterial` for look swap | Already the renderer [VERIFIED: package.json + src/render/characters.ts] |
| @dimforge/rapier3d-compat / -simd-compat | 0.20.0 | `KinematicCharacterController` per pursuer, `castRay`, `intersectionWithShape`, pooled ragdoll bodies/joints, interaction groups | API signatures confirmed in `dist/control/character_controller.d.ts` and `dist/pipeline/world.d.ts` [VERIFIED: node_modules d.ts] |
| vitest | 5.0.0 | Pure FSM/roster/token tests in Node | Existing TECH-06 harness (483 tests at 01-18) [VERIFIED: package.json, STATE.md] |
| @playwright/test | 1.63.0 | e2e via `window.__bt`, SwiftShader | Existing (92 passed at 01-18); chromium-1243 present locally [VERIFIED: ms-playwright folder] |

### Supporting (already in repo, reuse)
| Module | Purpose | When to Use |
|--------|---------|-------------|
| `src/logic/getUpFsm.ts` | ragdoll → recover → animated timings (settle 0.6 s, timeout 4 s, recover 0.45 s) | Player knockdown (parameterise timeout for the player) |
| `src/physics/ragdoll.ts` `createRagdoll(ctx, parts, groupIndex)` | 6 pooled bodies, deferred kick until mass > 0 | Player ragdoll (player's `character.parts` has the same 6 parts) |
| `src/logic/rng.ts` `mulberry32` | Seeded decisions | Per-NPC combat streams |
| `src/logic/hitStop.ts`, `render/cameraView.ts shakeCamera` | Freeze + bounded shake (≤ 0.5 m, ≤ 1000 ms) | "Player got hit" feedback |
| `src/logic/nearest.ts pickNearest` | Reach (edge distance) + cone math | Strike hit test (mirror for NPC facing) |
| `src/logic/swing.ts createSwingGate` | Cooldown gate pattern | NPC attack cooldown (same shape, own instance per NPC) |
| Kenney Impact Sounds 1.0 (already downloaded, CC0, credited) | `impactPunch_medium_000..004`, `impactSoft_medium_*`, `impactGeneric_light_*` | NPC-hit-player SFX distinct from the player's heavy slap; build via `npm run assets` (ffmpeg-static → MP3) [VERIFIED: assets-src/downloads/impact-sounds listing, CREDITS.md §Impact Sounds] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Rapier KCC direct steering | A navmesh (recast-navigation-js / three-pathfinding) | Phase 2 scope (DETECT-07); new package + slopcheck gate; overkill for 5–15 m chases in one room |
| Pooled player ragdoll | Stagger/knockback only (no ragdoll) | Cheaper and simpler but less slapstick; see G7 |
| DOM "!" marker | Per-NPC tinted material / sprite | Per-NPC material breaks shared-material caching; sprite = +1 draw per marker |
| Behaviour tree library | Hand-written tiny FSM | FSM is ~6 states; a BT lib adds a package and is not needed |

**Installation:** none.

## Package Legitimacy Audit

This phase installs **no** external packages; everything reuses pinned dependencies approved in 01-01 (slopcheck audit recorded in Phase 1). slopcheck was not run because there is nothing new to check.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| (none new) | — | — | — | — | n/a | — |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
If a plan later proposes a navmesh or behaviour-tree package, it must go through the Package Legitimacy Gate + a `checkpoint:human-verify` (and is probably Phase 2 scope).

## Measurements (this session)

All numbers below come from throwaway probes in `C:\Users\hiennv\AppData\Local\Temp\bt-probe-011\` (not committed, repo untouched: `git status` shows only this phase folder). Machine: Intel Core i5-12400, 12 threads, Node 22.14.0, Chromium 1243 headless with `--enable-unsafe-swiftshader`. Headless has no real GPU (D-24): fps below is **not** device fps.

### M1: In-game headless bench at N NPCs (patched copy of the real game)

Method:
- **Copy:** a copy of `src/` with `MAX_NPCS = 40` and route/texture index wrap for NPC ≥ 10.
- **Bench:** `?bench=1` honours `?npcs=N`, run with `&dur=20&q=high`, 1280×720.
- **Timers:** `performance.now()` around sim steps, `game.frameUpdate` (which contains `updateLabels`) and `renderer.render`.
- **Labels:** all NPCs named (`bt.npcs` seeded).

| NPCs | Peak draw calls | Peak bodies | Sim ms / frame | Sim ms / step | frameUpdate ms / frame | of which labels | render() submit ms | CPU total ms / frame | SwiftShader avg fps (not device) |
|------|----|-----|------|------|------|------|------|------|------|
| 3 | 84 | 116 | 0.375 | 0.309 | 0.171 | 0.073 | 0.567 | 1.11 | 49.2 |
| 10 | 91 | 165 | 0.488 | 0.378 | 0.206 | 0.083 | 0.639 | 1.33 | 46.2 |
| 15 | 96 | 200 | 0.681 | 0.471 | 0.293 | 0.104 | 0.841 | 1.82 | 41.1 |
| 20 | 101 | 235 | 0.666 | 0.474 | 0.295 | 0.105 | 0.852 | 1.81 | 42.7 |
| 30 | 111 | 305 | 0.807 | 0.548 | 0.333 | 0.120 | 0.950 | 2.09 | 40.7 |
| 40 | 121 | 375 | 0.990 | 0.620 | 0.413 | 0.133 | 1.146 | 2.55 | 37.7 |

Reading:
- **Draw calls:** exactly 81 + N (one rigid SkinnedMesh per character, 01-23), so the 120 budget allows N ≤ 39.
- **Bodies:** exactly 95 + 7N (capsule + 6 pooled ragdoll bodies per NPC; disabled bodies are counted). The ≈ 200 budget (01-RESEARCH estimate, not a device limit) allows N ≤ 15, or N ≤ 14 once a 6-body player ragdoll is added.
- **Labels:** 0.07 → 0.13 ms per frame even with 32 visible tags. DOM cost is not a limiter; visual clutter is.
- **Spikes:** `maxSimMsFrame` was 27–37 ms at every N, including N = 3. These are catch-up frames and hit-stops, not N-dependent.
- **Scope of this bench:** it measures walk, all-ragdoll and smash. It does not include pursuit (see M2/M3).
- **Mobile estimate [CITED via search snippets, MEDIUM-LOW]:**
  - Geekbench 6 single-core: i5-12400 ≈ 2245 (nanoreview aggregate); mid-range Android SoCs Helio G99 717, Snapdragon 695 893, Snapdragon 7 Gen 1 934. That is a ratio of ≈ 2.4–3.1× slower.
  - Scaled CPU/frame on a mid-range phone ≈ 4.4 ms at 10 NPCs, ≈ 5.6 ms at 15, ≈ 5.6 ms at 20, ≈ 7.9 ms at 40, against a 33.3 ms frame at 30 fps.
  - CPU is therefore not the likely limiter; the GPU cost of +1 draw per NPC on a phone is unmeasured.
  - **Even 10 NPCs has not been measured on a real device yet (01-19 pending).**

### M2: Rapier step cost by scenario (Node, SIMD build, world approximating the office)

World model: floor, walls, 7 static furniture boxes, 31 dynamic props with contact-force events, 60 disabled shard bodies, player KCC capsule, N NPC kinematic capsules each with a 6-body CCD ragdoll + 5 spherical joints (collision groups as in `ragdollGroups`). 120 warm-up + 1200 measured steps.

| N | walk mean ms | all ragdolls flying mean / p99 ms | pursue-all (KCC + 1 ray each, stop at 1.0 m) mean / p95 / p99 ms |
|---|------|------|------|
| 0 | 0.105 | 0.062 / 0.23 | 0.052 / 0.12 / 0.19 |
| 3 | 0.120 | 0.148 / 0.47 | 0.163 / 0.48 / 0.91 |
| 10 | 0.129 | 0.329 / 0.93 | 0.529 / 1.17 / 1.93 |
| 15 | 0.166 | 0.521 / 1.35 | 1.105 / 1.83 / 2.32 |
| 20 | 0.160 | 0.743 / 1.84 | 1.010 / 1.53 / 1.88 |
| 30 | 0.192 | 0.889 / 1.49 | **8.265 / 16.23 / 22.05** |
| 40 | 0.192 | 1.018 / 2.13 | **8.668 / 13.82 / 16.97** |

### M3: Is the pursuit blow-up crowding? (Node, same engine)

| N | crowd (all chase to 1.0 m) mean / p99 | token3 (3 chase, rest walk) mean / p99 | ring (6 slots at 1.3 m, others wait on 3 m ring at 6 shared angles) mean / p99 |
|---|------|------|------|
| 10 | 0.329 / 0.82 | 0.081 / 0.35 | 0.089 / 0.20 |
| 20 | 0.666 / 1.42 | 0.071 / 0.38 | 0.261 / 0.67 |
| 30 | **9.840 / 21.46** | 0.125 / 0.81 | **6.257 / 10.11** |
| 40 | **6.761 / 43.34** | 0.157 / 0.72 | **21.015 / 41.57** |

Conclusion (HIGH for this engine/version, desktop):
- **Cause:** the cost comes from many KCC capsules piled up in contact at one place, whether that is the player or a shared waiting spot. It does not come from the number of NPCs.
- **Token limit:** capping active pursuers keeps cost flat.
- **Waiters:** NPCs waiting for a token must not converge on a shared point either.
- **Phone impact:** at 2.4–3.1× the desktop cost, a 30-NPC pile-up would be ≈ 20–30 ms mean per step, which blows the 33 ms frame budget.

### M4: Other facts checked
- `character.glb` has 27 clips: static, idle, walk, sprint, sit, drive, die, pick-up, emote-yes, emote-no, holding-*, attack-melee-right/left, attack-kick-right/left, interact-right/left, wheelchair-* [VERIFIED: GLB JSON chunk read this session].
- Character textures are 512×512 PNG, 15–22 KB each on disk; uncompressed VRAM ≈ 1.05 MB each (512×512×4, no mipmaps per `characters.ts`), so all 18 ≈ 19 MB [VERIFIED: PNG IHDR; VRAM arithmetic].
- A 30-member roster JSON with 16-character names and look/temper fields = 1,987 UTF-16 units (fits the existing 4096 raw cap; astral-plane names could double name length → raise the cap to 8192) [VERIFIED: computed].

## Architecture Patterns

### System Architecture Diagram

```
 Input (Space/E/click/context, +/- keys, HUD pill, settings roster UI)
        │
        ▼
 ┌──────────────── fixedUpdate (1/60 s, frozen by hitStop/pause) ────────────────┐
 │ player.fixedUpdate ──(input locked while player ragdoll/recover)              │
 │        │                                                                      │
 │ swing gate → performSlap(npc) ──► npc.slap() ──► AngerModel.onSlapped(seed)   │
 │                                                     │                         │
 │ for each NPC:  BehaviourLayer select (priority)     ▼                         │
 │   ragdoll/recover (getUpFsm) > strike > windup > pursue > fume > routine walk │
 │        │                     ▲          ▲                                     │
 │        │        AttackTokens.arbitrate(anger, distance, id)  (≤3 pursue, ≤1 strike)
 │        ▼                                                                      │
 │  routine: waypointWalker ; pursue/return: steer target → NPC KCC (slide)      │
 │  strike moment: StrikeHit(reach+cone) ──hit──► PlayerStun.onHit ─► player     │
 │                                                  ragdoll.activate(kick)       │
 │                                                  hitStop + shake + SFX + UI   │
 │  player recover: free-spot search (intersectionWithShape) → teleport capsule  │
 └───────────────────────────────┬───────────────────────────────────────────────┘
                                 ▼
                         Rapier world.step
                                 ▼
 frameUpdate: mixer clips (walk/sprint/emote-no/attack-melee), camera follows player
 torso while knocked down, DOM labels + "!" markers + hit vignette, render
                                 ▼
 Storage: roster (new key) ◄── settings roster UI / quick add-remove (debounced write)
 Test hook: window.__bt.combat / __bt.roster (read-only getters)
```

### Recommended Project Structure (new files only; existing ones extended)
```
src/logic/
├── anger.ts            # meter, temper table, decay, decide retaliate (pure, seeded)
├── combatFsm.ts        # routine|fume|pursue|windup|strike|cooldown|return (pure)
├── attackTokens.ts     # max pursuers / attackers, deterministic arbitration (pure)
├── strikeHit.ts        # reach + cone test from NPC facing (pure)
├── playerStun.ts       # knockdown → recover → invulnerable timers, input lock (pure; wraps getUpFsm)
├── roster.ts           # schema, sanitize (reuses sanitizeNpcName), migrate from bt.npcs v1 (pure)
├── quickNpc.ts         # which member to add/remove, clamp to cap (pure)
└── presetNames.ts      # built-in fun names for the random button (pure data)
src/game/
├── rosterStore.ts      # localStorage try/catch, debounced write
├── combat.ts           # wires logic ↔ npc/player/physics; registers __bt.combat
src/ui/
├── rosterSection.ts    # replaces/extends npcSettingsSection (textContent only)
├── quickNpcPill.ts     # "− N +" HUD control ([data-hud-button])
└── combatMarkers.ts    # "!" over angry NPCs, hit vignette (DOM layer like npcLabels)
tests/unit/{anger,combatFsm,attackTokens,strikeHit,playerStun,roster,quickNpc}.test.ts
tests/e2e/{fightBack,playerKnockdown,roster,quickNpc}.spec.ts
```

### Pattern 1: Behaviour priority layers (compatible with Phase 2)
**What:** each NPC picks one active layer per step by priority. For 01.1: `physics (ragdoll/recover)` > `combat (strike, windup, pursue, fume, return)` > `routine (waypoint walk)`. Phase 2 inserts `suspicion/search` between combat and routine, and Phase 5 can bias anger from relationship, without rewriting 01.1.
**When:** always; the current `npc.ts` already has an implicit two-layer version (`getUp.mode` wins over `walker`).
**Rule:** the anger meter is its own number (0..100), separate from Phase 2's suspicion (0..100) and Phase 5's relationship (−100..100). Do not reuse one variable for two meanings.

### Pattern 2: Anger meter + temper (seeded)
```typescript
// Pure sketch (src/logic/anger.ts). Numbers are proposals for discuss (G6).
export type Temper = 'calm' | 'normal' | 'hot';
export const SLAP_ANGER: Record<Temper, number> = { calm: 34, normal: 50, hot: 100 }; // 3 / 2 / 1 slaps
export const ANGER_THRESHOLD = 100;
export const DECAY_PER_SEC = 8;          // starts after DECAY_DELAY_SEC without a new slap
export const DECAY_DELAY_SEC = 6;
export interface AngerState { value: number; sinceSlapSec: number; }
export function onSlapped(s: AngerState, t: Temper, rng: () => number): { state: AngerState; retaliate: boolean } {
  const jitter = Math.floor(rng() * 11) - 5; // ±5, seeded: same seed → same decision
  const value = Math.min(ANGER_THRESHOLD, s.value + SLAP_ANGER[t] + jitter);
  return { state: { value, sinceSlapSec: 0 }, retaliate: value >= ANGER_THRESHOLD };
}
```
Retaliation starts **after the get-up** (existing FSM: flight ~3 s + 0.45 s recover). That gives the readable beat: ragdoll → stands → turns → "!" → chases.

### Pattern 3: Pursuit without navmesh (Rapier KCC direct steering)
- Give each NPC its own `world.createCharacterController(0.02)` (or one controller reused sequentially; `computeColliderMovement` + `computedMovement` are per call) [VERIFIED: character_controller.d.ts]. Keep `setApplyImpulsesToDynamicBodies(false)` for NPCs so chasers do not launch desk items (deferred item from 01-16 shows the player's capsule already does) [CITED: rapier.rs character controller docs: dynamic bodies are not pushed unless impulses are enabled].
- Speed: chase 2.2 m/s vs player 3.2 m/s (`player.ts SPEED`), walker 1.4 m/s. The player can always outrun.
- The target is the player position; stop at reach distance; face the player (`TURN_RATE` damping exists).
- Stuck detection: if progress toward the target < 0.3 m over 1.0 s, sidestep (perpendicular) for 0.5 s; two failures → give up.
- Give up / return: after one landed strike (grudge satisfied), or chase time > 8 s, or distance > 9 m. Return to the nearest route point **through the KCC too**, handing back to `waypointWalker` within 0.5 m. The current walker moves kinematically in straight lines and pushes dynamic props with infinite mass (Pitfall 3).
- Line of sight: optional one `world.castRay` per pursuer per step (measured inside M2 pursuit numbers).

### Pattern 4: Attack/pursuit tokens
```typescript
// Pure sketch (src/logic/attackTokens.ts)
export const MAX_PURSUERS = 3;   // measured flat cost (M3 token3)
export const MAX_ATTACKERS = 1;  // one wind-up at a time: readable, never double-hit in one frame
export interface Contender { id: string; anger: number; dist: number; wantsPursue: boolean; wantsStrike: boolean; }
export function arbitrate(c: readonly Contender[], held: ReadonlySet<string>): { pursue: Set<string>; strike: Set<string> } {
  // Holders keep their token (no thrash); free slots go to highest anger, then nearest, then id (deterministic).
  // ...pure, allocation-light, unit-tested with fixed inputs
  return { pursue: new Set(), strike: new Set() };
}
```
Angry NPCs without a token **fume in place** (`emote-no` clip + "!") and keep their own spacing. They never walk to a shared waiting point (M3 ring result). Precedent: DOOM (2016) and Arkham-style games gate attackers with tokens, typically 2–3 at once, spacing attacks ~2–3 s apart [CITED: gamedeveloper.com "Enemy design and enemy AI for melee combat systems"; github.com/Lim-Young/UnrealAITokenSystem].

### Pattern 5: Telegraphed strike and hit test
- Wind-up 0.6 s: play `attack-melee-right` slowed (timeScale ≈ 0.35) or hold `interact-right`. Show a DOM "!" over the head and play a whoosh/cue. The impact frame is at the end of the wind-up.
- Hit test at the impact frame only (pure `strikeHit`): edge distance ≤ 1.2 m and inside a 100° cone of the NPC facing. It mirrors `pickNearest` (1.6 m / 140° for the player). A player who moves 0.6 s × 3.2 m/s = 1.9 m during the wind-up is out of reach, so dodging is possible by movement alone.
- Counter: the player can slap the NPC during pursuit or wind-up (the NPC is `slappable()` while animated), which interrupts the strike and adds anger. That is the "đánh qua lại" loop.
- Cooldown after a strike (hit or miss): 1.5 s per NPC (`createSwingGate(1500)` instance). Token released on strike end.
- Telegraph precedent: "preparation pose, then a glint on the weapon and a sound effect" (DmC) [CITED: gamedeveloper.com melee AI article].

### Pattern 6: Quick add/remove (NPC-01)
- Pure `quickNpc.ts`: add = the first roster member not present (roster order), remove = the last present member (LIFO). Clamp to the cap; no-op at bounds.
- Spawn at the route point farthest from the player, with an intersection check (`world.intersectionWithShape` with a capsule) so a new NPC never appears inside the player or furniture.
- Reuse `Game.applyNpcSettings`-style in-place apply (grow-only pool); debounce the storage write (~500 ms).
- Hotkeys by `KeyboardEvent.code`: `Equal`/`NumpadAdd` add, `Minus`/`NumpadSubtract` remove [ASSUMED: standard UI Events code names; unit-test `classifyKey`]. With Ctrl held they stay browser zoom (`classifyKey` already returns null with a modifier). Typing guard already covers name fields.
- Touch/desktop: a small `[data-hud-button]` pill "− N +" (top-left, translucent). `pointerPick` already ignores clicks on `[data-hud-button]`.

### Pattern 7: Roster schema + migration (NPC-02)
```typescript
// Pure sketch (src/logic/roster.ts). New key, one-way migration.
export const ROSTER_KEY = 'bt.roster';
export const ROSTER_MAX_MEMBERS = 30;
export const ROSTER_MAX_RAW = 8192;
export const NPC_LOOKS = 'bcdefghijklmnopqr'; // 17 looks; 'a' stays the player's
export interface Member { id: string; name: string; look: string; temper: 'calm' | 'normal' | 'hot'; }
export interface Roster { v: 1; members: Member[]; present: string[]; }
// parse: raw length cap → JSON.parse in try → plain object, v === 1 → copy ONLY whitelisted fields
// (id /^m[0-9]{1,3}$/, name = sanitizeNpcName, look ∈ NPC_LOOKS, temper enum), drop duplicates,
// present ⊆ member ids, present.length ≤ cap.
// migrateFromV1(bt.npcs): members = the 10 legacy slots (name, look = 'b'+i, temper 'normal'),
// present = the first count slots → the office looks exactly as before the upgrade.
```
Look swap on a pooled NPC: add `CharacterInstance.setLook(letter)`, which sets `skinned.material` and the hidden part meshes to `materialFor(letter)`. No geometry is rebuilt. Preload the texture before showing it (Pitfall 10).

### Pattern 8: Player knockdown via the existing ragdoll (NPC-04)
- Create a player ragdoll once at spawn: `createRagdoll(ctx, character.parts, PLAYER_GROUP)`. It uses its own collision bit (bit 0 is unused by NPC ragdolls; see Pitfall 5). +6 bodies, +5 joints, 0 extra draws.
- On hit: `hitStop.trigger(now, 80)`, `shakeCamera(0.22, 260)` (stronger than dealing a slap: 60 ms, 0.12 m / 180 ms), SFX `impactPunch_medium_*`, red edge vignette (DOM, 250 ms). Disable the player capsule; `ragdoll.activate(impulse ≈ 0.5 × SLAP constants × mass, torque)`. The kick applies on the next step when mass > 0 (01-15 finding, already handled in `ragdoll.fixedUpdate`).
- Input lock: while the player is ragdoll/recover, `player.fixedUpdate` ignores move; `interactQueued` is cleared (pause still works). Player FSM timeout ≤ 2.5 s (shorter than NPC 4 s) + recover 0.45 s.
- Recover: read the torso position, clamp to the room, then **free-spot search**. Test the capsule at the torso XZ with `world.intersectionWithShape(pos, rot, capsule, …, excludeRigidBody: player body)` [VERIFIED: world.d.ts signature]. If blocked, try 8 directions × 0.4 m steps up to 2 m, else fall back to `PLAYER_SPAWN`. Then `teleport` (exists) and re-enable the capsule.
- Invulnerability 1.5 s after getting up (blinking via CSS/opacity is optional); strikes during it do not count. Precedent: Gang Beasts gives a damage reduction that fades over 4 s after waking, with max K.O. 6 s growing with repeated K.O.s [CITED: gangbeasts.fandom.com K.O. mechanic, LOW-MEDIUM].
- Camera: `cameraView.update(dt, target)` receives the torso position while knocked down (same damping), so the view follows the flight without new camera modes.
- PEGI 12: slap-level injury on human-like characters is acceptable. No blood, no injury marks, no pain emphasis (no screams). Dizzy stars are fine [CITED: pegi.info labels; askaboutgames/parentzone summaries via search: "must not be any sight of blood or injuries, or an emphasis on pain"]. CrazyGames requires PEGI 12 compliance [CITED: docs.crazygames.com/requirements/gameplay].

### Pattern 9: Determinism
- Decisions draw from `mulberry32(hash(seed, memberId))` per NPC, **not** from the module-level rng in `slap.ts`. Otherwise adding NPCs or combat changes the bench replay (D-08).
- All combat timers advance by fixed `dt` inside `fixedUpdate` (no `performance.now()` in logic). A hit-stop freezes them automatically because no sim steps run.
- Arbitration tie-break by id, never by iteration order of a Map.
- e2e overrides via literal-only query values (like `?scenario=smash`), e.g. `?fight=always` → temper hot, jitter 0.

### Anti-Patterns to Avoid
- **All angry NPCs chase at once:** measured 8–10 ms/step at 30 on desktop; unreadable for the player.
- **Waiting NPCs converging on one ring/point:** also measured as a pile-up (M3 ring).
- **Straight-line kinematic return after a chase:** clips desks and shoves props (kinematic bodies push dynamics with infinite mass).
- **Reusing `slap.ts`'s rng for anger:** couples bench replay to combat.
- **Instant hits without wind-up:** the player cannot understand why they fell (Core Value "hiểu vì sao").
- **Writing the roster into `bt.npcs` with a new version:** old `/b/<sha>/` builds on the same origin overwrite it (Pitfall 2).
- **innerHTML for names/markers:** keep the textContent contract (T-01-26-01).
- **Health bars / HP for the player:** criterion 3 says "không có máu"; Phase 4 owns player meters.
- **NPCs throwing objects (as in Crazy Office):** that is weapons/projectiles territory (Phase 4); do not pull it in.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sliding a chaser around desks and other capsules | Custom collision/avoidance solver | Rapier `KinematicCharacterController` per pursuer | Handles slopes, sliding, contact offset; measured cheap when not crowded |
| "Is this spot free?" after knockdown | Manual AABB lists | `world.intersectionWithShape` / `castShape` | Uses the real colliders incl. props that moved |
| Player fall physics | New ragdoll | `createRagdoll` + `getUpFsm` (pooled) | Already tuned (deferred kick, re-attach order, timeout) |
| Name sanitising | New regex | `sanitizeNpcName` | Already covers controls, bidi, zero-width, NFC, 16 code points |
| Seeded randomness | `Math.random` | `mulberry32` streams | Determinism + tests |
| Cooldowns | Ad-hoc timestamps | `createSwingGate(ms)` shape / pure timers on sim dt | Tested edge cases (drop, no extension) |

**Key insight:** 01.1 is mostly wiring existing, tested parts together. The only new "hard" logic is arbitration and the FSM, and both are small pure modules.

## Runtime State Inventory

(Included because NPC-02 migrates a stored schema.)

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `localStorage['bt.npcs']` = `{"v":1,"count","names"[10]}` in every browser that used 01-26/27 builds (operator's devices, visitors of game.doibung.com) | Code: one-way migration into the new roster key on first read; keep reading v1 when the new key is absent. No server data. |
| Live service config | None. Static site; Caddy config unaffected (verified: no storage/server logic in `deploy/`) | none |
| OS-registered state | None | none |
| Secrets/env vars | None | none |
| Build artifacts | Old releases under `/srv/sites/breaktime/releases` served at `/b/<sha>/` on the **same origin** (D-04) still read/write `bt.npcs` v1 | Use a new key so old builds cannot clobber the roster; do not delete `bt.npcs` (old builds still work) |

## Common Pitfalls

### Pitfall 1: Pursuit pile-up cost
**What goes wrong:** step time jumps from ~1 ms to 8–10 ms mean (p99 21–43 ms) on desktop when ≥ 30 KCC capsules crowd one place (M2/M3).
**Why:** contact resolution between many overlapping/adjacent capsules.
**How to avoid:** tokens (≤ 3 pursuers); waiters fume in place with spacing; the cap ≤ 15 also reduces worst cases.
**Warning signs:** `__bt.combat.pursuers > 3`; a spike in sim ms in the brawl bench.

### Pitfall 2: Old builds on the same origin overwrite new storage
**What goes wrong:** `/b/<sha>/` builds (D-04) share `localStorage` with `/`. An old build's Áp dụng writes `bt.npcs` v1; if the roster lived in the same key, it would be destroyed.
**How to avoid:** new key `bt.roster`; the old key is read-only for migration.
**Warning signs:** e2e "write v1 after roster exists → roster intact" fails.

### Pitfall 3: Kinematic straight-line movement ignores furniture
**What goes wrong:** `waypointWalker` moves the kinematic capsule in straight lines. After a chase or a long ragdoll flight, "walk to the nearest route point" passes through desks and launches props (kinematic = infinite mass).
**How to avoid:** return-to-route through the NPC KCC; hand over to the walker only within 0.5 m of the route point. Note: get-up resume already has this latent issue today (existing behaviour, not 01.1-caused).

### Pitfall 4: Player recovers inside a desk
**What goes wrong:** the torso lands on or next to a desk; re-enabling the player capsule there traps the KCC.
**How to avoid:** free-spot search (Pattern 8) + fallback spawn; e2e drops the player next to a desk via a test hook and asserts movement works after recovery.

### Pitfall 5: 15 collision-group bits
**What goes wrong:** `ragdollGroups` clamps `groupIndex` to 14. NPC ≥ 15 shares a bit, so their parts pass through each other; a player ragdoll with an NPC bit ignores that NPC's parts.
**How to avoid:** cap 15 NPCs (indices 0..14) and give the player ragdoll bit 0 (membership bit 0, filter = all except bit 0). This works because world colliders are members of all bits [VERIFIED: ragdollGroups code + Rapier group semantics as used in 01-15].

### Pitfall 6: Impulse lost on a freshly enabled body
Rapier 0.20: a body created disabled has mass 0 until the step after `setEnabled(true)`. `ragdoll.fixedUpdate()` already defers the kick; the player ragdoll must be stepped through the same path (01-15 decision).

### Pitfall 7: RNG stream coupling breaks bench replay
Using `slap.ts`'s module rng or a single shared combat rng changes spin/pitch and decisions when NPC count or order changes. Use per-member streams.

### Pitfall 8: Wall-clock timers in logic
`hitStop` is on `performance.now()`, but combat timers must use sim `dt`. Otherwise wind-ups finish during a freeze or a pause.

### Pitfall 9: Queued input on recovery
An action pressed while knocked down would fire on the first free step. Clear `interactQueued` while locked (same as the paused rule in `loop.ts`).

### Pitfall 10: Texture pop on a new look
`materialFor(letter)` uses `TextureLoader.load`, which returns immediately and fills in later: a newly chosen look renders untextured for a frame or more. Preload on roster edit or at Chơi (18 × ~20 KB). VRAM ≈ 1 MB per loaded look.

### Pitfall 11: "Bodies" includes disabled pooled bodies
The HUD/bench body count counts disabled shards and ragdoll parts (01-15 decision). A cap derived from the 200-body estimate is conservative. Enabled bodies at the brawl peak are what cost step time (M2).

### Pitfall 12: Label layer capacity fixed at start
`createNpcLabels(uiRoot, MAX_NPCS)` gets its capacity once. `labels.setText(i)` silently ignores i ≥ capacity. Raise it with the cap.

### Pitfall 13: Bench comparability
If retaliation runs in `?bench=1`, the 01-19 device numbers (10 NPCs, no combat) and later runs are no longer comparable (D-08). Keep combat off in the default bench; add an opt-in brawl variant.

### Pitfall 14: Route and texture index clamps above 10
- `routeIndexForNpc` / `sharedIndexForNpc` clamp the index to 9, so NPCs 10+ get identical routes and spawn offsets and start inside each other.
- `String.fromCharCode(firstNpcLetter + k)` throws at k ≥ 17 (`spawnCharacter` accepts a..r).
- Both must change with the cap, and look must come from the roster, not the slot index.

### Pitfall 15: Spawning onto the player
A quick-added NPC spawned at a route start can overlap the player capsule. Choose the farthest free route point.

### Pitfall 16: Timing-based e2e flakes
01-18 already needed a de-flake (swing mashing, 300.1 ms). Combat e2e must wait on `__bt.combat` states, not sleep for wind-up durations.

## Code Examples

### Free-spot search (Rapier 0.20 signature verified)
```typescript
// Source: node_modules/@dimforge/rapier3d-compat/dist/pipeline/world.d.ts (intersectionWithShape)
const capsule = new R.Capsule(CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS);
const ROT = { x: 0, y: 0, z: 0, w: 1 };
function freeSpot(world: World, x: number, z: number, exclude: RigidBody): { x: number; z: number } | null {
  const y = CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS + 0.02;
  for (let r = 0; r <= 2.0 + 1e-6; r += 0.4) {
    const dirs = r === 0 ? 1 : 8;
    for (let k = 0; k < dirs; k++) {
      const a = (k / dirs) * Math.PI * 2;
      const p = { x: x + Math.cos(a) * r, y, z: z + Math.sin(a) * r };
      const hit = world.intersectionWithShape(p, ROT, capsule, undefined, undefined, undefined, exclude);
      if (!hit) return { x: p.x, z: p.z };
    }
  }
  return null; // caller falls back to PLAYER_SPAWN
}
```

### Per-pursuer KCC step (pattern measured in M2/M3)
```typescript
// Source: dist/control/character_controller.d.ts (computeColliderMovement / computedMovement)
kcc.computeColliderMovement(npc.collider, { x: dx, y: -0.01, z: dz });
const m = kcc.computedMovement();
const t = npc.body.translation();
npc.body.setNextKinematicTranslation({ x: t.x + m.x, y: CENTRE_Y, z: t.z + m.z });
```
(`npc.ts` today does not expose the capsule collider; keep the handle returned by `world.createCollider`.)

### Combat FSM transitions (pure, to unit-test)
```
routine --(anger ≥ 100 after get-up)--> fume
fume --(pursue token)--> pursue            fume --(anger decays < 40)--> routine
pursue --(in reach & strike token & cooldown ready)--> windup
pursue --(8 s | > 9 m | stuck twice)--> return
windup --(0.6 s)--> strike --(impact frame: strikeHit)--> cooldown (1.5 s)
cooldown --(landed hit)--> return (anger → 0)      cooldown --(missed)--> pursue (if token) | fume
any --(slapped)--> ragdoll layer (anger += temper), FSM resumes after get-up
return --(within 0.5 m of route point)--> routine
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Every enemy attacks when in range | Attack tokens / near-far groups, 2–3 attackers max, telegraphed tells | Arkham series, DOOM 2016 | Readable fights; also bounds CPU as measured here |
| 6 draw calls per Blocky character | 1 rigid SkinnedMesh per character | 01-23 (15/09/2026) | Draw calls no longer limit N below 39 |
| Hand slot list (count + 10 names) | Roster of members + presence (proposed) | 01.1 | Enables "choose who is present", looks, temper |

**Deprecated/outdated:** `navigator.vibrate` as "rung": not reliably available on iOS Safari. MDN/caniuse list no Safari support, while a March 2026 BCD issue claims it works; the sources conflict. Treat "rung" in NPC-04 as screen shake. Optional Android haptics must be feature-detected [CITED: developer.mozilla.org Navigator.vibrate, caniuse, github.com/mdn/browser-compat-data/issues/29166].

## Conflicts with draft requirements

- **C1 (NPC-01 "giới hạn trên theo số đo hiệu năng"):** no real-device measurement exists yet, even at 10 NPCs (01-DEVICE-LOG is empty; 01-19 pending). In this phase the cap can only be a headless-measured provisional value plus a device confirmation task. Suggested split: NPC-01a quick add/remove + provisional cap (headless); NPC-01b device bench at the cap (manual, reuses the 01-19 protocol).
- **C2 (NPC-05 "giữ ngân sách … body của Phase 1"):** the body budget "≤ ~200" is a Phase 1 estimate that counts disabled pooled bodies. The player ragdoll alone adds 6, so 15 NPCs = 206 > 200 while costing ≈ nothing when idle (disabled). Recommend restating NPC-05 as: draw calls ≤ 120; enabled bodies at brawl peak measured; sim step p99 on desktop ≤ 2 ms in the brawl bench; device fps ≥ 30 (manual).
- **C3 (CTRL-07 / D-29 "0–10"):** raising the cap changes a Phase 1 requirement text and decision. Discuss must amend CTRL-07/D-29 or keep 10.
- **C4 (NPC-04 "rung"):** vibration is not dependable on iOS Safari. Interpret as camera shake (already D-12) plus an optional Android-only haptic.
- **C5 (NPC-04 / criterion 3 "không có máu"):** in Vietnamese "máu" means both blood and HP. Discuss should state both explicitly: no blood AND no HP bar (G11).
- **C6 (scope size):** NPC-01/02 (UI + storage) and NPC-03..06 (AI + physics) are independent. One phase is fine, but plan them as separate waves so the roster can ship even if fight-back feel needs iterations.
- **C7 (dependency on the Phase 1 gate):** ROADMAP says do not go on past Phase 1 on an unmeasured stack; 01.1 "depends on Phase 1". Integration work done before 01-19..01-21 is at risk if the stack changes (G14).

## Gray Areas for Discuss

Mỗi mục có các phương án kèm bằng chứng, chi phí, rủi ro và **một** khuyến nghị. Operator quyết định; không mục nào ở đây là đã chốt.

### G1. Trần số NPC
| Phương án | Bằng chứng | Chi phí | Rủi ro |
|---|---|---|---|
| A. Giữ 10 | 10 là số duy nhất có trong bench 01-17/18; vẫn chưa đo máy thật | 0 | Không đạt "tùy ý"; operator muốn nhiều hơn |
| **B. 15** | Draw 96 (≤ 120); body 200 (+6 ragdoll người chơi = 206, gần ngân sách); vừa đúng 16 bit nhóm va chạm = 15 NPC + người chơi; CPU desktop 1,82 ms/frame, ước lượng điện thoại ≈ 5,6 ms | Nới 3 hằng số (MAX_NPCS, clamp route/texture), capacity nhãn, e2e đo lại | GPU điện thoại chưa đo; phải xác nhận bằng bench máy thật ở 15 |
| C. 20 | Draw 101; body 235 (vượt ước lượng 200 nhưng body tắt gần như không tốn: sim 0,47 ms/step); CPU 1,81 ms | Như B + chia nhóm va chạm (NPC ≥ 15 dùng chung bit) + 4 NPC/tuyến | Ragdoll một số cặp NPC xuyên nhau; chen chúc tuyến; nhãn rối |
| D. 30–40 kèm LOD (ẩn nhãn xa, giảm nhịp animation) | Draw 111–121 (40 vượt 120); CPU 2,1–2,55 ms; không có token thì đuổi chen chúc 8–10 ms/step | Thêm LOD, tuyến mới, UI roster lớn | Vượt trần draw; văn phòng 16×12 m quá chật; khó đọc |

**Khuyến nghị: B (15)**, là một hằng số duy nhất và có thể hạ về 10 nếu bench máy thật ở 15 < 30 fps. Lý do: đây là trần lớn nhất mà mọi ràng buộc cứng đều còn nguyên (bit nhóm va chạm, draw, ước lượng body), và số đo headless còn dư nhiều.

### G2. Cách thêm/bớt nhanh trong lúc chơi
| Phương án | Bằng chứng | Chi phí | Rủi ro |
|---|---|---|---|
| **A. Phím +/− (Equal/Minus, Numpad) + nút nhỏ "− N +" trên HUD (desktop và mobile)** | keyMap đã là data thuần, có typing guard; pointerPick đã bỏ qua `[data-hud-button]`; Ctrl± vẫn là zoom (classifyKey trả null khi có Ctrl) | 1 module thuần + 1 nút DOM + e2e | Thêm một nút trên màn mobile vốn đã có joystick/context/⏸/⟲⟳ |
| B. Chỉ nút HUD, không phím tắt | — | Ít hơn A một chút | Desktop phải dùng chuột, lệch D-27 (bàn phím là chính) |
| C. Bảng roster nhanh (chạm avatar để bật/tắt có mặt) | Gắn thẳng với NPC-02 "chọn ai có mặt" | Lớn: grid avatar, cuộn, tạm dừng khi mở | Nặng UI mobile; chạm trùng joystick |

**Khuyến nghị: A.** Thêm = thành viên đầu tiên chưa có mặt; bớt = người có mặt sau cùng. NPC mới xuất hiện ở điểm tuyến xa người chơi nhất và không chồng lên vật cản. Việc chọn chính xác ai có mặt vẫn làm trong settings.

### G3. Danh sách đồng nghiệp (roster) gồm những gì
| Phương án | Bằng chứng | Chi phí | Rủi ro |
|---|---|---|---|
| A. Mở rộng slot hiện có: 15 slot, mỗi slot có tên + ngoại hình, "có mặt" = N slot đầu | Gần code 01-27 nhất | Nhỏ | Không "chọn ai có mặt" được, chỉ lấy N người đầu |
| **B. Roster tối đa 30 người (tên + ngoại hình trong 17 bộ + tính khí), cờ có mặt ≤ trần, nút "tên ngẫu nhiên" từ danh sách tên vui có sẵn, sửa tên tại chỗ, xoá hết (có xác nhận)** | JSON 30 người = 1.987 ký tự (đo); texture 512² ~20 KB, ~1 MB VRAM mỗi bộ | Vừa: module thuần roster + UI section + setLook | UI dài trên mobile ngang (01-27 đã ghi panel cao quá 90dvh) |
| C. B + chân dung/ảnh xem trước ngoại hình | — | Lớn (render thumbnail hoặc 17 ảnh) | Tăng size/draw; lệch phạm vi |

**Khuyến nghị: B.** Ngoại hình chỉ chọn 'b'..'r'; 'a' giữ cho người chơi để không nhầm với chính mình. Hai người trùng ngoại hình được phép, nhãn tên phân biệt.

### G3r. Tuyến đi cho NPC thứ 11–15 (chưa có navmesh)
| Phương án | Bằng chứng | Chi phí | Rủi ro |
|---|---|---|---|
| **A. Dùng lại 5 tuyến hiện có, lệch pha (startIndex + trễ dwell theo seed)** | 8 NPC đã chạy 3 người/tuyến từ 01-14; tuyến đã qua test khoảng hở 0,35 m | Nhỏ: sửa routeIndex/sharedIndex, thêm test | Hai NPC có thể đứng chồng nhau ở điểm dwell (chỉ là hình, capsule kinematic không kẹt) |
| B. Đặt tay thêm 5 tuyến (tổng 10) | 01-23 đã đặt tay tuyến 3–4 và qua test ngay lần đầu | Vừa: đo layout, test clearance | Văn phòng nhỏ, tuyến mới dễ cắt corridor spawn |
| C. Sinh tuyến theo lưới làn (west/north/mid/south/east) | — | Lớn, chồng lấn Phase 2 navmesh | Làm hai lần |

**Khuyến nghị: A**; Phase 2 navmesh sẽ thay toàn bộ.

### G4. Lưu roster và nâng cấp từ `bt.npcs` v1
| Phương án | Bằng chứng | Chi phí | Rủi ro |
|---|---|---|---|
| **A. Key mới `bt.roster`, migrate một chiều từ `bt.npcs` lần đầu, không xoá `bt.npcs`** | Bản cũ ở `/b/<sha>/` cùng origin (D-04) vẫn đọc/ghi `bt.npcs` | Nhỏ | Hai key tồn tại song song (chấp nhận được) |
| B. Tăng `v: 2` trong cùng key `bt.npcs` | — | Nhỏ nhất | Bản cũ bấm Áp dụng sẽ ghi đè v1 → mất roster |
| C. Chỉ lưu roster, reset hết người dùng cũ | — | Nhỏ | Mất tên operator đã gõ trên máy thật |

**Khuyến nghị: A.**

### G5. Nội dung tên tự gõ (D-31)
| Phương án | Bằng chứng | Chi phí | Rủi ro |
|---|---|---|---|
| **A. Giữ gõ tự do + dòng cảnh báo "Chỉ để vui trên máy bạn, đừng dùng để bắt nạt ai" + nút tên ngẫu nhiên; bộ lọc để Phase 8 như D-31** | Tên chỉ hiện trên máy người gõ (không chat, không chia sẻ). Poki cấm chủ đề bắt nạt và cấm hệ thống chat; CrazyGames yêu cầu PEGI 12 và ToS cấm nội dung bắt nạt/quấy rối | Rất nhỏ | Cổng game có thể vẫn coi tên người thật là rủi ro, nhưng D-31 đã hoãn quyết định tới Phase 8 |
| B. Thêm blocklist từ tục vi/en ngay | — | Vừa (danh sách, false positive dấu tiếng Việt) | Chặn nhầm tên thật; vẫn không chặn được tên người thật |
| C. Chỉ cho chọn tên có sẵn | Đúng hướng "thay bằng danh sách có sẵn" của D-31 | Nhỏ | Mất phần vui "đặt tên đồng nghiệp" operator vừa yêu cầu |

**Khuyến nghị: A.** Không thêm tính năng chụp/chia sẻ tên. Phase 8 quyết lọc hay chỉ-có-sẵn qua PlatformAdapter.

### G6. NPC quyết định nổi giận thế nào
| Phương án | Bằng chứng | Chi phí | Rủi ro |
|---|---|---|---|
| A. Xác suất cố định mỗi cú tát (vd 35%, theo seed) | Đơn giản, deterministic | Nhỏ | Người chơi không đoán được → khó "hiểu vì sao" (Core Value) |
| **B. Thanh giận + tính khí (hiền 3 tát, thường 2, nóng 1; nguội dần sau 6 s không bị tát), jitter ±5 theo seed** | Đọc được và vẫn "tuỳ tính cách/xác suất" như NPC-03; tính khí nằm trong roster | Nhỏ–vừa: 1 module thuần + test | Cần chỉnh số trên máy thật |
| C. Luôn đánh trả sau mỗi cú tát | Dễ test nhất | Nhỏ | Đơn điệu; 15 NPC giận liên tục |

**Khuyến nghị: B.** Nổi giận chỉ bắt đầu **sau khi đứng dậy**, tận dụng nhịp ngã → đứng → "!" → đuổi.

### G7. Người chơi bị đánh trúng thì sao
| Phương án | Bằng chứng | Chi phí | Rủi ro |
|---|---|---|---|
| **A. Ragdoll người chơi (dùng lại ragdoll + getUpFsm), bay nhẹ hơn NPC (~0,5× lực), khoá điều khiển tối đa ~3 s, bất tử 1,5 s sau khi đứng dậy** | createRagdoll nhận parts của mọi nhân vật Blocky; +6 body tắt sẵn, 0 draw; Gang Beasts K.O. tối đa 6 s, có giảm sát thương 4 s sau khi tỉnh | Vừa: bit va chạm cho người chơi, tìm chỗ trống khi đứng dậy, camera theo thân | Kẹt trong bàn (đã có cách tìm chỗ trống + fallback spawn); cảm giác mất quyền điều khiển |
| B. Chỉ choáng/giật lùi (trượt qua KCC + sao chóng mặt 0,8–1,2 s), không ragdoll | Rẻ, không có rủi ro kẹt | Nhỏ | Kém "slapstick" hơn D-12; tiêu chí 3 ghi "choáng/ngã" |
| C. Lai: đòn thường thì giật lùi, đòn thứ 2 trong 5 s thì ragdoll | Có leo thang như Gang Beasts | Lớn nhất | Luật khó hiểu, thêm trạng thái |

**Khuyến nghị: A.**

### G8. Bao nhiêu NPC được đuổi/đánh cùng lúc
| Phương án | Bằng chứng | Chi phí | Rủi ro |
|---|---|---|---|
| A. Không giới hạn | M2/M3: 30 NPC dồn đuổi = 8–10 ms/step, p99 21–43 ms trên desktop | 0 | Vỡ ngân sách trên điện thoại; không đọc được đòn |
| **B. Token: tối đa 3 NPC đuổi, 1 NPC vung đòn một lúc; ai không có token thì đứng tức tối tại chỗ** | token3 = 0,07–0,16 ms/step tới 40 NPC; Arkham/DOOM giới hạn 2–3 kẻ tấn công | Vừa: 1 module thuần | Có thể thấy "chờ lượt" hơi giả; bù bằng hoạt ảnh tức tối |
| C. 1 đuổi, 1 đánh | Rẻ nhất | Nhỏ | Nhiều NPC giận mà ít áp lực, kém vui khi đông |

**Khuyến nghị: B.** Số 3/1 là hằng số, chỉnh sau khi chơi thử.

### G9. Đuổi và bỏ cuộc
| Phương án | Bằng chứng | Chi phí | Rủi ro |
|---|---|---|---|
| **A. Đuổi bằng KCC thẳng hướng (2,2 m/s < người chơi 3,2 m/s), tránh kẹt bằng bước ngang; bỏ cuộc khi đánh trúng 1 lần (hả giận) hoặc > 8 s hoặc > 9 m; về tuyến cũng qua KCC** | Đo được giá rẻ khi ≤ 3 người đuổi; Rapier KCC trượt theo bàn | Vừa | Có thể kẹt góc bàn khó; có giới hạn thời gian nên không đuổi mãi |
| B. Đuổi tới khi người chơi ra khỏi khoảng cách, không giới hạn thời gian | — | Nhỏ | Có thể bị đuổi vô tận, kẹt vĩnh viễn |
| C. Nhớ thù cả phiên: gặp lại trong 30 s là đuổi tiếp | Thêm chiều sâu | Vừa | Chồng lấn quan hệ NPC của Phase 5 (GOSSIP-07) |

**Khuyến nghị: A.** Thù không lưu qua phiên; Phase 5 sẽ nối vào quan hệ.

### G10. Báo trước đòn, né và mobile
| Phương án | Bằng chứng | Chi phí | Rủi ro |
|---|---|---|---|
| **A. Vung chậm 0,6 s + "!" trên đầu + âm báo; né bằng cách đi ra khỏi tầm (1,9 m trong 0,6 s); tát lại lúc NPC đang vung thì cắt đòn; không thêm nút** | Tell là chuẩn thể loại (DmC: tư thế chuẩn bị + lóe + âm thanh); D-18 chỉ một nút hành động | Nhỏ | Trên điện thoại 0,6 s có thể hơi ngắn → hằng số, chỉnh khi chơi thử |
| B. Thêm nút lướt/né | — | Vừa: nút mới, input, animation | Màn hình mobile đã đông; lệch D-18 |
| C. Không báo trước, trúng ngay khi trong tầm | — | Nhỏ nhất | Không công bằng, người chơi không hiểu vì sao ngã |

**Khuyến nghị: A.**

### G11. Phản hồi khi bị đánh và "không máu"
| Phương án | Bằng chứng | Chi phí | Rủi ro |
|---|---|---|---|
| **A. Không thanh máu, không máu: hit-stop 80 ms, rung camera mạnh hơn khi mình tát (0,22 m/260 ms), SFX impactPunch_medium, viền đỏ mờ 250 ms, sao chóng mặt; rung điện thoại chỉ Android nếu có** | PEGI 12 cho phép chấn thương nhẹ kiểu cú tát, cấm máu/vết thương/nhấn mạnh đau; iOS Safari không có vibrate đáng tin | Nhỏ; SFX đã có trong pack đã tải | Viền đỏ có thể bị hiểu là "máu": chọn màu cam/trắng nếu operator thấy vậy |
| B. Thêm đồng hồ "chóng mặt" ẩn, bị đánh nhiều thì ngã lâu hơn | Gang Beasts tăng thời gian K.O. theo số lần | Vừa | Luật ẩn khó hiểu |
| C. Thanh máu/HP người chơi | — | Vừa | Trái tiêu chí 3; Phase 4 sở hữu thanh stress |

**Khuyến nghị: A.**

### G12. Nhãn tên khi đông người
| Phương án | Bằng chứng | Chi phí | Rủi ro |
|---|---|---|---|
| **A. Luôn hiện như hiện nay + công tắc "Hiện tên" trong settings** | Nhãn chỉ tốn 0,08–0,13 ms/frame ở 10–40 NPC | Nhỏ | Rối mắt ở 15 NPC trong khung dọc |
| B. Chỉ hiện nhãn NPC gần (≤ 6 m), đang giận hoặc đang được nhắm | — | Vừa | Người chơi không thấy tên người ở xa |
| C. Mờ dần theo khoảng cách | — | Vừa | Khó đọc |

**Khuyến nghị: A.**

### G13. Benchmark và soak
| Phương án | Bằng chứng | Chi phí | Rủi ro |
|---|---|---|---|
| **A. Giữ nguyên `?bench=1` (không đánh trả) + thêm `&brawl=1` (N theo trần, 3 người đuổi, người chơi bị hạ nhiều lần) ghi thêm số NPC đuổi tối đa và thời gian sim** | D-08 cần so sánh được với số đo máy thật 01-19 | Vừa: timeline thêm pha | Thêm một URL đo trên máy thật |
| B. Đổi bench mặc định sang có đánh trả | — | Nhỏ | Mất so sánh với 01-19 |
| C. Không đo đánh trả | — | 0 | NPC-05 không có bằng chứng |

**Khuyến nghị: A.** Soak cần reset thêm trạng thái chiến đấu và ragdoll người chơi mỗi vòng.

### G14. Thứ tự làm so với cổng đo máy thật của Phase 1
| Phương án | Bằng chứng | Chi phí | Rủi ro |
|---|---|---|---|
| A. Làm toàn bộ 01.1 ngay, song song với 01-19 | Operator đánh dấu URGENT | 0 chờ | Nếu 01-19..21 hỏng và đổi stack (PlayCanvas), phần tích hợp three/Rapier phải làm lại |
| B. Chờ 01-19 có VERDICT rồi mới làm 01.1 | ROADMAP: không đi tiếp trên stack chưa đo | Chờ operator đo | Chậm tính năng operator đang muốn |
| **C. Làm ngay các module thuần (anger, combatFsm, tokens, strikeHit, playerStun, roster, quickNpc + unit test); phần tích hợp (npc/player/physics/UI/bench) làm sau khi 01-19 có kết quả** | Module thuần không phụ thuộc stack (chỉ TS), dùng lại được nếu đổi engine | Nhỏ | Chờ một ít cho phần chơi được |

**Khuyến nghị: C.** Nếu operator đo 01-19 xong sớm thì gần như không phải chờ.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Mobile CPU ≈ 2.4–3.1× slower than i5-12400 (Geekbench 6 SC from search snippets; page fetches 403) | Measurements M1 | Cap estimate optimistic; device bench at the cap guards it |
| A2 | Mobile GPU handles +1 draw call per NPC up to ~100 draws at ≥ 30 fps | G1 | Cap must drop to 10; draw-call reduction becomes a D-07 lever |
| A3 | Node Rapier timings approximate in-browser WASM timings within ~1.5× (browser sim/step at 10 NPCs 0.38 ms vs Node walk 0.13 / ragdoll 0.33) | M2/M3 | Ratios (crowd vs token) still hold; absolute values differ |
| A4 | `Equal`/`Minus`/`NumpadAdd`/`NumpadSubtract` are the standard `KeyboardEvent.code` names and reachable on common layouts | Pattern 6 | Hotkeys need a different binding; cheap to change (keyMap data) |
| A5 | Proposed tuning numbers (anger per temper, 0.6 s wind-up, 1.5 s cooldown/invulnerability, 2.2 m/s chase, 8 s / 9 m give-up, 0.5× player impulse) feel right | Patterns 2–8 | Needs play-test iteration; all are constants |
| A6 | Local-only typed names are not "chat"/UGC in the Poki/CrazyGames sense | G5 | Phase 8 may require preset-only names (already D-31) |
| A7 | Player ragdoll on collision bit 0 collides with the world and other ragdolls as expected (by the same group semantics as `ragdollGroups`) | Pitfall 5 | Unit test `ragdollGroups`-style function + e2e; fallback share bit 14 |
| A8 | Gang Beasts K.O. figures (max 6 s, 4 s wake protection) from a fan wiki | Pattern 8, G7 | Only used as inspiration, not a requirement |
| A9 | "PEGI 12: no blood/injuries or emphasis on pain toward humans; slap = trivial injury" wording comes from secondary summaries (askaboutgames/parentzone/fandom); pegi.info confirms "non-realistic violence towards human-like characters" | Pattern 8, G11 | Low: design stays well inside (no blood, cartoon ragdoll) |

## Open Questions (RESOLVED)

> **Resolved 16/09/2026 (02-CONTEXT.md):** Q1 → RESOLVED: out of scope (CONTEXT Deferred — NPCs never hit NPCs). Q2 → RESOLVED: out of scope (no witness anger; detection is Phase 3). Q3 → RESOLVED: cap locked at 15 (D-01); real-device confirmation is plan 02-13 `CAP_DECISION` on the two reference phones. Q4 → RESOLVED: no (player look not selectable in Phase 2).

1. **Does the operator want NPCs to hit each other (friendly fire) when a swing misses the player?**
   - What we know: `strikeHit` could test NPC capsules too; it would make chaos funnier.
   - Unclear: scope and readability.
   - Recommendation: out of scope for 01.1 unless the operator asks. Keep strikes player-only.
2. **Should angry NPCs react to the player slapping *another* NPC nearby (witness anger)?**
   - That is Phase 2 detection territory (vision). Recommend no in 01.1.
3. **Is 15 NPCs ok on the two reference phones?**
   - Unknown until 01-19 records models and a bench at the cap runs. Blocks the final cap only, not the logic.
4. **Should the player's own look be selectable from the roster screen?**
   - Not in NPC-02 and it touches Phase 6 outfits. Recommend no.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build, vitest, probes | ✓ | 22.14.0 (engines ≥ 22.12) | — |
| Playwright Chromium | e2e, headless measurement | ✓ | @playwright/test 1.63.0, chromium-1243 + headless shell | — |
| Rapier SIMD in Node | pure physics perf probe (optional dev script) | ✓ | 0.20.0 | compat build |
| Kenney Impact Sounds (downloaded) | new NPC-hit SFX | ✓ | 1.0, `assets-src/downloads/impact-sounds` | reuse `slap-*` at lower rate |
| ffmpeg-static | OGG → MP3 via `npm run assets` | ✓ (devDependency 5.3.0) | — | — |
| Android mid-range + iPhone (models unrecorded) | cap confirmation, fight feel, dodge on touch | ✗ recorded | — | none: manual gate (01-19 protocol) |

**Missing dependencies with no fallback:** real-device measurements (same blocker as Phase 1: device models not yet recorded).
**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.0 (unit, Node), Playwright 1.63.0 Chromium headless + SwiftShader (e2e, projects desktop / mobile-emu) |
| Config file | `vitest.config.ts` (tests/unit/**), `playwright.config.ts` (webServer `vite preview` 4173) |
| Quick run command | `npx vitest run` (note: `npm run typecheck` prints nothing on success, so check its rc) |
| Full suite command | `npm run build && npm run size && npx vitest run && npx playwright test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NPC-01 | add = first absent member, remove = last present, clamp 0..cap, no-op at bounds | unit | `npx vitest run tests/unit/quickNpc.test.ts` | ❌ Wave 0 |
| NPC-01 | Equal/Minus/Numpad bindings; Ctrl± not a game key; typing guard | unit | `npx vitest run tests/unit/keyMap.test.ts` | ✅ extend |
| NPC-01 | Press +/− and tap the HUD pill → `__bt.npcs.length` changes in place, never > cap, `__bt.ragdolls.bodies` ≤ cap×6 (+6 player), survives reload | e2e | `npx playwright test tests/e2e/quickNpc.spec.ts` | ❌ Wave 0 |
| NPC-01 | MEASURE at cap: peak draws ≤ 120, bodies logged, sim ms/step logged | e2e measure | `npx playwright test tests/e2e/characters.spec.ts -g cap` | ✅ extend |
| NPC-01 | ≥ 30 fps Android / 60 desktop at cap | manual | `?bench=1` and `?bench=1&brawl=1` screenshots on the reference phones (01-19 protocol) | manual-only (D-24) |
| NPC-02 | parse/sanitize/whitelist/limits; v1 → roster migration keeps names, looks b..k, count; tampered (oversize, __proto__, bad look, dup ids, present ∉ members) → safe | unit | `npx vitest run tests/unit/roster.test.ts` | ❌ Wave 0 |
| NPC-02 | Roster UI: add member with look + temper, toggle present, rename, random name, clear all (confirm); reload keeps; `<img onerror>` shown literally; `__bt.npcs[i].texture` = chosen look | e2e | `npx playwright test tests/e2e/roster.spec.ts` | ❌ Wave 0 |
| NPC-02 | Old build writes `bt.npcs` v1 after the roster exists → roster intact | e2e | same spec `-g "old build"` (addInitScript writes v1) | ❌ Wave 0 |
| NPC-03 | anger thresholds per temper, decay delay/rate, jitter from seed, retaliate only after get-up | unit | `npx vitest run tests/unit/anger.test.ts` | ❌ Wave 0 |
| NPC-03 | FSM transitions incl. give-up (8 s, 9 m, stuck ×2), interrupt by slap, cooldown | unit | `npx vitest run tests/unit/combatFsm.test.ts` | ❌ Wave 0 |
| NPC-03 | reach + cone hit test edges (1.2 m, 100°, behind, exact boundary) | unit | `npx vitest run tests/unit/strikeHit.test.ts` | ❌ Wave 0 |
| NPC-03 | `?autoplay=1&npcs=1&npcAt=0.9,1.0&fight=always`: slap → ragdoll → recover → `__bt.combat.npcs[0].state` passes pursue → windup → strike | e2e | `npx playwright test tests/e2e/fightBack.spec.ts` | ❌ Wave 0 |
| NPC-04 | player stun timers, input lock, invulnerability, no hit counted during invulnerability | unit | `npx vitest run tests/unit/playerStun.test.ts` | ❌ Wave 0 |
| NPC-04 | Player hit → `__bt.player.mode` ragdoll → recover → animated; move keys ignored while locked; `__bt.hitStop.count` +1; shake seen; `__bt.audio.requested` has the hit SFX; after recovery the position is not inside furniture and the player can walk | e2e | `npx playwright test tests/e2e/playerKnockdown.spec.ts` | ❌ Wave 0 |
| NPC-04 | Feel, readability of wind-up, dodge on touch, PEGI look (no blood/pain) | manual | operator checklist on both phones | manual-only |
| NPC-05 | tokens: ≤ MAX_PURSUERS / ≤ MAX_ATTACKERS, holders keep tokens, deterministic tie-break | unit | `npx vitest run tests/unit/attackTokens.test.ts` | ❌ Wave 0 |
| NPC-05 | `?bench=1&brawl=1&dur=20`: completes, peak draws ≤ 120, `maxPursuers` ≤ 3, sim ms p99 logged | e2e | `npx playwright test tests/e2e/bench.spec.ts -g brawl` | ✅ extend |
| NPC-05 | Default `?bench=1` timeline unchanged (same actions as before) | unit | `npx vitest run tests/unit/benchTimeline.test.ts` | ✅ |
| NPC-06 | same seed + same inputs → deep-equal traces for anger/FSM/tokens over 600 steps; different seed differs; no `Math.random` in new logic files | unit + grep | `npx vitest run tests/unit/combatDeterminism.test.ts` and a grep gate `Math.random` count = 0 in `src/logic/{anger,combatFsm,attackTokens,strikeHit,playerStun,quickNpc,roster}.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run` (+ `npm run typecheck`, check rc).
- **Per wave merge:** full suite.
- **Phase gate:** full suite green + device bench screenshots at the cap (default and brawl) on both reference phones + manual feel checklist, before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/unit/{quickNpc,roster,anger,combatFsm,strikeHit,playerStun,attackTokens,combatDeterminism}.test.ts`
- [ ] `tests/e2e/{quickNpc,roster,fightBack,playerKnockdown}.spec.ts`; extend `characters.spec.ts` (cap MEASURE), `bench.spec.ts` (brawl), `keyMap.test.ts`
- [ ] Test hooks: `__bt.combat` (npcs: id/state/anger/token; player: mode/invulnLeft/hitsTaken; tokens), `__bt.roster` (members count, present ids, storageOk); literal-only `?fight=always`
- [ ] Soak: `resetForSoak` covers combat state and the player ragdoll (extend `soak-leak.spec.ts` expectations)

## Security Domain

ASVS Level 1, block on high (`.planning/config.json`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture / threat model | yes | Threats below go to `<threat_model>` of each plan |
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Validation, Sanitization, Encoding | yes | Roster parse: raw length cap (8192) before `JSON.parse` in try; plain-object + version check; copy only whitelisted fields (never `Object.assign` from parsed data); `sanitizeNpcName`; look ∈ `b..r`; temper enum; id regex; members ≤ 30; present ⊆ ids, ≤ cap. Query `?npcs` clamp to cap; `?fight` literal whitelist. Output via textContent only |
| V6 Cryptography | no | — |
| V8 Data Protection | yes | Coworker names may be personal data of third parties: stored only in localStorage on the device, never sent (CSP `default-src 'self'`, no fetch in roster modules, grep gate), "Xoá hết" button, no share/export |
| V11 Business logic (abuse) | yes | Pool grow-only ≤ cap under +/− key repeat; debounce storage writes; tokens bound the physics work per step |
| V14 Configuration | yes | No new headers/CSP changes; no new packages |

### Known Threat Patterns for {static browser game + localStorage roster + DOM labels}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stored XSS via a roster name or marker text | Tampering | textContent only; grep gate for innerHTML/outerHTML/insertAdjacentHTML = 0 in src |
| Tampered storage spawning unbounded NPCs / huge arrays | DoS | clamp count to cap; members ≤ 30; raw ≤ 8192; ignore invalid → defaults |
| Prototype pollution through `__proto__`/`constructor` keys in stored JSON | Tampering | whitelist copy into fresh objects; unit test with hostile payload |
| Old same-origin build overwriting the roster | Tampering (integrity) | new key `bt.roster`; `bt.npcs` read-only for migration |
| Key-repeat spam (+ held) thrashing spawn/despawn | DoS | grow-only pool, state no-op at bounds, ignore `repeat` or rate-limit to one change per 150 ms |
| Real coworker names used to bully (content) | Repudiation / reputational | local-only, warning text, no sharing, Phase 8 review (D-31) |
| Query flags altering gameplay in production (`?fight=always`) | Tampering (low impact, single-player) | literal-only parsing, same as `?scenario=smash`; documented as test flag |

## Sources

### Primary (HIGH confidence, tool-verified this session)
- Repo code read directly: `src/game/{npc,slap,player,game,loop,waypoints,layout,npcSettingsStore}.ts`, `src/physics/{ragdoll,characterController}.ts`, `src/render/characters.ts`, `src/logic/{npcSettings,getUpFsm,waypointWalker,swing,rng,hitStop,nearest,keyMap}.ts`, `src/ui/{npcSettingsSection,npcLabels}.ts`, `src/bench/benchScript.ts`, `src/game/autopilot.ts`, `src/input/inputState.ts`
- `node_modules/@dimforge/rapier3d-compat/dist/control/character_controller.d.ts`, `dist/pipeline/world.d.ts` (KCC, castRay, intersectionWithShape, castShape signatures)
- `src/assets/character.glb` JSON chunk (27 clip names); PNG headers of `src/assets/tex/*`
- Probes (Temp, not committed): `physics-probe.mjs`, `physics-probe2.mjs`, `patch-app.mjs` + `browser-probe.mjs` results reproduced in §Measurements
- Planning: ROADMAP.md, REQUIREMENTS.md, PROJECT.md, STATE.md, 01-CONTEXT.md (D-11..D-31), 01-RESEARCH.md (Performance budget, Pattern 14, A6), 01-23/01-27/01-17/01-18 SUMMARY, 01-DEVICE-LOG.md, deferred-items.md

### Secondary (MEDIUM confidence)
- [PEGI: What do the labels mean](https://pegi.info/what-do-the-labels-mean): PEGI 7/12 violence wording
- [CrazyGames Gameplay requirements](https://docs.crazygames.com/requirements/gameplay/): "Your game must be PEGI 12 compliant"
- [CrazyGames Quality guidelines](https://docs.crazygames.com/requirements/quality/): restricted keys, layout-adaptive bindings
- [Poki Content & player safety](https://developers.poki.com/guide/content-player-safety): no chat systems; bullying out of scope
- [Rapier JS character controller guide](https://rapier.rs/docs/user_guides/javascript/character_controller/): impulses to dynamic bodies, computed collisions, filters
- [MDN Storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria): 5 MiB localStorage per origin, QuotaExceededError
- [Game Developer: Enemy design and enemy AI for melee combat systems](https://www.gamedeveloper.com/design/enemy-design-and-enemy-ai-for-melee-combat-systems): tokens, 2–3 s spacing, tells, near/far groups
- [UnrealAITokenSystem (DOOM-inspired token system)](https://github.com/Lim-Young/UnrealAITokenSystem)

### Tertiary (LOW confidence, flagged)
- [Gang Beasts Wiki: K.O. mechanic](https://gangbeasts.fandom.com/wiki/K.O._mechanic): max 6 s K.O., wake protection 4 s
- [Ask About Games PEGI ratings](https://askaboutgames.com/need-to-know/pegi-ratings) / [Parent Zone](https://parentzone.org.uk/article/pegi-games-ratings) / [Rating System Wiki](https://rating-system.fandom.com/wiki/12_(PEGI)): "slap = trivial injury", "no blood or emphasis on pain" (search summaries)
- Geekbench 6 single-core figures via search snippets: [nanoreview i5-12400](https://nanoreview.net/en/cpu/intel-core-i5-12400), [nanoreview SD 7 Gen 1 vs 695](https://nanoreview.net/en/soc-compare/qualcomm-snapdragon-7-gen-1-vs-qualcomm-snapdragon-695), [cpu-monkey SD695 vs G99](https://www.cpu-monkey.com/en/compare_cpu-qualcomm_snapdragon_695_5g-vs-mediatek_helio_g99) (pages returned 403 to direct fetch)
- [MDN Navigator.vibrate](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate), [caniuse](https://caniuse.com/mdn-api_navigator_vibrate), [BCD issue 29166](https://github.com/mdn/browser-compat-data/issues/29166): conflicting iOS Safari support
- [Crazy Office on CrazyGames](https://www.crazygames.com/game/crazy-office-slap-and-smash) and reviews: targets throw objects at the player (Phase 4-like mechanic, not adopted)
- [Untitled Goose Game (Wikipedia)](https://en.wikipedia.org/wiki/Untitled_Goose_Game): NPCs chase the goose when it trespasses or steals, then tidy items back (no numeric thresholds found)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, no new packages; all APIs confirmed in local d.ts and code.
- Architecture: MEDIUM-HIGH. Built on existing tested modules; pursuit/token costs measured headless.
- Perf cap: MEDIUM. Linear draw/body formulas exact; CPU measured on desktop; mobile GPU/CPU estimated only.
- Design tuning numbers: LOW-MEDIUM. Proposals for play-testing.
- Pitfalls: HIGH for code-derived ones (clamps, storage origin, groups, texture pop); MEDIUM for feel.

**Research date:** 2026-09-15
**Valid until:** 2026-10-15 (stack pinned; re-check after 01-19 device results or any change to MAX_NPCS/ragdoll/bench)
