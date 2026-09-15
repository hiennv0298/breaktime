---
phase: 01-spike-k-thu-t-ng-deploy
plan: 16
subsystem: breakables-debris
tags: [rapier, contact-force-events, instanced-mesh, shard-kit, debris-budget, quality-tiers, web-audio, mulberry32, vitest, playwright, tdd]
requires:
  - "01-10: createProps / PropRecord (kind, home, centre, mass), byColliderHandle, blob shadows, pickNearest targeting"
  - "01-11: TIERS[t].debrisCap 20/40/60, createQualityManager / subscribeQuality, __bt.hud drawCalls / bodies"
  - "01-13: playSfx, sfxNames, pickVariant, break-glass-0..1 / break-ceramic-0..1 / drop-wood-0..1 / drop-soft-0 / drop-metal-0"
  - "01-15: mulberry32 / BENCH_SEED, the Rapier 0.20 disabled-body mass-0 quirk, __bt.audio.requested"
provides:
  - "src/logic/debrisBudget.ts: DebrisBudget, createDebrisBudget(cap, capacity = 60), DEFAULT_DEBRIS_CAPACITY"
  - "src/logic/impact.ts: BreakRole, shardCountFor, shouldBreak, breakSoundFor, dropSoundFor, DROP_MIN_FORCE 15, DROP_COOLDOWN_MS 250"
  - "src/render/shardKit.ts: SHARD_SHAPES 5, SHARD_ASPECT, SHARD_TRIANGLES, ShardKit, createShardKit(scene, capacity)"
  - "src/physics/shards.ts: SHARD_LIFETIME_S 2.5, SHARD_SHRINK_S 0.3, Shards (emit/fixedUpdate/sync/active/cap/clearAll), createShards"
  - "src/game/breakables.ts: BREAK_FORCE (N/kg), DROP_MIN_FORCE_PER_KG 60, SMASH_ARMED_FACTOR 0.5, Breakables, createBreakables"
  - "src/physics/props.ts: CONTACT_FORCE_EVENT_THRESHOLD 8 (N/kg), MOVED_DISTANCE 0.3, PropRecord.halfExtents / broken, Props.movedCount / brokenCount / resetAll"
  - "src/game/game.ts: SMASH_STEP 30, scenarioFromQuery"
  - "URL param scenario=smash; window.__bt.debris { active, cap, broken, breaks, drops, lastBreak }; __bt.props.movedCount / brokenCount / list[].broken"
affects: [01-17, 01-18, 01-19, 01-20]
tech-stack:
  added: []
  patterns:
    - "Contact force normalised per kg of the prop: every prop has density 1, so Newton thresholds would depend on object size"
    - "Pooled shard bodies created disabled once; emit = setEnabled + setHalfExtents + setLinvel (velocity, not impulse, because of the mass-0 quirk)"
    - "One InstancedMesh per shard shape, instance index = debris slot, mesh hidden while it has no live instance (0 idle draw calls)"
    - "Debris budget as a doubly linked FIFO over typed arrays; returned arrays reused, so a break allocates nothing"
    - "Shard tint = most common palette texel under the object's UVs (Kenney materials are white + palette texture)"
    - "Broken props are disabled, not removed: collider handle, mass and byColliderHandle stay valid; resetAll re-enables"
key-files:
  created: [src/logic/debrisBudget.ts, src/logic/impact.ts, src/render/shardKit.ts, src/physics/shards.ts, src/game/breakables.ts, tests/unit/debrisBudget.test.ts, tests/unit/impact.test.ts, tests/e2e/breakables.spec.ts]
  modified: [src/physics/props.ts, src/game/game.ts]
