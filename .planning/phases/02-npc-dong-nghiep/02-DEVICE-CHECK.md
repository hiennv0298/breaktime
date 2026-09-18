# Phase 2 — Device Checklist (02-DEVICE-CHECK.md)

**Để operator kiểm tra chiến thuật, cảm giác chơi và hiệu suất thực tế trên máy.**

---

## Thông tin deploy

```
DEPLOY_SHA=82448797205b
DEPLOY_POLLER=count=8 non200=0
HEADLESS_BRAWL=MEASURE brawl npcs=15 peakDrawCalls=99 peakBodies=206 maxPursuers=3 maxAttackers=1 strikes=6 knockdowns=3 simStepAvgMs=0.73 simStepP99Ms=2.30 simStepMaxMs=9.30
NPC_DEVICE_VERDICT=PENDING
CAP_DECISION=PENDING
```

---

## URL để kiểm tra

Mở những URL dưới đây trên 2 điện thoại chuẩn (1 Android, 1 iPhone):

- **Chơi bình thường:** https://game.doibung.com/b/82448797205b/
- **Benchmark 10 NPC (so sánh Phase 1):** https://game.doibung.com/b/82448797205b/?bench=1
- **Benchmark 15 NPC với đánh trả:** https://game.doibung.com/b/82448797205b/?bench=1&brawl=1
- **Đánh liên tục với 3 NPC:** https://game.doibung.com/b/82448797205b/?fight=always&npcs=3

---

## Bảng kết quả trên máy chuẩn

### Máy chuẩn (Android — Chrome 153, Android 10, DPR 1.5, 576×1159/1279, tier Vừa/auto)

| Kịch bản | Avg fps | 1% low | Đỉnh draw | Đỉnh body | NPC | Đuổi tối đa | Người chơi bị hạ | Sim ms TB | Sim p99 | Ghi chú |
|---|---|---|---|---|---|---|---|---|---|---|
| ?bench=1 (10 NPC) | 59.3 | 27.0 | 72 | 171 | 10 | — | — | — | — | commit f8f4a44d3dde, 60s/3529 khung |
| ?bench=1&brawl=1 (15 NPC) | 58.9 | 24.3 | 82 | 206 | 15 | 3/3 | 5 | 3.6 | 10.1 | commit f8f4a44d3dde, 60s/3527 khung |

### Máy chuẩn (iPhone — Safari 604.1 / CriOS 153, iOS 26.6.2, DPR 2, 804×1368, tier Cao/manual)

| Kịch bản | Avg fps | 1% low | Đỉnh draw | Đỉnh body | NPC | Đuổi tối đa | Người chơi bị hạ | Sim ms TB | Sim p99 | Ghi chú |
|---|---|---|---|---|---|---|---|---|---|---|
| ?bench=1 (10 NPC) | 60.0 | 57.1 | 78 | 171 | 10 | — | — | — | — | commit f8f4a44d3dde, 60s/3563 khung |
| ?bench=1&brawl=1 (15 NPC) | 59.8 | 35.3 | 83 | 206 | 15 | 3/3 | 6 | 1.0 | 4.0 | commit f8f4a44d3dde, 60s/3576 khung |

**Kết luận số đo:** cả 2 máy chuẩn đều giữ avg fps ~59-60 kể cả ở kịch bản nặng nhất (brawl 15 NPC, 206/206 physics body — chạm trần). 1% low thấp nhất là Android brawl (24.3 fps) — dưới 30 nhưng chỉ là các khung đáy hiếm, không phải trung bình; avg vẫn 58.9. Không có dấu hiệu giới hạn 30fps, không nghẽn draw call.

**Lỗi phát hiện khi chơi thật (không phải lỗi hiệu năng):** sau khi bị đánh ngã và tự đứng dậy, chân/tay/đầu bị "co về giữa thân" trong lúc chuyển tiếp thay vì gắn khớp — do `blend()` trong `knockdown.ts` dùng sai điểm xuất phát khi lerp. Đã sửa ở commit `fa0a163` (sau bench này), cần operator xác nhận lại trên máy sau khi deploy bản mới.

---

## Đề xuất của planner về trần NPC (chờ operator quyết)

**Đây KHÔNG phải quyết định đã chốt. Planner chỉ đề xuất dựa trên số đo headless và RESEARCH G1; quyết định cuối cùng thuộc về operator.**

Nếu brawl (đánh trả 15 NPC) chạy **dưới 30 fps trên Android chuẩn** thì phương án fallback là: hạ trần NPC từ 15 về 10. Nếu đạt ≥ 30 fps trên cả 2 máy thì giữ trần 15. Operator có thể chọn khác và ghi lại quyết định của mình ở dòng `CAP_DECISION=`.

