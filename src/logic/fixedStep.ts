/**
 * Pure fixed-step accumulator (RESEARCH Pattern 3).
 * Each call adds one render frame and returns how many fixed sim steps to run.
 * - the frame is clamped to 0.1 s (tab switches, long GC pauses)
 * - at most `maxSteps` per frame; when the cap is hit the backlog is dropped (no spiral of death)
 * - timeScale 0 freezes the sim (pause, hit-stop) while rendering continues
 */
export function makeStepper(dt = 1 / 60, maxSteps = 4): (frameSeconds: number, timeScale: number) => number {
  let acc = 0;
  return (frameSeconds: number, timeScale: number): number => {
    const frame = Number.isFinite(frameSeconds) && frameSeconds > 0 ? Math.min(frameSeconds, 0.1) : 0;
    const scale = Number.isFinite(timeScale) && timeScale > 0 ? timeScale : 0;
    acc += frame * scale;
    let n = 0;
    while (acc >= dt && n < maxSteps) {
      acc -= dt;
      n++;
    }
    if (n === maxSteps) acc = 0;
    return n;
  };
}