decisions:
  - "01-16: Break and drop forces are measured in N per kg of the prop, not in N. Rapier 0.20 with density 1 was measured in Node: a mug (1.96 g) knocked off a 0.76 m desk peaks at 0.50 N, a monitor at 9.3 N and a chair dropped 0.3 m at 59.7 N, but all land at 165-259 N/kg. The plan's 12-25 N thresholds could never break a mug, and a single N threshold cannot fit both a mug and a monitor."
  - "01-16: BREAK_FORCE = mug 96, plantSmall 112, pottedPlant 144, computerScreen 160 N/kg (plan ratios x8; the monitor was lowered from 200). Collider event threshold = 8 N/kg x body mass. Drop SFX in play need >= 60 N/kg (~1 m/s landing), because at the pure default of 15 every prop settling at load would clatter."
  - "01-16: ?scenario=smash arms every breakable to break at 0.5x its threshold until it breaks or resets. Unarmed, 8 NPCs broke only 10/11 (d1-screen landed softly). Armed, it breaks 11/11 at 3 NPCs, 8 NPCs and q=low."
  - "01-16: A broken prop's body is disabled, not removed from the world. Removing it would invalidate the collider handle map and rec.body, and resetAll would have to allocate new bodies. HUD bodies therefore do not drop when something breaks."
  - "01-16: The shard tint is sampled from the palette texture, because Kenney materials are white with a palette map and 'first material colour' would make every shard white. It is computed once per role at game creation, with fixed per-role fallback colours."
  - "01-16: Contact force events are drained at the start of the next fixed step, before any other logic, instead of adding a hook to loop.ts. The auto-drain queue only clears when the next world step starts, so no event is lost."
  - "01-16: The shard pool subscribes with subscribeQuality (which is built on onChange), because createGame runs before startLoop creates the quality manager, so getQuality() would throw."
metrics:
  duration: "~36 min (10:04Z to 10:40Z)"
  completed: 2026-09-15
  tasks: 2
  files: 10
---

# Phase 1 Plan 16: Breakables, shared shard kit and ?scenario=smash Summary

Monitors, mugs and plants now shatter into 5-8 pieces from one shared, in-code low-poly shard kit, tinted with the object's palette colour and scaled to its size. The shards bounce around, shrink out after 2.8 s, and never exceed the quality tier's debris cap (20/40/60). The oldest shard is recycled first and a break allocates nothing. Chairs, bins, boxes, books and keyboards only tip, slide and fall, with wood/soft/metal drop sounds (250 ms per-prop cooldown). Breaks play glass (monitor) or ceramic (mug, plant) SFX. `?scenario=smash` launches every dynamic prop at sim step 30 with the bench seed. It breaks all 11 breakables and moves all 33 props, and `__bt.debris` / `__bt.props.movedCount` expose the counters for the benchmark (01-17).

## Measurements (headless SwiftShader, 1280x720, preview build, `?autoplay=1&scenario=smash`)

| Case | Draw calls at start / peak / after cleanup | HUD bodies | Live shards peak (cap) | Broken | Moved | Shards all gone |
|------|-------------------------------------------|------------|------------------------|--------|-------|-----------------|
| 3 NPCs | 104 / **105** / 81 | **116** (56 before + 60 pooled) | **60** (60) | 11/11 | 33/33 | ~5.0 s after page start |
| 8 NPCs | 134 / **134-135** / 113 | **151** (91 + 60) | **60** (60) | 11/11 armed (10/11 unarmed) | 32/33 | ~5.5 s |
| 3 NPCs, `q=low` | 104 / 105 / - | 116 | **20** (20) | 11/11 | - | - |

- **Draw calls:** the kit adds 0 draw calls while idle (104 at start, the same as 01-15) and at most +5 during a burst. Broken objects are hidden, so the count after cleanup is lower (81 at 3 NPCs). At 8 NPCs it is still over the ≤ 120 bench budget, as already known from 01-14. The fix for that is D-07 step 3 in 01-20.
- **Bodies:** the pool adds a constant 60 disabled bodies at start, and nothing per break. 151 at 8 NPCs is still under the ~200 cap.
- **SwiftShader fps** during the smash was 22-39 (steady state 40-47). These numbers say nothing about the phones.
- **Timeline at 3 NPCs:**
  - smash at step 30
  - 2 broken at 0.58 s
  - 10 broken at 2.0 s
  - 11 broken at 2.5 s
  - live shards 60 → 54 → 37 → 0 by 5.0 s
  - `drops` 46 in total
  - `__bt.audio.requested` contained `break-glass-0/1`, `break-ceramic-1`, `drop-wood-0/1`, `drop-soft-0` and `drop-metal-0`