Hành động sau:
- Nếu operator chọn "giữ 15 NPC" → viết `CAP_DECISION=KEEP_15` ở dòng trên
- Nếu chọn "hạ về 10 NPC" → viết `CAP_DECISION=LOWER_TO_10` + tạo plan sửa code để thay đổi `MAX_NPCS` và `npc-max-default`
- Nếu khác → `CAP_DECISION=OTHER:<ghi chú của operator>`

**Plan này KHÔNG thay đổi code.** Chỉ thu thập chứng minh thực máy.

---

## Kiểm tra cảm giác chơi (Manual Checks)

Hoàn tất trên cả **2 điện thoại chuẩn**. Đánh dấu **ok** / **không ok** và ghi chú nếu cần.

| Hành động | Kết quả (Android) | Kết quả (iPhone) | Ghi chú |
|---|---|---|---|
| **Thêm/bớt NPC** | | | |
| Phím +/− trên desktop (không kiểm trên phone) | — | — | Desktop không thuộc phase này |
| Nút "− N +" trên cả 2 điện thoại (bán trong suốt, không vấp tay) | | | Bấm để thêm tới 15, rồi bớt về 0 |
| **Tên đồng nghiệp** | | | |
| Thêm 3 đồng nghiệp trên mỗi phone bằng nút "Tên ngẫu nhiên" | | | Đảm bảo dòng cảnh báo xuất hiện |
| Reload và kiểm tra 3 tên đó vẫn còn | | | localStorage giữ lại |
| Dòng cảnh báo "Tên chỉ lưu trên máy bạn" đọc được | | | Vàng/cam, rõ chữ |
| Công tắc "Hiện tên" / "Ẩn tên" hoạt động | | | Toggle tắt/bật nhãn trên đầu NPC |
| **Độ giận của NPC** | | | |
| NPC Nóng (tính khí 🔴) bị tát 1 lần thì nổi giận | | | Thanh giận chỉ sau khi đứng dậy |
| NPC Thường (tính khí 🟡) cần tát 2 lần để nổi giận | | | Khoảng cách ≥ 3,5 giây |
| NPC Hiền (tính khí 🟢) cần tát 3 lần để nổi giận | | | Thử các tính khí khác nhau |
| **Báo trước đòn tấn công** | | | |
| NPC giơ tay + dấu "!" trên đầu 0,6 giây trước khi đánh | | | Nên đủ thời gian để đọc/né |
| Đi ra khỏi tầm (cách NPC ~1.2 m) là trốn thoát | | | Không bị đánh nếu đi ra kịp |
| Tát NPC lúc nó giơ tay thì hủy đòn / cắt wind-up | | | Tác động ngay khi có '!' trên đầu |
| **Cảm giác bị đánh (người chơi)** | | | |
| Bị trúng đòn → ngã ragdoll buồn cười (không trông như đau hay máu) | | | Lăn xe, gãy cánh tay, mặt cười |
| Khoá điều khiển ≤ ~3 giây, sau tự đứng dậy | | | Đo bằng ký tín: bấm nút 3-4 lần |
| Bất tử 1,5 giây sau khi dậy (NPC không thể tát được) | | | Vùi vui đập mà không bị hạ |
| Viền loé màn hình (không màu đỏ máu) | | | Trắng/xanh/vàng được; đỏ thì sai |
| Âm thanh **hurt-*** và **alert-*** (nếu bật âm) | | | |
| **Hành vi nhóm của NPC** | | | |
| Tối đa 3 NPC đuổi cùng lúc | | | Tát nhiều NPC, chỉ 3 cái gần nhất đuổi |
| Khi 3 NPC đang đuổi và tát NPC thứ 4 → NPC 4 chỉ đứng giận, không đuổi | | | Token limit: 1 vung đòn, 3 đuổi |
| Sau 2 phút, NPC 11–15 không kẹt tường / không thoát ra ngoài phòng | | | Đặc biệt khi có 15 NPC + người chơi |
| **Reload giữa chơi** | | | |
| Reload trang (F5 hoặc pull-to-refresh) giữa lúc chơi, đối tượng mở lại là cảnh chơi bình thường | | | Không có banner "Lần chơi trước bị dừng" |

---

## Xác nhận cuối cùng

Sau khi hoàn tất bảng và kiểm tra, operator ghi lại:

```
NPC_DEVICE_VERDICT=PASS
CAP_DECISION=KEEP_15
```

hoặc

```
NPC_DEVICE_VERDICT=PASS
CAP_DECISION=LOWER_TO_10
```

Sau đó submit `/gsd-verify-work` để hoàn tất Phase 2.

**Ngày cập nhật:** 2026-09-18  
**Mục tiêu:** Xác nhận hiệu suất ≥ 30 fps tại trần 15 NPC trên 2 máy chuẩn; quyết định CAP_DECISION.
