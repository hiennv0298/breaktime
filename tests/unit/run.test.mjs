import { describe, it, expect } from 'vitest';
import { run, SSH, TAR } from '../../scripts/lib/run.mjs';

const NODE = process.execPath;

describe('run(): rc + marker + output length are all required', () => {
  it('rejects rc=0 with empty output by default (rc=0 is not proof)', async () => {
    await expect(run(NODE, ['-e', 'process.exit(0)'])).rejects.toThrow(/empty output/);
  });

  it('resolves rc=0 with empty output only when allowEmpty is set', async () => {
    const r = await run(NODE, ['-e', 'process.exit(0)'], { allowEmpty: true });
    expect(r.out).toBe('');
  });

  it('rejects when the required marker is missing even though rc=0 and output exists', async () => {
    await expect(run(NODE, ['-e', "console.log('x')"], { marker: '__OK__' })).rejects.toThrow(
      /marker __OK__ missing/,
    );
  });

  it('rejects a non-zero exit code and reports rc', async () => {
    await expect(run(NODE, ['-e', 'process.exit(3)'], { allowEmpty: true })).rejects.toThrow(/rc=3/);
  });

  it('attaches the full stdout and rc to the rejection so callers can recover markers', async () => {
    const err = await run(NODE, ['-e', "console.log('BACKUP_DIR=/x');process.exit(30)"]).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.rc).toBe(30);
    expect(err.out).toContain('BACKUP_DIR=/x');
  });

  it('resolves when rc=0, output non-empty and marker present', async () => {
    const r = await run(NODE, ['-e', "console.log('__OK__')"], { marker: '__OK__' });
    expect(r.out).toContain('__OK__');
  });

  it('rejects (never resolves) when the command does not exist', async () => {
    await expect(run('definitely-not-a-real-command-bt-4242', [])).rejects.toThrow();
  });

  it('passes stdin input to the child', async () => {
    const r = await run(
      NODE,
      ['-e', "process.stdin.on('data',d=>process.stdout.write(String(d).toUpperCase()))"],
      { input: 'hello', marker: 'HELLO' },
    );
    expect(r.out).toBe('HELLO');
  });

  it('kills the child and rejects on timeout', async () => {
    await expect(
      run(NODE, ['-e', 'setTimeout(()=>{},10000)'], { timeoutMs: 300, allowEmpty: true }),
    ).rejects.toThrow(/timeout after 300 ms/);
  });

  it('exports SSH and TAR executable paths as non-empty strings', () => {
    expect(typeof SSH).toBe('string');
    expect(SSH.length).toBeGreaterThan(0);
    expect(typeof TAR).toBe('string');
    expect(TAR.length).toBeGreaterThan(0);
  });
});
