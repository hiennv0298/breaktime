# Break Time

## What This Is

Game web 3D low-poly chơi được trên cả desktop lẫn điện thoại (không cần cài app), bối cảnh một văn phòng.
Người chơi là nhân viên bị sếp và đồng nghiệp làm phiền, "xả stress" bằng cách **chọc phá lén lút**,
**nói xấu cho tin đồn lan** (và có thể bị truy ra), rồi khi stress đầy thì **Rage Mode đập phá**.
Nhắm người chơi casual trên các cổng game web (CrazyGames trước), bản tiếng Việt dùng để lan truyền.

## Core Value

**Một "ngày làm việc" 5–8 phút phải buồn cười và căng thẳng đúng lúc.** Người chơi hiểu vì sao mình
bị phát hiện, và mỗi prank, tin đồn hay lần đập phá đều có punchline. Nếu mọi thứ khác hỏng,
vòng lặp này vẫn phải chơi được mượt trên một điện thoại tầm trung.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Chạy mượt trên trình duyệt desktop và mobile, tải lần đầu nhỏ (xem REQUIREMENTS.md TECH-*)
- [ ] Hệ phát hiện rõ ràng: nón nhìn, thanh nghi ngờ, tiếng ồn, chỗ nấp
- [ ] Hệ chọc phá theo to-do list, có cutscene punchline
- [ ] Hệ tin đồn: thì thầm → lan → méo tin → truy nguồn → đối chất (USP)
- [ ] Stress → Rage Mode đập phá ragdoll + hoá đơn thiệt hại
- [ ] Vòng ngày làm việc 08:00–17:00, 3 gậy HR, chấm điểm, coin, mở khoá, lưu tiến trình
- [ ] Đạt yêu cầu CrazyGames Basic Launch và có số đo thật (playtime, D1, conversion)

### Out of Scope

- Tài khoản người dùng / backend lưu dữ liệu người chơi — v1 chỉ dùng localStorage; không có dữ liệu cá nhân thì không vướng hồ sơ chuyển dữ liệu xuyên biên giới (VPS ở Singapore)
- IAP / tiền thật — Poki cấm, CrazyGames Basic Launch không kiếm tiền; để sau Full Launch
- Multiplayer / co-op — cần backend realtime, lệch Core Value
- Nhập tên người thật, gõ tin đồn tự do, level editor — rủi ro nội dung bắt nạt/xúc phạm, cần kiểm duyệt
- Bạo lực có máu, vũ khí sắc nhọn đâm người — PEGI 12 bắt buộc ở CrazyGames
- Unity / Unity WebGL — build nặng, dễ crash vì hết bộ nhớ trên Safari iOS
- Tên/nhân vật/IP có sẵn ("The Office", "Scary Teacher"…) — rủi ro bản quyền
- Artist vẽ riêng — v1 dùng pack CC0

## Context

- Research đầy đủ (đối thủ, cơ chế, luật các cổng, số liệu): `docs/research-game-design.md`.
- Mốc so sánh: **Crazy Office — Slap & Smash** (Freeplay). Hơn 50M lượt tải Android, bản web làm bằng Unity 2022,
  iOS nặng 357.9 MB. Người chơi chê ít màn/ít vũ khí → nhu cầu nội dung không đáy.
  Nhóm Z&K (Prankster 3D, Poki 4.5★/563K) chứng minh công thức "lẻn vào → đặt prank → xem cutscene".
- Mảng "nói xấu rồi bị lộ" mới chỉ có ở board game → khoảng trống thị trường.
- Người làm: **1 dev (operator) + Claude viết code**. Operator review, chơi thử trên máy thật, chốt nội dung.
- Máy chơi thử: cần ít nhất 1 Android tầm trung + 1 iPhone (Safari) để đo. Đây là cổng chặn, không tuỳ chọn.
- Deploy thử: VPS cá nhân `ssh doibung` (Hostinger, **1 vCPU / 3,6 GB RAM** đo 14/09/2026).
  Caddy của stack `doibung` đang giữ cổng 80/443 → game là static site, chạy sau **chính Caddy đó**
  (thêm site block), không dựng container mới bind 80/443.

## Constraints

- **Tech stack**: TypeScript + Vite + Three.js + Rapier (WASM) — nhẹ hơn Unity, chạy được Safari iOS, hệ sinh thái lớn
- **Kích thước**: tải lần đầu mục tiêu ≤ 8 MB, trần cứng ≤ 20 MB — CrazyGames chỉ đưa lên trang chủ mobile khi build ≤ 20 MB; Poki muốn ~8 MB
- **Hiệu năng**: ≥ 30 fps ổn định trên Android tầm trung, 60 fps desktop; vào gameplay ≤ 10s trên 4G — CrazyGames đo conversion 80%+
- **Cổng web**: không request ra ngoài (font/asset đóng gói hết), chạy được khi bật ad-blocker, localStorage bọc try/catch, ESC/Space để pause, cutscene skip được — luật Poki/CrazyGames
- **Nội dung**: ≤ PEGI 12; tin đồn chọn từ thẻ có sẵn, nội dung ngớ ngẩn vô hại
- **Asset**: chỉ dùng license CC0 hoặc tương đương cho phép thương mại + web; ghi nguồn trong `CREDITS.md`
- **Dữ liệu**: không thu dữ liệu cá nhân ở v1
- **Hạ tầng deploy**: dùng chung VPS với doibung.com; không được làm gián đoạn doibung.com khi deploy game

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Three.js + Rapier, không Unity | Unity WebGL khó xuống < 20 MB, dễ crash trên Safari iOS; Rapier là physics WASM nhanh nhất | — Pending (spike Phase 1 đo) |
| 3D low-poly, camera góc nghiêng cố định | Điều khiển mobile đơn giản, nón nhìn luôn đọc được, asset CC0 dễ đồng bộ | — Pending |
| Vòng "Một ngày làm việc" gộp stealth + gossip + rage | Stealth tạo căng thẳng, Rage giải toả; chưa đối thủ nào gộp | — Pending |
| Gossip là USP | Board game có, game điện tử casual chưa ai làm | — Pending |
| Solo dev + Claude, phase Vertical MVP | Mỗi phase ra bản chơi được để operator thử trên máy thật | — Pending |
| Pack asset CC0 (Kenney/Quaternius) | Nhanh, rẻ, thay dần được | — Pending |
| CrazyGames Basic Launch là đích đầu | Build ≤ 50 MB, chưa bắt SDK, trả số đo thật sau 7–21 ngày | — Pending |
| Không tài khoản ở v1 | Tránh nghĩa vụ dữ liệu cá nhân + giảm phạm vi | — Pending |
| Deploy thử sau Caddy của doibung | VPS có sẵn; static site gần như không tốn tài nguyên | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-14 after initialization*
