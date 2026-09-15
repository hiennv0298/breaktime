# Phase 1: Spike kỹ thuật & đường deploy - Context

**Gathered:** 2026-09-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Chứng minh stack **Three.js + Rapier (WASM) + TypeScript/Vite** chạy đạt ngân sách size/fps trên **điện thoại thật**
và dựng đường deploy một lệnh lên VPS. Sau phase này, mọi commit đều chơi thử được qua `https://game.doibung.com`.

Nội dung chơi được: một căn phòng open-space, nhân vật điều khiển được trên desktop và mobile, tát/đẩy NPC ngã
ragdoll kiểu slapstick, ≥ 20 đồ vật văng/vỡ, 3 NPC đi theo đường cố định, SFX cơ bản, chế độ benchmark.

**KHÔNG thuộc phase này**: navmesh/lịch trình NPC, nón nhìn, nghi ngờ (Phase 2); prank, to-do (Phase 3);
vung đòn bằng kéo/vuốt, Rage Mode (Phase 4); nhạc nền, i18n, tutorial (Phase 7).

Requirements: TECH-01..07, CTRL-01..05, PLAT-01, PLAT-02.

</domain>

<decisions>
## Implementation Decisions

### Domain & deploy VPS
- **D-01:** Bản chơi thử chạy ở **`game.doibung.com`**. Operator phải thêm bản ghi DNS `A game → 187.53.128.67` (việc tay, người làm). Caddy tự xin HTTPS. **(Đổi 15/09/2026: operator chuyển domain từ `breaktime.doibung.com` sang `game.doibung.com`; subdomain chưa được tạo lúc đổi. Tên nội bộ `breaktime` — thư mục `/srv/sites/breaktime`, file `breaktime.caddy` — giữ nguyên.)**
- **D-02:** Gắn game vào Caddy của stack `doibung` bằng **cơ chế import thư mục sites**, cấu hình **trực tiếp trên VPS qua `ssh doibung`** (operator chốt 14/09/2026). **KHÔNG sửa repo `d:\whattoeat` ở máy local**; máy local chỉ dùng để chạy và test game.
  - Trên server: Caddyfile đang chạy (`/opt/doibung/Caddyfile.nodb`) thêm `import /etc/caddy/sites/*.caddy`; compose đang tạo container caddy mount thư mục host (ví dụ `/srv/sites`) vào caddy **read-only**, gồm file site `*.caddy` + thư mục web tĩnh của từng dự án
  - Recreate container caddy **một lần** (doibung.com gián đoạn vài giây; volume `caddy_data` giữ nguyên cert). Trước khi sửa: sao lưu file gốc trên server; sau khi sửa: kiểm doibung.com trả 200
  - Mọi file của break-time nằm **ngoài `/opt/doibung`** (dưới `/srv/sites`) để deploy whattoeat không xoá được game
  - ⚠️ **Rủi ro còn lại (đã chấp nhận):** deploy whattoeat tiếp theo (`rsync --delete` từ `d:\whattoeat` vào `/opt/doibung`) sẽ **ghi đè 2 dòng sửa trong Caddyfile/compose** → game mất khỏi Caddy. Plan phải có: (a) một script/lệnh kiểm tra idempotent "Caddy còn import sites không" chạy trong `npm run deploy` của break-time, tự báo lỗi rõ ràng nếu dòng import biến mất; (b) ghi chú bàn giao cho operator về việc này. Không tự sửa repo whattoeat.
- **D-03:** Deploy bằng **script local `npm run deploy`**, chạy tuần tự: build → kiểm kích thước (vượt trần thì dừng) → test chặn (D-24) → rsync qua `ssh doibung` → `caddy reload` nếu file site đổi → smoke test **cả** `https://game.doibung.com` **và** `https://doibung.com` (phải trả 200). Không dùng CI, không đưa private key root lên đâu.
- **D-04:** Server giữ **bản mới nhất ở `/`** và **bản theo commit ở `/b/<sha>/`**, giữ khoảng 10 bản gần nhất, tự dọn bản cũ. Vite dùng base tương đối để một build chạy được ở cả hai đường dẫn. Mục đích: mở 2 bản trên cùng điện thoại để so fps, và quay lại bản cũ khi bản mới lỗi.
- **D-05:** Bản chơi thử **công khai hoàn toàn**: không mật khẩu, không chặn index (operator chọn).

