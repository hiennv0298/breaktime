# Game "Văn Phòng Loạn" — Research đối thủ, tính năng & kiến trúc web (desktop + mobile)

> Ngày research: 14/09/2026. Mốc so sánh: **Crazy Office — Slap & Smash** (Freeplay).
> Mọi con số dưới đây lấy từ nguồn công khai (link ở cuối). Số nào **chưa đo được** thì ghi rõ
> "CHƯA ĐO", đừng coi là sự thật.

---

## 1. Tóm tắt (đọc phần này là đủ để quyết)

1. **Thị trường có thật và lớn**: Crazy Office có **50M+ lượt tải Android**, iOS được **4.7★ từ 101K đánh giá**,
   và **đã có bản chơi trên web** ở CrazyGames (9.0/10). Mảng prank của Z&K (Scary Teacher / Prankster 3D)
   trên Poki được **4.5★ từ 563K lượt vote**.
2. **Chưa ai gộp đủ 3 kiểu chơi** mà bạn muốn làm: *đập phá* (Crazy Office, Kick the Buddy), *chọc phá lén lút*
   (Prankster 3D, Untitled Goose Game) và *nói xấu rồi bị lộ*. Riêng mảng **nói xấu/tin đồn** mới chỉ có
   **board game** (Gossip, Office Gossip), **bản game điện tử gần như bỏ trống** → đây là điểm khác biệt chính.
3. **Kỹ thuật web là nút thắt**: Crazy Office làm bằng Unity 2022, bản iOS nặng **357.9 MB**. Trên web thì
   CrazyGames muốn build **< 20 MB** mới được lên trang chủ mobile, còn Poki muốn tải lần đầu khoảng **< 8 MB**.
   Safari iOS chỉ cho WebGL khoảng **300–500 MB heap**. Vì vậy **không đi Unity WebGL**.
4. **Khuyến nghị (MỘT phương án)**: 3D low-poly, camera góc nghiêng cố định, dùng **Three.js + Rapier (WASM) +
   TypeScript/Vite**. Vòng lặp chính là **"Một ngày làm việc"**: chọc phá / nói xấu lén lút → thanh Stress đầy
   → **Rage Mode** đập phá. Phát hành thử trước ở **CrazyGames Basic Launch** để lấy số đo thật.

---

## 2. Bản đồ đối thủ

### 2.1 Nhóm A — Đập phá / đánh người (stress relief)

| Game | Cơ chế lõi | Số liệu | Bài học |
|---|---|---|---|
| **Crazy Office — Slap & Smash** (Freeplay, Unity 2022) | Beat-em-up ragdoll; đi qua từng tầng văn phòng, ném ghế, vung gậy golf, đánh đồng nghiệp → đánh sếp → đánh **CEO** ở cuối. Desktop: kéo chuột để vung, Space/click để tung đòn boss | Android 50M+, Content 12+ (Moderate Violence), có ads + IAP; iOS 4.7★/101K, 357.9 MB, cập nhật khoảng hàng tháng; web CrazyGames 9.0/10, ra 04/2025 | Ragdoll + đồ vật văn phòng = cười. **Người chơi phàn nàn**: muốn **thêm màn, thêm vũ khí, thêm kiểu "trừng phạt" sếp** → nhu cầu nội dung không đáy |
| **Kick the Buddy** (Playgendary) | Sandbox, không mục tiêu, không đếm giờ; mở khoá hàng trăm vũ khí bằng coin | Có gói Premium tuần $7.99 / tháng $19.99 / năm $99.99; có trên Poki, CrazyGames | "Không áp lực" cũng là một tính năng. Mở khoá vũ khí = động lực quay lại |
| **Smash the Office – Stress Fix** | Phá văn phòng bằng búa tạ, cưa máy, katana, rìu, gậy bóng chày | — | Phá **đồ vật** (không phải người) vẫn đủ vui, lại giữ rating thấp |
| **Whack Your Boss** (Flash/Newgrounds) | Point-and-click: đồ vật phát sáng khi hover → click → cutscene "xử" sếp; từ 6 lên **24 cách** | Kinh điển, được YouTuber (Markiplier) chơi | "Tìm hết N cách" = collectible cực rẻ để làm. **Nhưng quá bạo lực** cho các cổng web (xem §5) |

### 2.2 Nhóm B — Chọc phá lén lút, bị bắt là thua

