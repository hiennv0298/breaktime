// scripts/lib/poller.mjs — watches a URL (doibung.com) during risky server steps and reports
// the longest continuous run of unexpected results.

/**
 * @param {string} url
 * @param {{ intervalMs?: number, timeoutMs?: number, expectStatus?: number }} [opts]
 */
export function startPoller(url, { intervalMs = 1000, timeoutMs = 3000, expectStatus = 200 } = {}) {
  /** @type {Array<{ t: number, status?: number, error?: string }>} */
  const samples = [];
  const inflight = new Set();
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    const sample = { t: Date.now() };
    samples.push(sample);
    const p = fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) })
      .then(async (res) => {
        sample.status = res.status;
        try {
          await res.body?.cancel();
        } catch {
          /* body already consumed/closed */
        }
      })
      .catch((e) => {
        sample.error = e?.name === 'TimeoutError' ? `timeout ${timeoutMs} ms` : String(e?.message ?? e);
      })
      .finally(() => inflight.delete(p));
    inflight.add(p);
  };

  tick();
  const timer = setInterval(tick, intervalMs);

  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      await Promise.allSettled([...inflight]);
      const end = Date.now();
      const ordered = [...samples].sort((a, b) => a.t - b.t);
      let non200 = 0;
      let streakStart = null;
      let maxConsecutiveNon200Ms = 0;
      for (const s of ordered) {
        const good = s.status === expectStatus && !s.error;
        if (!good) {
          non200 += 1;
          if (streakStart === null) streakStart = s.t;
        } else if (streakStart !== null) {
          maxConsecutiveNon200Ms = Math.max(maxConsecutiveNon200Ms, s.t - streakStart);
          streakStart = null;
        }
      }
      if (streakStart !== null) maxConsecutiveNon200Ms = Math.max(maxConsecutiveNon200Ms, end - streakStart);
      return { count: ordered.length, non200, maxConsecutiveNon200Ms, samples: ordered };
    },
  };
}