### Máy đo & cổng chặn
- **D-06:** Operator có sẵn **một Android tầm trung + một iPhone** làm máy chuẩn. **Model chưa ghi.** Plan phải có bước ghi model/OS/trình duyệt vào kết quả đo **trước lần đo đầu tiên**, và dùng đúng hai máy đó cho mọi phase sau.
- **D-07:** Build đầu chưa đạt (< 30 fps trên Android chuẩn, hoặc crash Safari iOS trong 15 phút) thì làm **đúng một vòng tối ưu có danh sách sẵn**:
  1. hạ `devicePixelRatio` render
  2. tắt mọi bóng động còn sót
  3. instancing / gộp mesh tĩnh
  4. giới hạn số mảnh vỡ + tự dọn nhanh hơn
  5. cho body ngủ sớm hơn

  Đo lại. **Vẫn không đạt thì DỪNG**, viết đánh giá PlayCanvas trước khi sang Phase 2. Không đi tiếp trên stack chưa đạt.
- **D-08:** Đo fps bằng **chế độ benchmark `?bench=1`**: kịch bản cố định 60s tự chạy (nhân vật đi quanh phòng, tát NPC, đập ≥ 20 đồ, 8 NPC ngã ragdoll cùng lúc — xem D-11). Kết thúc hiện: fps trung bình, fps 1% thấp nhất, draw call, số physics body đỉnh, commit sha, mức chất lượng đang dùng. Ảnh chụp màn hình kết quả là bằng chứng nghiệm thu. Mọi lần đo dùng cùng kịch bản (seed cố định).

### Nội dung căn phòng spike
- **D-09:** Nhân vật dùng **Kenney Blocky Characters** (CC0, 18 nhân vật, 27 animation, có glTF). Đồ nội thất ưu tiên **Kenney Furniture Kit** (CC0, 140 model, có glTF) cho đồng bộ style. ⚠️ **Chưa kiểm** Furniture Kit có máy tính/màn hình/máy in/cây nước không; researcher phải liệt kê được đồ thật, thiếu thì bù bằng pack CC0 khác của Kenney hoặc khối low-poly tự dựng cùng style.
- **D-10:** Căn phòng là **open-space 4 bàn làm việc + góc pantry**, bố cục dùng lại được cho Phase 2–3 (NPC đi bàn ↔ pantry, prank cà phê).
- **D-11:** **3 NPC mặc định**, đi vòng qua các điểm **đặt tay** (bàn ↔ pantry), không navmesh, không lịch trình (đó là DETECT-07, Phase 2). ~~Benchmark tăng lên 8 NPC~~ **Sửa 15/09/2026:** người chơi chọn 0–10 NPC trong settings (D-29), nên **benchmark đo trần 10 NPC** cho ngã ragdoll cùng lúc.
- **D-12:** Cú tát/đẩy kiểu **slapstick phóng đại**: NPC bay xa, xoay, tiếng "bốp", hit-stop khoảng 60ms, rung màn hình nhẹ, ngã ragdoll rồi **tự đứng dậy** đi tiếp. Không máu (PEGI 12).
- **D-13:** Đồ vật: **phần lớn văng/đổ theo vật lý** (ghế, thùng rác, giấy tờ…). **Cốc, màn hình, chậu cây vỡ thành mảnh**: dùng **một bộ 5–8 mảnh low-poly chung**, đổi màu/tỉ lệ theo vật bị vỡ (không cắt riêng từng vật bằng Blender — operator chốt sau research, 14/09/2026). Mảnh tự dọn sau vài giây, số mảnh tối đa có trần.
- **D-14:** Ánh sáng **màu phẳng + bóng tròn giả (blob shadow) dưới chân** nhân vật/đồ vật. **Không dùng shadow map thời gian thực.**
- **D-15:** Có **vài SFX CC0** (tát, đồ vỡ, đồ rơi) để đánh giá cảm giác slapstick, và để kiểm tra sớm việc iOS chỉ phát âm thanh sau lần chạm đầu. Nhạc nền để Phase 7.