| Game | Cơ chế lõi | Số liệu | Bài học |
|---|---|---|---|
| **Scary Teacher 3D / Prankster 3D** (Z&K) | Joystick ảo + nút hành động; lẻn vào phòng, nhặt đồ, đặt bẫy (ví dụ bỏ ớt vào pizza), tránh tầm nhìn nạn nhân → chạy ra xem **cutscene** prank | Scary Teacher: hàng chục triệu lượt cài; Prankster 3D trên Poki **4.5★/563K vote**; IAP khoảng $2–$20, ads có thưởng | **Cấu trúc level cố định + cutscene đền đáp** là công thức đã được kiểm chứng. Điều khiển: WASD/joystick + click/tap |
| **Bash The Boss / The Office: Prank The Boss** (Z&K) | Nick bị sếp Francis bắt nạt → prank sếp trong văn phòng, có cả crossword | iOS 4.5★/391; **phàn nàn: nhiều quảng cáo, kẹt ở level 10, ít màn** | Chủ đề văn phòng + nhân vật sếp ác có sức hút, nhưng **ads dày + nội dung mỏng thì bị chê** |
| **Prank Master 3D** (Lion Studios) | Hypercasual: mỗi màn chọn 1 trong 2 đồ vật → xem prank diễn ra | — | Kiểu chơi siêu nhẹ, hợp làm **màn tutorial** hoặc mini-event |
| **Untitled Goose Game** (House House) | Làm theo **to-do list**; gây ồn để dụ NPC đi chỗ khác; NPC **phản ứng** chứ không "giết" người chơi; nhạc phản ứng theo hành động | **>1M bản trong 2019**, GOTY ở D.I.C.E. + GDC | Hài đến từ **"set-up rồi punchline"**. **Không có bạo lực** mà vẫn viral. To-do list là khung nhiệm vụ tốt nhất cho prank |
| **Hello Neighbor** (tinyBuild) | Sandbox lén lút; AI **học theo cách bạn chơi** (đặt camera, bẫy ở chỗ bạn hay đi) | — | Ý tưởng "sếp học thói quen" để tăng độ khó |

### 2.3 Nhóm C — Trốn việc / "sếp đang tới"

| Game | Cơ chế lõi | Bài học |
|---|---|---|
| **Office Slacking 1–5** (web) | Làm việc riêng (mini-game); sếp đi kiểm tra định kỳ → phải tắt cửa sổ, giả vờ làm việc | Kiểu chơi **"red light – green light"**, rất hợp mobile |
| **Work In Progress** (itch.io, kiểu FNAF) | Bấm Space để chuyển **ngồi** (chơi mini-game cho qua ngày) / **đứng** (canh sếp); phải đang gõ phím khi sếp đứng ở cửa cubicle; có **thanh buồn ngủ**; thắng khi sống sót **9h–17h** | **Hai trạng thái + đồng hồ ngày làm việc** = khung level tự nhiên |
| **Hide From the Boss** (Android) | Trốn sếp | — |

### 2.4 Nhóm D — Nói xấu / tin đồn (khoảng trống thị trường)

| Game | Cơ chế | Ghi chú |
|---|---|---|
| **GOSSIP** (card game, The Game Crafter) | Social deduction: một phe tung tin đồn, một phe tìm kẻ tung trước khi tinh thần văn phòng sụp | Chỉ có bản giấy |
| **Office Gossip** (BoardGameGeek) | 5–13 người; một người là kẻ nói xấu để loại đối thủ, những người còn lại đoán ra ai | Chỉ có bản giấy |
| **The Office: Gossip** (NYU Game Center) | Thuyết phục "Michael" rằng người khác tung tin trước khi hết tuần | Dự án sinh viên |

**Kết luận**: cơ chế "nói xấu → tin lan → nạn nhân nghe được → truy ra bạn" **chưa có game điện tử casual nào
làm tử tế**. Đây là USP (điểm bán hàng độc nhất).

---

## 3. Thiết kế đề xuất: "Một ngày làm việc"

### 3.1 Vòng lặp lõi

