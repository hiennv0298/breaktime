# Requirements: Break Time

**Defined:** 2026-09-14
**Core Value:** Một "ngày làm việc" 5–8 phút phải buồn cười và căng thẳng đúng lúc, chạy mượt trên điện thoại tầm trung.

## v1 Requirements

### Nền tảng kỹ thuật (TECH)

- [ ] **TECH-01**: Người chơi mở URL trên Chrome/Edge/Firefox desktop, Chrome Android và Safari iOS là vào được game, không cần cài gì
- [ ] **TECH-02**: Phần tải lần đầu (tới lúc chơi được) ≤ 8 MB, trần cứng ≤ 20 MB; build in ra kích thước từng phần
- [ ] **TECH-03**: Game giữ ≥ 30 fps trên máy Android tầm trung và 60 fps trên desktop ở màn nặng nhất
- [ ] **TECH-04**: Chơi liên tục 15 phút trên Safari iOS không crash, không reload
- [ ] **TECH-05**: Game không gửi request nào ra ngoài (font, asset, thư viện đóng gói hết)
- [ ] **TECH-06**: Logic gameplay (nghi ngờ, tin đồn, quan hệ, điểm) có unit test chạy không cần trình duyệt
- [ ] **TECH-07**: Có HUD debug bật/tắt được, hiện fps, draw call, số physics body

### Điều khiển (CTRL)

- [ ] **CTRL-01**: Trên desktop, người chơi di chuyển bằng WASD và tương tác bằng E hoặc click chuột trái vào vật đang sáng
- [ ] **CTRL-02**: Trên mobile/tablet, người chơi di chuyển bằng joystick ảo nửa trái và tương tác bằng một nút ngữ cảnh lớn (icon đổi theo vật gần nhất)
- [ ] **CTRL-03**: Game phủ toàn màn hình ở cả hướng dọc và ngang; xoay máy giữa chừng không vỡ UI
- [ ] **CTRL-04**: Người chơi tạm dừng bằng ESC/Space (desktop) hoặc nút ⏸ (mobile)
- [ ] **CTRL-05**: Người chơi xoay camera theo bước 90° quanh văn phòng

### Phát hiện (DETECT)

- [ ] **DETECT-01**: Mỗi NPC có nón nhìn vẽ mờ trên sàn; góc và tầm nhìn khác nhau theo loại NPC
- [ ] **DETECT-02**: Khi người chơi làm hành vi đáng ngờ trong tầm nhìn, thanh nghi ngờ của NPC tăng dần 0→100 theo khoảng cách và hành vi (không bật tắt tức thì)
- [ ] **DETECT-03**: Mũi tên cảnh báo quanh nhân vật chỉ về NPC sắp phát hiện, to và đậm dần theo mức nguy hiểm
- [ ] **DETECT-04**: NPC chuyển trạng thái Làm việc → Nghi ngờ (?) → Tìm kiếm → Bắt quả tang (!), có icon và màu nón tương ứng
- [ ] **DETECT-05**: Tiếng ồn (đồ rơi, máy in kẹt…) tạo vòng ồn khiến NPC trong bán kính đi tới kiểm tra
- [ ] **DETECT-06**: Người chơi nấp sau vật cản hoặc "giả vờ làm việc" để giảm/ngừng tăng nghi ngờ
- [ ] **DETECT-07**: NPC đi theo lịch trong ngày (bàn → pantry → họp → toilet) trên navmesh

### Chọc phá (PRANK)

- [ ] **PRANK-01**: Người chơi nhặt đồ vật, cầm theo (hiện trên tay/HUD) và đặt vào điểm prank hợp lệ
- [ ] **PRANK-02**: Prank chỉ kích hoạt khi nạn nhân tương tác với vật bị gài; người chơi có thể đã rời hiện trường
- [ ] **PRANK-03**: Mỗi prank thành công phát cutscene/animation punchline, bỏ qua được
- [ ] **PRANK-04**: Mỗi ngày có to-do list 3–5 phi vụ; hoàn thành thì gạch và cộng điểm
- [ ] **PRANK-05**: Có ít nhất 12 prank khác nhau trong tầng đầu tiên
- [ ] **PRANK-06**: Ít nhất 2 chuỗi combo, trong đó prank A mở điều kiện cho prank B

### Tin đồn (GOSSIP)