### Điều khiển & hướng màn hình
- **D-16:** Mobile **ưu tiên màn ngang**. Cầm dọc vẫn chơi được: camera lùi xa hơn, nút dồn xuống đáy. **Không** bắt người chơi xoay máy.
- **D-17:** Joystick ảo **nổi theo ngón tay**: chạm đâu ở nửa trái màn hình thì joystick hiện ngay đó.
- **D-18:** Tát bằng **nút ngữ cảnh (mobile) / ~~phím E~~ Space (desktop, sửa 15/09/2026 — E vẫn dùng được như phím phụ)** khi đứng gần NPC; icon nút đổi theo vật gần nhất. Kéo/vuốt để vung đòn dành cho Rage Mode (Phase 4).
- **D-19:** Camera góc nghiêng cố định, **bám mượt theo nhân vật**, tầm nhìn khoảng 1/2 phòng. Xoay 90° bằng **Z / C trên desktop** và **nút ⟲ ⟳ góc trên phải trên mobile**. (Sửa 14/09/2026 sau research: Q/E ban đầu trùng phím E tương tác của CTRL-01/D-18; operator chọn Z/C.) **Sửa 15/09/2026:** phím mũi tên KHÔNG còn là phím phụ xoay camera — mũi tên dùng để di chuyển (D-27).
- **D-20:** ~~Desktop di chuyển bằng WASD, tương tác bằng E hoặc click chuột trái vào vật đang sáng (CTRL-01). Pause bằng ESC/Space; mobile có nút ⏸ (CTRL-04).~~ **Thay bằng D-27 (15/09/2026).** Click chuột trái vào vật đang sáng vẫn giữ; mobile vẫn có nút ⏸.

### Máy yếu / không có WebGL
- **D-21:** Có **3 mức chất lượng Thấp / Vừa / Cao**, chỉnh pixel ratio, trần mảnh vỡ và khoảng cách vẽ. Game đo fps vài giây đầu rồi **tự chọn mức**, và **có nút đổi tay** trong menu pause. Benchmark ghi rõ đang chạy mức nào.
- **D-22:** Trình duyệt không có WebGL2 thì hiện **màn báo rõ ràng** (không màn đen), gợi ý trình duyệt khác.

### Test tự động
- **D-24:** **Vitest** cho logic thuần. **Playwright headless** mở bản build và kiểm: game load không lỗi console, `?bench=1` chạy tới cuối và in kết quả, **không có request nào ra ngoài origin** (TECH-05). Bất kỳ kiểm tra nào hỏng thì `npm run deploy` dừng. FPS **không** đo bằng headless (không có GPU thật); chỉ tin số đo trên máy thật (D-08).

### Màn vào game
- **D-23:** Có **màn tải với thanh tiến trình thật**, xong hiện **một nút "Chơi"**. Lần chạm này mở khoá âm thanh iOS và xin toàn màn hình. Góc màn hình luôn hiện tên tạm **"Break Time"** + **commit sha ngắn** để ảnh chụp bench biết là bản nào.

### Chốt bổ sung sau research (14/09/2026)
- **D-25:** SFX Kenney (OGG) được chuyển sang **MP3** cho Safari iOS bằng **`ffmpeg-static` trong devDependencies**, chạy qua script npm (ví dụ `npm run assets`). Không cài ffmpeg vào Windows.
- **D-26:** iPhone Safari không hỗ trợ fullscreen cho phần tử (chỉ iPad). Nút "Chơi" (D-23) xin fullscreen khi trình duyệt hỗ trợ; trên iPhone thì chơi ở chế độ phủ kín viewport, không báo lỗi.