- **Visual check** (screenshot, not committed): props scattered, terracotta shards from the big plant pot, grey monitor shards, no white debris.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED + pure GREEN) | Debris budget and impact rules via TDD; failing breakables e2e | c13be7f | src/logic/debrisBudget.ts, src/logic/impact.ts, tests/unit/debrisBudget.test.ts, tests/unit/impact.test.ts, tests/e2e/breakables.spec.ts |
| 2 (GREEN) | Shard kit, shard pool, breakables, contact-force routing, SFX, smash scenario | 9f35f96 | src/render/shardKit.ts, src/physics/shards.ts, src/game/breakables.ts, src/physics/props.ts, src/game/game.ts |

## Verification evidence

**Task 1:**
- Unit tests first failed to import (rc 1), then passed 20/20: debrisBudget 8, impact 12.
- The verify script (`bash` on a .sh file) printed `UNIT_GREEN` and `E2E_RED`. All 3 breakables tests failed with `waitForFunction: Timeout 10000ms` while waiting for `__bt.debris`, which is the expected reason.
- Pure modules: `grep -c "from 'three'" ... | grep -v ":0" | wc -l` = 0.

**Task 2:**
- `npx playwright test tests/e2e/breakables.spec.ts --project=desktop`: 3 passed.
- Acceptance greps:
  - `InstancedMesh` in shardKit.ts = 4.
  - `ConvexObjectBreaker` in src = 0 files.
  - `drainContactForceEvents` in game.ts: line 314.
  - shards.ts exports `SHARD_LIFETIME_S = 2.5` (line 19) and `SHARD_SHRINK_S = 0.3` (line 20).
  - `new InstancedMesh|new BufferGeometry` in shards.ts + breakables.ts = 0.
  - `debrisCap` in shards.ts: line 104.
  - `blood|gore|máu` in src = 0 (T-01-16-04).

**Full local suite (after Task 2):**
- `npx tsc --noEmit`: rc 0, 0 bytes of output. `npm run typecheck`: rc 0.
- `npx vitest run`: 28 files, **300/300** (was 280, +20).
- `npm run build`: rc 0. game chunk 122.43 kB (+10.6 kB), sfx 4.55 kB, index 7.63 kB.
- `npm run size`: `SIZE_GATE_OK totalRaw=7268695 files=52`. First load is still 3,360,593 bytes (`FIRST_LOAD_LEVEL=ok`), because the game chunk loads after ready-to-play.
- `npx playwright test`: **55 passed, 39 skipped, 0 failed**, rc 0. That is 52 before plus the 3 breakables tests; the 3 new skips are the same tests in mobile-emu.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Newton thresholds could never fire for density-1 props**
- **Found during:** Task 2, before implementation, with a Node probe on the installed rapier3d-compat 0.20.
- **Issue:**
  - Contact force scales with mass. A mug knocked off a desk peaks at 0.50 N, so `BREAK_FORCE.mug = 12` N and the 8 N event threshold would never fire.
  - A monitor lands at 9.3 N and a chair at 59.7 N, so no single N value fits every object.
- **Fix:**
  - `breakables.onContactForce` still receives `totalForceMagnitude()` in N and divides by the prop's mass.
  - `BREAK_FORCE` is in N/kg (mug 96, plantSmall 112, pottedPlant 144, computerScreen 160).
  - The collider threshold is `8 × mass`.
  - Drop SFX in play use `minForce: 60` N/kg. The pure default stays 15 and is unit-tested.
- **Files modified:** src/game/breakables.ts, src/physics/props.ts
- **Commit:** 9f35f96

