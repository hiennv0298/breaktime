// Raw Web Audio SFX (D-15, D-23, D-25; RESEARCH Pattern 6 / Pitfall 5). No HTMLAudioElement, no library, MP3 only.
//
// Lifecycle: the MP3 files are fetched as ArrayBuffers during loading (same-origin, CSP connect-src 'self').
// Nothing touches Web Audio before the Chơi tap: unlockFromGesture() creates the context, calls resume() and starts
// a 1-sample silent buffer synchronously inside the click, then decodes every buffer and plays the start cue.
// The Safari audio session type is never overridden, so the iPhone silent switch keeps muting SFX as the user expects.

import { fetchWithProgress, type LoadTask } from '../boot/loading';
import { registerDebug } from '../debug/testHook';
import { sfxNameFromPath } from '../logic/sfxNames';

export type AudioStateName = 'locked' | 'suspended' | 'running' | 'interrupted' | 'closed';

const START_CUE = 'drop-soft-0';
const START_CUE_GAIN = 0.6;
const PLAYED_KEEP = 20;

// Glob keys ('../assets/sfx/slap-1.mp3') give the names; values are the hashed same-origin build URLs.
const SFX_URLS: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('../assets/sfx/*.mp3', { query: '?url', import: 'default', eager: true }),
  ).map(([key, url]) => [sfxNameFromPath(key), url]),
);

let ctx: AudioContext | null = null;
const encoded = new Map<string, ArrayBuffer>();
const buffers = new Map<string, AudioBuffer>();
const decoding = new Set<string>();
const played: string[] = [];
let requests = 0;
let failed = 0;
let listenersInstalled = false;

type AudioContextCtor = new () => AudioContext;

function audioContextCtor(): AudioContextCtor | undefined {
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext;
}

/** 'locked' until the first gesture; afterwards the real context state (Safari adds 'interrupted'). */
export function audioState(): AudioStateName {
  if (!ctx) return 'locked';
  return ctx.state as AudioStateName;
}

/** Every SFX name bundled with the build, sorted. */
export function sfxNames(): string[] {
  return Object.keys(SFX_URLS).sort();
}

function safeResume(c: AudioContext): Promise<void> {
  try {
    return c.resume().catch((e: unknown) => console.warn('AudioContext.resume failed', e));
  } catch (e) {
    console.warn('AudioContext.resume failed', e);
    return Promise.resolve();
  }
}

function safeSuspend(c: AudioContext): void {
  try {
    void c.suspend().catch((e: unknown) => console.warn('AudioContext.suspend failed', e));
  } catch (e) {
    console.warn('AudioContext.suspend failed', e);
  }
}

/** Decode every fetched-but-not-yet-decoded buffer. Each ArrayBuffer is decoded once (decodeAudioData detaches it). */
function decodePending(c: AudioContext): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (const [name, data] of encoded) {
    if (decoding.has(name) || buffers.has(name)) continue;
    decoding.add(name);
    encoded.delete(name);
    jobs.push(
      c
        .decodeAudioData(data)
        .then((buf) => {
          buffers.set(name, buf);
        })
        .catch((e: unknown) => {
          failed++;
          console.warn(`decode ${name} failed`, e);
        })
        .finally(() => decoding.delete(name)),
    );
  }
  return Promise.all(jobs).then(() => undefined);
}

function installLifecycleListeners(): void {
  if (listenersInstalled) return;
  listenersInstalled = true;
  // Hidden tab: stop the audio thread. Visible again: resume (the game itself stays paused until the player resumes).
  document.addEventListener('visibilitychange', () => {
    if (!ctx || ctx.state === 'closed') return;
    if (document.visibilityState === 'hidden') safeSuspend(ctx);
    else void safeResume(ctx);
  });
  // Safari can leave the context 'interrupted' (call, Siri, backgrounding); the next touch is a gesture to resume in.
  const resumeOnGesture = () => {
    if (!ctx || document.visibilityState === 'hidden') return;
    const s = ctx.state as string;
    if (s === 'interrupted' || s === 'suspended') void safeResume(ctx);
  };
  document.addEventListener('pointerdown', resumeOnGesture, { capture: true, passive: true });
  document.addEventListener('pointerup', resumeOnGesture, { capture: true, passive: true });
}

/**
 * Call synchronously inside the Chơi click (onPlayGesture). resume() and the silent buffer start happen before any
 * await, so iOS Safari counts them as part of the gesture; decoding and the start cue follow asynchronously.
 */
export function unlockFromGesture(): void {
  if (!ctx) {
    const Ctor = audioContextCtor();
    if (!Ctor) {
      console.warn('Web Audio is not available; SFX stay silent');
      return;
    }
    ctx = new Ctor();
  }
  const c = ctx;
  const resumed = safeResume(c);
  try {
    const silent = c.createBuffer(1, 1, 22050);
    const src = c.createBufferSource();
    src.buffer = silent;
    src.connect(c.destination);
    src.onended = () => src.disconnect();
    src.start(0);
  } catch (e) {
    console.warn('silent unlock buffer failed', e);
  }
  installLifecycleListeners();

  void Promise.all([decodePending(c), resumed]).then(() => playSfx(START_CUE, { gain: START_CUE_GAIN }));
}

/** Load task 'sfx' (weight 5): fetches every MP3 as an ArrayBuffer before Chơi; decoding waits for the unlock. */
export function sfxLoadTask(): LoadTask {
  return {
    id: 'sfx',
    weight: 5,
    async run(report) {
      const entries = Object.entries(SFX_URLS);
      const fractions = entries.map(() => 0);
      const emit = () => report(entries.length === 0 ? 1 : fractions.reduce((a, b) => a + b, 0) / entries.length);
      await Promise.all(
        entries.map(async ([name, url], i) => {
          try {
            const data = await fetchWithProgress(url, (f) => {
              fractions[i] = f;
              emit();
            });
            encoded.set(name, data);
          } catch (e) {
            // A missing sound must not block the game; the audio e2e asserts every file decodes.
            failed++;
            console.warn(`fetch sfx ${name} failed`, e);
          }
          fractions[i] = 1;
          emit();
        }),
      );
      // Loading normally finishes before Chơi, but if the unlock already happened decode right away.
      if (ctx) await decodePending(ctx);
      return sfxNames();
    },
  };
}

/** Fire-and-forget one-shot. Silently ignored while locked, suspended or for an unknown/undecoded name. */
export function playSfx(name: string, opts?: { gain?: number; rate?: number }): void {
  requests++;
  const c = ctx;
  if (!c || c.state !== 'running') return;
  const buf = buffers.get(name);
  if (!buf) return;
  const gainValue = Number.isFinite(opts?.gain) ? Math.min(2, Math.max(0, opts!.gain!)) : 1;
  const rate = Number.isFinite(opts?.rate) ? Math.min(4, Math.max(0.25, opts!.rate!)) : 1;
  try {
    // Per-play nodes: they are disconnected on 'ended' and garbage-collected; buffers are shared (T-01-13-02).
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = c.createGain();
    g.gain.value = gainValue;
    src.connect(g);
    g.connect(c.destination);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
    };
    src.start();
    played.push(name);
    if (played.length > PLAYED_KEEP) played.splice(0, played.length - PLAYED_KEEP);
  } catch (e) {
    console.warn(`play ${name} failed`, e);
  }
}

if (typeof window !== 'undefined') {
  registerDebug('audio', () => ({
    state: audioState(),
    decoded: buffers.size,
    requests,
    played: [...played],
    failed,
    names: sfxNames(),
  }));
}