### Chốt bổ sung sau khi chơi thử bản live (15/09/2026, operator)
- **D-27:** Sơ đồ phím desktop: **phím mũi tên và WASD đều di chuyển**; **Space là nút hành động duy nhất** (luôn vung tay; trúng NPC thì tát, trúng đồ thì đẩy — giống nút ngữ cảnh mobile); **Ctrl hoặc Esc mở menu settings/tạm dừng** (có Esc để tránh bẫy Ctrl+W/Ctrl+R và khác biệt Ctrl/Cmd trên Mac; chỉ phản ứng khi Ctrl được nhấn và thả một mình, không nuốt tổ hợp Ctrl+phím của trình duyệt); **xoay camera chỉ Z/C**; E giữ làm phím phụ của Space. Space không còn là phím tạm dừng.
- **D-28:** **Bảng hướng dẫn phím bán trong suốt ở góc dưới-trái** trên desktop (←↑→↓ đi, Space đánh, Ctrl/Esc settings, Z/C xoay), tự mờ còn ~30% sau vài giây, rõ lại khi di chuột vào, bật/tắt trong settings (nhớ lựa chọn trong localStorage, bọc try/catch). Trên mobile: các nút ảo bán trong suốt và có dòng hướng dẫn ngắn lần đầu.
- **D-29:** **NPC 0–10, tự đặt tên**: trong settings chọn số NPC 0–10 (mặc định 3) và gõ tên từng NPC (≤ 16 ký tự, cắt khoảng trắng, hiển thị nhãn tên trên đầu NPC — render bằng DOM/textContent hoặc sprite, không innerHTML), lưu localStorage trên máy, không gửi đi đâu. NPC thứ 9–10 cần tuyến đường đặt tay thêm (vẫn không navmesh). `?npcs=` vẫn dùng được và giới hạn 0–10.
- **D-30:** Bấm nút tấn công (Space/E/nút ngữ cảnh/click) **luôn phát hoạt ảnh vung tay ngay lập tức**, kể cả khi không có mục tiêu trong tầm; trúng mục tiêu thì mới tát/đẩy. Có thời gian hồi ngắn để không spam.
- **D-31:** Rủi ro nội dung của tên NPC tự gõ (PROJECT Out of Scope "nhập tên người thật"): **operator chấp nhận cho bản chơi thử riêng**; phải xem lại trước khi nộp CrazyGames (Phase 8) — thay bằng danh sách tên có sẵn hoặc lọc.
- **Hệ quả hiệu năng:** 10 NPC vượt ngân sách draw call (8 NPC đã 134 > 120, mỗi nhân vật 6 draw call) → gộp mesh nhân vật (6 → 1 draw call/nhân vật, RESEARCH A6) nên được làm **trước** benchmark 01-17 thay vì để D-07 ở 01-20.

### Claude's Discretion
- Cấu trúc thư mục, cách tách module render / physics / logic / input, ECS hay không
- Phiên bản thư viện cụ thể (lấy bản ổn định hiện hành), cấu hình Vite, cách nén asset (glTF + meshopt/Draco, KTX2) và cách chia chunk để đạt ≤ 8 MB tải đầu
- Thông số vật lý (lực tát, khối lượng, số khớp ragdoll của Blocky Characters), thời gian dọn mảnh
- Thuật toán tự chọn mức chất lượng (ngưỡng fps, số giây đo)
- Cách dựng ragdoll cho nhân vật khối (hộp/capsule cho từng khúc)
- Bố cục chi tiết căn phòng và vị trí 20 đồ vật
- Nguồn SFX CC0 cụ thể (ghi vào CREDITS.md)
- Tên file site Caddy, đường dẫn thư mục dưới `/srv/sites`, chiến lược dọn bản `/b/<sha>/`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Dự án
- `.planning/PROJECT.md` — Core value, constraints (size ≤ 8/20 MB, ≥ 30 fps, không request ngoài, PEGI 12, không dữ liệu cá nhân), key decisions
- `.planning/REQUIREMENTS.md` — TECH-01..07, CTRL-01..05, PLAT-01..02 (câu chữ requirement)
- `.planning/ROADMAP.md` §Phase 1 — success criteria + cổng chặn
- `docs/research-game-design.md` §4 (ràng buộc cổng web, lý do chọn engine, stack, điều khiển, ngân sách hiệu năng), §5 (rủi ro nội dung)

