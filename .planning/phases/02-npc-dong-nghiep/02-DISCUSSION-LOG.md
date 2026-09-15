# Phase 2: NPC đồng nghiệp — tên, số lượng, đánh trả - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-15 → 2026-09-16
**Phase:** 02-npc-dong-nghiep (lập nhầm là 01.1 ngày 15/09, operator sửa: "đây là plan cho phase 2, không phải mở rộng phase 1"; revert d7a50f6)
**Areas discussed:** Số lượng & roster, NPC đánh trả, Phản hồi/nhãn/bench/thứ tự, Phạm vi Phase 2

---

## Phạm vi Phase 2

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 2 = NPC đồng nghiệp; Hệ phát hiện lùi thành Phase 3 | Đã research + discuss, plan ngay; phase cũ 2–8 → 3–9 | ✓ |
| Gộp cả hai vào Phase 2 | Phải research + discuss thêm phần phát hiện; phase rất lớn | |

## Số lượng & roster

| Câu | Lựa chọn đưa ra | Chọn |
|-----|-----------------|------|
| G1 Trần NPC | 15 · Giữ 10 · 20–30 | 15 |
| G2 Thêm/bớt nhanh | Phím +/− và nút HUD · Chỉ settings · Chỉ phím tắt desktop | Phím +/− và nút HUD |
| G3 Roster | Tên+ngoại hình+tính khí (30) · Tên+ngoại hình · Giữ như hiện tại | Tên+ngoại hình+tính khí (30) |
| G5 Nội dung tên | Gõ tự do+cảnh báo+ngẫu nhiên · Bộ lọc từ thô ngay · Chỉ tên có sẵn | Gõ tự do+cảnh báo+ngẫu nhiên |

## NPC đánh trả

| Câu | Lựa chọn đưa ra | Chọn |
|-----|-----------------|------|
| G6 Nổi giận | Thanh giận theo tính khí · Xác suất mỗi lần tát · Luôn đánh trả | Thanh giận theo tính khí |
| G7 Bị trúng | Ngã ragdoll nhẹ rồi đứng dậy · Choáng tại chỗ · Có thanh máu | Ngã ragdoll nhẹ |
| G8 Cùng lúc | 3 đuổi/1 vung · 5 đuổi/2 vung · Không giới hạn | 3 đuổi/1 vung |
| G10 Né đòn | Vung chậm 0,6 s + "!", né bằng đi ra · Thêm nút né · Không báo trước | Vung chậm 0,6 s + "!" |

## Phản hồi, nhãn, bench, thứ tự

| Câu | Lựa chọn đưa ra | Chọn |
|-----|-----------------|------|
| G11 Phản hồi bị trúng | Không HP; hit-stop+rung camera+tiếng+viền · Đếm số lần bị đánh | Không HP; hit-stop+rung camera+tiếng+viền |
| G12 Nhãn tên | Luôn hiện + công tắc · Chỉ hiện khi gần | Luôn hiện + công tắc |
| G13/G14 Thứ tự & bench | Logic thuần trước, tích hợp sau 01-19; &brawl=1 · Làm toàn bộ ngay | Logic thuần trước; &brawl=1 |

**User's choice:** tất cả theo khuyến nghị có số đo của research.

## Claude's Discretion

- G3r tuyến NPC 11–15 dùng lại có lệch pha theo seed; G4 key `bt.roster` migrate một chiều từ `bt.npcs`; G9 ngưỡng bỏ cuộc (1 cú trúng / ~8 s / ~9 m)

## Deferred Ideas

- Bộ lọc từ thô (Phase 9); NPC đánh trúng NPC khác; NPC giận vì thấy tát người khác; quan hệ ảnh hưởng độ giận (Phase 6)
