# Quick fix 16/09/2026 — mỗi NPC đi tuyến riêng sinh từ seed

Ngoài plan (operator yêu cầu trực tiếp, không chờ cổng máy thật Phase 1 vì chỉ đụng phần sinh tuyến, không đụng kiến
trúc đang chờ đo). Phase 1 vẫn là phase hiện tại trong STATE.md; không tick plan nào, không đụng dòng blocker của
entry guard, không đụng REQUIREMENTS.md.

## Vấn đề

`waypoints.ts` gán 15 slot NPC vào **5 tuyến đặt tay** (`NPC_ROUTES`): slot 0..9 theo ánh xạ Phase 1, slot 10..14 dùng
lại đúng 5 tuyến đó chỉ đổi điểm xuất phát (plan 02-03, G3r). Hệ quả nhìn thấy trong game: NPC thêm sau đi lại đúng
đường của NPC cũ — như xếp hàng nối đuôi.

## Đã đổi gì

| Việc | Chỗ |
| --- | --- |
| Module sinh tuyến thuần, có seed | `src/logic/routeGen.ts` (mới) |
| Ánh xạ slot → tuyến riêng + tốc độ riêng | `src/game/waypoints.ts` |
| NPC nhận tốc độ đi bộ riêng | `src/game/npc.ts` (`NpcOptions.speed` → `stepWalker`) |
| Spawn/respawn theo tuyến riêng | `src/game/game.ts` (`ensureNpc`, `spawnPointFor`) |

### `src/logic/routeGen.ts` (thuần: không three.js / Rapier / DOM / `Date.now` / `Math.random`)

- Đầu vào là hình học trần (`RouteArea`), **không** import `game/layout.ts` → module độc lập, Vitest phủ được.
- Ứng viên điểm dừng = lưới 0,5 m trên nền trống (`freeSpots`). Chặn theo `BlockRect` (hình chữ nhật + `margin`) và
  `BlockCircle` (khoảng cách tâm).
- Chọn 3–5 điểm bằng tìm kiếm có quay lui trên thứ tự Fisher–Yates riêng của từng seed: mỗi điểm cách nhau ≥ 2 m, mỗi
  chặng thẳng phải thông (kể cả chặng khép vòng từ điểm cuối về điểm đầu), và độ trải (khoảng cách xa nhất giữa hai
  điểm) ≥ 6 m. Hai chặn cứng `triesPerLevel` 48 / `nodeBudget` 20 000 → luôn dừng sau số bước cố định.
- Vẫn **không phải navmesh** (đó là Phase 3): chỉ là tìm kiếm khả kiến trên lưới thô.
- Không tìm được thì hạ yêu cầu độ trải; vẫn không được thì `throw` (layout hỏng phải kêu to, không im lặng).

### Dải giá trị (band) — đã ghi trong `DEFAULT_ROUTE_CONFIG`

| Tham số | Dải | Lý do |
| --- | --- | --- |
| Số điểm dừng | 3–5 | operator yêu cầu |
| Khoảng cách 2 điểm của cùng NPC | ≥ 2,0 m | để không dồn một góc |
| Độ trải của vòng | ≥ 6,0 m | trải khắp phòng 15 × 11 m đi lại được |
| Dwell mỗi điểm | 1,5–5,0 s (một mức nền/NPC, ±25 % mỗi điểm) | đủ để "có việc", không lâu tới mức thành tượng |
| Tốc độ đi | 1,1–1,6 m/s | quanh `WALK_SPEED` 1,4 m/s cũ, ±~18 % |
| Khoảng cách spawn giữa 2 NPC | ≥ 0,6 m (`MIN_SPAWN_GAP`) | hai capsule 0,3 m cạnh nhau |

Seed: `seedFor(BENCH_SEED, 'npc-route-' + slot)` (luồng riêng từng slot theo Pattern 9 của `rng.ts`). Slot n chỉ phụ
thuộc điểm spawn của slot 0..n-1, nên **cùng seed + cùng slot ⇒ cùng tuyến, bất kể thứ tự hỏi và bất kể số NPC** →
`?bench=1` / `?soak=1` vẫn phát lại được.

### Dữ liệu chướng ngại (`NPC_ROUTE_AREA`)

Mở rộng đúng bộ dữ liệu clearance đang có, không nới lỏng cái nào:

- `ROUTE_OBSTACLES` (4 bàn, quầy pantry, tủ lạnh, cây nước, kệ sách, máy in) — margin `NPC_RADIUS + ROUTE_CLEARANCE`
  = 0,35 m;