```
 08:00 vào ca ──► nhận TO-DO LIST (3–5 "phi vụ")
      │
      ├─► CHỌC PHÁ (stealth)   ─┐
      ├─► NÓI XẤU (social)      ├─► mỗi phi vụ xong: -Stress, +Chaos/Drama point
      ├─► TRỐN VIỆC (red-light)─┘
      │        ▲
      │        └── bị bắt ► +1 GẬY (biên bản HR) + Stress tăng vọt
      │
      ├─► Sếp giao việc / mắng / bắt họp ► Stress tăng
      │
      ├─► STRESS đầy 100% ► RAGE MODE 20–30s: đập phá ragdoll, tính $ thiệt hại
      │
      └─► 17:00 hết ca  ► chấm điểm ★ (Lén lút / Hỗn loạn / Drama) ► coin ► mở khoá
          3 GẬY trước 17:00 ► "BỊ ĐUỔI" ► màn kết đặc biệt: rage-quit đập đường xuống tầng trệt
```

Vì sao gộp như vậy: **stealth** (nhóm B) tạo căng thẳng, **Rage Mode** (nhóm A) giải toả căng thẳng đó. Người chơi
tự chọn chơi "sạch" (lén lút, ít Stress) hay "bẩn" (bị bắt nhiều, nhưng được đập phá sớm). Mỗi màn chơi
**~5–8 phút**, hợp với mốc playtime **10+ phút/phiên** của CrazyGames khi người chơi làm 2 màn liền.

### 3.2 Hệ thống 1 — Phát hiện (nền của mọi thứ "bị phát hiện")

| Thành phần | Thiết kế | Nguồn tham chiếu |
|---|---|---|
| **Vision cone** | Mỗi NPC có nón nhìn (góc/tầm khác nhau: sếp rộng, thực tập sinh hẹp, IT cắm tai nghe gần như mù). Vẽ nón mờ trên sàn | Stealth design chuẩn |
| **Thanh nghi ngờ 0→100** | Tăng dần theo khoảng cách, tốc độ di chuyển và "hành vi đáng ngờ" (đang cầm đồ, đứng sau ghế người khác). **Không** bật tắt kiểu thấy/không thấy | Best practice: gradual detection meter |
| **Mũi tên cảnh báo** | Mũi tên quanh nhân vật chỉ về NPC sắp phát hiện, to/đậm dần theo mức nguy hiểm | Hitman (2016) |
| **Tiếng ồn** | Làm rơi đồ / máy in kẹt / lò vi sóng nổ tạo vòng ồn → NPC đi tới kiểm tra. **Dùng tiếng ồn chủ động để dụ NPC đi chỗ khác** | Untitled Goose Game |
| **Trạng thái NPC** | `Làm việc → Nghi ngờ (?) → Tìm kiếm → Bắt quả tang (!)`; màu nón đổi theo | — |
| **Chỗ nấp / "cover"** | Núp sau tủ hồ sơ, giả vờ in tài liệu, cầm cốc cà phê ("đi pha cà phê" = hành vi hợp lệ) | Social stealth kiểu Hitman |
| **Sếp học thói quen** (v2) | Bạn hay prank ở pantry → sếp tuần sau đặt camera / tăng tuần tra ở pantry | Hello Neighbor |

Nguyên tắc: **luật phát hiện phải rõ đến mức người chơi lên kế hoạch được**. Bị bắt mà không hiểu vì sao là
lý do số 1 khiến người chơi bỏ game stealth.

### 3.3 Hệ thống 2 — Chọc phá (prank)

Mỗi prank = **nhặt đồ → đặt/tương tác đúng chỗ → rời khỏi hiện trường → xem punchline**.

| Prank (ví dụ, bối cảnh văn phòng VN) | Đồ cần | Punchline |
|---|---|---|
| Bỏ muối vào cà phê sếp | Hũ muối (pantry) | Sếp phun cà phê vào màn hình |
| Dán băng keo dưới chuột | Băng keo | Đồng nghiệp đập chuột, hét IT |
| Tráo trà sữa giao tới | Trà sữa đá me | — |
| Đổi hình nền máy tính thành ảnh "sếp múa" | USB | Chiếu nhầm lên máy chiếu giữa buổi họp |
| Hạ chiều cao ghế xoay | — | Ngồi thụp xuống |
| Để điện thoại báo thức trong ngăn kéo người khác | Điện thoại cũ | Cả phòng quay nhìn |
| Ăn vụng sữa chua trong tủ lạnh chung (có ghi tên) | — | Tạo "vụ án" → nối sang hệ thống tin đồn |
| Rút phích máy in lúc sếp in gấp | — | Sếp đá máy in (ragdoll máy in) |

- **Combo / chuỗi**: prank A tạo điều kiện cho prank B (rút phích máy in → sếp đi tìm IT → phòng sếp trống → tráo cà phê).
- **Collectible "N cách"**: mỗi nạn nhân có bộ sưu tập prank riêng (học từ Whack Your Boss: 6 → 24 cách).
- **Cutscene phải skip được** (Poki bắt buộc).

