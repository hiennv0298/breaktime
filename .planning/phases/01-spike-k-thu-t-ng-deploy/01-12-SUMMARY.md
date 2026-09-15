---
phase: 01-spike-k-thu-t-ng-deploy
plan: 12
subsystem: infra
tags: [deploy, go-live, caddy, dns, tls, lets-encrypt, approval-token, poller, doibung]
requires:
  - phase: 01-04
    provides: "infra.mjs check/apply/rollback, apply-caddy-sites.sh with state-bound one-time approval nonce, state-check.sh, poller"
  - phase: 01-07
    provides: "npm run deploy (17 fail-fast steps), dnsCheck, smoke, step-16 poller verdict"
  - phase: 01-08
    provides: "joystick controls in the shipped build"
provides:
  - "Live site https://game.doibung.com/ and https://game.doibung.com/b/<sha>/ over a valid Let's Encrypt certificate"
  - "doibung Caddy wiring on the VPS: import sites in /opt/doibung/Caddyfile.nodb, /srv/sites:/etc/caddy/sites:ro in both compose files and the live container, /srv/sites/breaktime.caddy"
  - "Infra backup /root/breaktime-infra-backup/20260915T094249Z and the token-gated rollback form"
  - "Releases 1b318ec49460 and 3d3cb78f560f on the server (current = 3d3cb78f560f)"
  - "01-GO-LIVE.md evidence: DNS, preflight, OPERATOR_REPLY, infra apply, both deploys, verify, rollback, deviation"
affects: [phase-1-verifier, 01-16, 01-17, 01-18, 01-19, 01-20, 01-21, future deploys]
tech-stack:
  added: []
  patterns:
    - "Operator-typed APPROVE-CADDY-<code> token copied verbatim from the reply; refusals recorded for non-matching replies"
    - "A routine deploy leaves Caddy alone (SITE_FILE_UNCHANGED); only a site-file change reloads Caddy"
key-files:
  created:
    - .planning/phases/01-spike-k-thu-t-ng-deploy/01-GO-LIVE.md
    - .planning/phases/01-spike-k-thu-t-ng-deploy/01-12-SUMMARY.md
  modified:
    - .planning/STATE.md
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md
key-decisions:
  - "01-12: go-live ran after 01-13..01-15 by operator choice, so the first live build already has audio, Blocky NPCs and slap ragdolls"
  - "01-12: public domain is game.doibung.com; the internal name stays breaktime (/srv/sites/breaktime, breaktime.caddy)"
  - "01-12: a first deploy that fails only at step 16 (one ~1 s fetch failed during the first-time Caddy site reload) is closed by one operator-approved re-run, not by server fixes; the re-run skipped the reload and passed with non200=0"
  - "01-12: PLAT-02 marked complete (valid HTTPS on its own subdomain, verified independently); PLAT-01 and TECH-01 left for the phase verifier (first deploy had a 1 s doibung blip; real phones not checked)"
patterns-established:
  - "Evidence commits happen only after the deploy run, because deploy refuses a dirty tree"
requirements-completed: [PLAT-02]
duration: 34min
completed: 2026-09-15
---

# Phase 1 Plan 12: Go live on game.doibung.com Summary

**The game is live at https://game.doibung.com/ (release 3d3cb78f560f, Let's Encrypt certificate, /b/<sha>/ per commit). It is served by the shared doibung Caddy, which was rewired with the operator's own one-time token APPROVE-CADDY-4ebe4eba. The first `npm run deploy` saw a single ~1 s connection failure on doibung.com during the first-time site reload. One re-run chosen by the operator ended with DEPLOY_OK, zero non-200 on doibung.com and no Caddy reload.**

## Performance

- **Duration:** about 34 min (2026-09-15T09:25:23Z to 09:59:38Z, including two operator waits)
- **Tasks:** 3 of 3 (Task 1 DNS, Task 2 preflight plus operator token, Task 3 apply, deploy, verify)
- **Files:** 2 created, 3 modified (planning docs only; no source change)

## Accomplishments

- **DNS (Task 1):** game.doibung.com resolved to 187.53.128.67 on 1.1.1.1 and 8.8.8.8 at the first check, and doibung.com was unchanged, so there was no halt.
- **Preflight (Task 2):** `infra:check` exited 2 with 5 DRIFT lines. Tokenless `infra:apply` printed PREFLIGHT_OK, `APPROVAL_CODE=4ebe4eba` and APPROVAL_TOKEN_MISSING, exit 3, with no BACKUP_DIR.
  - The orchestrator refused two operator replies: "oke duyệt", then the literal placeholder "APPROVE-CADDY-APPROVAL_CODE".
  - The third reply, `APPROVE-CADDY-4ebe4eba`, was recorded verbatim.
- **Infra apply (Task 3, step 1):**
  - Markers: APPROVAL_TOKEN_OK, APPROVAL_NONCE_CONSUMED, INFRA_APPLY_OK. The apply ran about 11 min before the nonce TTL expired.
  - Backup `/root/breaktime-infra-backup/20260915T094249Z`.
  - CERT_FP before and after are identical, and the app/postgres IDs are unchanged.
  - The caddy recreate blip was `POLLER count=9 non200=1 maxConsecutiveNon200Ms=509`, well under the 60 s auto-rollback threshold.
- **First deploy (1b318ec49460):**
  - All gates, upload 86/86, activation, `__SITE_RELOADED__` and 9/9 smoke passed.
  - It failed at step 16/17 with `count=22 non200=1 maxConsecutiveNon200Ms=1013`: one `fetch failed` at 09:49:00.038Z.
  - The release stayed current, as 01-07 specifies.