### Hạ tầng deploy (CHỈ ĐỌC để hiểu cấu trúc — sửa trên server theo D-02, không sửa repo này)
- `d:/whattoeat/Caddyfile.nodb` — bản nguồn của Caddyfile đang chạy trên server (`/opt/doibung/Caddyfile.nodb` bind mount 1 file vào `/etc/caddy/Caddyfile`); site `doibung.com` + redirect `www`
- `d:/whattoeat/docker-compose.nodb.yml` — service `caddy` (80/443, volume `caddy_data`/`caddy_config`, `mem_limit: 128m`)
- `d:/whattoeat/docker-compose.withdb.yml` — trên server project `doibung` còn chạy postgres từ file này; phải xác định trên server file compose nào thực sự tạo container caddy trước khi thêm mount
- Nguồn sự thật là **file trên server** (`ssh doibung`), không phải bản local
- `d:/whattoeat/docs/08-selfhost-vps-admin.md` §8.5 — bẫy đã gặp: named volume cho state, `mem_limit` mọi container, không publish cổng DB, kiểm lại bằng đo chứ không tin config

### Luật cổng game web
- https://docs.crazygames.com/requirements/intro/ — giới hạn size/file, PEGI 12
- https://docs.crazygames.com/resources/basic-launch-metrics/ — tải ≤ 10s, build < 20 MB
- https://developers.poki.com/guide/requirements-quality — không request ngoài, localStorage try/catch, pause ESC/Space

### Asset
- https://kenney.nl/assets/blocky-characters — nhân vật (CC0)
- https://kenney.nl/assets/furniture-kit — nội thất (CC0), chưa kiểm đủ đồ văn phòng

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Chưa có code. Repo `d:\break-time` mới khởi tạo, chỉ có docs và `.planning`.

### Established Patterns
- Chưa có. Phase này đặt nền pattern cho mọi phase sau: tách logic gameplay thuần (test được bằng Vitest, TECH-06) khỏi render/physics; PlatformAdapter sẽ đến ở Phase 7.

### Integration Points
- **VPS `ssh doibung`** (root@187.53.128.67, Hostinger, AlmaLinux 10). Đo 14/09/2026: **1 vCPU / 3,6 GB RAM**, đĩa còn 42 GB. Đang chạy `doibung-caddy-1` (80/443), `doibung-app-1`, `doibung-postgres-1` (compose project `doibung` ở `/opt/doibung`).
- Caddyfile đang là **bind mount một file**: `/opt/doibung/Caddyfile.nodb -> /etc/caddy/Caddyfile`. Editor thay inode thì container không thấy thay đổi; sửa xong phải `caddy reload` và **đọc lại cấu hình đang chạy** để xác nhận.
- Không build trên VPS: build ở máy local, chỉ đẩy file tĩnh lên.
- Không có `firewall-cmd` trên server; 80/443 đã mở (doibung.com đang chạy).

</code_context>

<specifics>
## Specific Ideas

- Cảm giác tát giống Crazy Office / Kick the Buddy: phóng đại, buồn cười, không máu.
- Style nhân vật khối "bloxy". Crazy Office trên CrazyGames cũng gắn tag này.
- Ảnh chụp màn hình kết quả `?bench=1` trên hai máy chuẩn là bằng chứng nghiệm thu phase. Không chấp nhận "chạy mượt" bằng lời.
- Mỗi lần deploy phải chứng minh doibung.com vẫn sống, vì hai dự án dùng chung Caddy.

</specifics>

<deferred>
## Deferred Ideas

- Bảo vệ bản chơi thử bằng mật khẩu / noindex: operator chọn công khai hoàn toàn. Nên xem lại trước khi nộp CrazyGames (Phase 8) nếu muốn tránh bản dở bị index dưới tên game.
- Navmesh + lịch trình NPC: Phase 2 (DETECT-07).
- Vung đòn bằng kéo/vuốt: Phase 4 (RAGE-03).
- Nhạc nền, bật/tắt âm thanh đầy đủ: Phase 7 (UX-03).

</deferred>

---

*Phase: 01-spike-k-thu-t-ng-deploy*
*Context gathered: 2026-09-14*
