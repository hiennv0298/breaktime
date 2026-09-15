# Phase 2: NPC đồng nghiệp — tên, số lượng, đánh trả - Context

**Gathered:** 2026-09-15 → 2026-09-16
**Status:** Ready for planning

> Research làm trước discuss theo yêu cầu operator. Ban đầu lập nhầm là "Phase 01.1" (15/09), đã revert và chuyển sang Phase 2 (16/09). File `02-RESEARCH.md` còn ghi "01.1" ở nhiều chỗ — hiểu là Phase 2 này; trong research "Phase 2 detection" = Phase 3 mới, "Phase 4 Rage" = Phase 5, "Phase 5 relationship" = Phase 6.

<domain>
## Phase Boundary

Biến NPC hiện có (Phase 1: 0–10 NPC, tên trong settings, tát → ragdoll → đứng dậy) thành **đồng nghiệp**:
roster lưu trên máy (tên, ngoại hình, tính khí), thêm/bớt nhanh trong lúc chơi tới **15** NPC,
và NPC **nổi giận, đuổi theo, đánh trả** người chơi kiểu slapstick.

**Đã có từ Phase 1, KHÔNG làm lại**: stepper 0–10 + ô tên + Áp dụng trong settings (01-27), làm sạch tên ≤ 16 ký tự + nhãn textContent (01-26), `bt.npcs` v1, pool NPC chỉ tăng, rigid SkinnedMesh 1 draw/nhân vật (01-23), cú tát + ragdoll + get-up + hit-stop + rung (01-15), swing luôn chạy + cooldown 350 ms (01-24), bench `?bench=1` 10 NPC (01-17).

**KHÔNG thuộc phase này**: nón nhìn, nghi ngờ, navmesh/lịch trình (Phase 3); Rage Mode, vũ khí, hoá đơn thiệt hại (Phase 5); quan hệ NPC–người chơi (Phase 6); NPC đánh trượt trúng NPC khác; NPC giận vì *thấy* người chơi tát người khác.

Requirements: NPC-01, NPC-02, NPC-03, NPC-04, NPC-05, NPC-06.

</domain>

<decisions>
## Implementation Decisions

### Số lượng & roster
- **D-01 (G1):** Trần **15 NPC** (giới hạn cứng hiện có: 16 nhóm va chạm ragdoll = 15 NPC + người chơi). Headless đo 15 NPC: 96 draw call, CPU 1,82 ms/frame. Bench phải xác nhận ≥ 30 fps trên 2 máy chuẩn. CTRL-07 (0–10) được nâng lên 0–15; `?npcs=` kẹp 0..15.
- **D-02 (G2):** Thêm/bớt nhanh bằng **phím +/−** trên desktop (`Equal`/`NumpadAdd`, `Minus`/`NumpadSubtract`, không chặn tổ hợp Ctrl) và **cụm nút "− N +" bán trong suốt** trên HUD mobile/desktop, đánh dấu `data-hud-panel` để không vung tay. NPC thêm vào lấy lần lượt từ những người **có mặt** trong roster.
- **D-03 (G3):** **Roster tối đa 30 đồng nghiệp**: tên (≤ 16 ký tự, làm sạch như 01-26), 1 trong **17 ngoại hình** Blocky, **tính khí Nóng / Thường / Hiền**; tick ai có mặt; nút tên ngẫu nhiên; đổi tên tại chỗ; xoá. Roster sửa trong settings.
- **D-04 (G5, kế thừa Phase 1 D-31):** Tên **gõ tự do** + **dòng cảnh báo** "Tên chỉ lưu trên máy bạn — đừng dùng để xúc phạm ai" + nút tên ngẫu nhiên. Bộ lọc từ thô xét ở Phase 9 (CrazyGames). Không gửi tên đi đâu, textContent only.

### NPC đánh trả
- **D-05 (G6):** **Thanh giận theo tính khí**: Nóng giận sau 1 cú tát, Thường 2, Hiền 3; thanh giận nguội dần theo thời gian; NPC chỉ bắt đầu hành động giận **sau khi đứng dậy** khỏi ragdoll. Quyết định dùng rng có seed.
- **D-06 (G7):** Người chơi bị đánh trúng → **ngã ragdoll nhẹ** kiểu slapstick, **khoá điều khiển tối đa ~3 s**, tự đứng dậy, **bất tử 1,5 s** sau khi dậy. Không thua, không màn game over.
- **D-07 (G8):** **Token: tối đa 3 NPC đuổi, 1 NPC vung đòn** cùng lúc (đo được: 30 NPC cùng đuổi tốn 8–10 ms/step, giới hạn 3 còn 0,07–0,16 ms). NPC giận không có token thì đứng tại chỗ bực bội / chờ lượt.
- **D-08 (G10):** **Báo trước 0,6 s**: NPC giơ tay + dấu "!" trên đầu; người chơi **né bằng cách đi ra** khỏi tầm; tát trúng NPC đang giơ tay thì **cắt đòn**. **Không thêm nút né** (mobile vẫn 1 nút ngữ cảnh).
- **D-09 (G11):** **Không HP**, không máu (PEGI 12). Phản hồi khi bị trúng: hit-stop + **rung camera** (không dùng `navigator.vibrate` — iOS Safari không hỗ trợ) + SFX + **viền màn hình loé** (không màu đỏ máu).
- **D-10 (G12):** Nhãn tên NPC **luôn hiện**, có **công tắc trong settings**; NPC đang giận **đổi màu nhãn**.

