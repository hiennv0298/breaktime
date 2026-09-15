# Bàn giao hạ tầng: game Break Time gắn vào Caddy của doibung.com

Ghi chú này dành cho operator. Break Time chạy chung VPS `ssh doibung` (187.53.128.67) với doibung.com và dùng lại
container Caddy của stack `doibung`. Repo `d:\whattoeat` **không bị sửa**. Mọi thay đổi nằm trên VPS và chỉ do
`npm run infra:apply` thực hiện (D-02).

## 1. `infra:apply` thay đổi gì trên server

Chỉ có 4 thay đổi, lần nào cũng giống nhau:

| Chỗ | Thay đổi |
|-----|----------|
| `/opt/doibung/Caddyfile.nodb` | Thêm **1 dòng** cuối file: `import /etc/caddy/sites/*.caddy`. Ghi nối vào file, giữ nguyên inode. |
| `/opt/doibung/docker-compose.nodb.yml` | Thêm **1 dòng** ngay sau `- ./Caddyfile.nodb:/etc/caddy/Caddyfile:ro` trong service `caddy`: `- /srv/sites:/etc/caddy/sites:ro` |
| `/opt/doibung/docker-compose.withdb.yml` | Thêm đúng dòng mount đó, cùng vị trí |
| `/srv/sites`, `/srv/sites/breaktime`, `/srv/sites/breaktime/releases` | Tạo thư mục (755). Mount vào caddy ở chế độ **read-only**. File site `breaktime.caddy` do `npm run deploy` thêm sau, khi DNS đã trỏ đúng. |

Sau khi sửa file, script recreate **chỉ container caddy**, đúng lệnh này:

```
cd /opt/doibung && docker compose -p doibung -f docker-compose.withdb.yml up -d --pull never --no-deps caddy
```

doibung.com gián đoạn vài giây. Volume `caddy_data` giữ nguyên nên chứng chỉ không đổi, script so fingerprint SHA-256
trước và sau. Container app và postgres không bị động tới: script so ID container và config-hash trước và sau.

Thứ tự kiểm tra trong script:
1. Preflight.
2. Tiêu thụ nonce.
3. Backup.
4. Sửa file, mỗi file diff phải đúng +1/−0, sai thì khôi phục.
5. `docker compose config` phải thấy mount `/etc/caddy/sites` `read_only: true`.
6. Hash app/postgres không đổi.
7. `caddy validate` trong container tạm `--network none`.
8. Recreate caddy.
9. Verify: mount, dòng import, admin config có doibung.com, ID app/postgres, cert.
10. Máy local kiểm doibung.com trả 200, www trả 301/308 về https://doibung.com, rồi chạy lại `infra:check`.

Nếu doibung.com không trả 200 trong 60 s, `infra:apply` tự rollback từ backup vừa tạo (exit 4).

## 2. Backup và nonce duyệt nằm ở đâu

- Backup: `/root/breaktime-infra-backup/<YYYYMMDDTHHMMSSZ>/` (mode 700, ngoài `/opt/doibung`), gồm
  `Caddyfile.nodb`, `docker-compose.nodb.yml`, `docker-compose.withdb.yml`, `inspect.json` (docker inspect caddy),
  `live-config.json` (admin config lấy từ 127.0.0.1:2019) và `preflight.env`.
- Nonce duyệt một lần: `/root/breaktime-infra-backup/.approval-nonce` (mode 600). Preflight tạo file này nếu chưa có
  hoặc đã quá 6 giờ. Đây là thứ duy nhất preflight ghi. Apply và rollback đã duyệt sẽ **xoá nonce trước mọi thay đổi**.
  Gõ sai mã thì nonce cũng bị đốt, lần sau có mã mới.

## 3. Quy trình duyệt (bắt buộc, executor không tự duyệt được)

1. Chạy `npm run infra:apply` (không kèm mã). Lệnh in preflight: `APP_ID`, `PG_ID`, `CERT_FP_BEFORE`, `HOST_*`,
   `LIVE_*`, `NEED_HOST_EDIT`, `NEED_RECREATE`, tuổi nonce, dòng `APPROVAL_CODE=<8 hex>`, rồi dừng với exit 3.
   Chưa có backup, file hay container nào bị động tới.
2. Operator đọc preflight rồi **tự gõ** `APPROVE-CADDY-<mã>`.
3. Chạy `npm run infra:apply -- --approve=APPROVE-CADDY-<mã>` (hoặc đặt biến môi trường
   `BREAKTIME_CADDY_APPROVAL=APPROVE-CADDY-<mã>`).

Mã là 8 hex đầu của SHA-256 tính trên trạng thái preflight cộng nonce của server. Vì vậy **mã đổi khi trạng thái server
đổi** (container app/postgres bị tạo lại, cert đổi, file bị sửa…) hoặc khi nonce đổi, và **mỗi mã chỉ dùng được một lần**.
Thiếu mã, sai định dạng (chữ hoa, thiếu ký tự, dư dấu cách), mã cũ hay mã lệch đều bị từ chối với exit 3 trước mọi thay đổi.

Nếu host và container đã đúng cấu hình, `npm run infra:apply` in "Không cần làm gì" và thoát 0, không cần mã, không recreate.