### 3.4 Hệ thống 3 — Nói xấu & bị lộ (USP)

Mô hình **mạng lưới tin đồn** đơn giản, deterministic, dễ đọc:

```
Bạn thì thầm với NPC-A: "Anh Tuấn kế toán ăn vụng sữa chua"
   │  (điều kiện: không ai khác trong bán kính nghe, nạn nhân không trong tầm nhìn)
   ▼
Tin đồn = { nội dung, nạn nhân, NGUỒN = bạn, độ "hot" 0-100, dấu vết[] }
   │
   ├─ mỗi X giây, NPC nào đang giữ tin mà gặp NPC khác ở pantry / thang máy / smoking area → lan tiếp
   │     mỗi lần lan: độ hot tăng, và có % "méo tin" (hài: "ăn vụng sữa chua" → "biển thủ quỹ công ty")
   │
   ├─ DRAMA POINT = độ hot × số người biết
   │
   └─ NGUY CƠ LỘ: nạn nhân nghe được → truy ngược dấu vết[] → mỗi mắt xích 1 lần "hỏi cung"
         ├─ NPC thân với bạn (quan hệ cao) → khai "không nhớ ai nói"
         ├─ NPC ghét bạn / "bà tám" → khai tên bạn ngay
         └─ lộ ► CUTSCENE ĐỐI CHẤT + 1 GẬY + nạn nhân thành "kẻ thù" (theo dõi bạn các ngày sau)
```

Các nút gạt để làm cho hay:

- **Quan hệ (Relationship)** với từng NPC (−100 → +100): mời trà sữa để tăng, nói xấu người thân của họ thì giảm.
  Đây là thứ giữ người chơi qua nhiều ngày.
- **Chọn người để thì thầm** là quyết định chiến thuật: "bà tám" lan nhanh nhưng dễ khai; người kín miệng thì lan chậm.
- **Đổ tội (frame)**: để lại "dấu vết" giả trỏ về NPC khác → nếu thành công, NPC đó bị gậy thay bạn.
- **Bằng chứng giả**: chụp ảnh prank của mình rồi gửi vào group chat công ty dưới tên người khác (UI giả lập chat).
- **Nội dung tin đồn**: chọn từ **thẻ có sẵn** (không cho gõ tự do) để kiểm soát nội dung và dịch được. Giữ ở mức
  ngớ ngẩn vô hại (ăn vụng, ngủ gật, hát karaoke dở). **Tránh** tình dục, sắc tộc, ngoại hình, bệnh tật (xem §5).

### 3.5 Hệ thống 4 — Rage Mode (đập phá)

- Kích hoạt khi Stress đầy hoặc bị đuổi. Có **20–30s**, đổi nhạc, slow-motion lúc đòn đầu.
- Đồ vật có **HP + giá trị $** (máy photocopy $$$, bình nước, cây cảnh, laptop, tủ hồ sơ, máy lọc nước...).
  Kết thúc hiện bảng **"Hoá đơn thiệt hại"**, là thứ người chơi hay chụp màn hình khoe.
- Đồng nghiệp là **ragdoll bị đẩy ngã / bị ném giấy / bị tạt nước**, kiểu slapstick, không máu.
  (Crazy Office cho đánh người vẫn giữ được 12+, nhưng PEGI 12 yêu cầu bạo lực với người phải **phi thực tế**
  hoặc chỉ ở mức **"cái tát"**.)
- Vũ khí: file hồ sơ, bàn phím, ghế xoay, gậy golf của sếp, bình chữa cháy (đẩy lùi), cây lau nhà...

### 3.6 Meta / tiến trình (giữ chân D1)

