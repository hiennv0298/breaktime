<!-- GSD:project-start source:PROJECT.md -->

## Project

**Break Time**

Game web 3D low-poly chơi được trên cả desktop lẫn điện thoại (không cần cài app), bối cảnh một văn phòng.
Người chơi là nhân viên bị sếp và đồng nghiệp làm phiền, "xả stress" bằng cách **chọc phá lén lút**,
**nói xấu cho tin đồn lan** (và có thể bị truy ra), rồi khi stress đầy thì **Rage Mode đập phá**.
Nhắm người chơi casual trên các cổng game web (CrazyGames trước), bản tiếng Việt dùng để lan truyền.

**Core Value:** **Một "ngày làm việc" 5–8 phút phải buồn cười và căng thẳng đúng lúc.** Người chơi hiểu vì sao mình
bị phát hiện, và mỗi prank, tin đồn hay lần đập phá đều có punchline. Nếu mọi thứ khác hỏng,
vòng lặp này vẫn phải chơi được mượt trên một điện thoại tầm trung.

### Constraints

- **Tech stack**: TypeScript + Vite + Three.js + Rapier (WASM) — nhẹ hơn Unity, chạy được Safari iOS, hệ sinh thái lớn
- **Kích thước**: tải lần đầu mục tiêu ≤ 8 MB, trần cứng ≤ 20 MB — CrazyGames chỉ đưa lên trang chủ mobile khi build ≤ 20 MB; Poki muốn ~8 MB
- **Hiệu năng**: ≥ 30 fps ổn định trên Android tầm trung, 60 fps desktop; vào gameplay ≤ 10s trên 4G — CrazyGames đo conversion 80%+
- **Cổng web**: không request ra ngoài (font/asset đóng gói hết), chạy được khi bật ad-blocker, localStorage bọc try/catch, ESC/Space để pause, cutscene skip được — luật Poki/CrazyGames
- **Nội dung**: ≤ PEGI 12; tin đồn chọn từ thẻ có sẵn, nội dung ngớ ngẩn vô hại
- **Asset**: chỉ dùng license CC0 hoặc tương đương cho phép thương mại + web; ghi nguồn trong `CREDITS.md`
- **Dữ liệu**: không thu dữ liệu cá nhân ở v1
- **Hạ tầng deploy**: dùng chung VPS với doibung.com; không được làm gián đoạn doibung.com khi deploy game

<!-- GSD:project-end -->

<!-- GSD:stack-start source:STACK.md -->

## Technology Stack

Technology stack not yet documented. Will populate after codebase mapping or first phase.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
