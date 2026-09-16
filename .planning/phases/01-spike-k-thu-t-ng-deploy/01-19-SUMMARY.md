# 01-19-SUMMARY — Cổng máy thật Phase 1

**Ngày:** 2026-09-16 · **Sha đo:** `04c06b21c39a` · **Phán quyết:** `VERDICT=PASS`

## Đã làm

| Task | Kết quả |
|---|---|
| 1. Ghi 2 máy tham chiếu (D-06) | Xong một phần — OS + trình duyệt đủ để kiểm baseline (iOS 26.6.1 ≥ 16.4; Chrome Android 152 ≥ 111 → **không** BELOW_BASELINE). Model cả hai máy vẫn thiếu, ghi thành nợ tài liệu |
| 2. Operator đo trên máy thật (D-08) | 4 lần đo hợp lệ: bench Android, bench Safari iOS, bench Chrome iOS, bench desktop + soak iPhone 15 phút. Ảnh còn ở hội thoại, chưa lưu file vào `evidence/` |
| 3. Chép số + viết phán quyết (D-07) | `01-GATE.md` với đủ 9 khoá và `VERDICT=PASS`; khoảng trống chuyển sang verify-work |

## Bốn tiêu chí chặn cổng

```
GATE_ANDROID_FPS=PASS (avg=60.6, low1=53.6, tier=Vừa (auto), npc=10)
GATE_ANDROID_OBJECTS=PASS (knocked_or_broken=33)
GATE_IOS_SOAK=PASS
GATE_FIRST_LOAD=PASS (raw=3364381)
VERDICT=PASS
```

Không hàng đo nào bị `INVALID_SHA` / `INVALID_THROTTLED` / `INVALID_SCENARIO`: cả 4 ảnh đều hiện đúng commit `04c06b21c39a`, `NPC 10` và `Bị giới hạn 30 fps? Không`.

## Điều đáng chú ý trong số đo

Cả ba máy đều chạm trần 60 fps ở tier tự chọn, nên **fps trung bình không phân biệt được máy nào khoẻ hơn** — chỉ số thật sự là 1% thấp:

| Máy | TB | 1% thấp | Draw đỉnh | Tier · DPR |
|---|---|---|---|---|
| Desktop Chrome 153 | 59.9 | 53.6 | 91 | Cao · 1 |
| Android Chrome 152 | 60.6 | 53.6 | 74 | Vừa · 1.5 |
| iPhone Safari 604.1 | 60.0 | 49.2 | 78 | Vừa · 1.5 |
| iPhone Chrome iOS 153 | 60.0 | 46.2 | 78 | Cao · 2 |

Cấu hình nặng nhất đo được (iPhone tier Cao, DPR 2, backbuffer 804×1368) vẫn giữ 1% thấp 46.2 — cách ngưỡng 30 fps rất xa. Đây là lý do không cần chạy vòng tối ưu D-07 (plan 01-20 / 01-21).

## Nợ chuyển sang verify-work (không đổi phán quyết)

1. `CTRL_UI_CHECK=0/0` — 13 dòng checklist điều khiển/cài đặt (D-19, D-27..D-30) chưa kiểm tay trên desktop và 2 điện thoại. **Đây là khoảng trống lớn nhất.**
2. `TECH01_BROWSERS=3/5` — Edge và Firefox desktop chưa mở thử.
3. `CTRL02_FEEL` chưa ghi nhận — chưa có nhận xét joystick / nút ngữ cảnh.
4. 4 ảnh bằng chứng chưa nằm trong `evidence/` (Claude không ghi được ảnh từ hội thoại xuống đĩa; xem `evidence/README.md`).
5. Soak chạy trên Chrome iOS (cùng lõi WebKit) chứ chưa trên Safari; chưa chơi thường thêm 15 phút và chưa kiểm banner "Lần chơi trước bị dừng đột ngột" sau khi mở lại. Bench thì đã có bản Safari thật.
6. Model 2 máy tham chiếu chưa rõ.

## Hệ quả

`node scripts/phase-gate-guard.mjs --plan 02-06` chuyển từ `PLAN_EXIT_GATE_PENDING` sang **`GUARD_CONTINUE plan=02-06 reason=passed`**, và dòng blocker `[Phase 2] Tích hợp chờ cổng máy thật Phase 1` đã tự gỡ khỏi STATE.md. Các plan tích hợp 02-06…02-13 hết bị chặn.

Operator yêu cầu **dừng sau khi xong plan, chưa execute Phase 2**.

## Self-Check

- Verify Task 3: `GATE_KEYS_MISSING none VERDICT PASS`, exit 0
- `GATE_ANDROID_OBJECTS=PASS (knocked_or_broken=33)` khớp regex acceptance
- `CTRL_UI_CHECK=0/0 ok` khớp regex acceptance
- SHA trong 01-GATE.md = sha trong 01-GO-LIVE.md "## Measurement build" (đã thêm ghi chú cập nhật `04c06b21c39a` ở đầu mục đó)
- **Không đạt:** acceptance "ít nhất 4 hàng đo trỏ tới file có thật trong evidence/" — ảnh chưa lưu được, đã ghi rõ ở mục nợ 4 thay vì bỏ qua
