# Phase 01 deferred items (out of scope for the plan that found them)

## From 01-16

- **Player capsule launches desk props hard enough to break things on another desk.** The kinematic player controller from 01-03/01-10 (`setApplyImpulsesToDynamicBodies(true)`, autostep 0.3 m) can launch `d4-laptop` to y 1.40 while the player walks along desk d4. The laptop then lands on desk d2 and breaks its monitor or mug. Measured break forces: 202, 233 and 300 N/kg, in 3 of 4 scripted walks. Idle for 15 s: 0 breaks. The break rules behave correctly (a flying object really hit the breakable). What is out of scope is how hard the capsule pushes. Candidate for 01-20 tuning: cap the capsule impulse, or give desk items a collision group the capsule does not push.
