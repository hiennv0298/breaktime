import { weightedProgress } from '../logic/progress';

export interface LoadTask {
  id: string;
  weight: number;
  run(report: (fraction: number) => void): Promise<unknown>;
}

/** Runs all tasks in parallel and reports real weighted progress (D-23). Rejects if any task rejects. */
export async function runLoadTasks(tasks: LoadTask[], onProgress: (p: number) => void): Promise<Map<string, unknown>> {
  const weights: Record<string, number> = {};
  const fractions: Record<string, number> = {};
  for (const t of tasks) {
    if (Object.prototype.hasOwnProperty.call(weights, t.id)) throw new Error('duplicate load task ' + t.id);
    weights[t.id] = t.weight;
    fractions[t.id] = 0;
  }
  const emit = () => onProgress(weightedProgress(weights, fractions));
  emit();

  const results = new Map<string, unknown>();
  await Promise.all(
    tasks.map(async (t) => {
      const value = await t.run((fraction) => {
        // Never move backwards, and never report 1 before the task actually resolves.
        const f = Math.min(0.999, Math.max(fractions[t.id], Number.isFinite(fraction) ? fraction : 0));
        if (f !== fractions[t.id]) {
          fractions[t.id] = f;
          emit();
        }
      });
      fractions[t.id] = 1;
      results.set(t.id, value);
      emit();
    }),
  );
  return results;
}

/** Same-origin fetch that streams the body and reports received / content-length when the header exists. */
export async function fetchWithProgress(url: string, report: (fraction: number) => void): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  const total = Number(res.headers.get('content-length'));
  if (!res.body || !Number.isFinite(total) || total <= 0) {
    const buf = await res.arrayBuffer();
    report(1);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    report(Math.min(1, received / total));
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  report(1);
  return out.buffer;
}

/** div#loading > div.bar > div.fill plus "Đang tải… NN%". */
export function createLoadingView(): { set(p: number): void; hide(): void } {
  const root = document.createElement('div');
  root.id = 'loading';
  const bar = document.createElement('div');
  bar.className = 'bar';
  const fill = document.createElement('div');
  fill.className = 'fill';
  bar.appendChild(fill);
  const label = document.createElement('div');
  label.className = 'label';
  root.appendChild(bar);
  root.appendChild(label);
  document.body.appendChild(root);

  const set = (p: number) => {
    const pct = Math.round(Math.min(1, Math.max(0, Number.isFinite(p) ? p : 0)) * 100);
    fill.style.width = pct + '%';
    label.textContent = `Đang tải… ${pct}%`;
  };
  set(0);
  return {
    set,
    hide() {
      root.remove();
    },
  };
}