- **Second deploy (3d3cb78f560f, the operator's option 1, run exactly once):**
  - `DEPLOY_OK 3d3cb78f560f https://game.doibung.com/ https://game.doibung.com/b/3d3cb78f560f/`, exit 0.
  - Step 13 printed `SITE_FILE_UNCHANGED` (no Caddy reload).
  - Poller `count=5 non200=0`, smoke 9/9, and the step-17 state check passed.
- **Verify:**
  - The plan chain prints `INFRA_CHECK_OK`, `LIVE_OK 3d3cb78f560f 200 200 301` and `TOKEN_FROM_OPERATOR`.
  - Independent checks: version.json sha is 3d3cb78f560f. /b/3d3cb78f560f/ and /b/1b318ec49460/ both return 200. doibung.com returns 200, and www returns 301 to https://doibung.com/.
  - The doibung.com certificate fingerprint equals CERT_FP_BEFORE. The game.doibung.com certificate is authorized (valid until Dec 14 2026).

## Task Commits

1. **Task 1: DNS** and **Task 2: preflight**: `cb70238` docs(01-12): record DNS resolution and tokenless Caddy preflight
2. **Task 2: operator reply**: `1b318ec` docs(01-12): record operator reply APPROVE-CADDY token verbatim
3. **Task 3: infra apply and first deploy**: `3d3cb78` docs(01-12): record infra apply OK and first deploy fail at poller verdict
4. **Task 3: second deploy, verify, deviation**: `0a91695` docs(01-12): record second deploy DEPLOY_OK 3d3cb78f560f with poller non200=0

The server changes themselves are not commits. They are the infra:apply run (backup above) and the two `npm run deploy` runs.

## Files Created/Modified

- `.planning/phases/01-spike-k-thu-t-ng-deploy/01-GO-LIVE.md`: the evidence log. Sections: DNS, Preflight, Operator reply, Infra apply, First deploy, Rollback, both verify runs, Second deploy, Deviation.
- `.planning/STATE.md`: the 01-12 deploy blocker and deferred row are removed, and position and progress are updated.
- `.planning/ROADMAP.md`: phase 1 plan progress.
- `.planning/REQUIREMENTS.md`: PLAT-02 checked.

## Decisions Made

- **Plan order:** Go-live ran after 01-13, 01-14 and 01-15 because the operator chose that order. The first live build therefore ships audio, 8 Blocky NPCs and slap ragdolls, not just the 01-08 joystick room.
- **Domain:** game.doibung.com is the public domain. The internal name stays `breaktime`.
- **Re-run:** After the step-16 failure the operator chose a single re-run of `npm run deploy`. Server-side fixes and rollback were not options. The re-run was the only server-changing command in the continuation.

## Deviations from Plan

**1. [Operator decision] The first deploy did not reach DEPLOY_OK. The must-have was met on the second run.**
- **Found during:** Task 3, step 3.
- **Issue:** The first `npm run deploy` (1b318ec49460) exited 1 at step 16/17. The doibung.com poller recorded one `fetch failed` of about 1 s (count=22, non200=1, maxConsecutiveNon200Ms=1013) during first-time site activation, when step 13 ran a graceful `caddy reload` adding the game.doibung.com TLS host and ACME issued its certificate.
  - The cause is likely but not proven: there are no per-step timestamps, and no server logs were read because of the operator constraint.
- **Resolution:** A STATE.md blocker went to the operator, who chose option 1 and re-ran `npm run deploy` once.
  - The re-run of 3d3cb78f560f skipped the reload (`SITE_FILE_UNCHANGED`) and got `non200=0` and DEPLOY_OK.
- **Evidence:** 01-GO-LIVE.md "## First deploy", "## Second deploy" and "## Deviation".
- **Commits:** 3d3cb78, 0a91695.

**2. [Record] The deployed sha is the evidence commit, not the game commit.**
- 3d3cb78f560f is a docs-only commit on top of 1b318ec49460. The build output is identical: DIST_RAW=7258044 and FIRST_LOAD_TOTAL_RAW=3360593 in both runs.

**Total deviations:** 1 operator-decided re-run and 1 record note. **Impact:** The goal was met. The residual risk is noted below.

## Issues Encountered

- **Nonce expiry:** The preflight nonce was already 19974 s old (TTL 21600 s), which left about 27 min to approve. The apply ran with about 11 min to spare.
- **Short poller window:** The second deploy's poller window was short (5 samples), because no reload or ACME wait happened. It proves zero non-200 for a routine deploy, not a long soak.

## Known Stubs

None. This plan made no code changes.

## Threat Flags

None beyond the plan's threat model. The only new public surface is game.doibung.com (T-01-12-06, accepted).

## User Setup Required

None remaining. The DNS A record `game → 187.53.128.67` and the approval token were done by the operator.

## Next Phase Readiness

- Any commit can now go live with `npm run deploy`.
- **Residual risk:** A future change to `deploy/caddy/breaktime.caddy` triggers a Caddy reload and may again cause a ~1 s blip on doibung.com. Step 16 will fail such a deploy loudly.
- **Whattoeat deploy:** A future whattoeat deploy (`rsync --delete` on /opt/doibung) may remove the import line. `npm run deploy` then stops at step 3 with DRIFT, and restoring it needs a new operator token.
- **For the phase verifier:**
  - Real-phone check (Android Chrome, iPhone Safari) on https://game.doibung.com is still open. It is the plan's human-check.
  - PLAT-01 and TECH-01 are left unmarked.
- **Rollback:**
  - Release: redeploy 1b318ec, or use /b/1b318ec49460/.
  - Infra: `npm run infra:rollback -- /root/breaktime-infra-backup/20260915T094249Z --approve=APPROVE-CADDY-<new operator code>` after a fresh preflight.

---
*Phase: 01-spike-k-thu-t-ng-deploy*
*Completed: 2026-09-15*
