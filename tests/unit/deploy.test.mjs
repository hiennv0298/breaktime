import { describe, it, expect } from 'vitest';
import { CLEAN_PATHS, parseUploadedCount, runDeploy, uploadRemoteCommand } from '../../scripts/deploy.mjs';
import { DRIFT_MESSAGE } from '../../scripts/lib/stateCheck.mjs';

const SHA = '0123456789ab';
const WIRED = [
  'HOST_IMPORT=1',
  'HOST_MOUNT_NODB=1',
  'HOST_MOUNT_WITHDB=1',
  'LIVE_MOUNT=1',
  'LIVE_IMPORT=1',
  'LIVE_SITE=0',
  'SITE_FILE_SHA=',
  'CADDY_RUNNING=true',
  'END=1',
].join('\n');
const DRIFTED = WIRED.replace('HOST_IMPORT=1', 'HOST_IMPORT=0').replace('LIVE_MOUNT=1', 'LIVE_MOUNT=0');

function fakeDeps({ porcelain = '', stateOut = WIRED } = {}) {
  const calls = [];
  const logs = [];
  const errors = [];
  const deps = {
    run: async (cmd, args, opts) => {
      calls.push({ kind: 'run', cmd, args });
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return { out: 'D:/break-time\n', err: '' };
      if (args[0] === 'status') return { out: porcelain, err: '' };
      if (args[0] === 'rev-parse') return { out: `${SHA}\n`, err: '' };
      throw new Error(`unexpected run ${cmd} ${args.join(' ')} ${JSON.stringify(opts ?? {})}`);
    },
    ssh: async (remote, opts) => {
      calls.push({ kind: 'ssh', remote });
      return { out: '__SSH_OK__\n', err: '' };
    },
    sshScript: async (path, args) => {
      calls.push({ kind: 'sshScript', path, args });
      if (String(path).replace(/\\/g, '/').endsWith('deploy/remote/state-check.sh')) return { out: stateOut, err: '' };
      throw new Error(`unexpected sshScript ${path}`);
    },
    startPoller: () => {
      calls.push({ kind: 'poller' });
      throw new Error('poller must not start');
    },
    checkDns: async () => {
      calls.push({ kind: 'dns' });
      throw new Error('dns must not run');
    },
    runSmoke: async () => {
      calls.push({ kind: 'smoke' });
      return [];
    },
    upload: async () => {
      calls.push({ kind: 'upload' });
      throw new Error('upload must not run');
    },
    log: (s) => logs.push(s),
    error: (s) => errors.push(s),
  };
  return { deps, calls, logs, errors };
}

describe('runDeploy guards (fake deps, no server)', () => {
  it('refuses unknown flags before doing anything', async () => {
    const f = fakeDeps();
    expect(await runDeploy(['--skip-tests'], f.deps)).toBe(1);
    expect(f.calls).toEqual([]);
    expect(f.errors.join('\n')).toContain('--skip-tests');
  });

  it('stops a dirty tree with exit 1 before any ssh step', async () => {
    const f = fakeDeps({ porcelain: '?? src/__dirty_probe.ts\n' });
    expect(await runDeploy(['--dry-run'], f.deps)).toBe(1);
    expect(f.errors.join('\n')).toContain('Cây làm việc chưa sạch — commit trước khi deploy');
    expect(f.calls.some((c) => c.kind !== 'run')).toBe(false);
    expect(f.logs.join('\n')).not.toContain('__SSH_OK__');
    const status = f.calls.find((c) => c.args?.[0] === 'status');
    expect(status.args).toContain('--untracked-files=all');
    for (const p of ['src', 'public', 'deploy', 'scripts', 'index.html', 'CREDITS.md']) expect(status.args).toContain(p);
  });

  it('exits 2 with the drift message at step 3 and never builds, uploads or polls', async () => {
    const f = fakeDeps({ stateOut: DRIFTED });
    expect(await runDeploy(['--dry-run'], f.deps)).toBe(2);
    expect(f.errors.join('\n')).toContain(DRIFT_MESSAGE);
    expect(f.logs.join('\n')).toContain('== STEP 3/17 server drift check');
    expect(f.logs.join('\n')).not.toContain('== STEP 4/17');
    expect(f.calls.map((c) => c.kind)).toEqual(['run', 'run', 'run', 'ssh', 'sshScript']);
  });

  it('fails (exit 1) when the state check output is truncated', async () => {
    const f = fakeDeps({ stateOut: WIRED.replace('\nEND=1', '') });
    expect(await runDeploy([], f.deps)).toBe(1);
    expect(f.logs.join('\n')).not.toContain('== STEP 4/17');
  });

  it('keeps the plan paths in the clean-tree guard', () => {
    for (const p of [
      'src',
      'index.html',
      'package.json',
      'package-lock.json',
      'vite.config.ts',
      'tsconfig.json',
      'tsconfig.node.json',
      'vitest.config.ts',
      'playwright.config.ts',
      'deploy',
      'scripts',
      'assets-src/build-assets.mjs',
      'assets-src/asset-map.json',
      'CREDITS.md',
    ]) {
      expect(CLEAN_PATHS).toContain(p);
    }
  });
});

describe('upload helpers', () => {
  it('validates the sha before building the remote command', () => {
    expect(() => uploadRemoteCommand('0123456789ab; rm -rf /')).toThrow(/sha/);
    expect(() => uploadRemoteCommand('')).toThrow(/sha/);
    const cmd = uploadRemoteCommand(SHA);
    expect(cmd).toContain(`.incoming-${SHA}`);
    expect(cmd).toContain('set -euo pipefail');
    expect(cmd).toContain('tar -xzf - --no-same-owner');
    expect(cmd).toContain('test -s "$I/index.html"');
    expect(cmd).toContain('__UPLOADED__');
  });

  it('parses the uploaded count and rejects missing markers', () => {
    expect(parseUploadedCount('noise\n__UPLOADED__ 22\n')).toBe(22);
    expect(parseUploadedCount('__UPLOADED__ \n')).toBeNaN();
    expect(parseUploadedCount('')).toBeNaN();
    expect(parseUploadedCount(undefined)).toBeNaN();
  });
});
