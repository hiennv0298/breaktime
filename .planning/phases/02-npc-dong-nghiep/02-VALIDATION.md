---
phase: 2
slug: npc-dong-nghiep
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-16
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Nguồn: `02-RESEARCH.md` §Validation Architecture. **Research dùng số NPC-0x của bản nháp cũ; bảng dưới đã ánh xạ lại theo REQUIREMENTS đã chốt 16/09:** research NPC-04 (người chơi bị hạ gục) → **NPC-05**; research NPC-05 (token) → **NPC-03**, (brawl bench) → **NPC-06**; báo trước/né đòn = **NPC-04**.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.0 (unit, Node) · Playwright 1.63.0 Chromium headless + SwiftShader (projects desktop / mobile-emu / no-webgl) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` (webServer `vite preview` 4173) — đã có từ Phase 1 |
| **Quick run command** | `npm run typecheck && npx vitest run` (typecheck im lặng khi đạt — xét rc) |
| **Full suite command** | `npm run build && npm run size && npx vitest run && npx playwright test` |
| **Estimated runtime** | quick < 15 s · full ~6 min |

---

## Sampling Rate

- **After every task commit:** `npm run typecheck && npx vitest run`
- **After every plan wave:** full suite
- **Before `/gsd-verify-work`:** full suite green + bench screenshots tại trần (`?bench=1` và `?bench=1&brawl=1`) trên 2 máy chuẩn + checklist cảm giác thủ công
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

*Planner điền task ID thật. Bản đồ theo requirement:*

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| NPC-01 | thêm = người có mặt đầu tiên chưa vào, bớt = người cuối, kẹp 0..15, no-op ở biên | unit | `npx vitest run tests/unit/quickNpc.test.ts` | ❌ W0 | ⬜ pending |
| NPC-01 | phím Equal/Minus/Numpad; Ctrl± không phải phím game; chặn khi đang gõ | unit | `npx vitest run tests/unit/keyMap.test.ts` | ✅ extend | ⬜ pending |
| NPC-01 | bấm +/− và nút HUD "− N +" → `__bt.npcs.length` đổi tại chỗ, không vượt 15, body ragdoll ≤ 15×6 (+6 người chơi), còn sau reload | e2e | `npx playwright test tests/e2e/quickNpc.spec.ts` | ❌ W0 | ⬜ pending |
| NPC-01 | đo tại trần 15: draw đỉnh ≤ 120, log body và ms/step | e2e measure | `npx playwright test tests/e2e/characters.spec.ts -g cap` | ✅ extend | ⬜ pending |
| NPC-02 | parse/làm sạch/whitelist/giới hạn roster; migrate `bt.npcs` v1 → `bt.roster`; dữ liệu bị sửa (quá cỡ, `__proto__`, look sai, id trùng, present ∉ members) → an toàn | unit | `npx vitest run tests/unit/roster.test.ts` | ❌ W0 | ⬜ pending |
| NPC-02 | UI roster: thêm người (ngoại hình + tính khí), tick có mặt, đổi tên, tên ngẫu nhiên, xoá hết (xác nhận); reload giữ; `<img onerror>` hiện nguyên chữ; texture NPC = ngoại hình đã chọn; dòng cảnh báo có mặt | e2e | `npx playwright test tests/e2e/roster.spec.ts` | ❌ W0 | ⬜ pending |
| NPC-02 | bản cũ ghi `bt.npcs` v1 sau khi roster tồn tại → roster nguyên vẹn | e2e | `npx playwright test tests/e2e/roster.spec.ts -g "old build"` | ❌ W0 | ⬜ pending |
| NPC-03 | ngưỡng giận theo tính khí (1/2/3), nguội dần, jitter theo seed, chỉ đánh trả sau khi đứng dậy | unit | `npx vitest run tests/unit/anger.test.ts` | ❌ W0 | ⬜ pending |
| NPC-03 | token: ≤ 3 đuổi / ≤ 1 vung, giữ token, tie-break deterministic | unit | `npx vitest run tests/unit/attackTokens.test.ts` | ❌ W0 | ⬜ pending |
| NPC-03 | `?autoplay=1&npcs=1&npcAt=…&fight=always`: tát → ragdoll → đứng dậy → state đi qua pursue → windup → strike | e2e | `npx playwright test tests/e2e/fightBack.spec.ts` | ❌ W0 | ⬜ pending |
| NPC-04 | FSM: windup 0,6 s, dấu "!", bỏ cuộc (8 s, 9 m, kẹt ×2), bị tát lúc windup thì cắt đòn, cooldown | unit | `npx vitest run tests/unit/combatFsm.test.ts` | ❌ W0 | ⬜ pending |
| NPC-04 | hit test tầm + nón (1,2 m, 100°, phía sau, đúng biên) → đi ra khỏi tầm là trượt | unit | `npx vitest run tests/unit/strikeHit.test.ts` | ❌ W0 | ⬜ pending |
| NPC-05 | stun người chơi: khoá input ≤ 3 s, bất tử 1,5 s, không tính trúng khi bất tử | unit | `npx vitest run tests/unit/playerStun.test.ts` | ❌ W0 | ⬜ pending |
| NPC-05 | người chơi bị trúng → mode ragdoll → dậy → animated; phím di chuyển bị bỏ qua khi khoá; hit-stop +1; rung camera; SFX; viền loé; sau khi dậy không kẹt trong đồ đạc; nhãn NPC giận đổi màu; công tắc nhãn | e2e | `npx playwright test tests/e2e/playerKnockdown.spec.ts` | ❌ W0 | ⬜ pending |
| NPC-06 | cùng seed + cùng input → trace giận/FSM/token giống hệt qua 600 step; seed khác thì khác; `Math.random` = 0 trong file logic mới | unit + grep | `npx vitest run tests/unit/combatDeterminism.test.ts` + grep gate `src/logic/{anger,combatFsm,attackTokens,strikeHit,playerStun,quickNpc,roster}.ts` | ❌ W0 | ⬜ pending |
| NPC-06 | `?bench=1&brawl=1&dur=20` chạy xong, draw đỉnh ≤ 120, `maxPursuers` ≤ 3, log p99 ms/step; `?bench=1` mặc định không đổi timeline | e2e + unit | `npx playwright test tests/e2e/bench.spec.ts -g brawl` · `npx vitest run tests/unit/benchTimeline.test.ts` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/{quickNpc,roster,anger,combatFsm,strikeHit,playerStun,attackTokens,combatDeterminism}.test.ts`
- [ ] `tests/e2e/{quickNpc,roster,fightBack,playerKnockdown}.spec.ts`; mở rộng `characters.spec.ts` (đo trần), `bench.spec.ts` (brawl), `keyMap.test.ts`
- [ ] Test hooks: `__bt.combat` (npcs: id/state/anger/token; player: mode/invulnLeft/hitsTaken; tokens), `__bt.roster` (số người, id có mặt, storageOk); `?fight=always` chỉ nhận giá trị literal
- [ ] Soak: `resetForSoak` phủ trạng thái combat và ragdoll người chơi (mở rộng `soak-leak.spec.ts`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| ≥ 30 fps Android / 60 desktop tại trần 15 NPC, cả `?bench=1` và `?bench=1&brawl=1` | NPC-01, NPC-06 | Headless không có GPU thật (D-24 Phase 1) | Chụp màn hình bench trên 2 máy chuẩn theo protocol 01-19 |
| Cảm giác: đọc được windup, né bằng touch, ngã/đứng dậy buồn cười, không trông như máu/đau (PEGI 12) | NPC-04, NPC-05 | Cảm giác và thẩm mỹ | Checklist operator trên cả 2 điện thoại |
| Cảnh báo tên và nút tên ngẫu nhiên dễ dùng trên phone | NPC-02 | UX gõ/nhập trên máy thật | Thêm 3 đồng nghiệp trên mỗi phone, reload, kiểm tra |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
