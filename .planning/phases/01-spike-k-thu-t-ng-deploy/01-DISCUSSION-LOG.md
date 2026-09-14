# Phase 1: Spike kỹ thuật & đường deploy - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-14
**Phase:** 01-spike-k-thu-t-ng-deploy
**Areas discussed:** Domain & deploy VPS, Máy đo & cổng chặn, Nội dung căn phòng spike, Điều khiển & hướng màn hình, Ai được vào bản chơi thử, Máy yếu / không WebGL, Mức test tự động, Màn vào game

---

## Domain & deploy VPS

| Option | Description | Selected |
|--------|-------------|----------|
| breaktime.doibung.com | 1 bản ghi A, Caddy tự HTTPS, miễn phí | ✓ |
| Mua domain riêng ngay | ~300–800k/năm, tên game chưa chốt | |
| doibung.com/break-time | Không cần DNS nhưng chung origin với doibung | |

| Option | Description | Selected |
|--------|-------------|----------|
| Caddy import thư mục sites | Sửa 1 lần repo whattoeat, recreate caddy 1 lần, deploy whattoeat không xoá được game | ✓ |
| Container nginx riêng | Tách biệt, thêm container trên máy 1 vCPU, vẫn phải sửa Caddyfile whattoeat | |
| Sửa thẳng Caddyfile trên server | Bị `rsync --delete` của whattoeat xoá mất | |

| Option | Description | Selected |
|--------|-------------|----------|
| Script local `npm run deploy` | build → size → rsync → smoke test cả 2 site | ✓ |
| GitHub Actions khi push | Phải đưa private key root lên CI | |

| Option | Description | Selected |
|--------|-------------|----------|
| Mới nhất + bản theo commit `/b/<sha>/` | So fps giữa các bản, rollback | ✓ |
| Chỉ bản mới nhất | Đơn giản | |

**User's choice:** Toàn bộ theo khuyến nghị.
**Notes:** Không hỏi thêm.

---

## Máy đo & cổng chặn

| Option | Description | Selected |
|--------|-------------|----------|
| Có sẵn cả Android tầm trung + iPhone | Model ghi vào CONTEXT làm chuẩn | ✓ |
| Chỉ Android | Safari iOS phải mượn/thuê | |
| Chỉ iPhone | Dễ cho số đẹp giả | |

| Option | Description | Selected |
|--------|-------------|----------|
| Tối ưu 1 vòng có giới hạn rồi xét | Danh sách tối ưu sẵn; vẫn trượt thì dừng, đánh giá PlayCanvas | ✓ |
| Dừng ngay, đánh giá lại stack | Có thể bỏ stack vì build chưa tối ưu | |
| Ghi nhận rồi đi tiếp | Nền chưa chắc | |

| Option | Description | Selected |
|--------|-------------|----------|
| Chế độ benchmark `?bench=1` | Kịch bản cố định 60s, số so sánh được | ✓ |
| Nhìn HUD khi chơi tự do | Không so sánh được | |

**User's choice:** Theo khuyến nghị.
**Notes:** Model máy chưa được ghi. Phải ghi trước lần đo đầu.

---

## Nội dung căn phòng spike

| Option | Description | Selected |
|--------|-------------|----------|
| Kenney Blocky Characters | Khối, nhẹ, đồng bộ Furniture Kit, tag "Bloxy" như Crazy Office | ✓ |
| Quaternius Modular Men/Women | Tỉ lệ người, nặng hơn, khác style | |
| Kenney Mini Characters | Rất nhẹ, ít biểu cảm | |

| Option | Description | Selected |
|--------|-------------|----------|
| Open-space 4 bàn + góc pantry | Dùng lại cho Phase 2–3 | ✓ |
| Phòng sếp riêng | Số đo lạc quan | |
| Sàn trống + đồ test | Không dùng lại được | |

| Option | Description | Selected |
|--------|-------------|----------|
| Slapstick phóng đại | Bay xa, "bốp", hit-stop, tự đứng dậy | ✓ |
| Vật lý thực tế nhẹ | Kém hài | |
| Chỉ đẩy ngã | Không trả lời "có vui không" | |

| Option | Description | Selected |
|--------|-------------|----------|
| Bám mượt theo nhân vật | Tầm nhìn ~1/2 phòng | ✓ |
| Cố định thấy cả phòng | Nhân vật nhỏ trên điện thoại | |
| Bám theo + chụm zoom | Xung đột joystick | |

