# 01-DEVICE-LOG — Reference devices and real-device measurements (plan 01-19)

Implements D-06 (two reference devices recorded before any measurement), D-08 (bench protocol) and the D-27..D-30 feel check.
Template prepared 2026-09-15 by 01-19 Task 1 before the first halt. Nothing below has been measured yet.

## Build under test

- Measurement sha: **`04c06b21c39a`** (quickfix tuyến NPC riêng theo seed, deploy 16/09/2026, DEPLOY_OK poller 5/5 200)
- ~~`1ecc53ce473e`~~ (01-18) bị thay: tuyến NPC đổi nên số đo cũ không so trực tiếp được
- Bench: https://game.doibung.com/?bench=1 · Soak: https://game.doibung.com/?soak=1 · Play: https://game.doibung.com/
- Bench: https://game.doibung.com/b/1ecc53ce473e/?bench=1
- Soak: https://game.doibung.com/b/1ecc53ce473e/?soak=1
- Play: https://game.doibung.com/b/1ecc53ce473e/
- First load (from deploy): FIRST_LOAD_TOTAL_RAW=3364381 bytes (about 3.21 MB, level ok)

Live check before the Task 1 halt (Node fetch, default TLS, 2026-09-15T15:35:49.255Z):

```
BENCH_STATUS=200 SOAK_STATUS=200 PLAIN_STATUS=200 ROOT_STATUS=200
VERSION_JSON={"sha":"1ecc53ce473e","time":"2026-09-15T15:22:11.777Z"} VERSION_SHA_MATCH=true
B_VERSION_JSON={"sha":"1ecc53ce473e","time":"2026-09-15T15:22:11.777Z"} B_VERSION_SHA_MATCH=true
DOIBUNG_STATUS=200
LIVE_CHECK_OK
```

## Reference devices

Declared the reference devices for every later phase (D-06). Record model, OS and browser only: no serial numbers, accounts or personal data (T-01-19-02).

| Role | Model | OS version | Browser + version | Low Power Mode / Battery Saver default | Display refresh rate | RAM if known | Recorded at |
|------|-------|------------|-------------------|----------------------------------------|----------------------|--------------|-------------|
| Android | **KHÔNG CÓ MÁY** (operator 16/09) | — | — | — | — | — | — |
| iPhone | (chờ operator ghi model) | iOS 26.6.2 | Chrome iOS (CriOS) 153 — bench 16/09; Safari sẽ đo bổ sung | tắt khi đo | (không rõ) | (không rõ) | 2026-09-16 |

Baseline (Vite 8 build target): iOS must be ≥ 16.4 and Chrome ≥ 111. If either phone is lower, write `BELOW_BASELINE` here, add a STATE.md blocker and stop the plan instead of measuring.

Baseline result: (chưa kiểm — chưa có model/OS của 2 điện thoại). Desktop không thuộc baseline này.

## Measurement sessions

Rules for Task 3: the sha on screen must be `04c06b21c39a` (cập nhật 16/09) (else `INVALID_SHA`); throttled "Có" or Low Power / Battery Saver on → `INVALID_THROTTLED`; NPC not 10 on a bench row → `INVALID_SCENARIO`.

