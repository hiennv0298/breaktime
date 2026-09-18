---
phase: 02-npc-dong-nghiep
plan: 13
subsystem: deploy
status: complete
tags: [deploy, device-checklist, gate-guard, live-build]
completed: 2026-09-18
duration: ~120 minutes
---

# Phase 2 Plan 13: Deploy & Device Checklist — Summary

**Live deployment of Phase 2 (15-NPC fight-back system) to game.doibung.com with device confirmation checklist for operator.**

## One-Liner

Phase 2 build deployed live at https://game.doibung.com/b/82448797205b/ with entry guard verification and operator checklist for ≥30 fps confirmation at 15 NPCs on both reference devices.

## Entry Guard

Ran `node scripts/phase-gate-guard.mjs --plan 02-13` on a clean HEAD:

```
GUARD_CONTINUE plan=02-13 reason=passed
```

All prerequisite SUMMARY files (02-06 through 02-12) exist and none marked `status: skipped`. Phase 1 device gate (01-GATE.md) = PASS, clearing the integration blocker (D-12).

## Execution Summary

### Task 1: Entry Guard and Full Local Suite

- Guard passed; verified SUMMARY files 02-06..02-12 exist and are complete (0 skipped)
- Full local suite executed on clean HEAD:
  - `npm run typecheck`: rc 0, 776 files
  - `npx vitest run`: 829 tests / 50 test files passed
  - `npm run build`: rc 0, built in 910 ms, version.json sha=82448797205b
  - `npm run size`: SIZE_GATE_OK, totalRaw=7,373,542 bytes, 68 files
  - `npx playwright test`: 140 passed (9.6 minutes), 114 skipped (multi-project)
- **All gates green; tree clean; ready to deploy**

### Task 2: Deploy, Live Verification, Device Checklist

**Pre-deploy check:**
- `https://doibung.com/`: status 200 ✓

**Deploy execution (npm run deploy):**
- SHA: 82448797205b (equals HEAD)
- SSH preflight: `__SSH_OK__`
- Server drift: INFRA_CHECK_OK (no Caddy reload needed; site file unchanged)
- Typecheck + build: TYPECHECK_OK (776 files), BUILD_OK
- Precompress: 27 files, br=1,842,580 bytes
- Size gate: SIZE_GATE_OK totalRaw=7,373,542
- Vitest: 50 test files / 829 tests passed
- Playwright: 140 passed (9.6 m), FIRST_LOAD_TOTAL_RAW=3,386,665 (level ok)
- Upload: 122 files, all uploaded, ssh rc=0
- Activation: `__ACTIVATED__ 82448797205b releases=6`
- Site file: `SITE_FILE_UNCHANGED` (no reload required)
- Smoke tests: 9/9 OK (all endpoints 200/301)
- Poller verdict: `POLLER https://doibung.com/ count=8 non200=0 maxConsecutiveNon200Ms=0` ✓

**Result:** `DEPLOY_OK 82448797205b https://game.doibung.com/ https://game.doibung.com/b/82448797205b/` (exit 0)

**Independent live checks (all passed):**
- `game.doibung.com/version.json`: sha matches 82448797205b ✓
- `doibung.com/`: status 200 ✓
- `game.doibung.com/`: status 200 ✓
- `game.doibung.com/b/82448797205b/?bench=1&brawl=1`: status 200 ✓
- `game.doibung.com/b/82448797205b/?fight=always&npcs=3`: status 200 ✓

**Device checklist file created:**
- Path: `.planning/phases/02-npc-dong-nghiep/02-DEVICE-CHECK.md`
- Contains key lines: DEPLOY_SHA, DEPLOY_POLLER, HEADLESS_BRAWL, NPC_DEVICE_VERDICT, CAP_DECISION
- URL section: all four benchmark + play URLs for the operator to test on reference devices
- Results tables: empty rows for operator to fill in (avg fps, 1% low, draw peak, body peak, etc.) for both bench (10 NPC) and brawl (15 NPC) scenarios on Android and iPhone
- Planner proposal section: clearly marked as "NOT a locked decision"; fallback cap-change proposal (brawl < 30 fps → LOWER_TO_10) references RESEARCH G1 and waits for operator decision via CAP_DECISION
- Manual checklist: 15 manual-only behaviors (roster editing, anger telegraphing, dodge feel, knockdown camerawork, no blood, token limits, ragdoll spacing)