*(Operator chọn "Hỏi thêm về căn phòng")*

| Option | Description | Selected |
|--------|-------------|----------|
| Phần lớn văng/đổ + vài món vỡ mảnh | Đo cả hai loại tải | ✓ |
| Chỉ văng/đổ | Không đo tải mảnh vỡ | |
| Mọi thứ vỡ mảnh | Vượt ngân sách body | |

| Option | Description | Selected |
|--------|-------------|----------|
| 1 NPC chơi tự do + benchmark rải 6 | | |
| Chỉ 1 NPC | | |
| 3 NPC đi lại | | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Màu phẳng + bóng tròn giả | Không shadow map realtime | ✓ |
| 1 đèn có bóng thật | Ngốn fps | |
| Baked + bóng giả | Tốn công, tăng size | |

| Option | Description | Selected |
|--------|-------------|----------|
| Vài SFX CC0 cho tát và đồ vỡ | Đánh giá slapstick + thử unlock audio iOS | ✓ |
| Im lặng tới Phase 7 | | |

Làm rõ tiếp:

| Option | Description | Selected |
|--------|-------------|----------|
| Đi theo đường cố định đơn giản | Navmesh vẫn Phase 2 | ✓ |
| Làm luôn navmesh + tìm đường | Kéo DETECT-07 về Phase 1 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Chơi 3, bench đẩy lên 8 | Đo trần Tầng 1 | ✓ |
| Bench cũng 3 | | |

**User's choice:** Theo khuyến nghị, trừ số NPC: chọn 3 NPC đi lại thay vì 1.
**Notes:** Đã làm rõ "đi lại" = đường cố định, không phải navmesh (tránh lấn Phase 2).

---

## Điều khiển & hướng màn hình

| Option | Description | Selected |
|--------|-------------|----------|
| Ngang là chính, dọc vẫn chơi được | Không bắt xoay máy | ✓ |
| Dọc là chính | Thấy ít phòng | |
| Chỉ ngang, dọc thì báo xoay | Trái CTRL-03 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Nổi theo ngón tay | | ✓ |
| Cố định góc trái dưới | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Nút ngữ cảnh / phím E | Để dành kéo/vuốt cho Rage | ✓ |
| Click/chạm thẳng vào NPC | Dễ chạm nhầm | |
| Làm luôn vuốt để vung | Kéo việc Phase 4 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Q/E desktop + nút ⟲⟳ mobile | | ✓ |
| Vuốt 2 ngón | | |
| Bỏ xoay trong spike | Phải dời CTRL-05 | |

**User's choice:** Theo khuyến nghị.

---

## Ai được vào bản chơi thử

| Option | Description | Selected |
|--------|-------------|----------|
| Mật khẩu + chặn index | basic_auth + noindex | |
| Công khai + chặn index | | |
| Công khai hoàn toàn | | ✓ |

**User's choice:** Công khai hoàn toàn (khác khuyến nghị).
**Notes:** Ghi vào Deferred để xem lại trước Phase 8.

---

## Máy yếu / không có WebGL

| Option | Description | Selected |
|--------|-------------|----------|
| Tự hạ theo fps + có nút chỉnh tay | 3 mức, màn báo khi thiếu WebGL2 | ✓ |
| Chỉ tự hạ, không nút | | |
| Một mức duy nhất | | |

---

## Mức test tự động

| Option | Description | Selected |
|--------|-------------|----------|
| Unit + smoke trình duyệt chặn deploy | Vitest + Playwright headless; fps chỉ tin máy thật | ✓ |
| Chỉ unit test | | |

---

## Màn vào game

| Option | Description | Selected |
|--------|-------------|----------|
| Màn tải + nút "Chơi" | Unlock audio iOS, fullscreen, hiện tên + commit sha | ✓ |
| Vào thẳng căn phòng | | |

---

## Claude's Discretion

- Cấu trúc code, ECS, phiên bản thư viện, cấu hình Vite, nén asset, chia chunk
- Thông số vật lý, dựng ragdoll nhân vật khối, thời gian dọn mảnh
- Thuật toán tự chọn mức chất lượng
- Bố cục chi tiết phòng, nguồn SFX CC0, tên file site Caddy, chiến lược dọn `/b/<sha>/`

## Deferred Ideas

- Mật khẩu/noindex cho bản chơi thử: xem lại trước Phase 8
- Navmesh + lịch trình NPC: Phase 2
- Vung đòn kéo/vuốt: Phase 4
- Nhạc nền, i18n: Phase 7
