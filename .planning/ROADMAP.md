# Roadmap: Break Time

## Overview

Đi từ một căn phòng trống tới bản game nộp được lên CrazyGames. Thứ tự các phase là **rủi ro lớn nhất trước**:
Phase 1 chứng minh stack chạy được trên điện thoại thật và dựng sẵn đường deploy, để mọi phase sau đều chơi thử
được trên máy thật. Phase 2–5 lần lượt thêm từng trụ gameplay (phát hiện → chọc phá → rage → tin đồn), mỗi phase
kết thúc bằng một bản chơi được. Phase 6 nối tất cả thành vòng tiến trình 5 ngày. Phase 7 đánh bóng cho người lạ
chơi. Phase 8 phát hành và đo.

Tin đồn (USP) đứng sau chọc phá và rage vì nó cần sẵn NPC có lịch trình, điểm tụ tập và hệ gậy/bị bắt.
Làm sớm hơn thì phải làm lại.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Spike kỹ thuật & đường deploy** - 1 phòng, nhân vật đi được trên desktop+mobile, ragdoll + đồ vỡ, đo size/fps trên máy thật, tự deploy lên VPS
- [ ] **Phase 2: Hệ phát hiện** - NPC có lịch trình, nón nhìn, thanh nghi ngờ, tiếng ồn, chỗ nấp
- [ ] **Phase 3: Chọc phá & một ngày làm việc** - Nhặt/đặt đồ, prank có punchline, to-do list, đồng hồ ngày, gậy HR
- [ ] **Phase 4: Stress & Rage Mode** - Thanh stress, Rage đập phá ragdoll, hoá đơn thiệt hại, màn bị đuổi
- [ ] **Phase 5: Hệ tin đồn** - Thì thầm, lan, méo tin, truy nguồn, đối chất, quan hệ NPC
- [ ] **Phase 6: Tầng 1 đầy đủ & tiến trình** - 5 ngày, 12+ prank, combo, chấm điểm, coin, shop, lưu tiến trình
- [ ] **Phase 7: Đánh bóng cho người lạ** - Tutorial, vi/en, âm thanh, tải nhanh, PlatformAdapter, credits
- [ ] **Phase 8: CrazyGames Basic Launch** - Nộp build, chạy 7–21 ngày, tổng kết số đo

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

- [ ] 01-27-PLAN.md — Settings section: NPC 0–10 stepper, name fields, Áp dụng with safe in-place respawn (grow-only pool) (W12)

**Wave 13** *(blocked on Wave 12 completion)*

- [ ] 01-17-PLAN.md — `?bench=1` deterministic 60 s benchmark with 10 NPCs + results screen (W13)

**Wave 14** *(blocked on Wave 13 completion)*

- [ ] 01-18-PLAN.md — `?soak=1` 15-min soak, crash beacon, leak proxy, deploy measurement build (W14)

**Wave 15** *(blocked on Wave 14 completion)*

- [ ] 01-19-PLAN.md — Real-device gate: device log, operator measurements, controls & settings checklist, VERDICT incl. ≥ 20 objects on Android (W15)

**Wave 16** *(blocked on Wave 15 completion)*

- [ ] 01-20-PLAN.md — Conditional single D-07 optimisation pass + re-measure (entry guard exits on PASS; character merge already done in 01-23) (W16)

**Wave 17** *(blocked on Wave 16 completion)*

- [ ] 01-21-PLAN.md — Conditional verdict after D-07, or STOP + PlayCanvas evaluation (entry guard) (W17)

**UI hint**: yes

Cổng chặn: nếu tiêu chí 2–4 **không** đạt trên máy thật thì dừng lại, xem lại stack (PlayCanvas là ứng viên 2)
trước khi sang Phase 2. Không đi tiếp trên một stack chưa đo.

### Phase 2: Hệ phát hiện

**Goal**: Người chơi lẻn quanh văn phòng có NPC đi lại, hiểu rõ vì sao mình sắp bị hoặc đã bị phát hiện
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: DETECT-01, DETECT-02, DETECT-03, DETECT-04, DETECT-05, DETECT-06, DETECT-07
**Success Criteria** (what must be TRUE):

  1. 3+ NPC đi theo lịch (bàn → pantry → họp) trên navmesh, không kẹt tường sau 10 phút quan sát
  2. Người chơi thấy nón nhìn trên sàn, thanh nghi ngờ tăng dần khi đứng trong nón, và mũi tên cảnh báo trước khi bị bắt
  3. Làm rơi đồ tạo tiếng ồn khiến NPC gần nhất bỏ vị trí đi kiểm tra, mở ra khoảng trống để lẻn qua
  4. Nấp sau tủ hoặc giả vờ làm việc làm thanh nghi ngờ ngừng tăng
  5. Logic nghi ngờ có unit test với các ca biên (ngoài tầm, sau vật cản, đang nấp)

**Plans**: TBD
**UI hint**: yes

### Phase 3: Chọc phá & một ngày làm việc

**Goal**: Chơi trọn một ngày ngắn: nhận to-do, gài prank, rời hiện trường, xem punchline, bị bắt thì ăn gậy
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: PRANK-01, PRANK-02, PRANK-03, PRANK-04, LOOP-01, LOOP-02
**Success Criteria** (what must be TRUE):

  1. Người chơi nhặt hũ muối ở pantry, bỏ vào cà phê sếp, đi chỗ khác; sếp uống → punchline phát (bỏ qua được)
  2. To-do list 3 phi vụ hiện trên HUD, gạch khi xong; đồng hồ chạy 08:00→17:00 rồi kết thúc ngày
  3. Bị bắt quả tang khi đang gài thì nhận 1 gậy; đủ 3 gậy thì ngày kết thúc với trạng thái "bị đuổi"
  4. Có ít nhất 4 prank khác nhau chơi được