**2. [Rule 1 - Bug] "First mesh material colour" is white for every Kenney object**
- **Found during:** Task 2 (`gltf-transform inspect`: office.glb uses PaletteMaterial001/002 and food.glb uses colormap, all with a baseColorTexture).
- **Fix:** `dominantColour()` samples the most common palette texel under the object's UVs, through `Texture.transformUv`, and multiplies it by the material colour. It runs once per role at creation. If the image cannot be read, fixed per-role colours are used.
- **Files modified:** src/game/breakables.ts
- **Commit:** 9f35f96

**3. [Rule 1 - Bug] Smash did not break every breakable with 8 NPCs**
- **Found during:** Task 2 probe. Unarmed, 10/11 broke at 8 NPCs (d1-screen survived). The e2e floor is ≥ 10, and the plan says "breaks every breakable".
- **Fix:** `smashAll` arms breakables at `SMASH_ARMED_FACTOR 0.5` until they break or reset, and the monitor threshold was lowered from 200 to 160. Result: 11/11 at 3 NPCs, 8 NPCs and q=low.
- **Files modified:** src/game/breakables.ts
- **Commit:** 9f35f96

**4. [Rule 3 - Blocking] Quality manager does not exist when the game is created**
- **Issue:** `getQuality().onChange` throws inside `createGame`, because main.ts calls `createGame` before `startLoop`.
- **Fix:** the pool uses `subscribeQuality`, which queues early subscribers and wraps `onChange`. The budget starts at 60 and is set to the real tier before the first frame. e2e confirms `q=low` gives cap 20.
- **Commit:** 9f35f96

### Implementation choices within the plan's intent

- **Broken props are disabled, not removed.** See the decisions above. `Props.resetAll` re-enables them instead of recreating bodies.
- **Shard size:** largest object extent × rng(0.18..0.35) × the shape's own aspect (`SHARD_ASPECT`), with a minimum edge of 0.03 m. Shard bodies use CCD. A per-axis bbox multiply would have turned every shape into the same cube.
- **Event drain point:** contact events are drained at the start of the next `fixedUpdate` (see decisions). loop.ts is unchanged.
- **Additive interfaces:**
  - `Shards.cap()` and `Props.movedCount()` / `brokenCount()`.
  - An optional `BreakablesOptions { onBreak, onReset }`, used to remove and restore prop blob shadows.
  - `__bt.debris` extras `breaks`, `drops` and `lastBreak {id, role, force, armed}` for 01-20 tuning.
  - Targeting skips broken props.
- **Reused return arrays:** `debrisBudget` returns reused arrays (documented, and copied in the tests), so emit allocates nothing.
- **Drop families** cover every dynamic role:
  - printer and laptop → metal
  - waterCooler and computerMouse → soft
  - chairDesk, computerKeyboard and unknown roles → wood, with `drop-wood-1` for a landing at ≥ 2× minForce

## Deferred Issues

- The player's kinematic capsule (01-03/01-10, `setApplyImpulsesToDynamicBodies(true)`) can launch `d4-laptop` across onto desk d2 and break its monitor or mug. Measured at 202-300 N/kg in 3 of 4 scripted walks, with 0 breaks when idle for 15 s. The break rules are right; how hard the capsule pushes is out of scope. Logged in `deferred-items.md` for 01-20.

## Human check (end of phase, per `human_verify_mode`)

Run `npm run dev` and open `?scenario=smash`, then in normal play slap a coworker into a desk. **Expected:** coloured shards that vanish after about 3 s, bins and chairs tumbling with clatter, no permanent debris. This is a feel judgement and has not been done yet.

## Known Stubs

None. `Props.resetAll` / `Breakables.resetAll` have no in-game caller yet; plan 01-18 (soak) wires them in, as the plan states.

## Threat Flags

None. The only new surface is `?scenario`, which is covered by T-01-16-03: only the literal `smash` is recognised, it fires once at step 30, and the impulses are bounded constants × mass.

## Self-Check: PASSED

- All 8 created and 2 modified files exist.
- Commits c13be7f and 9f35f96 exist in `git log`.
