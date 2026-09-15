# Roadmap: Break Time

## Overview

Đi từ một căn phòng trống tới bản game nộp được lên CrazyGames. Thứ tự các phase là **rủi ro lớn nhất trước**:
Phase 1 chứng minh stack chạy được trên điện thoại thật và dựng sẵn đường deploy, để mọi phase sau đều chơi thử
được trên máy thật. Phase 2 cho đồng nghiệp NPC có tên, số lượng tuỳ ý và biết đánh trả. Phase 3–6 lần lượt thêm từng trụ gameplay (phát hiện → chọc phá → rage → tin đồn), mỗi phase
kết thúc bằng một bản chơi được. Phase 7 nối tất cả thành vòng tiến trình 5 ngày. Phase 8 đánh bóng cho người lạ
chơi. Phase 9 phát hành và đo.

> **Đánh số lại 16/09/2026 (operator):** chèn Phase 2 mới "NPC đồng nghiệp"; các phase cũ 2–8 lùi thành 3–9, nội dung giữ nguyên. Tài liệu Phase 1 viết trước ngày này nhắc "Phase 2 (navmesh/phát hiện)" = Phase 3 mới, "Phase 4 (Rage)" = Phase 5, "Phase 7" = Phase 8, "Phase 8 (CrazyGames)" = Phase 9.

Tin đồn (USP) đứng sau chọc phá và rage vì nó cần sẵn NPC có lịch trình, điểm tụ tập và hệ gậy/bị bắt.
Làm sớm hơn thì phải làm lại.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Spike kỹ thuật & đường deploy** - 1 phòng, nhân vật đi được trên desktop+mobile, ragdoll + đồ vỡ, đo size/fps trên máy thật, tự deploy lên VPS
- [ ] **Phase 2: NPC đồng nghiệp — tên, số lượng, đánh trả** - Roster 30 đồng nghiệp (tên, ngoại hình, tính khí), 0–15 NPC thêm/bớt nhanh, NPC giận đuổi và đánh trả kiểu slapstick
- [ ] **Phase 3: Hệ phát hiện** - NPC có lịch trình, nón nhìn, thanh nghi ngờ, tiếng ồn, chỗ nấp
- [ ] **Phase 4: Chọc phá & một ngày làm việc** - Nhặt/đặt đồ, prank có punchline, to-do list, đồng hồ ngày, gậy HR
- [ ] **Phase 5: Stress & Rage Mode** - Thanh stress, Rage đập phá ragdoll, hoá đơn thiệt hại, màn bị đuổi
- [ ] **Phase 6: Hệ tin đồn** - Thì thầm, lan, méo tin, truy nguồn, đối chất, quan hệ NPC
- [ ] **Phase 7: Tầng 1 đầy đủ & tiến trình** - 5 ngày, 12+ prank, combo, chấm điểm, coin, shop, lưu tiến trình
- [ ] **Phase 8: Đánh bóng cho người lạ** - Tutorial, vi/en, âm thanh, tải nhanh, PlatformAdapter, credits
- [ ] **Phase 9: CrazyGames Basic Launch** - Nộp build, chạy 7–21 ngày, tổng kết số đo

## Phase Details

### Phase 1: Spike kỹ thuật & đường deploy

**Goal**: Chứng minh Three.js + Rapier đạt ngân sách size/fps trên điện thoại thật, và mọi commit sau đều chơi thử được qua một URL HTTPS
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: TECH-01, TECH-02, TECH-03, TECH-04, TECH-05, TECH-06, TECH-07, CTRL-01, CTRL-02, CTRL-03, CTRL-04, CTRL-05, CTRL-06, CTRL-07, PLAT-01, PLAT-02
**Success Criteria** (what must be TRUE):

  1. Operator mở URL HTTPS trên điện thoại Android và iPhone, đi quanh một phòng văn phòng low-poly bằng joystick ảo; trên desktop thì bằng WASD
  2. Người chơi tát/đẩy được một NPC ngã ragdoll và làm vỡ ≥ 20 đồ vật mà HUD debug vẫn báo ≥ 30 fps trên Android tầm trung
  3. Lệnh build in kích thước; phần tải lần đầu ≤ 8 MB (hoặc có số đo + lý do nếu vượt, nhưng ≤ 20 MB)
  4. Chơi 15 phút trên Safari iOS không crash
  5. Một lệnh deploy đẩy bản mới lên VPS; doibung.com vẫn trả 200 trong và sau khi deploy