- **thêm 4 ghế** (nửa cạnh 0,315 m tại bàn z + 0,9) — cố ý *không* thêm vào `ROUTE_OBSTACLES` vì tuyến đặt tay đứng
  ngay sau lưng ghế là chủ ý (`BEHIND_CHAIR_Z`), còn điểm dừng sinh tự động thì không;
- hành lang spawn/test-box (`CORRIDOR`) — margin 0,3 m;
- 8 prop đứng sàn (2 thùng rác, 2 thùng carton, box-test, 3 chậu cây) — khoảng cách tâm ≥ 0,6 m (`PROP_CLEARANCE`);
- tường: phòng thu vào 0,5 m mỗi phía.

### `ROUTE_START_INDEX = 1`

NPC đứng sẵn ở điểm 0 nên nếu nhắm vào điểm 0 nó sẽ *dwell trước* — tới 5 s đứng như tượng ngay khi vào phòng (và e2e
`npc.spec.ts` theo dõi 4 s thấy `npc-2 travelled 0.00 m`). Nhắm điểm 1 → đi ngay, vẫn dwell ở điểm 0 khi vòng lại.
Đây là sửa **hành vi**, không phải nới assertion.

## Test nào bị viết lại, vì sao

`tests/unit/waypoints.test.ts` — xoá 2 describe khoá chặt hành vi dùng chung tuyến, có ghi lý do ngay đầu file
("16/09/2026 operator: NPC đi tuyến riêng theo seed thay vì dùng chung 5 tuyến"):

1. `Phase 1 slot mapping regression (slots 0..9, D-11 bench comparability)` — khoá literal của
   `routeIndexForNpc` / `sharedIndexForNpc` / `routeStartIndexForNpc` / `spawnPointForNpc` trên 5 tuyến chung. Các hàm
   ánh xạ đó đã bị bỏ.
2. `slots 10..14 reuse the 5 routes with seeded start points (D-01, G3r)` — cùng lý do: không slot nào dùng lại tuyến.

Thay bằng describe `per-NPC seeded routes`: 15 slot đều có 3–5 điểm dừng, xác định (kể cả khi hỏi ngược thứ tự trên
một module mới `vi.resetModules()`), **không slot nào trùng tập điểm** và mọi cặp chia sẻ ≤ 1 điểm (trong 0,5 m), spawn
cách nhau ≥ 0,6 m, tốc độ/dwell trong dải, mọi điểm + mọi chặng (kể cả chặng khép vòng) lấy mẫu 2 cm vẫn cách đủ xa
từng chướng ngại. Thêm `tests/unit/routeGen.test.ts` (14 case): cùng seed ⇒ giống hệt, khác seed ⇒ khác, negative
control cho `segmentBlocked`, và 200 seed liên tiếp không seed nào fail.

Các assertion không liên quan giữ nguyên: 6 test hình học của `NPC_ROUTES`, `farthestRouteIndex`, và toàn bộ e2e.

## Cái gì KHÔNG đổi

- `NPC_ROUTES` giữ nguyên từng byte: `src/bench/benchScript.ts` dựng waypoint **người chơi** cho `?bench=1` từ nó
  (01-17). Timeline bench (hành động người chơi) không đổi. Không NPC nào còn đi 5 tuyến này.
- `MAX_NPCS` vẫn 10 (việc nâng trần là plan 02-06 của Phase 2, đang chờ cổng máy thật). Module sinh tuyến đã sẵn sàng
  cho slot 0..14.
- Không đụng navmesh (Phase 3), không lịch làm việc, không đổi slap/ragdoll/get-up.

> ⚠️ Số bench cũ (10 NPC đi chung 5 tuyến) **không còn so trực tiếp** với các lần chạy mới: NPC bây giờ đi tuyến dài
> ngắn khác nhau, tốc độ khác nhau, nên tải vật lý và quãng đường mỗi giây đã khác.

## Tuyến sinh ra (seed hiện tại, slot 0..14)