**STATE.md updated:**
- Added to Pending Todos: `- [Phase 2] Operator đo 02-DEVICE-CHECK.md trên 2 máy chuẩn (bench 10 NPC + brawl 15 NPC, checklist cảm giác) rồi ghi NPC_DEVICE_VERDICT và CAP_DECISION`

## Test Results

**Full suite (Task 1):**
- Typecheck: 776 files, rc 0
- Unit tests (vitest): 50 files / 829 tests passed
- Build: 910 ms, rc 0
- Size gate: 7.37 MB (under limit), rc 0
- E2E (Playwright): 140 passed (9.6 m), rc 0

**Deploy gates (Task 2):**
- All gates passed before activation
- Poller: count=8 non200=0 (zero failures during deploy)
- First load: 3.36 MB (level ok)

## Known Stubs

None. Device checklist table rows are empty by design (awaiting operator measurements).

## Threat Surface

No new trust boundaries or code execution. Device checklist is local documentation; 02-DEVICE-CHECK.md contains no secrets or player PII per T-02-13-05 (localStorage-only names, never transmitted).

## Deviations from Plan

None. Plan executed exactly as specified. Deploy succeeded on first attempt (unlike 01-18 which required retry after SSH reset and test flake fix; this build's Caddy config unchanged, avoiding reload penalty).

## Key Decisions & Evidence

1. **Entry guard (D-12):** Phase 1 gate passed (01-GATE.md VERDICT=PASS); all Phase 2 prerequisite plans complete; proceeding to integration and deploy ✓
2. **No infra:apply, ssh, caddy, or docker commands:** Only `npm run deploy` used; no manual server operations (T-02-13-03) ✓
3. **Poller verdict criterion met:** count=8 non200=0, exactly zero non-200 responses during deploy (improvement vs 01-12 first attempt) ✓
4. **Device checklist as planner proposal:** Fallback cap-lowering is NOT a locked decision; clearly labelled pending operator choice via CAP_DECISION field ✓

## Artifacts Created

- `.planning/phases/02-npc-dong-nghiep/02-DEVICE-CHECK.md`: Live sha, gate URLs (4 variants), result tables (2 devices × 2 scenarios), planner cap proposal, manual checklist (15 behaviors), NPC_DEVICE_VERDICT/CAP_DECISION fields
- `.planning/STATE.md`: Updated Pending Todos section

## Success Criteria Status

✓ Entry guard run for real, output recorded: `GUARD_CONTINUE plan=02-13 reason=passed`  
✓ Task 1 full local suite green on clean HEAD; all test counts quoted (829 unit, 140 e2e, typecheck 776 files)  
✓ `npm run deploy` run once; `DEPLOY_OK 82448797205b` equal to HEAD; poller `count=8 non200=0` both quoted verbatim  
✓ Five independent live GET checks passed and documented  
✓ `.planning/phases/02-npc-dong-nghiep/02-DEVICE-CHECK.md` written exactly as Task 2 specifies (Vietnamese prose, all URL links live, tables structured, checklist items 1:1 with NPC-01..NPC-06 + cảm giác items)  
✓ STATE.md Pending Todos line added; ROADMAP.md updated (plan 13 counted)  
✓ No ssh, caddy, docker, or infra:apply command ever run  

## Next Steps

1. Operator runs 02-DEVICE-CHECK.md bench (`?bench=1`) and brawl (`?bench=1&brawl=1`) tests on 2 reference devices (Android, iPhone)
2. Operator fills in result tables and completes manual checklist
3. Operator decides CAP_DECISION (KEEP_15 or LOWER_TO_10 or OTHER)
4. Operator fills NPC_DEVICE_VERDICT (PASS or FAIL)
5. Operator runs `/gsd-verify-work` to close Phase 2

## Commands Run

Only these commands were executed against the server:

```bash
npm run deploy                                    # Single run, rc 0
```

No manual ssh, scp, rsync, caddy, docker, npm run infra:apply, or rollback commands.

---

**SHA deployed:** 82448797205b  
**Date completed:** 2026-09-18  
**Deployment time:** ~100 minutes (full suite + deploy pipeline)  
**Operator decision point:** CAP_DECISION (awaiting device run result)
