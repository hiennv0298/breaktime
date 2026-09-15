/** Pure frame statistics for the HUD, auto-tier and the benchmark (D-08, RESEARCH Pattern 7). No DOM, no three. */

/** Median of `a` without mutating it; the mean of the two middle values for even lengths; 0 for an empty list. */
export function median(a: number[]): number {
  const n = a.length;
  if (n === 0) return 0;
  const s = [...a].sort((x, y) => x - y);
  const mid = n >> 1;
  return n % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Average fps and "1% low" (fps of the mean of the worst 1% of frames, at least one frame). */
export function summarize(frameMs: number[]): { avgFps: number; low1Fps: number; frames: number } {
  const n = frameMs.length;
  const total = frameMs.reduce((a, b) => a + b, 0);
  if (n === 0 || !(total > 0)) return { avgFps: 0, low1Fps: 0, frames: n };
  const avgFps = (n * 1000) / total;
  const worst = [...frameMs].sort((a, b) => b - a).slice(0, Math.max(1, Math.ceil(n * 0.01)));
  const worstMean = worst.reduce((a, b) => a + b, 0) / worst.length;
  const low1Fps = worstMean > 0 ? 1000 / worstMean : 0;
  return { avgFps, low1Fps, frames: n };
}

/**
 * Throttle heuristic (Pitfall 3): iOS Low Power Mode and cross-origin iframes before interaction cap rAF at 30 fps
 * (WebKit bug 168837). Frames arriving every ~33 ms while the CPU work per frame is tiny means capped, not slow.
 */
export function looksThrottled(intervalMs: number[], workMs: number[]): boolean {
  if (intervalMs.length === 0 || workMs.length === 0) return false;
  return median(intervalMs) > 30 && median(workMs) < 12;
}

/** Rolling fps over the last `windowMs` of pushed frame timestamps. */
export function createFpsMeter(windowMs = 1000): { push(nowMs: number): void; fps(): number } {
  // Ring of timestamps sized for ~625 Hz over the window, so pushing never allocates per frame.
  const cap = Math.max(16, Math.ceil(windowMs / 1.6));
  const ring = new Float64Array(cap);
  let head = 0; // index of the oldest kept timestamp
  let count = 0;

  function oldest(): number {
    return ring[head];
  }
  function newest(): number {
    return ring[(head + count - 1) % cap];
  }

  return {
    push(nowMs) {
      if (!Number.isFinite(nowMs)) return;
      if (count === cap) {
        head = (head + 1) % cap;
        count--;
      }
      ring[(head + count) % cap] = nowMs;
      count++;
      while (count > 1 && oldest() < nowMs - windowMs) {
        head = (head + 1) % cap;
        count--;
      }
    },
    fps() {
      if (count < 2) return 0;
      const span = newest() - oldest();
      return span > 0 ? ((count - 1) * 1000) / span : 0;
    },
  };
}