```
slot  0 v=1.60 (-3,2.5)@2.2 (-2.5,5.5)@2.85 (5.5,4)@2.45 (-6,4)@3.2
slot  1 v=1.23 (-2,5)@2.3 (7,0.5)@2.15 (2.5,3)@2.45
slot  2 v=1.17 (0,-5)@4.5 (7,1.5)@4.5 (1.5,-0.5)@4.35 (2,4.5)@5 (1.5,-3)@4.55
slot  3 v=1.49 (7.5,-0.5)@2.75 (1.5,2.5)@2.95 (4.5,1)@2.35 (2,5)@2.65
slot  4 v=1.24 (0.5,5)@1.5 (-5.5,5.5)@2.2 (-4,1.5)@1.5 (-2.5,3.5)@2.2 (4,3.5)@2.25
slot  5 v=1.26 (-6.5,-1)@5 (-7.5,-3.5)@3.65 (-5.5,5.5)@4.8
slot  6 v=1.32 (2,-0.5)@3.95 (3,5.5)@3.35 (1,4)@3.85 (6.5,-1)@4.15
slot  7 v=1.44 (5.5,-2.5)@5 (6.5,2)@4.1 (4,-4.5)@4.45
slot  8 v=1.41 (-2.5,4)@1.5 (-5,5.5)@1.75 (-7,5.5)@2 (4,5.5)@1.5 (-6,3)@1.65
slot  9 v=1.37 (-1,-2.5)@2.65 (4,-3.5)@3.1 (7.5,2.5)@3.15 (6,1)@3 (2,-4.5)@2.6
slot 10 v=1.57 (-7,5.5)@4.9 (3.5,4.5)@4.1 (0,3.5)@4.7
slot 11 v=1.48 (7,-1)@3.35 (1.5,-1)@3.6 (1.5,-4)@2.95 (5.5,-3.5)@3.25
slot 12 v=1.47 (-1,4.5)@1.95 (1,3.5)@2.05 (3.5,4.5)@2.15 (-7,2)@2.2
slot 13 v=1.46 (-6.5,-3)@3.95 (-6.5,0.5)@5 (-6.5,-5.5)@5 (-7,2.5)@3.7
slot 14 v=1.37 (6,1.5)@4.2 (4,-4.5)@3.4 (2,5.5)@4.15 (4.5,-2.5)@4.3
```

532 ô trống trên lưới; vòng dài 14–30 m, chu kỳ một vòng 23–49 s.

## Bằng chứng

| Cổng | Kết quả |
| --- | --- |
| `npm run typecheck` | rc 0 |
| `npx vitest run` | 50 file / **824 test** pass |
| `npm run build` | rc 0 |
| `npm run size` | `SIZE_GATE_OK totalRaw=7310641 files=63` |
| `npx playwright test` | **92 passed, 76 skipped, 0 failed** (5,4 phút) |

Deploy (một lần):

```
DEPLOY_OK 04c06b21c39a https://game.doibung.com/ https://game.doibung.com/b/04c06b21c39a/
POLLER https://doibung.com/ count=5 non200=0 maxConsecutiveNon200Ms=0
SUMMARY DIST_FILES=63 DIST_RAW=7310641 DIST_GZIP=2754624 DIST_BROTLI=2144847 FIRST_LOAD_TOTAL_RAW=3364381 FIRST_LOAD_LEVEL=ok poller=5/5 200
```

Kiểm tra độc lập sau deploy: `game.doibung.com/version.json` = `{"sha":"04c06b21c39a",...}` khớp HEAD
`04c06b21c39a975deebfa38497ee1e20ce967793`; `/b/04c06b21c39a/` 200; `doibung.com` 200 (trước deploy cũng 200);
`www.doibung.com` 301. Trước deploy `version.json` là `1ecc53ce473e`.

## Sự cố trong lúc làm (đã khắc phục, ghi lại để không lặp)

Khi quét ký tự vô hình tôi chạy `perl -0777 -ne '...' -i <file>` — cờ `-i` (sửa tại chỗ) đi kèm `-n` mà không in lại
nội dung ⇒ **rỗng hoá 6 file** và tôi đã lỡ commit bản rỗng đó. Khôi phục: `git checkout <commit RED> -- <file>` cho
3 file nguồn + 2 file test, viết lại `routeGen.ts`, áp lại các sửa đổi, rồi `git commit --amend` (nhánh local, chưa có
remote). Đã đối chiếu: 15 tuyến sinh ra sau khôi phục **giống hệt từng con số** so với bản đo trước sự cố. Bài học:
`perl -i -ne` mà không `print` là lệnh xoá nội dung; muốn quét chỉ đọc thì bỏ `-i`.

## Có thể làm tiếp (không làm lần này)

- Điểm dừng hiện là ô nền trống bất kỳ; có thể ưu tiên ô cạnh bàn/pantry/máy in để NPC dừng "có lý do" hơn.
- Trần NPC vẫn 10; nâng lên 15 là việc của plan 02-06.
