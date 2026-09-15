// Rapier loader with SIMD build + compat fallback (TECH-01, RESEARCH Pattern 2) and the physics world wrapper.

export type RapierApi = typeof import('@dimforge/rapier3d-compat');

export async function loadRapier(preferSimd: boolean): Promise<{ R: RapierApi; flavor: 'simd' | 'compat' }> {
  if (preferSimd && !new URLSearchParams(location.search).has('simd0')) {
    try {
      const R = await import('@dimforge/rapier3d-simd-compat');
      await R.init();
      // Both packages ship identical declarations; their classes are only nominally distinct.
      return { R: R as unknown as RapierApi, flavor: 'simd' };
    } catch (e) {
      console.warn('SIMD Rapier failed, falling back', e);
    }
  }
  const R = await import('@dimforge/rapier3d-compat');
  await R.init();
  return { R, flavor: 'compat' };
}

export interface Physics {
  R: RapierApi;
  world: InstanceType<RapierApi['World']>;
  eventQueue: InstanceType<RapierApi['EventQueue']>;
  step(): void;
}

export function createPhysics(R: RapierApi): Physics {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  const eventQueue = new R.EventQueue(true);
  return {
    R,
    world,
    eventQueue,
    step() {
      world.step(eventQueue);
    },
  };
}
