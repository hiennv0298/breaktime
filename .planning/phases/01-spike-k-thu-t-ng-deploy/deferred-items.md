# Phase 01 deferred items (out of scope for the plan that found them)

## From 01-16

- **Player capsule launches desk props hard enough to break things on another desk.** The kinematic player controller from 01-03/01-10 (`setApplyImpulsesToDynamicBodies(true)`, autostep 0.3 m) can launch `d4-laptop` to y 1.40 while the player walks along desk d4. The laptop then lands on desk d2 and breaks its monitor or mug. Measured break forces: 202, 233 and 300 N/kg, in 3 of 4 scripted walks. Idle for 15 s: 0 breaks. The break rules behave correctly (a flying object really hit the breakable). What is out of scope is how hard the capsule pushes. Candidate for 01-20 tuning: cap the capsule impulse, or give desk items a collision group the capsule does not push.

## From 01-27

- **Pause panel taller than its `max-height: 90dvh` in the mobile-emu landscape viewport.** In an 844x390 `isMobile` Chromium context the `#pause-menu .panel` (hud.css, plan 01-08/01-11) measured 391 px tall at y -0.5, where 90dvh would be 351 px. The panel still scrolls, and e2e proves every name field and Áp dụng can be scrolled into view in landscape and portrait, so nothing is unreachable. It is not known whether real iOS Safari behaves the same, because dvh in device emulation may follow a different viewport. Check it on the reference phones during the 01-27 real-device check. If the panel runs under the notch or home bar, cap it with `calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 16px)`.
- **Section labels sit tight against the button above.** `#pause-menu .sections` has no gap, so "Hướng dẫn phím" and "NPC trong văn phòng" touch the previous section (visible in the 01-27 screenshots). This is cosmetic only and belongs to the menu CSS from 01-11/01-25.
