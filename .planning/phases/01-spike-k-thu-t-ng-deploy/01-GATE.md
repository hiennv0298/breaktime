# 01-GATE — Phán quyết cổng Phase 1 trên máy thật

Viết bởi plan 01-19 Task 3 ngày 2026-09-16. Ngưỡng lấy từ ROADMAP Phase 1 (tiêu chí thành công 2–4) và quyết định D-07. Số liệu chép từ 4 ảnh bench/soak operator gửi ngày 16/09/2026 (xem `evidence/README.md`).

```
SHA=04c06b21c39a
GATE_ANDROID_FPS=PASS (avg=60.6, low1=53.6, tier=Vừa (auto), npc=10)
GATE_ANDROID_OBJECTS=PASS (knocked_or_broken=33)
GATE_IOS_SOAK=PASS
GATE_FIRST_LOAD=PASS (raw=3364381)
TECH03_DESKTOP=59.9 on 60 Hz
TECH03_DESKTOP_OK=yes
TECH01_BROWSERS=3/5 playable
CTRL02_FEEL=chưa ghi nhận (operator chưa gửi cảm nhận joystick / nút ngữ cảnh trên 2 điện thoại)
CTRL_UI_CHECK=0/0 ok
VERDICT=PASS
```

## Bằng chứng theo từng tiêu chí

| Tiêu chí | Ngưỡng | Đo được | Nguồn |
|---|---|---|---|
| Android fps | avg ≥ 30, hàng hợp lệ (sha đúng, không bị bóp, NPC = 10) | **60.6** TB, 1% thấp 53.6, 3599 khung / 60 s | ảnh bench Android 16/09 — Chrome 152, DPR 1.5 · 562x1251, rapier simd |
| Android đồ văng/vỡ | ≥ 20 trong **cùng** lần bench đó | **33** (vỡ 11) | cùng ảnh trên |
| iOS soak | soak chạy đủ 15 phút, không crash, không tự tải lại, không banner khi mở lại | 15:00/15:00, 14 chu kỳ, mất ngữ cảnh 0, geometries 44/44, textures 25/25, bodies 165/165, "Xong 15 phút — không crash" | ảnh soak iPhone 16/09 |
| First load | ≤ 20.000.000 byte (> 8.000.000 thì cần SIZE-REASON.md) | **3.364.381** byte (~3,21 MB) → dưới cả mốc 8 MB, không cần SIZE-REASON.md | FIRST_LOAD_TOTAL_RAW của lần deploy sha đo |
| TECH-03 desktop | avg ≥ 57 trên màn 60 Hz | **59.9** TB, 1% thấp 53.6, 91 draw đỉnh | ảnh bench desktop 16/09 — Chrome 153, 1920x911, DPR 1 |

Bốn tiêu chí chặn cổng đều PASS → **VERDICT=PASS**, không kích hoạt D-07, không cần chạy 01-20 / 01-21.

### Đối chiếu 3 máy (cùng sha, cùng kịch bản 10 NPC / 165 body / 33 đồ)

| Máy | TB fps | 1% thấp | Draw đỉnh | Tier | DPR · backbuffer |
|---|---|---|---|---|---|
| Desktop Chrome 153 | 59.9 | 53.6 | 91 | Cao (tay) | 1 · 1920x911 |
| Android Chrome 152 | 60.6 | 53.6 | 74 | Vừa (tự) | 1.5 · 562x1251 |
| iPhone Safari 604.1 | 60.0 | 49.2 | 78 | Vừa (tự) | 1.5 · 603x1071 |
| iPhone Chrome iOS 153 | 60.0 | 46.2 | 78 | Cao (tay) | 2 · 804x1368 |

Cả ba máy chạm trần 60 fps ở tier tự chọn; chỉ số thật sự phân biệt là 1% thấp, và máy yếu nhất (iPhone tier Cao, DPR 2) vẫn còn 46.2 — cách ngưỡng 30 khá xa. Không máy nào báo "Bị giới hạn 30 fps? Có".

## Khoảng trống chuyển sang verify-work

Những mục dưới đây **không** đổi VERDICT (D-07 chỉ kích hoạt bởi 4 tiêu chí chặn cổng), nhưng phải xử lý trước khi đóng phase hoặc trong verify-work:

1. **CTRL_UI_CHECK=0/0** — toàn bộ 13 dòng "Controls & settings checklist" (D-19, D-27, D-28, D-29, D-30) chưa được kiểm bằng tay trên desktop và 2 điện thoại. Đây là khoảng trống lớn nhất còn lại.
2. **TECH01_BROWSERS=3/5** — đã xác nhận Chrome desktop, Chrome Android, Safari iOS. **Edge và Firefox desktop chưa mở thử.**
3. **CTRL02_FEEL chưa ghi nhận** — chưa có nhận xét joystick / nút ngữ cảnh trên 2 điện thoại (2 phút chơi mỗi máy).
4. **Ảnh bằng chứng chưa nằm trong repo** — 4 ảnh còn ở hội thoại; số liệu đã chép nhưng file chưa lưu vào `evidence/`. Xem `evidence/README.md`.
5. **Soak chạy trên Chrome iOS, không phải Safari** — cùng lõi WebKit nên kết quả bộ nhớ/ngữ cảnh có giá trị, nhưng hai mục con chưa kiểm riêng: (a) chơi thường thêm 15 phút, (b) mở lại trang xem có banner "Lần chơi trước bị dừng đột ngột" không. Bench thì đã có bản Safari thật.
6. **Model 2 máy tham chiếu còn thiếu (D-06)** — Chrome Android gửi UA rút gọn (`Android 10; K`) nên không lộ model/bản Android thật; model iPhone chờ operator ghi. OS/browser đã đủ để kiểm baseline (iOS 26.6.1 ≥ 16.4, Chrome 152 ≥ 111).
7. **Các mục quan sát mang từ plan trước** (khung hình camera, nút xoay dọc màn, tier Thấp cắt tường xa, âm thanh sau khi chuyển app, cảm giác tát, mảnh vỡ, đồ trên bàn bị hất, icon nút ngữ cảnh khi không có mục tiêu, chiều cao bảng tạm dừng khi xoay ngang, gõ/dán tên) — vẫn chưa kiểm, xem cuối `01-DEVICE-LOG.md`.

## Hệ quả

Cổng Phase 1 PASS → mở khoá các plan tích hợp Phase 2 (`02-06`…`02-13`) đang bị `scripts/phase-gate-guard.mjs` chặn bằng `PLAN_EXIT_GATE_PENDING`.