- [ ] **GOSSIP-01**: Người chơi thì thầm một tin đồn (chọn từ thẻ có sẵn) với NPC đứng cạnh, chỉ khi không ai khác nghe trong bán kính
- [ ] **GOSSIP-02**: NPC đang giữ tin đồn lan cho NPC khác khi gặp nhau ở điểm tụ tập (pantry, thang máy…)
- [ ] **GOSSIP-03**: Mỗi lần lan có xác suất tin bị "méo" sang phiên bản phóng đại hài hước; người chơi thấy được phiên bản hiện tại
- [ ] **GOSSIP-04**: Mỗi tin đồn lưu chuỗi người đã truyền; khi nạn nhân nghe được, họ truy ngược từng mắt xích
- [ ] **GOSSIP-05**: NPC khai hay giấu nguồn tuỳ quan hệ với người chơi và tính cách ("bà tám" khai ngay)
- [ ] **GOSSIP-06**: Bị truy ra thì có cutscene đối chất, người chơi nhận 1 gậy và nạn nhân thành "kẻ thù" (theo dõi gắt hơn)
- [ ] **GOSSIP-07**: Người chơi có quan hệ −100..100 với từng NPC, thay đổi theo hành động (mời trà sữa +, nói xấu người thân của họ −)
- [ ] **GOSSIP-08**: Drama point = độ hot × số người biết, hiện trên HUD

### Stress & Rage (RAGE)

- [ ] **RAGE-01**: Thanh Stress tăng khi sếp giao việc, mắng, bắt họp và khi bị bắt; giảm khi prank/tin đồn thành công
- [ ] **RAGE-02**: Stress đầy thì vào Rage Mode 20–30s: đổi nhạc, slow-motion đòn đầu
- [ ] **RAGE-03**: Trong Rage Mode, người chơi vung đòn (kéo chuột / vuốt) làm đồ vật vỡ theo vật lý và NPC ngã kiểu ragdoll, không máu
- [ ] **RAGE-04**: Đồ vật có HP và giá trị $; hết Rage hiện "Hoá đơn thiệt hại"
- [ ] **RAGE-05**: Có ít nhất 5 vũ khí văn phòng với cảm giác đánh khác nhau
- [ ] **RAGE-06**: Mảnh vỡ và ragdoll bị giới hạn số lượng + tự dọn, không làm tụt fps dưới ngưỡng TECH-03

### Vòng ngày làm việc (LOOP)

- [ ] **LOOP-01**: Mỗi màn là một ngày có đồng hồ 08:00→17:00 (thời lượng thật 5–8 phút)
- [ ] **LOOP-02**: Bị bắt khi đang prank/trốn việc/nói xấu thì nhận 1 gậy HR; đủ 3 gậy thì "bị đuổi"
- [ ] **LOOP-03**: Bị đuổi thì chuyển sang màn kết rage-quit: đập phá đường xuống tầng trệt
- [ ] **LOOP-04**: Hết ngày hiện bảng chấm điểm ★ Lén lút / Hỗn loạn / Drama và số coin nhận được
- [ ] **LOOP-05**: Tầng đầu tiên có 5 ngày (Thứ 2 → Thứ 6), độ khó và to-do tăng dần, 6–8 NPC

### Tiến trình (PROG)

- [ ] **PROG-01**: Người chơi dùng coin (một loại tiền duy nhất) mở khoá prank, vũ khí rage, trang phục
- [ ] **PROG-02**: Tiến trình (ngày đã qua, coin, đồ đã mở) được lưu và còn nguyên khi mở lại trình duyệt; incognito không crash mà báo "tiến trình sẽ không được lưu"
- [ ] **PROG-03**: Người chơi xem bộ sưu tập prank và tin đồn đã làm được

### Trải nghiệm (UX)

- [ ] **UX-01**: Lần đầu vào game, người chơi được dạy bằng một ngày hướng dẫn trực quan, không phải đọc chữ dài
- [ ] **UX-02**: Người chơi đổi ngôn ngữ Tiếng Việt / English; mọi chữ, kể cả tin đồn, đều dịch
- [ ] **UX-03**: Có nhạc nền và hiệu ứng âm thanh; âm thanh bắt đầu sau lần chạm đầu (luật iOS) và bật/tắt được
- [ ] **UX-04**: Từ lúc bấm URL tới lúc điều khiển được nhân vật ≤ 10s trên 4G, không màn splash dài
- [ ] **UX-05**: Toàn bộ nhân vật và tên là tự thiết kế; asset có ghi nguồn trong CREDITS.md

### Phát hành & vận hành (PLAT)

- [ ] **PLAT-01**: Mỗi lần deploy, bản chơi thử tự lên VPS qua một lệnh duy nhất, không làm gián đoạn doibung.com
- [ ] **PLAT-02**: Bản chơi thử có HTTPS ở một (sub)domain riêng
- [ ] **PLAT-03**: Code gọi cổng game qua một lớp PlatformAdapter (web riêng / CrazyGames), đổi cổng không sửa gameplay
- [ ] **PLAT-04**: Build đạt giới hạn CrazyGames (tổng ≤ 250 MB, ≤ 1.500 file, tải đầu ≤ 50 MB) và được nộp Basic Launch
- [ ] **PLAT-05**: Có bảng tổng kết số đo sau Basic Launch: playtime trung bình, D1 retention, conversion, so với mốc 10 phút / 10–15% / 80%

## v2 Requirements

### Kiếm tiền & cổng