| Tính năng | Mục đích | Ưu tiên |
|---|---|---|
| **Tuần làm việc** = 5 màn/tầng; mỗi tầng là 1 phòng ban (Kế toán, Sales, IT, Nhân sự, Phòng CEO) | Nội dung có cấu trúc; nhóm B bị chê vì "kẹt level 10, ít màn" | MVP (1 tầng) |
| Coin → mở khoá **prank, vũ khí rage, trang phục** | Kick the Buddy / Scary Teacher | MVP |
| **Bộ sưu tập prank / tin đồn / "cách xử sếp"** | Collectible rẻ | v1 |
| **Thăng chức giả**: Thực tập → Nhân viên → Trưởng nhóm, mở phòng mới | Tiến trình dài hạn | v1 |
| **Thử thách ngày** (daily): "Hôm nay prank 3 lần mà không bị bắt" | Mốc D1 10–15% | v1 |
| **Replay "bị bắt" hài hước** + nút chia sẻ clip/ảnh | Viral (Zalo/Facebook/TikTok) | v1 |
| **Sandbox văn phòng** (không mục tiêu, như Kick the Buddy) | Chế độ thư giãn | v2 |
| **Level editor / văn phòng của bạn** (đặt tên đồng nghiệp tuỳ ý) | UGC; **rủi ro nội dung**, cần kiểm duyệt | v2, cân nhắc |
| **Co-op 2 người** (1 người canh, 1 người prank) | Khác biệt; tốn backend | v2+ |

### 3.7 Kiếm tiền (tuân thủ luật từng cổng)

| Kênh | Luật chính | Thiết kế phù hợp |
|---|---|---|
| **Poki** | Chỉ ads qua Poki SDK, **cấm IAP**, tránh 2 loại tiền, cấm tự hẹn giờ ads, không khoá gameplay lõi sau ads, nút rewarded **không màu xanh lá** + icon 🎬, nút thường ≥ kích thước nút rewarded | 1 loại coin; rewarded = "x2 coin cuối ngày", "xoá 1 gậy (1 lần/ngày)", "thử vũ khí rage VIP 1 lần" |
| **CrazyGames** | Ads qua SDK (dev nhận 60%), IAP 70%; Full Launch cần SDK + auto login + cloud save | Như trên + gói trang phục (IAP) |
| **Web riêng / Zalo / Facebook** | Tự do | Dùng làm kênh viral + đo; ads network riêng |

CrazyGames gợi ý cho thể loại action: **revive tối đa 1 lần/phiên** (đếm ngược 5s, bất tử 2–3s), **thử đồ premium
1 lần**, **nhân thưởng cuối màn**, và **không chen ads giữa lúc đang đánh nhau**.

Kỳ vọng doanh thu cần tỉnh táo: game casual chạy tốt trên cổng lớn thường được **$200–$2.000/tháng**; một case
8 game WebGL với 451K lượt chơi chỉ được **~€557 (≈€1,2/1.000 lượt)**; eCPM rewarded khoảng **$1–3 ở thị trường tier-3**
(Việt Nam gần nhóm này) so với **$15–28 ở Mỹ**. → **Nên nhắm traffic quốc tế (EN) từ đầu**, bản tiếng Việt để viral.

---

## 4. Kỹ thuật: chơi được cả desktop lẫn mobile trên web

### 4.1 Ràng buộc cứng (từ tài liệu cổng + trình duyệt)

| Ràng buộc | Con số | Nguồn |
|---|---|---|
| Tải lần đầu, CrazyGames | ≤ 50 MB; **≤ 20 MB để lên trang chủ mobile**; tổng ≤ 250 MB; ≤ 1.500 file | CrazyGames docs |
| Tải lần đầu, Poki | Mục tiêu **~< 8 MB**; > 10s load là người chơi bỏ | Poki docs |
| Conversion (≥ 1 phút chơi) | 80%+ | CrazyGames |
| Heap WebGL trên Safari iOS | ~300–500 MB | Unity/Bugnet |
| Không request ra ngoài | Font, asset, thư viện phải đóng gói hết | Poki |
| Chạy được khi bật ad-blocker; `localStorage` bọc try/catch (incognito) | — | Poki |
| Phủ full screen dọc **hoặc** ngang; tablet phải dùng điều khiển mobile | — | Poki |
| Nội dung ≤ **PEGI 12** | — | CrazyGames |

### 4.2 Chọn engine: **Three.js + Rapier 3D (WASM)**

| Phương án | Kết luận | Lý do |
|---|---|---|
| **Unity WebGL** (như Crazy Office) | ❌ Loại | Rất khó xuống < 20 MB; hay crash vì hết bộ nhớ trên Safari iOS; chính bản web của Crazy Office là Unity nên đây là chỗ ta có thể **nhẹ hơn và vào game nhanh hơn** họ |
| **Phaser 4 (2D)** | ❌ Loại cho game này | 2D mất phần hài của ragdoll 3D; nguồn tự báo chỉ khoảng 200 physics body ở 60fps trên mobile |
| **PlayCanvas** | Ứng viên 2 | Runtime nhỏ, WebGPU tốt, có editor. Nhưng editor là cloud, cộng đồng và mẫu code nhỏ hơn Three.js |
| **Three.js + Rapier** | ✅ **Chọn** | Hệ sinh thái lớn nhất; có WebGPU renderer và tự lùi về WebGL2; Rapier (Rust→WASM, SIMD) là physics nhanh nhất trên trình duyệt, có ragdoll/joint; bundle tự kiểm soát được dung lượng |