**Plans**: TBD
**UI hint**: yes

### Phase 4: Stress & Rage Mode

**Goal**: Căng thẳng tích luỹ thành một cú xả đập phá đã tay, rồi quay lại chơi lén lút
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: RAGE-01, RAGE-02, RAGE-03, RAGE-04, RAGE-05, RAGE-06, LOOP-03
**Success Criteria** (what must be TRUE):

  1. Stress tăng khi bị sếp mắng/giao việc/bị bắt và giảm khi prank thành công; đầy thì Rage Mode tự bật (đổi nhạc, slow-motion)
  2. Trong Rage, người chơi vung ≥ 5 loại vũ khí bằng kéo chuột/vuốt, đồ vỡ theo vật lý, NPC ngã ragdoll không máu
  3. Hết Rage hiện "Hoá đơn thiệt hại" với tổng $ và món đắt nhất
  4. Bị đuổi (3 gậy) thì vào màn rage-quit đập phá đường xuống tầng trệt
  5. Rage lúc nặng nhất vẫn giữ ≥ 30 fps trên Android tầm trung (mảnh vỡ tự dọn)

**Plans**: TBD
**UI hint**: yes

### Phase 5: Hệ tin đồn

**Goal**: Người chơi tung tin, nhìn tin lan và méo đi, rồi hoặc thoát hoặc bị truy ra và đối chất
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: GOSSIP-01, GOSSIP-02, GOSSIP-03, GOSSIP-04, GOSSIP-05, GOSSIP-06, GOSSIP-07, GOSSIP-08
**Success Criteria** (what must be TRUE):

  1. Người chơi chọn thẻ tin đồn và thì thầm với NPC cạnh bên; bị từ chối nếu có người khác trong bán kính nghe
  2. Tin lan qua pantry/thang máy; người chơi xem được ai đang biết và phiên bản (đã méo) hiện tại
  3. Nạn nhân nghe được thì đi hỏi từng người trong chuỗi; NPC thân với người chơi giấu nguồn, "bà tám" khai
  4. Bị truy ra thì có cutscene đối chất, +1 gậy, nạn nhân theo dõi người chơi gắt hơn
  5. Mô phỏng lan/truy nguồn là deterministic theo seed và có unit test (cùng seed → cùng kết quả)

**Plans**: TBD
**UI hint**: yes

### Phase 6: Tầng 1 đầy đủ & tiến trình

**Goal**: Một tuần làm việc trọn vẹn có lý do để chơi tiếp ngày mai
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: LOOP-04, LOOP-05, PRANK-05, PRANK-06, PROG-01, PROG-02, PROG-03
**Success Criteria** (what must be TRUE):

  1. Tầng 1 có 5 ngày (Thứ 2→Thứ 6) với 6–8 NPC, to-do và độ khó tăng dần
  2. Có ≥ 12 prank và ≥ 2 chuỗi combo; bộ sưu tập hiện prank/tin đồn đã làm
  3. Cuối ngày chấm ★ Lén lút / Hỗn loạn / Drama và cộng coin; shop mở khoá prank, vũ khí, trang phục bằng coin
  4. Đóng trình duyệt mở lại vẫn còn tiến trình; incognito không crash và báo không lưu được

**Plans**: TBD
**UI hint**: yes

### Phase 7: Đánh bóng cho người lạ

**Goal**: Người chưa từng thấy game vào được gameplay trong 10 giây và tự hiểu cách chơi
**Mode:** mvp
**Depends on**: Phase 6
**Requirements**: UX-01, UX-02, UX-03, UX-04, UX-05, PLAT-03
**Success Criteria** (what must be TRUE):

  1. 5 người ngoài (không được giải thích) vào từ URL, qua ngày hướng dẫn và hoàn thành ngày thứ Hai
  2. Đổi vi/en thì mọi chữ đổi theo, kể cả thẻ tin đồn; không còn chuỗi cứng trong code
  3. Có nhạc + SFX, bắt đầu sau lần chạm đầu, tắt/bật được
  4. Từ bấm URL tới điều khiển được ≤ 10s trên 4G (đo, không ước)
  5. Gọi cổng game đi qua PlatformAdapter; CREDITS.md liệt kê mọi asset và license

**Plans**: TBD
**UI hint**: yes

### Phase 8: CrazyGames Basic Launch

**Goal**: Game lên CrazyGames và có số đo thật để quyết định bước tiếp theo
**Mode:** mvp
**Depends on**: Phase 7
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
| 1. Spike kỹ thuật & đường deploy | 21/27 | In Progress|  |
| 2. Hệ phát hiện | 0/TBD | Not started | - |
| 3. Chọc phá & một ngày làm việc | 0/TBD | Not started | - |
| 4. Stress & Rage Mode | 0/TBD | Not started | - |
| 5. Hệ tin đồn | 0/TBD | Not started | - |
| 6. Tầng 1 đầy đủ & tiến trình | 0/TBD | Not started | - |
| 7. Đánh bóng cho người lạ | 0/TBD | Not started | - |
| 8. CrazyGames Basic Launch | 0/TBD | Not started | - |