- **MON-01**: Rewarded ads đúng luật Poki/CrazyGames (x2 coin, xoá 1 gậy/ngày, thử vũ khí VIP)
- **MON-02**: CrazyGames Full Launch: SDK, auto login, cloud save
- **MON-03**: Phát hành lên Poki

### Nội dung sống

- **LIVE-01**: Thử thách hằng ngày
- **LIVE-02**: Tầng mới (Sales, IT, Nhân sự, Phòng CEO) + thăng chức
- **LIVE-03**: Event theo mùa (Tết, KPI cuối quý)
- **LIVE-04**: Sếp học thói quen người chơi (đặt camera/tăng tuần tra ở chỗ hay bị prank)
- **LIVE-05**: Đổ tội cho NPC khác + group chat công ty giả lập
- **LIVE-06**: Replay khoảnh khắc bị bắt + chia sẻ ảnh/clip
- **LIVE-07**: Chế độ sandbox văn phòng không mục tiêu

## Out of Scope

| Feature | Reason |
|---------|--------|
| Tài khoản / backend dữ liệu người chơi | Không dữ liệu cá nhân → không hồ sơ xuyên biên giới; localStorage đủ cho v1 |
| IAP | Poki cấm; Basic Launch không kiếm tiền |
| Multiplayer / co-op | Cần backend realtime, lệch Core Value |
| Gõ tin đồn tự do / nhập tên người thật / level editor | Rủi ro nội dung bắt nạt, cần kiểm duyệt |
| Máu, vũ khí sắc đâm người | PEGI 12 |
| Unity WebGL | Size + crash Safari iOS |
| IP có sẵn (The Office, Scary Teacher…) | Bản quyền |
| Hai loại tiền (coin + gem) | Poki khuyến cáo tránh |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TECH-01 | Phase 1 | Pending |
| TECH-02 | Phase 1 | Pending |
| TECH-03 | Phase 1 | Pending |
| TECH-04 | Phase 1 | Pending |
| TECH-05 | Phase 1 | In Progress |
| TECH-06 | Phase 1 | In Progress |
| TECH-07 | Phase 1 | Pending |
| CTRL-01 | Phase 1 | Pending |
| CTRL-02 | Phase 1 | Pending |
| CTRL-03 | Phase 1 | Pending |
| CTRL-04 | Phase 1 | Pending |
| CTRL-05 | Phase 1 | Pending |
| PLAT-01 | Phase 1 | Pending |
| PLAT-02 | Phase 1 | Pending |
| DETECT-01 | Phase 2 | Pending |
| DETECT-02 | Phase 2 | Pending |
| DETECT-03 | Phase 2 | Pending |
| DETECT-04 | Phase 2 | Pending |
| DETECT-05 | Phase 2 | Pending |
| DETECT-06 | Phase 2 | Pending |
| DETECT-07 | Phase 2 | Pending |
| PRANK-01 | Phase 3 | Pending |
| PRANK-02 | Phase 3 | Pending |
| PRANK-03 | Phase 3 | Pending |
| PRANK-04 | Phase 3 | Pending |
| LOOP-01 | Phase 3 | Pending |
| LOOP-02 | Phase 3 | Pending |
| RAGE-01 | Phase 4 | Pending |
| RAGE-02 | Phase 4 | Pending |
| RAGE-03 | Phase 4 | Pending |
| RAGE-04 | Phase 4 | Pending |
| RAGE-05 | Phase 4 | Pending |
| RAGE-06 | Phase 4 | Pending |
| LOOP-03 | Phase 4 | Pending |
| GOSSIP-01 | Phase 5 | Pending |
| GOSSIP-02 | Phase 5 | Pending |
| GOSSIP-03 | Phase 5 | Pending |
| GOSSIP-04 | Phase 5 | Pending |
| GOSSIP-05 | Phase 5 | Pending |
| GOSSIP-06 | Phase 5 | Pending |
| GOSSIP-07 | Phase 5 | Pending |
| GOSSIP-08 | Phase 5 | Pending |
| LOOP-04 | Phase 6 | Pending |
| LOOP-05 | Phase 6 | Pending |
| PRANK-05 | Phase 6 | Pending |
| PRANK-06 | Phase 6 | Pending |
| PROG-01 | Phase 6 | Pending |
| PROG-02 | Phase 6 | Pending |
| PROG-03 | Phase 6 | Pending |
| UX-01 | Phase 7 | Pending |
| UX-02 | Phase 7 | Pending |
| UX-03 | Phase 7 | Pending |
| UX-04 | Phase 7 | Pending |
| UX-05 | Phase 7 | Pending |
| PLAT-03 | Phase 7 | Pending |
| PLAT-04 | Phase 8 | Pending |
| PLAT-05 | Phase 8 | Pending |

**Coverage:**

- v1 requirements: 57 total
- Mapped to phases: 57
- Unmapped: 0 ✓

---
*Requirements defined: 2026-09-14*
*Last updated: 2026-09-14 after initial definition*