| Date | Sha | Device | URL | Tier (source) | Low Power | Throttled flag | NPC | Avg fps | 1% low | Peak draws | Peak bodies | Knocked/broken | Ragdolls at once | Flavor | Screenshot |
|------|-----|--------|-----|---------------|-----------|----------------|-----|---------|--------|------------|-------------|----------------|------------------|--------|------------|
| 2026-09-16 | 04c06b21c39a | iPhone (iOS 26.6.2, **Chrome iOS / CriOS 153**, DPR 2, 804x1368) | ?bench=1 | Cao (manual) | tắt | Không | 10 | 60.0 | 46.2 | 78 | 165 | 33 (vỡ 11) | 10 | simd | ảnh operator gửi 16/09 — chưa lưu file evidence/ |
| 2026-09-16 | 04c06b21c39a | iPhone — SOAK 15 phút (Chrome iOS) | ?soak=1 | Cao | tắt | — | 10 | fps thấp nhất/phút: 59·60·59·60·54·60×11 | — | — | 165 (gốc 165) | — | — | simd | 14 chu kỳ, mất ngữ cảnh 0, geometries 44/44, textures 25/25 → không rò rỉ; "Xong 15 phút — không crash" |
| — | — | **Android: CHƯA ĐO** | — | — | — | — | — | — | — | — | — | — | — | — | Operator không có máy Android (16/09). Giả định tạm: Android giữ 60 fps ở cảnh chơi thường 3 NPC (ảnh HUD 15/09). **Không suy ra được hệ số** vì cả hai máy đều chạm trần 60 fps và hai ảnh khác cảnh (body 116 vs 56). Nợ: phải đo bench Android thật trước Phase 9 |
| 2026-09-16 | 04c06b21c39a | Desktop (Windows 10/11, Chrome 153, 1920x911, DPR 1) | ?bench=1 | Cao (auto) | n/a | Không | 10 | 59.9 | 53.6 | 91 | 165 | 33 (vỡ 11) | 10 | simd | ảnh operator gửi trong hội thoại 16/09 — **chưa lưu file vào evidence/** |

## Browser checklist

| Browser | Loads | Playable | Notes |
|---------|-------|----------|-------|
| Chrome desktop | ok | ok | Bench 60 s hoàn tất, 59.9 fps TB / 53.6 (1% thấp), 3560 khung; Chrome 153 trên Windows |
| Edge desktop |  |  |  |
| Firefox desktop |  |  |  |
| Chrome Android |  |  |  |
| Safari iOS | (chờ đo) | (chờ đo) | Bench 16/09 chạy trên **Chrome iOS (CriOS 153)**, không phải Safari — operator sẽ chạy lại bench 60 s trên Safari |

## Controls & settings checklist

Answer "ok" or "not ok" (+ note). "n/a" cells are not applicable on that device and are excluded from CTRL_UI_CHECK. Findings here are gaps for verify-work and never trigger D-07 by themselves.

| Check | Desktop Chrome | Android Chrome | iPhone Safari | Notes |
|-------|----------------|----------------|---------------|-------|
| Arrows and WASD move (D-27) |  | n/a | n/a |  |
| Space swings and hits, E also works (D-27, D-30) |  | n/a | n/a |  |
| Lone Ctrl opens/closes settings, Ctrl+R/Ctrl+W still work (D-27) |  | n/a | n/a |  |
| Esc opens/closes settings (D-27) |  | n/a | n/a |  |
| Space never pauses (D-27) |  | n/a | n/a |  |
| Z/C rotate, arrows never rotate (D-19) |  | n/a | n/a |  |
| Key hint panel bottom-left, fades to ~30%, full on hover (D-28) |  | n/a | n/a |  |
| Key hint toggle in settings survives reload (D-28) |  | n/a | n/a |  |
| Virtual buttons translucent, one-time hint not over the joystick or buttons (D-28) | n/a |  |  |  |
| Swing plays on every press/tap with or without a target (D-30) |  |  |  |  |
| NPC count 0–10 applies at once from settings (D-29) |  |  |  |  |
| NPC names ≤ 16 chars show above heads and survive reload (D-29) |  |  |  |  |
| Typing a name does not move/rotate/pause the game; phone keyboard does not zoom (D-29) |  |  |  |  |

## Soak and crash notes (iPhone, TECH-04)

- Soak panel after 15 min: **ĐẠT** — 15:00/15:00, 14 chu kỳ, mất ngữ cảnh 0, geometries 44 (gốc 44), textures 25 (gốc 25), bodies 165 (gốc 165), "Xong 15 phút — không crash" (Chrome iOS, 16/09)
- 15 min normal play: (not measured yet)
- Crash banner "Lần chơi trước bị dừng đột ngột" on reload: (not measured yet)
- Safari reloaded the tab by itself: chưa ghi nhận (bản đo chạy Chrome iOS; operator chưa báo tab bị tải lại)

## Feel notes (CTRL-02)

- Android joystick / context button: (not recorded yet)
- iPhone joystick / context button: (not recorded yet)

## Human checks carried over from earlier plans

Observations only. They are noted for verify-work and are not gate criteria (they do not change VERDICT).

- 01-03 / 01-09: camera framing shows more than the planned "~1/2 room" (landscape 11 m / 55°, portrait 15 m / 60°): (not checked yet)
- 01-09: portrait rotate buttons ⟲ ⟳ too close to the joystick thumb area: (not checked yet)
- 01-11: tier Thấp clips the far wall in portrait: (not checked yet)
- 01-13: audio audible after Chơi and after switching apps and coming back: (not checked yet)
- 01-15: slap feel, ragdoll flight (~9 m/s): (not checked yet)
- 01-16: shard look and timing when something breaks: (not checked yet)
- 01-16 (deferred): walking along a desk launches desk items hard: (not checked yet)
- 01-24: context button icon shows nothing with no target, although it always swings: (not checked yet)
- 01-27 (deferred): pause panel height in phone landscape (runs under notch / home bar?): (not checked yet)
- 01-27: name field typing, long-press paste, keyboard not covering the field: (not checked yet)
