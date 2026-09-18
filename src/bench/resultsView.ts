import { TIER_LABEL_VI, type Tier } from '../logic/quality';
import type { BenchResult } from './benchScript';

/**
 * Results screen (plan 01-17, D-08, D-21): one full-screen overlay the operator screenshots on each reference phone.
 * Built with createElement / textContent only (no HTML strings); two columns in landscape, one in portrait, sized to
 * fit 844x390 and 390x844 without scrolling (bench.css). Nothing here is sent anywhere (T-01-17-03).
 */

function tierLabel(t: string): string {
  return Object.prototype.hasOwnProperty.call(TIER_LABEL_VI, t) ? `${TIER_LABEL_VI[t as Tier]} (${t})` : t;
}

function fixed1(n: number): string {
  return Number.isFinite(n) ? n.toFixed(1) : '-';
}

export function showBenchResults(r: BenchResult): void {
  document.getElementById('bench-results')?.remove();

  const section = document.createElement('section');
  section.id = 'bench-results';
  section.setAttribute('data-hud-panel', '');
  section.setAttribute('aria-label', 'Kết quả benchmark');

  const title = document.createElement('h2');
  title.textContent = 'Kết quả benchmark';

  const tier = [tierLabel(r.tier), r.tierSource, ...r.tierChanges].join(' · ');
  const rows: [string, string][] = [
    ['FPS TB', fixed1(r.avgFps)],
    ['1% thấp', fixed1(r.low1Fps)],
    ['Draw call đỉnh', String(r.peakDrawCalls)],
    ['Physics body đỉnh', String(r.peakBodies)],
    ['NPC', String(r.npcCount)],
    ['Ragdoll cùng lúc', String(r.maxSimultaneousRagdolls)],
    ['Đồ văng/vỡ', `${r.knockedOrBroken} (vỡ ${r.broken})`],
  ];

  // Add brawl-specific rows (D-11)
  if (r.brawl) {
    rows.push(
      ['Kịch bản', 'Đánh trả (brawl)'],
      ['NPC đuổi tối đa', `${r.maxPursuers}/3`],
      ['Vung đòn tối đa', `${r.maxAttackers}/1`],
      ['Người chơi bị hạ', String(r.playerKnockdowns)],
      ['Sim ms/step TB · p99', `${fixed1(r.simStepAvgMs!)} · ${fixed1(r.simStepP99Ms!)}`],
    );
  }

  rows.push(
    ['Tier', tier],
    ['Rapier', r.flavor],
    ['DPR / backbuffer', `${r.dpr} · ${r.backbuffer}`],
    ['Bị giới hạn 30 fps?', r.throttled ? 'Có' : 'Không'],
    ['Commit', r.sha],
    ['Thời lượng', `${r.durationSec} s · ${r.frames} khung`],
  );

  const grid = document.createElement('dl');
  grid.className = 'rows';
  for (const [name, value] of rows) {
    const row = document.createElement('div');
    row.className = 'row';
    const dt = document.createElement('dt');
    dt.textContent = name;
    const dd = document.createElement('dd');
    dd.textContent = value;
    row.append(dt, dd);
    grid.appendChild(row);
  }

  const ua = document.createElement('p');
  ua.className = 'ua';
  ua.textContent = r.userAgent;

  const footer = document.createElement('div');
  footer.className = 'footer';
  const note = document.createElement('p');
  note.className = 'note';
  note.textContent = 'Chụp màn hình này làm bằng chứng đo';
  const again = document.createElement('button');
  again.type = 'button';
  again.id = 'bench-rerun';
  again.textContent = 'Chạy lại';
  again.addEventListener('click', () => location.reload());
  footer.append(note, again);

  section.append(title, grid, ua, footer);
  document.body.appendChild(section);
}