**Plans**: 27 plans (17 waves; 01-22..01-27 added 15/09/2026 after the live play-test (D-27..D-31) and run before 01-17; Walking Skeleton = 01, 02, 03, 04, 06, 07, 12 — see `phases/01-spike-k-thu-t-ng-deploy/01-SKELETON.md`)
Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Package legitimacy gate (human-action) + exact-pin scaffold, configs, CSP, sha badge (W1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Boot slice: capability gate, loading bar, Chơi, Rapier SIMD/compat loop, unsupported screen (W2)
- [x] 01-04-PLAN.md — Server wiring tooling: drift check, token-gated idempotent infra:apply/rollback, HANDOFF (W2)
- [x] 01-05-PLAN.md — CC0 asset pipeline: Kenney packs, gltf-transform, ffmpeg-static MP3/textures, CREDITS.md (W2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03-PLAN.md — Walled room, WASD kinematic player, E pushes a physics box, follow camera (W3)
- [x] 01-06-PLAN.md — Size gate + precompress + first-load e2e + Caddy site file + release scripts (W3)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-07-PLAN.md — One-command `npm run deploy` orchestration with DNS/smoke helpers (W4)
- [x] 01-08-PLAN.md — Floating joystick, context button, ESC/Space/⏸ pause (W4)
- [x] 01-09-PLAN.md — Z/C + ⟲⟳ 90° camera rotation, portrait/landscape layout, fullscreen-if-supported, page hardening (W4)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 01-10-PLAN.md — Kenney open-space office + pantry, 24+ physics props, blob shadows, highlight + click/E (W5)
- [x] 01-11-PLAN.md — Debug HUD + auto/manual quality tiers + context-loss handling (W5)
- [x] 01-12-PLAN.md — Go live: DNS checkpoint, operator-typed approval token checkpoint, infra:apply, first deploy (W5)
- [x] 01-13-PLAN.md — Audio unlock on Chơi + MP3 SFX module (W5)

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 01-14-PLAN.md — Blocky player + 3 NPCs on hand-placed routes (up to 8 for bench) (W6)

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 01-15-PLAN.md — Slap → slapstick ragdoll → get-up, hit-stop, shake, punch SFX (W7)

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 01-16-PLAN.md — Breakables with shared shard kit, debris cap by tier, drop/break SFX, smash scenario (W8)

**Wave 9** *(blocked on Wave 8 completion)*

- [x] 01-22-PLAN.md — Key map D-27: arrows/WASD move, Space action (E secondary), Esc or lone Ctrl opens settings, Z/C-only rotation, typing guard (W9)
- [x] 01-23-PLAN.md — One draw call per Blocky character (rigid SkinnedMesh), routes for NPCs 9–10, ?npcs 0..10, budget measured at 3 and 10 NPCs (W9)

**Wave 10** *(blocked on Wave 9 completion)*

- [x] 01-24-PLAN.md — Swing always plays on Space/E/context/click, hit only in range, 350 ms cooldown (W10)
- [x] 01-25-PLAN.md — Key hint panel (bottom-left, fades to 30%, settings toggle), translucent touch buttons, one-time touch hint (W10)

**Wave 11** *(blocked on Wave 10 completion)*

- [x] 01-26-PLAN.md — Saved NPC count + names applied at start, sanitised names as textContent labels over heads (W11)

**Wave 12** *(blocked on Wave 11 completion)*

- [x] 01-27-PLAN.md — Settings section: NPC 0–10 stepper, name fields, Áp dụng with safe in-place respawn (grow-only pool) (W12)

**Wave 13** *(blocked on Wave 12 completion)*

- [x] 01-17-PLAN.md — `?bench=1` deterministic 60 s benchmark with 10 NPCs + results screen (W13)

**Wave 14** *(blocked on Wave 13 completion)*

- [x] 01-18-PLAN.md — `?soak=1` 15-min soak, crash beacon, leak proxy, deploy measurement build (W14)

**Wave 15** *(blocked on Wave 14 completion)*

- [ ] 01-19-PLAN.md — Real-device gate: device log, operator measurements, controls & settings checklist, VERDICT incl. ≥ 20 objects on Android (W15)

**Wave 16** *(blocked on Wave 15 completion)*

- [ ] 01-20-PLAN.md — Conditional single D-07 optimisation pass + re-measure (entry guard exits on PASS; character merge already done in 01-23) (W16)

**Wave 17** *(blocked on Wave 16 completion)*

- [ ] 01-21-PLAN.md — Conditional verdict after D-07, or STOP + PlayCanvas evaluation (entry guard) (W17)

**UI hint**: yes

Cổng chặn: nếu tiêu chí 2–4 **không** đạt trên máy thật thì dừng lại, xem lại stack (PlayCanvas là ứng viên 2)
trước khi sang Phase 2. Không đi tiếp trên một stack chưa đo.

### Phase 2: NPC đồng nghiệp — tên, số lượng, đánh trả

**Goal**: Văn phòng có đồng nghiệp mang tên do người chơi đặt, số lượng thêm/bớt tuỳ ý tới 15, và bị tát đủ nhiều thì nổi giận đuổi theo đánh trả kiểu slapstick — đánh qua lại vẫn buồn cười, không máu, không thanh HP, không tụt fps
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: NPC-01, NPC-02, NPC-03, NPC-04, NPC-05, NPC-06
**Success Criteria** (what must be TRUE):

  1. Người chơi thêm/bớt NPC trong lúc chơi bằng phím +/− (desktop) hoặc cụm nút "− N +" trên HUD (mobile), trong khoảng 0–15, không cần mở settings
  2. Người chơi lưu roster tối đa 30 đồng nghiệp (tên ≤ 16 ký tự, 1 trong 17 ngoại hình Blocky, tính khí Nóng/Thường/Hiền), chọn ai có mặt, có nút tên ngẫu nhiên; roster còn nguyên sau reload và không gửi đi đâu
  3. Tát NPC làm đầy thanh giận theo tính khí (Nóng 1 cú / Thường 2 / Hiền 3); NPC giận đứng dậy rồi đuổi theo (tối đa 3 NPC đuổi, 1 NPC vung đòn cùng lúc), giơ tay báo trước 0,6 s kèm dấu "!", người chơi né bằng cách đi ra khỏi tầm, tát trúng NPC đang giơ tay thì cắt đòn
  4. Người chơi bị đánh trúng thì ngã ragdoll nhẹ, khoá điều khiển tối đa ~3 s, tự đứng dậy và bất tử 1,5 s; không HP, không máu; có hit-stop, rung camera, SFX và viền màn hình loé
  5. Logic giận / đuổi / đánh / token chạy deterministic theo seed và có unit test; `?bench=1` giữ nguyên, kịch bản `&brawl=1` có NPC đánh trả vẫn giữ ngân sách fps/draw call của Phase 1 trên máy chuẩn

**Plans**: 13 plans (10 waves; 02-01..02-05 logic thuần chạy ngay, 02-06..02-13 mở đầu bằng entry guard D-12 đọc `01-GATE.md`)
Plans:
**Wave 1**

- [x] 02-01-PLAN.md — Logic thuần: thanh giận theo tính khí (1/2/3 cú, chỉ nguội khi NPC đứng, rng có seed) + token 3 đuổi / 1 vung (W1)
- [ ] 02-02-PLAN.md — Logic thuần: hit test tầm/nón, stun người chơi (khoá ≤ 3 s, bất tử 1,5 s), 16 bit nhóm va chạm, điểm đứng dậy (W1)
- [ ] 02-03-PLAN.md — Công cụ entry guard D-12 (`scripts/phase-gate-guard.mjs`) + tuyến/điểm xuất phát cho NPC 11–15 (W1)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 02-04-PLAN.md — Logic thuần: roster 30 người (`bt.roster`, migrate một chiều `bt.npcs`), thêm/bớt nhanh, 32 tên ngẫu nhiên, phím +/−, luật công tắc nhãn `bt.npcLabels` (W2)
- [ ] 02-05-PLAN.md — Logic thuần: FSM chiến đấu + combat director, test deterministic 600 step (W2)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 02-06-PLAN.md — Guard + trần 15 NPC (`?npcs=`, stepper), NPC 11–15 xuất phát cách nhau, bench vẫn 10, đo draw/body ở 15 (W3)

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 02-07-PLAN.md — Guard + văn phòng dựng từ roster (`rosterStore`, ngoại hình/tên/tính khí theo thành viên, migrate `bt.npcs`, không ghi `bt.npcs`) (W4)

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 02-08-PLAN.md — Guard + thêm/bớt NPC trong lúc chơi: phím +/− và cụm nút "− N +" (W5)

**Wave 6** *(blocked on Wave 5 completion)*

- [ ] 02-09-PLAN.md — Guard + danh sách đồng nghiệp trong settings (tên, ngoại hình, tính khí, có mặt, ngẫu nhiên, xoá hết, cảnh báo) + công tắc nhãn tên (W6)

**Wave 7** *(blocked on Wave 6 completion)*

- [ ] 02-10-PLAN.md — Guard + NPC nổi giận, đuổi (KCC, token), giơ tay 0,6 s + "!", né, tát cắt đòn, nhãn giận đổi màu (cả NPC không tên: 'Giận!') (W7)

**Wave 8** *(blocked on Wave 7 completion)*

- [ ] 02-11-PLAN.md — Guard + người chơi bị hạ: ragdoll nhẹ, khoá ≤ ~3 s, đứng dậy chỗ trống, bất tử 1,5 s, hit-stop/rung/SFX/viền loé (W8)

**Wave 9** *(blocked on Wave 8 completion)*

- [ ] 02-12-PLAN.md — Guard + `?bench=1&brawl=1` (15 NPC đánh trả, p99 ms/step), `?bench=1` và soak giữ nguyên (W9)

**Wave 10** *(blocked on Wave 9 completion)*

- [ ] 02-13-PLAN.md — Guard + full suite + `npm run deploy` + `02-DEVICE-CHECK.md` cho 2 máy chuẩn (đề xuất hạ trần về 10 nếu brawl < 30 fps là của planner, chờ operator quyết) (W10)

**UI hint**: yes

Thứ tự (G14): module logic thuần (giận, đuổi, token, roster) làm trước; phần gắn vào game chờ cổng đo máy thật Phase 1 (01-19..01-21) có VERDICT, để nếu phải đổi stack thì không làm lại.

### Phase 3: Hệ phát hiện

**Goal**: Người chơi lẻn quanh văn phòng có NPC đi lại, hiểu rõ vì sao mình sắp bị hoặc đã bị phát hiện
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: DETECT-01, DETECT-02, DETECT-03, DETECT-04, DETECT-05, DETECT-06, DETECT-07
**Success Criteria** (what must be TRUE):

  1. 3+ NPC đi theo lịch (bàn → pantry → họp) trên navmesh, không kẹt tường sau 10 phút quan sát
  2. Người chơi thấy nón nhìn trên sàn, thanh nghi ngờ tăng dần khi đứng trong nón, và mũi tên cảnh báo trước khi bị bắt
  3. Làm rơi đồ tạo tiếng ồn khiến NPC gần nhất bỏ vị trí đi kiểm tra, mở ra khoảng trống để lẻn qua
  4. Nấp sau tủ hoặc giả vờ làm việc làm thanh nghi ngờ ngừng tăng
  5. Logic nghi ngờ có unit test với các ca biên (ngoài tầm, sau vật cản, đang nấp)

**Plans**: TBD
**UI hint**: yes

### Phase 4: Chọc phá & một ngày làm việc

**Goal**: Chơi trọn một ngày ngắn: nhận to-do, gài prank, rời hiện trường, xem punchline, bị bắt thì ăn gậy
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: PRANK-01, PRANK-02, PRANK-03, PRANK-04, LOOP-01, LOOP-02
**Success Criteria** (what must be TRUE):

  1. Người chơi nhặt hũ muối ở pantry, bỏ vào cà phê sếp, đi chỗ khác; sếp uống → punchline phát (bỏ qua được)
  2. To-do list 3 phi vụ hiện trên HUD, gạch khi xong; đồng hồ chạy 08:00→17:00 rồi kết thúc ngày
  3. Bị bắt quả tang khi đang gài thì nhận 1 gậy; đủ 3 gậy thì ngày kết thúc với trạng thái "bị đuổi"
  4. Có ít nhất 4 prank khác nhau chơi được

**Plans**: TBD
**UI hint**: yes

### Phase 5: Stress & Rage Mode

**Goal**: Căng thẳng tích luỹ thành một cú xả đập phá đã tay, rồi quay lại chơi lén lút
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: RAGE-01, RAGE-02, RAGE-03, RAGE-04, RAGE-05, RAGE-06, LOOP-03
**Success Criteria** (what must be TRUE):

  1. Stress tăng khi bị sếp mắng/giao việc/bị bắt và giảm khi prank thành công; đầy thì Rage Mode tự bật (đổi nhạc, slow-motion)
  2. Trong Rage, người chơi vung ≥ 5 loại vũ khí bằng kéo chuột/vuốt, đồ vỡ theo vật lý, NPC ngã ragdoll không máu
  3. Hết Rage hiện "Hoá đơn thiệt hại" với tổng $ và món đắt nhất
  4. Bị đuổi (3 gậy) thì vào màn rage-quit đập phá đường xuống tầng trệt
  5. Rage lúc nặng nhất vẫn giữ ≥ 30 fps trên Android tầm trung (mảnh vỡ tự dọn)

**Plans**: TBD
**UI hint**: yes

### Phase 6: Hệ tin đồn

**Goal**: Người chơi tung tin, nhìn tin lan và méo đi, rồi hoặc thoát hoặc bị truy ra và đối chất
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: GOSSIP-01, GOSSIP-02, GOSSIP-03, GOSSIP-04, GOSSIP-05, GOSSIP-06, GOSSIP-07, GOSSIP-08
**Success Criteria** (what must be TRUE):

  1. Người chơi chọn thẻ tin đồn và thì thầm với NPC cạnh bên; bị từ chối nếu có người khác trong bán kính nghe
  2. Tin lan qua pantry/thang máy; người chơi xem được ai đang biết và phiên bản (đã méo) hiện tại
  3. Nạn nhân nghe được thì đi hỏi từng người trong chuỗi; NPC thân với người chơi giấu nguồn, "bà tám" khai
  4. Bị truy ra thì có cutscene đối chất, +1 gậy, nạn nhân theo dõi người chơi gắt hơn
  5. Mô phỏng lan/truy nguồn là deterministic theo seed và có unit test (cùng seed → cùng kết quả)

**Plans**: TBD
**UI hint**: yes

### Phase 7: Tầng 1 đầy đủ & tiến trình

**Goal**: Một tuần làm việc trọn vẹn có lý do để chơi tiếp ngày mai
**Mode:** mvp
**Depends on**: Phase 6
**Requirements**: LOOP-04, LOOP-05, PRANK-05, PRANK-06, PROG-01, PROG-02, PROG-03
**Success Criteria** (what must be TRUE):

  1. Tầng 1 có 5 ngày (Thứ 2→Thứ 6) với 6–8 NPC, to-do và độ khó tăng dần
  2. Có ≥ 12 prank và ≥ 2 chuỗi combo; bộ sưu tập hiện prank/tin đồn đã làm
  3. Cuối ngày chấm ★ Lén lút / Hỗn loạn / Drama và cộng coin; shop mở khoá prank, vũ khí, trang phục bằng coin
  4. Đóng trình duyệt mở lại vẫn còn tiến trình; incognito không crash và báo không lưu được

**Plans**: TBD
**UI hint**: yes

### Phase 8: Đánh bóng cho người lạ

**Goal**: Người chưa từng thấy game vào được gameplay trong 10 giây và tự hiểu cách chơi
**Mode:** mvp
**Depends on**: Phase 7
**Requirements**: UX-01, UX-02, UX-03, UX-04, UX-05, PLAT-03
**Success Criteria** (what must be TRUE):

  1. 5 người ngoài (không được giải thích) vào từ URL, qua ngày hướng dẫn và hoàn thành ngày thứ Hai
  2. Đổi vi/en thì mọi chữ đổi theo, kể cả thẻ tin đồn; không còn chuỗi cứng trong code
  3. Có nhạc + SFX, bắt đầu sau lần chạm đầu, tắt/bật được
  4. Từ bấm URL tới điều khiển được ≤ 10s trên 4G (đo, không ước)
  5. Gọi cổng game đi qua PlatformAdapter; CREDITS.md liệt kê mọi asset và license

**Plans**: TBD
**UI hint**: yes

### Phase 9: CrazyGames Basic Launch

**Goal**: Game lên CrazyGames và có số đo thật để quyết định bước tiếp theo
**Mode:** mvp
**Depends on**: Phase 8
**Requirements**: PLAT-04, PLAT-05
**Success Criteria** (what must be TRUE):

  1. Build qua kiểm tra giới hạn CrazyGames (≤ 1.500 file, tải đầu ≤ 50 MB) và nộp Basic Launch thành công
  2. Sau khi đủ 7 ngày + 500 lượt chơi (hoặc hết 21 ngày), có bảng playtime / D1 / conversion so với mốc 10 phút / 10–15% / 80%
  3. Có quyết định ghi lại: lên Full Launch + v2, sửa vòng lõi, hay dừng

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Spike kỹ thuật & đường deploy | 24/27 | In Progress|  |
| 2. NPC đồng nghiệp — tên, số lượng, đánh trả | 1/13 | In Progress | - |
| 3. Hệ phát hiện | 0/TBD | Not started | - |
| 4. Chọc phá & một ngày làm việc | 0/TBD | Not started | - |
| 5. Stress & Rage Mode | 0/TBD | Not started | - |
| 6. Hệ tin đồn | 0/TBD | Not started | - |
| 7. Tầng 1 đầy đủ & tiến trình | 0/TBD | Not started | - |
| 8. Đánh bóng cho người lạ | 0/TBD | Not started | - |
| 9. CrazyGames Basic Launch | 0/TBD | Not started | - |