## 4. Vì sao deploy whattoeat làm game biến mất

`/opt/doibung` là bản chép từ `d:\whattoeat`. Lần deploy whattoeat tiếp theo (chép đè hoặc `rsync --delete`) sẽ
**ghi đè `Caddyfile.nodb` và 2 file compose bằng bản gốc, tức là mất dòng import và dòng mount**.

- Ngay sau khi ghi đè, game **vẫn chạy**, vì container caddy đang chạy vẫn giữ mount và config cũ.
- Game **biến mất ở lần recreate hoặc restart caddy kế tiếp**, ví dụ khi deploy whattoeat chạy `docker compose up`.
  Caddy lúc đó dựng lại từ file gốc, không còn import sites.

`/srv/sites` nằm ngoài `/opt/doibung` nên deploy whattoeat không xoá được file game, chỉ làm Caddy thôi phục vụ nó.

## 5. Phát hiện: `npm run deploy` / `npm run infra:check`

Mỗi lần `npm run deploy` (và `npm run infra:check`) đều chạy `deploy/remote/state-check.sh` ở chế độ chỉ đọc. Script
kiểm **riêng** file trên host (`HOST_IMPORT`, `HOST_MOUNT_NODB`, `HOST_MOUNT_WITHDB`) và container đang chạy
(`LIVE_MOUNT`, `LIVE_IMPORT`, `LIVE_SITE`, `CADDY_RUNNING`). Chỉ cần thiếu một mục là exit 2 với thông báo:

> Caddy của doibung đã mất cấu hình sites (có thể do deploy whattoeat ghi đè /opt/doibung). Chạy `npm run infra:apply`
> để xem preflight và mã duyệt, operator gõ `APPROVE-CADDY-<mã>`, rồi `npm run infra:apply -- --approve=APPROVE-CADDY-<mã>`
> (idempotent, có backup) và deploy lại. Chi tiết: deploy/HANDOFF.md

Nếu `HOST_IMPORT=0` mà `LIVE_IMPORT=1`, whattoeat vừa ghi đè nhưng game chưa mất. Nên áp lại **trước** lần recreate
caddy kế tiếp. Trường hợp này apply chỉ sửa file, không cần recreate (`RECREATE_SKIPPED`).

## 6. Lệnh áp lại và rollback

Áp lại (idempotent, có backup):

```
npm run infra:apply
# operator đọc preflight, gõ APPROVE-CADDY-<mã>
npm run infra:apply -- --approve=APPROVE-CADDY-<mã>
npm run deploy
```

Rollback về một backup (khôi phục 3 file, recreate caddy cùng cách an toàn, `/srv/sites` giữ nguyên):

```
npm run infra:rollback -- /root/breaktime-infra-backup/<YYYYMMDDTHHMMSSZ>
# operator đọc preflight, gõ APPROVE-CADDY-<mã>   (mã rollback khác mã apply)
npm run infra:rollback -- /root/breaktime-infra-backup/<YYYYMMDDTHHMMSSZ> --approve=APPROVE-CADDY-<mã>
```

Chỉ có một trường hợp rollback chạy không cần mã mới: `infra:apply` đã được duyệt nhưng doibung.com không trả 200
trong 60 s, lúc đó script tự gọi `restore-auto`.

Mã thoát của `infra:apply`: 0 OK/không cần làm gì · 1 lỗi preflight/kết nối · 2 check sau apply thấy lệch ·
3 từ chối vì thiếu hoặc sai mã · 4 doibung.com không lên nên đã tự rollback · 5 gián đoạn liên tục > 30 s ·
6 một bước lỗi (in lệnh rollback).

## 7. Luật cấm trên server

- **Không bao giờ** chạy `docker compose -f docker-compose.nodb.yml up`. File nodb định nghĩa `app` khác bản đang chạy
  (hash `bee15e…` ≠ `3d8218…`), nên app sẽ bị tạo lại mà không có `DATABASE_URL`.
- **Không bao giờ** bỏ `--no-deps` khi recreate caddy, và không dùng `--remove-orphans`.
- Admin API của Caddy chỉ gọi qua `127.0.0.1:2019`. `localhost` phân giải ra ::1 và bị từ chối.

## 8. Cách sửa vĩnh viễn (tuỳ operator, làm trong repo whattoeat)

Break Time **không bao giờ sửa** repo `d:\whattoeat` (D-02). Nếu operator muốn deploy whattoeat không còn xoá cấu hình,
có thể tự làm trong repo đó:

1. Thêm dòng `import /etc/caddy/sites/*.caddy` vào cuối `Caddyfile.nodb`.
2. Thêm `- /srv/sites:/etc/caddy/sites:ro` ngay sau dòng mount Caddyfile của service `caddy` trong
   `docker-compose.nodb.yml` và `docker-compose.withdb.yml`.
3. Tạo sẵn `/srv/sites` trên server (Caddy chấp nhận glob import rỗng).

Làm xong, deploy whattoeat giữ nguyên cấu hình. `npm run infra:check` sẽ báo `INFRA_CHECK_OK` và `infra:apply` thành no-op.