> ⚠️ **CHƯA ĐO**: dung lượng thật của bundle Three.js + Rapier + asset, và FPS thật trên máy Android tầm trung
> và iPhone Safari. **Spike tuần đầu phải đo 3 số này** trước khi cam kết (§6).

### 4.3 Stack

```
TypeScript + Vite
├─ render      three (WebGLRenderer; WebGPU bật sau khi đo)
├─ physics     @dimforge/rapier3d-compat   (ragdoll = capsule + joints; ragdoll chỉ bật khi bị đánh/ngã)
├─ AI          FSM tay + navmesh (recast-navigation-js) ; vision cone = dot product + raycast Rapier
├─ ECS nhẹ     bitecs hoặc tự viết (NPC, đồ vật, tin đồn là data thuần → dễ test)
├─ UI          HTML/CSS overlay (menu, to-do, chat giả lập) – rẻ, sắc nét trên mobile
├─ audio       Howler.js (unlock audio sau lần chạm đầu – bắt buộc trên iOS)
├─ input       lớp trừu tượng: bàn phím/chuột ⇄ joystick ảo + nút ngữ cảnh
├─ i18n        JSON vi/en (nội dung tin đồn lấy từ thẻ → dịch được)
├─ save        localStorage (try/catch) → cloud save qua SDK cổng
└─ platform    PlatformAdapter { init, gameplayStart/Stop, commercialBreak, rewarded, save }
                 ├─ PokiAdapter   ├─ CrazyGamesAdapter   └─ WebAdapter (site riêng, PWA)
```

**Logic gameplay (tin đồn, nghi ngờ, quan hệ, chấm điểm) tách khỏi render**, viết thành hàm thuần có unit test,
chạy theo tick cố định. Cách này cho phép replay "khoảnh khắc bị bắt" bằng cách chạy lại input.

### 4.4 Điều khiển

| | Desktop | Mobile (dọc hoặc ngang) |
|---|---|---|
| Di chuyển | WASD / click-to-move | Joystick ảo nửa trái màn hình |
| Tương tác (nhặt/đặt/thì thầm) | E / click chuột trái vào vật đang sáng | **Một nút ngữ cảnh lớn** bên phải, đổi icon theo vật gần nhất |
| Nấp / giả vờ làm việc | Shift / Space | Nút thứ 2 |
| Rage: vung đòn | Kéo chuột (như Crazy Office) | Vuốt |
| Pause | ESC / Space (Poki yêu cầu) | Nút ⏸ |

Camera **góc nghiêng cố định, xoay được theo góc 90°**, không để camera tự do: đỡ gánh điều khiển trên mobile,
và nón nhìn luôn đọc được.

### 4.5 Ngân sách hiệu năng (mục tiêu, cần xác nhận ở spike)

| Hạng mục | Mục tiêu |
|---|---|
| Tải lần đầu (tới lúc chơi được) | **≤ 8 MB** (đạt chuẩn Poki), trần cứng 20 MB; các tầng khác tải lười (lazy load) |
| Thời gian vào gameplay | ≤ 10s trên 4G |
| FPS | 60 desktop; ≥ 30 ổn định trên Android tầm trung |
| Draw call / frame (mobile) | ≤ ~100–150 (dùng instancing + texture atlas) |
| Rigid body động cùng lúc | Ngủ (sleep) tất cả; ragdoll chỉ bật cho 1–3 NPC gần nhất; mảnh vỡ giới hạn + tự dọn |
| Asset | glTF + meshopt, texture KTX2 (Basis), low-poly flat color (kiểu Goose Game, vừa rẻ vừa có phong cách), âm thanh ogg/m4a |

---

## 5. Rủi ro nội dung & pháp lý

