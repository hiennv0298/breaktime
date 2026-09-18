import { BUILD_SHA } from '../boot/buildInfo';
import { registerDebug } from '../debug/testHook';
import { createAutopilot } from '../game/autopilot';
import type { Game } from '../game/game';
import { PLAYER_SPAWN } from '../game/layout';
import { getPauseState, onFrame, onStep, onStepDone } from '../game/loop';
import { getQuality } from '../game/qualityManager';
import { NPC_ROUTES } from '../game/waypoints';
import { looksThrottled, percentile, summarize } from '../logic/benchStats';
import { buildTimeline, type BenchAction } from '../logic/benchTimeline';
import { BENCH_SEED } from '../logic/rng';
import { getCameraYaw } from '../render/cameraView';
import { showBenchResults } from './resultsView';
import './bench.css';

/**
 * ?bench=1 runner (plan 01-17, D-08, D-11 revised, D-21, TECH-07). Plays the seeded timeline on the fixed simulation
 * step, records every rendered frame after a 60-step warm-up, tracks draw-call / body / ragdoll peaks and tier changes,
 * then pauses the game and shows the results screen the operator screenshots as evidence. No network code (TECH-05).
 */

export interface BenchResult {
  sha: string;
  durationSec: number;
  frames: number;
  avgFps: number;
  low1Fps: number;
  peakDrawCalls: number;
  peakBodies: number;
  tier: string;
  tierSource: string;
  tierChanges: string[];
  flavor: string;
  dpr: number;
  backbuffer: string;
  throttled: boolean;
  npcCount: number;
  maxSimultaneousRagdolls: number;
  knockedOrBroken: number;
  broken: number;
  userAgent: string;
  brawl?: boolean;
  maxPursuers?: number;
  maxAttackers?: number;
  strikes?: number;
  playerKnockdowns?: number;
  simStepAvgMs?: number;
  simStepP99Ms?: number;
  simStepMaxMs?: number;
}

export interface BenchRun {
  onFrame(ts: number, workMs: number): void;
  onStep(step: number): void;
  done(): boolean;
  result(): BenchResult | null;
}

/** Frames of the first second say more about shader warm-up and GC than about the scene (RESEARCH Pattern 7). */
export const BENCH_WARMUP_STEPS = 60;
/**
 * After the mass-ragdoll step, NPCs that were still getting up from an earlier slap (ragdoll <= 4 s + 0.45 s recover,
 * getUpFsm.ts) are slapped the moment they stand, for at most this many steps, so all of them are ragdolls at once
 * even in a short &dur= run. Everyone slappable at the mass step is slapped in that same step.
 */
export const MASS_RAGDOLL_WINDOW_STEPS = 300;

let started = false;

/**
 * Player spawn + every NPC route point, de-duplicated at 1 cm (shared by the 01-17 bench and the 01-18 soak). Route
 * corners repeat across the NPC routes (west column, north lane); duplicates would make the loop pace in place.
 */
