/**
 * Pure debris budget (D-13, D-21, RESEARCH Pattern 15; TECH-06). No three, no DOM, no Rapier.
 *
 * A fixed-capacity slot table with a FIFO of live slots (a doubly linked list over typed arrays), so acquiring,
 * releasing and recycling are O(1) and allocate nothing. When the live count reaches the tier cap, the oldest live
 * slot is recycled first. The arrays returned by acquire/setCap are reused by the next call: copy them if you keep them.
 */

export interface DebrisBudget {
  /** Up to min(n, cap) slots. `recycled` lists live slots that were taken back (oldest first) to make room. */
  acquire(n: number): { slots: number[]; recycled: number[] };
  /** Frees a live slot; unknown or already free slots are ignored. */
  release(slot: number): void;
  /** Clamps the cap to [0, capacity] and releases the oldest live slots above it; returns them oldest first. */
  setCap(cap: number): number[];
  active(): number;
  cap(): number;
}

/** Highest tier debris cap (TIERS.high.debrisCap). */
export const DEFAULT_DEBRIS_CAPACITY = 60;

const NONE = -1;

function clampInt(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, Math.floor(v)));
}

export function createDebrisBudget(cap: number, capacity = DEFAULT_DEBRIS_CAPACITY): DebrisBudget {
  const size = clampInt(capacity, 0, 1 << 16);
  const live = new Uint8Array(size);
  const prev = new Int32Array(size).fill(NONE);
  const next = new Int32Array(size).fill(NONE);
  // Free stack: popping gives the lowest free index first on a fresh budget.
  const free = new Int32Array(size);
  let freeTop = 0;
  for (let i = size - 1; i >= 0; i--) free[freeTop++] = i;

  let head = NONE; // oldest live slot
  let tail = NONE; // newest live slot
  let count = 0;
  let limit = clampInt(cap, 0, size);

  const out = { slots: [] as number[], recycled: [] as number[] };
  const released: number[] = [];

  function append(slot: number): void {
    live[slot] = 1;
    prev[slot] = tail;
    next[slot] = NONE;
    if (tail !== NONE) next[tail] = slot;
    else head = slot;
    tail = slot;
    count++;
  }

  function unlink(slot: number): void {
    const p = prev[slot];
    const n = next[slot];
    if (p !== NONE) next[p] = n;
    else head = n;
    if (n !== NONE) prev[n] = p;
    else tail = p;
    prev[slot] = NONE;
    next[slot] = NONE;
    live[slot] = 0;
    count--;
  }

  function isLive(slot: number): boolean {
    return Number.isInteger(slot) && slot >= 0 && slot < size && live[slot] === 1;
  }

  return {
    acquire(n) {
      out.slots.length = 0;
      out.recycled.length = 0;
      const want = clampInt(n, 0, limit);
      for (let i = 0; i < want; i++) {
        let slot: number;
        if (count >= limit) {
          slot = head;
          unlink(slot);
          out.recycled.push(slot);
        } else {
          slot = free[--freeTop];
        }
        append(slot);
        out.slots.push(slot);
      }
      return out;
    },
    release(slot) {
      if (!isLive(slot)) return;
      unlink(slot);
      free[freeTop++] = slot;
    },
    setCap(c) {
      released.length = 0;
      limit = clampInt(c, 0, size);
      while (count > limit) {
        const slot = head;
        unlink(slot);
        free[freeTop++] = slot;
        released.push(slot);
      }
      return released;
    },
    active: () => count,
    cap: () => limit,
  };
}