| Rủi ro | Xử lý |
|---|---|
| **PEGI 12** (CrazyGames bắt buộc): bạo lực với người phải phi thực tế hoặc chỉ ở mức "cái tát" | Không máu, không vũ khí sắc nhọn đâm người; ragdoll ngã kiểu slapstick. **Không** đi theo hướng Whack Your Boss (bóp cổ, đâm dao rọc giấy) |
| "Nói xấu" có thể đọc như **khuyến khích bắt nạt nơi làm việc** | Tin đồn chọn từ thẻ, nội dung ngớ ngẩn. Có **hậu quả** (bị lộ, mất quan hệ). Không cho nhập tên người thật (hoặc lọc từ, nếu làm editor v2) |
| Nhân vật giống người/công ty thật (ví dụ "The Office", "Scary Teacher") | Tự thiết kế nhân vật và tên. **Không** dùng tên hay IP "The Office" |
| Chửi thề | Chỉ ở mức nhẹ; mặc định bật "bleep" |
| Luật riêng của cổng | Không link ra ngoài (Poki: dùng `openExternalLink`), không logo splash dài, không ads ngoài SDK |

---

## 6. Lộ trình & cổng kiểm chứng

| Giai đoạn | Phạm vi | Cổng chặn (phải đạt mới đi tiếp) |
|---|---|---|
| **0. Spike kỹ thuật** (~1–2 tuần) | 1 phòng, 1 NPC có nón nhìn + thanh nghi ngờ, 1 prank, ragdoll tát/ngã, 20 đồ vật vỡ được | **Đo thật**: bundle ≤ 8 MB; ≥ 30 fps trên 1 máy Android tầm trung + 1 iPhone Safari; không crash sau 15 phút |
| **1. Prototype "vui chưa?"** (~2–3 tuần) | 1 ngày làm việc đầy đủ: to-do, 4 prank, tin đồn cơ bản (3 NPC), Rage Mode, chấm điểm | Cho 5–10 người chơi thử ngoài team: có cười không, có bấm "chơi lại" không |
| **2. MVP** (~6–8 tuần) | 1 tầng (5 ngày), 6–8 NPC, 12–15 prank, cây quan hệ, coin + shop, save, vi/en, PlatformAdapter | Build đạt §4.1; thiếu SDK ads vẫn chơi được |
| **3. CrazyGames Basic Launch** | Đăng thử (không kiếm tiền), chạy 7–21 ngày, cần ≥ 500 lượt chơi | Mốc: **playtime ≥ 10 phút, D1 10–15%, conversion ≥ 80%** |
| **4. Full Launch + Poki + site riêng** | SDK ads/rewarded, cloud save, daily challenge, chia sẻ clip | Theo số đo ở giai đoạn 3 |
| **5. Nội dung sống** | Thêm 1 tầng/tháng, event (Tết, cuối năm, KPI cuối quý), sếp học thói quen, sandbox | — |

Ước lượng thời gian giả định team **1–2 dev + 1 artist 3D low-poly**; team khác thì tính lại.

---

## 7. Checklist tính năng (backlog)

**MVP**
- [ ] Nhân vật di chuyển: desktop (WASD/click) + mobile (joystick + nút ngữ cảnh), dọc và ngang
- [ ] NPC: navmesh, lịch làm việc (bàn → pantry → họp → toilet), FSM 4 trạng thái
- [ ] Vision cone + thanh nghi ngờ + mũi tên cảnh báo + tiếng ồn
- [ ] Hệ prank: nhặt / đặt / rời hiện trường / cutscene skip được
- [ ] Hệ tin đồn: thì thầm, lan qua điểm tụ tập, méo tin, truy nguồn, đối chất
- [ ] Quan hệ NPC (−100..100)
- [ ] Stress + 3 gậy HR + màn "bị đuổi"
- [ ] Rage Mode: ragdoll, đồ vật có HP/$, hoá đơn thiệt hại
- [ ] Chấm điểm cuối ngày ★ Lén lút / Hỗn loạn / Drama; 1 loại coin; shop mở khoá
- [ ] Save (try/catch), vi/en, pause bằng ESC/Space, tắt tiếng khi chạy ads
- [ ] PlatformAdapter (Poki / CrazyGames / Web)

**v1**: daily challenge · bộ sưu tập · thăng chức & tầng mới · đổ tội · group chat giả lập · replay khoảnh khắc bị bắt + chia sẻ · rewarded đúng luật Poki

**v2**: sếp học thói quen · sandbox văn phòng · co-op 2 người · editor văn phòng (kèm kiểm duyệt)

---

## Nguồn

