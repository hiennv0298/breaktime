---
phase: 2
slug: npc-dong-nghiep
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-16
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Nguồn: `02-RESEARCH.md` §Validation Architecture. **Research dùng số NPC-0x của bản nháp cũ; bảng dưới đã ánh xạ lại theo REQUIREMENTS đã chốt 16/09:** research NPC-04 (người chơi bị hạ gục) → **NPC-05**; research NPC-05 (token) → **NPC-03**, (brawl bench) → **NPC-06**; báo trước/né đòn = **NPC-04**.
> Cập nhật 16/09 sau khi lập plan (revision 1: tách 02-06 thành 02-06 trần 15 + 02-07 roster, các plan sau lùi một số, tổng 13 plan): task ID thật `02-NN-Tk` (plan 02-NN, task k). Plan 02-01..02-05 là logic thuần (không cần cổng); plan 02-06..02-13 có Task 1 là entry guard D-12 (`node scripts/phase-gate-guard.mjs --plan 02-NN`) — nếu guard in `PLAN_EXIT_*` thì các task còn lại của plan đó không chạy và các dòng tương ứng giữ ⬜.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.0 (unit, Node) · Playwright 1.63.0 Chromium headless + SwiftShader (projects desktop / mobile-emu / no-webgl) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` (webServer `vite preview` 4173) — đã có từ Phase 1 |
| **Quick run command** | `npm run typecheck && npx vitest run` (typecheck im lặng khi đạt — xét rc, chuỗi lệnh in `TYPECHECK_OK`) |
| **Full suite command** | `npm run build && npm run size && npx vitest run && npx playwright test` |
| **Estimated runtime** | quick < 15 s · full ~7–9 min (thêm brawl bench dur 40) |
| **Bẫy máy local** | chạy verify nhiều lệnh qua file `.sh` (inline `set -e` từng cho GREEN giả); `grep -P` im lặng; PATH có thể rơi giữa phiên; Write tool có thể biến escape backslash-u thành ký tự vô hình → quét `CTRL_SCAN` |

---

## Sampling Rate

- **After every task commit:** `npm run typecheck && npx vitest run`
- **After every plan wave:** full suite
- **Before `/gsd-verify-work`:** full suite green + bench screenshots tại trần (`?bench=1` và `?bench=1&brawl=1`) trên 2 máy chuẩn + checklist cảm giác thủ công trong `02-DEVICE-CHECK.md` (plan 02-13)
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|---------|-------------|----------|-----------|-------------------|-------------|--------|
| 02-01-T1 | NPC-03, NPC-06 | ngưỡng giận theo tính khí 1/2/3 cú với 1000 seed (anger mỗi cú 100/60/42), khoảng cách thực tế giữa hai cú (RAGDOLL_TIMEOUT + RECOVER + 1,5 s) và đi chậm 7 s vẫn giữ 1/2/3, đồng hồ nguội chỉ chạy khi NPC đứng (`holdDecay`), jitter 0..5 theo seed, `?fight=always` literal | unit | `npx vitest run tests/unit/anger.test.ts` | ❌ W0 (tạo trong task) | ⬜ pending |
| 02-01-T2 | NPC-03 | token ≤ 3 đuổi / ≤ 1 vung, giữ token, tie-break deterministic, không phụ thuộc thứ tự | unit | `npx vitest run tests/unit/attackTokens.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-T1 | NPC-04, NPC-05 | hit test tầm 1,2 m + nón 100°, đi ra khỏi tầm là trượt; ma trận 16 bit nhóm va chạm (15 NPC + người chơi) | unit | `npx vitest run tests/unit/strikeHit.test.ts tests/unit/collisionGroups.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-T2 | NPC-05 | khoá ≤ 3 s, bất tử 1,5 s, không tính trúng khi ragdoll/recover/bất tử, không có HP; getUpFsm mặc định 4 s giữ nguyên | unit | `npx vitest run tests/unit/getUpFsm.test.ts tests/unit/playerStun.test.ts` | ✅ extend / ❌ W0 | ⬜ pending |
| 02-02-T3 | NPC-05 | 41 điểm tìm chỗ trống khi đứng dậy, kẹp trong phòng | unit | `npx vitest run tests/unit/freeSpot.test.ts` | ❌ W0 | ⬜ pending |
| 02-03-T1 | NPC-06 (D-12) | entry guard: PASS / PASS sau D-07 → tiếp tục; thiếu file / REMEASURE / FAIL chờ D-07 → pending; FAIL cuối / STOP → dừng; blocker STATE.md một dòng (LF và CRLF), không phụ thuộc plan id | unit + CLI | `npx vitest run tests/unit/phaseGate.test.mjs` · `node scripts/phase-gate-guard.mjs --plan 02-03 --dry-run` | ❌ W0 | ⬜ pending |
| 02-03-T2 | NPC-01 | slot 10–14 dùng lại 5 tuyến, điểm xuất phát theo seed cách ≥ 0,6 m; slot 0–9 giữ nguyên Phase 1 | unit | `npx vitest run tests/unit/waypoints.test.ts` | ✅ extend | ⬜ pending |
| 02-04-T1 | NPC-02 | parse/làm sạch/whitelist/giới hạn roster; migrate `bt.npcs` v1 → `bt.roster`; dữ liệu bị sửa (quá cỡ, `__proto__`, look sai, id trùng, present ∉ members) → an toàn; `resolveStartRoster` | unit | `npx vitest run tests/unit/roster.test.ts` | ❌ W0 | ⬜ pending |
| 02-04-T2 | NPC-01, NPC-02 | thêm = người có mặt kế tiếp chưa vào, bớt = người vào sau cùng, kẹp 0..min(15, có mặt); thao tác sửa roster; 32 tên ngẫu nhiên sạch ≤ 16 ký tự | unit | `npx vitest run tests/unit/quickNpc.test.ts tests/unit/presetNames.test.ts tests/unit/roster.test.ts` | ❌ W0 | ⬜ pending |
| 02-04-T3 | NPC-01, NPC-05 | phím Equal/NumpadAdd/Minus/NumpadSubtract; Ctrl± không phải phím game; luật `bt.npcLabels` (chỉ '0' là tắt) | unit | `npx vitest run tests/unit/keyMap.test.ts tests/unit/uiPrefs.test.ts` | ✅ extend | ⬜ pending |
| 02-05-T1 | NPC-03, NPC-04 | FSM: chỉ hành động sau khi đứng dậy, fume khi không có token, windup 0,6 s, bị tát lúc windup thì cắt đòn, bỏ cuộc (1 cú trúng / 8 s / >9 m trong 1 s / kẹt ×2 / nguội), cooldown 1,5 s | unit | `npx vitest run tests/unit/combatFsm.test.ts` | ❌ W0 | ⬜ pending |
| 02-05-T2 | NPC-06, NPC-03, NPC-04 | cùng seed + cùng input → trace giận/FSM/token giống hệt qua 600 step; seed khác thì khác; mọi step ≤ 3 đuổi, ≤ 1 windup; NPC Thường giận sau cú thứ 2 với khoảng cách thực tế; né/cắt đòn/bất tử trong director; `Math.random` = 0 trong file logic Phase 2 | unit + gate | `npx vitest run tests/unit/combatDirector.test.ts tests/unit/combatDeterminism.test.ts` + `PHASE2_PURE_GATE 0` | ❌ W0 | ⬜ pending |
| 02-06-T1 | (D-12) | guard trước khi tích hợp | CLI | `node scripts/phase-gate-guard.mjs --plan 02-06 --dry-run` | ✅ (02-03) | ⬜ pending |
| 02-06-T2 | NPC-01 | `?npcs=` 0..15, NPC 11–15 xuất phát cách nhau ≥ 0,5 m, bench/soak vẫn 10; đo tại trần 15: draw đỉnh ≤ 120, body ≤ 206, in dòng MEASURE | e2e + measure | `npx playwright test tests/e2e/npc.spec.ts tests/e2e/characters.spec.ts --project=desktop` · `… characters.spec.ts -g cap` | ✅ extend | ⬜ pending |
| 02-06-T3 | NPC-01 | spec Phase 1 còn lại cập nhật trần 15 (npcNames, npcSettings) + full suite | e2e | `npx playwright test` | ✅ extend | ⬜ pending |
| 02-07-T1 | (D-12) | guard | CLI | `node scripts/phase-gate-guard.mjs --plan 02-07 --dry-run` | ✅ | ⬜ pending |
| 02-07-T2 | NPC-02 | `rosterStore` (try/catch, không literal key, không mạng), `setLook` + preload; e2e RED | e2e (RED) + gate | `npx playwright test tests/e2e/rosterStart.spec.ts --project=desktop` (phải đỏ) | ❌ W0 | ⬜ pending |
| 02-07-T3 | NPC-02 | văn phòng dựng từ roster (mặc định / migrate / đã lưu), ngoại hình + tên + tính khí theo thành viên, `bt.npcs` cũ không đè roster, bench bỏ qua roster, không ghi `bt.npcs`, storage bị sửa/throw vẫn chạy | e2e | `npx playwright test tests/e2e/rosterStart.spec.ts` | ❌ W0 | ⬜ pending |
| 02-08-T1 | (D-12) | guard | CLI | `node scripts/phase-gate-guard.mjs --plan 02-08 --dry-run` | ✅ | ⬜ pending |
| 02-08-T2 | NPC-01 | phím +/− vào `npcDelta`, không repeat, không khi đang gõ; dòng gợi ý phím thứ 5 | unit + e2e (RED) | `npx vitest run tests/unit/keyMap.test.ts` · `npx playwright test tests/e2e/keyHints.spec.ts` | ✅ extend | ⬜ pending |
| 02-08-T3 | NPC-01 | bấm +/− và nút HUD "− N +" → `__bt.npcs.length` đổi tại chỗ, không vượt 15, 90 body ragdoll NPC ở 15 và sau khi bớt về 0, người mới xuất hiện xa người chơi, Ctrl± không bị chặn, còn sau reload, bench ẩn nút | e2e | `npx playwright test tests/e2e/quickNpc.spec.ts` | ❌ W0 | ⬜ pending |
| 02-09-T1 | (D-12) | guard | CLI | `node scripts/phase-gate-guard.mjs --plan 02-09 --dry-run` | ✅ | ⬜ pending |
| 02-09-T2 | NPC-02, NPC-05 | e2e editor viết trước (RED), port đủ 8 test của npcSettings.spec | e2e (RED) | `npx playwright test tests/e2e/roster.spec.ts --project=desktop` (phải đỏ) | ❌ W0 | ⬜ pending |
| 02-09-T3 | NPC-02, NPC-05 | UI roster: sửa tên/ngoại hình/tính khí, tick có mặt, thêm, xoá, tên ngẫu nhiên, xoá hết (bấm 2 lần); reload giữ; `<img onerror>` hiện nguyên chữ; dòng cảnh báo có mặt; công tắc nhãn; các bảo đảm 01-27 được port | e2e | `npx playwright test tests/e2e/roster.spec.ts` | ❌ W0 (thay npcSettings.spec) | ⬜ pending |
| 02-09-T3 | NPC-02 | bản cũ ghi `bt.npcs` v1 sau khi roster tồn tại → roster nguyên vẹn | e2e | `npx playwright test tests/e2e/roster.spec.ts -g "old build"` | ❌ W0 | ⬜ pending |
| 02-10-T1 | (D-12) | guard | CLI | `node scripts/phase-gate-guard.mjs --plan 02-10 --dry-run` | ✅ | ⬜ pending |
| 02-10-T2 / T3 | NPC-03, NPC-04, NPC-05 | `?autoplay=1&npcs=1&npcAt=1.3,1.6&fight=always`: tát → ragdoll → đứng dậy → fume → pursue → windup ('!') → strike trúng; né bằng đi ra; tát lúc windup cắt đòn; nhãn giận đổi màu; NPC không tên nổi giận hiện nhãn 'Giận!' màu cam; tắt nhãn thì không hiện nhãn nhưng vẫn có '!'; NPC Thường cần 2 cú thật với khoảng cách ≥ 3,5 s; bench tắt combat | e2e | `npx playwright test tests/e2e/fightBack.spec.ts` | ❌ W0 | ⬜ pending |
| 02-11-T1 | (D-12) | guard | CLI | `node scripts/phase-gate-guard.mjs --plan 02-11 --dry-run` | ✅ | ⬜ pending |
| 02-11-T2 / T3 | NPC-05 | người chơi bị trúng → ragdoll → recover → bất tử 1,5 s → free; khoá ≤ ~3 s; phím bị bỏ qua; hit-stop +1; rung camera; SFX `hurt-*` + `alert-*`; viền loé không đỏ; đứng dậy không kẹt, đi được; 6 body ragdoll người chơi | e2e | `npx playwright test tests/e2e/playerKnockdown.spec.ts` | ❌ W0 | ⬜ pending |
| 02-12-T1 | (D-12) | guard | CLI | `node scripts/phase-gate-guard.mjs --plan 02-12 --dry-run` | ✅ | ⬜ pending |
| 02-12-T2 | NPC-06 | `?bench=1` mặc định: fingerprint timeline không đổi; `brawlFromQuery` literal; `percentile` | unit | `npx vitest run tests/unit/benchTimeline.test.ts tests/unit/benchStats.test.ts` | ✅ extend | ⬜ pending |
| 02-12-T3 | NPC-06 | `?bench=1&brawl=1&dur=40` chạy xong với 15 NPC, draw đỉnh ≤ 120, body ≤ 206, `maxPursuers` 1..3, `maxAttackers` ≤ 1, strikes ≥ 1, log p99 ms/step; bench mặc định brawl false, maxPursuers 0; soak kết thúc combat routine + người chơi free | e2e | `npx playwright test tests/e2e/bench.spec.ts tests/e2e/soak-leak.spec.ts` | ✅ extend | ⬜ pending |
| 02-13-T1 | (D-12) | guard + full suite trên HEAD, SUMMARY 02-06..02-12 không skipped | CLI + full | `node scripts/phase-gate-guard.mjs --plan 02-13 --dry-run` · full suite | ✅ | ⬜ pending |
| 02-13-T2 | NPC-01..NPC-06 | deploy `npm run deploy` (DEPLOY_OK, poller non200=0), kiểm live độc lập, `02-DEVICE-CHECK.md` có URL + bảng + checklist + mục "Đề xuất của planner về trần NPC (chờ operator quyết)" | CLI + manual | `node` kiểm khoá `DEPLOY_SHA`/`NPC_DEVICE_VERDICT`/`CAP_DECISION` + `LIVE_OK` | ❌ (tạo trong task) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Không có plan Wave 0 riêng: mỗi file test được tạo ở task đầu tiên cần nó (TDD RED trước GREEN).

- [ ] `tests/unit/{anger,attackTokens}.test.ts` → 02-01-T1/T2
- [ ] `tests/unit/{strikeHit,collisionGroups,playerStun,freeSpot}.test.ts` → 02-02-T1..T3
- [ ] `tests/unit/phaseGate.test.mjs` → 02-03-T1
- [ ] `tests/unit/{roster,quickNpc,presetNames}.test.ts` → 02-04-T1/T2; mở rộng `keyMap.test.ts`, `uiPrefs.test.ts` → 02-04-T3
- [ ] `tests/unit/{combatFsm,combatDirector,combatDeterminism}.test.ts` → 02-05-T1/T2
- [ ] mở rộng `npc.spec.ts` + `characters.spec.ts` (test `cap:`) → 02-06-T2
- [ ] `tests/e2e/rosterStart.spec.ts` → 02-07-T2
- [ ] `tests/e2e/quickNpc.spec.ts` → 02-08-T2; mở rộng `keyHints.spec.ts` → 02-08-T2
- [ ] `tests/e2e/roster.spec.ts` (thay `npcSettings.spec.ts`) → 02-09-T2
- [ ] `tests/e2e/fightBack.spec.ts` → 02-10-T2
- [ ] `tests/e2e/playerKnockdown.spec.ts` → 02-11-T2
- [ ] mở rộng `bench.spec.ts` (brawl), `soak-leak.spec.ts` (reset combat) → 02-12-T2
- [ ] Test hooks: `__bt.roster` (02-07), `__bt.combat` (02-10, `player` mở rộng ở 02-11), `__bt.hitFlash` (02-11), `__bt.npcLabelsPref` (02-09); `?fight=always` literal (02-01 parser, 02-10 dùng)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| ≥ 30 fps Android / 60 desktop tại trần 15 NPC, cả `?bench=1` và `?bench=1&brawl=1` | NPC-01, NPC-06 | Headless không có GPU thật (D-24 Phase 1) | Chụp màn hình bench trên 2 máy chuẩn theo `02-DEVICE-CHECK.md` (plan 02-13). D-01 chỉ yêu cầu xác nhận ≥ 30 fps; phương án "brawl < 30 fps trên Android chuẩn → hạ trần về 10" là **đề xuất của planner (RESEARCH G1), chờ operator quyết** qua `CAP_DECISION` |
| Cảm giác: đọc được windup, né bằng touch, ngã/đứng dậy buồn cười, không trông như máu/đau (PEGI 12) | NPC-04, NPC-05 | Cảm giác và thẩm mỹ | Checklist operator trên cả 2 điện thoại (`02-DEVICE-CHECK.md`) |
| Cảnh báo tên và nút tên ngẫu nhiên dễ dùng trên phone | NPC-02 | UX gõ/nhập trên máy thật | Thêm 3 đồng nghiệp trên mỗi phone, reload, kiểm tra |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (mỗi file tạo trong task RED đầu tiên)
- [x] No watch-mode flags
- [x] Feedback latency < 15s (quick command)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