export function benchWaypoints(): { x: number; z: number }[] {
  const seen = new Set<string>();
  return [{ x: PLAYER_SPAWN.x, z: PLAYER_SPAWN.z }, ...NPC_ROUTES.flat()]
    .map((p) => ({ x: p.x, z: p.z }))
    .filter((p) => {
      const key = `${p.x.toFixed(2)},${p.z.toFixed(2)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function startBench(game: Game, opts: { durationSec: number; brawl?: boolean }): BenchRun {
  if (started) throw new Error('bench already started');
  started = true;

  const durationSec = opts.durationSec;
  const brawl = opts.brawl === true;
  const actions: BenchAction[] = buildTimeline({ durationSec, seed: BENCH_SEED, waypoints: benchWaypoints() });
  const autopilot = createAutopilot();
  const quality = getQuality();
  const pause = getPauseState();

  const intervals: number[] = [];
  const work: number[] = [];
  const stepMs: number[] = [];
  let next = 0;
  let baseStep = -1;
  let localStep = 0;
  let lastTs = -1;
  let running = true;
  let finished = false;
  let result: BenchResult | null = null;
  let peakDrawCalls = 0;
  let peakBodies = 0;
  let maxRagdolls = 0;
  let massWindowLeft = 0;
  let target: { x: number; z: number } | null = null;
  const mass = { step: -1, slappedAtStep: 0, lateSlaps: 0 };
  const log = { slaps: 0, slapMisses: 0, smashes: 0 };
  const tierChanges: string[] = [];
  let lastTier = quality.current();

  const unsubTier = quality.onChange((t) => {
    tierChanges.push(`${lastTier}→${t} @${(localStep / 60).toFixed(1)}s`);
    lastTier = t;
  });

  const label = document.createElement('div');
  label.id = 'bench-label';
  label.textContent = brawl ? 'BENCH BRAWL' : 'BENCH';
  document.body.appendChild(label);

  function run(a: BenchAction): void {
    switch (a.kind) {
      case 'walkTo':
        autopilot.setTarget(a.x, a.z);
        target = { x: a.x, z: a.z };
        break;
      case 'slapNearest':
        if (game.slapNearestNpc()) log.slaps++;
        else log.slapMisses++;
        break;
      case 'massRagdoll':
        mass.step = localStep;
        mass.slappedAtStep = game.massRagdoll();
        massWindowLeft = MASS_RAGDOLL_WINDOW_STEPS;
        break;
      case 'smash':
        game.smash();
        log.smashes++;
        break;
      case 'end':
        finish();
        break;
    }
  }

  function finish(): void {
    if (finished) return;
    finished = true;
    running = false;
    autopilot.stop();
    autopilot.apply(game.playerInput, game.player.pos(), getCameraYaw());
    unsubFrame();
    unsubStep();
    unsubStepDone();
    unsubTier();
    label.remove();

    const summary = summarize(intervals);
    const s = game.stats();
    const combat = game.combatStats();
    result = {
      sha: BUILD_SHA,
      durationSec,
      frames: summary.frames,
      avgFps: summary.avgFps,
      low1Fps: summary.low1Fps,
      peakDrawCalls,
      peakBodies,
      tier: quality.current(),
      tierSource: quality.source(),
      tierChanges: [...tierChanges],
      flavor: s.flavor,
      dpr: s.dpr,
      backbuffer: `${s.backbufferWidth}x${s.backbufferHeight}`,
      throttled: looksThrottled(intervals, work),
      npcCount: game.activeNpcCount(),
      maxSimultaneousRagdolls: maxRagdolls,
      knockedOrBroken: game.knockedOrBroken(),
      broken: game.brokenCount(),
      userAgent: navigator.userAgent,
      ...(brawl && {
        brawl: true,
        maxPursuers: combat.maxPursuers,
        maxAttackers: combat.maxAttackers,
        strikes: combat.strikes,
        playerKnockdowns: combat.knockdowns,
        simStepAvgMs: stepMs.length > 0 ? stepMs.reduce((a, b) => a + b, 0) / stepMs.length : 0,
        simStepP99Ms: percentile(stepMs, 0.99),
        simStepMaxMs: stepMs.length > 0 ? Math.max(...stepMs) : 0,
      }),
    };
    pause.pauseFor('user');
    showBenchResults(result);

    // Log MEASURE line for brawl runs (D-11)
    if (brawl) {
      const measure = `MEASURE brawl npcs=${result.npcCount} peakDrawCalls=${result.peakDrawCalls} peakBodies=${result.peakBodies} maxPursuers=${result.maxPursuers} maxAttackers=${result.maxAttackers} strikes=${result.strikes} knockdowns=${result.playerKnockdowns} simStepAvgMs=${result.simStepAvgMs!.toFixed(2)} simStepP99Ms=${result.simStepP99Ms!.toFixed(2)} simStepMaxMs=${result.simStepMaxMs!.toFixed(2)}`;
      console.log(measure);
    }
  }

  const bench: BenchRun = {
    onStep(step) {
      if (finished) return;
      if (baseStep < 0) baseStep = step;
      localStep = step - baseStep;
      while (next < actions.length && actions[next].step <= localStep) {
        run(actions[next++]);
        if (finished) return;
      }
      if (massWindowLeft > 0) {
        massWindowLeft--;
        if (game.countRagdollsActive() < game.activeNpcCount()) mass.lateSlaps += game.massRagdoll();
      }
      const ragdolls = game.countRagdollsActive();
      if (ragdolls > maxRagdolls) maxRagdolls = ragdolls;
      // Every NPC is a ragdoll at the same moment: the window has done its job, nobody gets slapped twice.
      if (massWindowLeft > 0 && ragdolls >= game.activeNpcCount()) massWindowLeft = 0;
      autopilot.apply(game.playerInput, game.player.pos(), getCameraYaw());
    },
    onFrame(ts, workMs) {
      if (finished) return;
      const s = game.stats();
      if (s.drawCalls > peakDrawCalls) peakDrawCalls = s.drawCalls;
      if (s.bodies > peakBodies) peakBodies = s.bodies;
      const ragdolls = game.countRagdollsActive();
      if (ragdolls > maxRagdolls) maxRagdolls = ragdolls;
      // Paused frames (menu, hidden tab) and the warm-up say nothing about the scene; the gap after a pause is skipped.
      if (pause.isPaused() || baseStep < 0 || localStep < BENCH_WARMUP_STEPS) {
        lastTs = pause.isPaused() ? -1 : ts;
        return;
      }
      if (lastTs >= 0 && ts > lastTs) {
        intervals.push(ts - lastTs);
        work.push(workMs);
      }
      lastTs = ts;
    },
    done: () => finished,
    result: () => result,
  };

  const unsubStep = onStep((step) => bench.onStep(step));
  const unsubFrame = onFrame((ts, workMs) => bench.onFrame(ts, workMs));
  const unsubStepDone = onStepDone((step, ms) => {
    // Collect step timing only after warm-up (D-11)
    if (localStep >= BENCH_WARMUP_STEPS) {
      stepMs.push(ms);
    }
  });

  registerDebug('bench', () => ({
    running,
    done: finished,
    result,
    step: localStep,
    totalSteps: actions[actions.length - 1].step,
    massRagdoll: { ...mass },
    log: { ...log },
    target: target ? { ...target } : null,
    arrived: autopilot.arrived(),
  }));

  return bench;
}
