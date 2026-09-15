import { defineConfig, type Plugin } from 'vite';
import { execSync } from 'node:child_process';

function readSha(): string {
  try {
    const sha = execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    return /^[0-9a-f]{12}$/.test(sha) ? sha : '000000000000';
  } catch {
    return '000000000000';
  }
}

const sha = readSha();
const time = new Date().toISOString();

// Emits dist/version.json ({ sha, time }) — read by the deploy smoke test.
function versionJson(): Plugin {
  return {
    name: 'version-json',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ sha, time }) });
    },
  };
}

export default defineConfig({
  base: './', // D-04: same build runs under / and /b/<sha>/
  define: {
    __BUILD_SHA__: JSON.stringify(sha),
    __BUILD_TIME__: JSON.stringify(time),
  },
  plugins: [versionJson()],
  build: {
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 4000,
    reportCompressedSize: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