- Crazy Office: [Google Play](https://play.google.com/store/apps/details?id=com.freeplay.crazyoffice&hl=en_US) · [Google Play PC (50M+, 12+)](https://play.google.com/pc-store/games/details?id=com.freeplay.crazyoffice) · [App Store (4.7★/101K, 357.9MB)](https://apps.apple.com/us/app/crazy-office-slap-smash/id1623395612) · [CrazyGames (Unity 2022, 9.0/10)](https://www.crazygames.com/game/crazy-office-slap-and-smash)
- Nhóm prank: [Prankster 3D – Poki](https://poki.com/en/g/prankster-3d) · [The Office: Prank The Boss – App Store](https://apps.apple.com/us/app/the-office-prank-the-boss/id1605579294) · [Bash The Boss – Google Play](https://play.google.com/store/apps/details?id=com.zatg.grumpyboss.pranks) · [Bash The Boss – Amazon (review)](https://www.amazon.com/The-Office-Prank-Boss/dp/B0BRKZJBXG) · [Prank Master 3D](https://play.google.com/store/apps/details?id=com.alphapotato.prankster&hl=en_US) · [Scary Teacher 3D overview](https://apkbomb.com/scary-teacher-3d/) · [Hello Neighbor](https://www.helloneighborgame.com/)
- Goose: [Wikipedia](https://en.wikipedia.org/wiki/Untitled_Goose_Game) · [Nintendo Life to-do guide](https://www.nintendolife.com/news/2020/05/guide_untitled_goose_game_walkthrough_-_puzzle_solutions_and_to-do_list_objectives)
- Đập phá: [Kick the Buddy – Google Play](https://play.google.com/store/apps/details?id=com.playgendary.kickthebuddy&hl=en_US) · [Smash the Office](https://smash-the-office-stress-fix.en.uptodown.com/android) · [Whack Your Boss wiki](https://whackyourboss.fandom.com/wiki/Whack_Your_Boss_(game))
- Trốn việc: [Office Slacking 5](https://www.numuki.com/game/office-slacking-5/) · [Work In Progress – itch.io](https://smont85.itch.io/workinprogress) · [No Way I Wanna Work](https://windspirit7595.itch.io/no-way-i-wanna-work) · [Hide From the Boss](https://play.google.com/store/apps/details?id=com.hide.from.the.boss.game&hl=en)
- Tin đồn: [GOSSIP – The Game Crafter](https://www.thegamecrafter.com/games/gossip) · [Office Gossip – BGG](https://boardgamegeek.com/boardgame/28736/office-gossip) · [The Office: Gossip – NYU Game Center](https://gamecenter.nyu.edu/projects/the-office-gossip/)
- Stealth design: [Stealth Game Design](https://gamedesignskills.com/game-design/stealth/) · [Visibility Meter – TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/Main/VisibilityMeter)
- Cổng web: [Poki requirements](https://developers.poki.com/guide/requirements-quality) · [CrazyGames requirements](https://docs.crazygames.com/requirements/intro/) · [CrazyGames Basic Launch metrics](https://docs.crazygames.com/resources/basic-launch-metrics/) · [CrazyGames monetizing action](https://docs.crazygames.com/resources/monetizing-action/) · [CrazyGames hypercasual](https://docs.crazygames.com/resources/monetizing-hypercasual-io/) · [Cinevva – web monetization data](https://app.cinevva.com/guides/web-game-monetization)
- Kỹ thuật: [Web engines 2026 – Cinevva](https://app.cinevva.com/guides/web-game-engines-comparison) · [Phaser vs PixiJS](https://generalistprogrammer.com/comparisons/phaser-vs-pixijs) · [Rapier](https://rapier.rs/) · [Best web physics engine](https://www.abratabia.com/game-physics/best-web-physics-engine.php) · [Matter.js → Rapier benchmark](https://dev.to/jerzakm/this-little-known-javascript-physics-library-blew-my-mind-57oo) · [Unity WebGL Safari iOS crash](https://bugnet.io/blog/how-to-fix-unity-webgl-build-crashing-on-safari-ios) · [Unity WebGL memory](https://docs.unity3d.com/2021.3/Documentation//Manual/webgl-memory.html)
- Nội dung: [PEGI labels](https://pegi.info/what-do-the-labels-mean) · [Parent Zone – PEGI](https://parentzone.org.uk/article/pegi-games-ratings)
- Phân phối VN: [Zalo Mini App – mini game](https://cnv.vn/mini-game-tren-mini-app-zalo/)