### Benchmark & thứ tự
- **D-11 (G13):** `?bench=1` **giữ nguyên** (10 NPC, so sánh được với Phase 1); thêm kịch bản **`&brawl=1`** có NPC giận đuổi/đánh trả để đo ngân sách.
- **D-12 (G14):** **Làm module logic thuần trước** (giận, đuổi, token, roster, lưu trữ — test bằng Node, không phụ thuộc three/Rapier); **phần gắn vào game chờ cổng đo máy thật Phase 1 (01-19..01-21) có VERDICT**. Plan tích hợp phải có bước chặn (entry guard) đọc `01-GATE.md`: VERDICT=PASS mới làm; nếu Phase 1 dừng để đổi stack thì dừng tích hợp.

### Claude's Discretion
- **G3r:** NPC 11–15 dùng lại 5 tuyến đặt tay, lệch pha/offset theo seed (chưa có navmesh — Phase 3); vẫn phải qua test khoảng cách với đồ đạc.
- **G4:** key localStorage mới **`bt.roster`** (có version), chuyển một chiều từ `bt.npcs` v1 (không ghi ngược, vì bản cũ ở `/b/<sha>/` cùng origin có thể ghi đè); dữ liệu hỏng/bị chặn → fallback mặc định; trần kích thước.
- **G9:** đuổi chậm hơn người chơi; bỏ cuộc khi đánh trúng 1 lần, quá ~8 s, hoặc xa quá ~9 m; quay về tuyến qua character controller.
- Nhóm va chạm ragdoll, texture theo chỉ số (fix crash ≥ 17), cách ragdoll người chơi (hiện là kinematic controller), camera khi người chơi ngã, chọn SFX Kenney Impact có sẵn, cấu trúc module FSM ưu tiên physics > combat > routine (RESEARCH).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase này
- `.planning/phases/02-npc-dong-nghiep/02-RESEARCH.md` — số đo trần NPC, chi phí đuổi, ràng buộc cứng (16 nhóm va chạm, texture ≥ 17 crash, route kẹp ở 10), mẫu FSM/token, pitfalls, Validation Architecture, Gray Areas G1–G14 (đọc với ghi chú "01.1 = Phase 2")
- `.planning/ROADMAP.md` §Phase 2 — goal + 5 success criteria
- `.planning/REQUIREMENTS.md` — NPC-01..NPC-06 (và CTRL-07 bị nâng trần)
- `.planning/PROJECT.md` — PEGI 12, ≥ 30 fps Android tầm trung, không dữ liệu cá nhân, không mạng

### Code & quyết định Phase 1 phải kế thừa
- `.planning/phases/01-spike-k-thu-t-ng-deploy/01-CONTEXT.md` — D-11, D-12, D-13, D-21, D-24, D-27..D-31 (đọc ghi chú đánh số lại)
- SUMMARY Phase 1: `01-14` (Blocky, 18 texture, tuyến), `01-15` (tát/ragdoll/get-up, rng seed, hit-stop), `01-16` (props, lực theo kg), `01-17` (bench, autopilot), `01-18` (soak, beacon), `01-23` (rigid SkinnedMesh, 10 NPC = 91–92 draw, 165 body), `01-24` (swing + cooldown 350 ms), `01-25` (bảng phím, uiPrefs), `01-26` (npcSettings, nhãn), `01-27` (settings NPC, pool chỉ tăng)
- `.planning/phases/01-spike-k-thu-t-ng-deploy/deferred-items.md`
- `.planning/phases/01-spike-k-thu-t-ng-deploy/01-DEVICE-LOG.md` + (khi có) `01-GATE.md` — cổng máy thật cho D-12

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/game/npc.ts`, `src/game/slap.ts`, `src/game/player.ts`, `src/physics/ragdoll.ts`, `src/physics/characterController.ts` — NPC, tát, người chơi, ragdoll, controller
- `src/render/rigidSkin.ts`, `src/render/characters.ts` — nhân vật 1 draw call, texture theo NPC
- `src/logic/npcSettings.ts`, `src/game/npcSettingsStore.ts`, `src/ui/npcSettingsSection.ts`, `src/ui/npcLabels.ts` — làm sạch tên, lưu trữ, UI settings, nhãn
- `src/logic/keyMap.ts`, `src/logic/uiPrefs.ts`, `src/ui/keyHints.ts` — phím, prefs, bảng phím
- `src/logic/rng.ts` (seed 20260914), `src/logic/getUpFsm.ts`, `src/logic/waypointWalker.ts`, `src/game/waypoints.ts`
- `src/bench/*`, `src/game/autopilot.ts` — bench/soak

### Established Patterns
- Logic thuần trong `src/logic/*` + unit test Vitest; e2e qua `window.__bt` hook chỉ đọc
- localStorage bọc try/catch, version, trần kích thước; textContent only (grep gate innerHTML = 0)
- `data-hud-panel` = click không vung tay; `createGame(ctx, { forcedNpcCount, bench })`

### Integration Points
- Không deploy trong phase này trừ khi plan chỉ định qua `npm run deploy` (server wiring có sẵn từ 01-12)
- Cổng Phase 1 (01-19..01-21) chặn phần tích hợp (D-12)

</code_context>

<specifics>
## Specific Ideas

- Mục đích của operator: "đặt tên đồng nghiệp cho vui" và "NPC có thể đánh lại mình".
- Cảm giác slapstick giống Phase 1 (Crazy Office / Kick the Buddy): phóng đại, buồn cười, không máu.

</specifics>

<deferred>
## Deferred Ideas

- Bộ lọc từ thô cho tên NPC — Phase 9 (trước khi nộp CrazyGames)
- NPC đánh trượt trúng NPC khác; NPC giận vì thấy người chơi tát người khác — ngoài phạm vi (research đề xuất), xem lại khi có Hệ phát hiện (Phase 3)
- Quan hệ −100..100 ảnh hưởng độ giận — Phase 6 (tin đồn)

</deferred>

---

*Phase: 02-npc-dong-nghiep*
*Context gathered: 2026-09-16*
