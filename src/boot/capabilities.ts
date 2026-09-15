// Capability gate (D-22, RESEARCH Pattern 2). Must not import three: the unsupported screen has to stay instant.

export interface Caps {
  webgl2: boolean;
  wasm: boolean;
  simd: boolean;
}

// Minimal module using a SIMD opcode; WebAssembly.validate returns true only where SIMD is supported.
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
]);

export function detect(): Caps {
  let webgl2 = false;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    webgl2 = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext(); // free the probe context
  } catch {
    /* stays false */
  }
  const wasm = typeof WebAssembly === 'object';
  let simd = false;
  if (wasm) {
    try {
      simd = WebAssembly.validate(SIMD_PROBE);
    } catch {
      simd = false;
    }
  }
  return { webgl2, wasm, simd };
}
