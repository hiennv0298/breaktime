// scripts/lib/run.mjs — every external step must prove itself:
// exit code 0 AND the expected marker AND non-empty output (rc=0 alone is not proof).
// RESEARCH Pattern 13 / Pitfall 7. Never shell:true, never StrictHostKeyChecking off.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

export const SSH =
  process.platform === 'win32' && existsSync('C:/Windows/System32/OpenSSH/ssh.exe')
    ? 'C:/Windows/System32/OpenSSH/ssh.exe'
    : 'ssh';
export const TAR =
  process.platform === 'win32' && existsSync('C:/Windows/System32/tar.exe')
    ? 'C:/Windows/System32/tar.exe'
    : 'tar';

const SSH_HOST = 'doibung';
const SAFE_ARG = /^[A-Za-z0-9._\/=:-]+$/;

function tail(text, max = 2000) {
  const s = String(text ?? '');
  return s.length > max ? '…' + s.slice(-max) : s;
}

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ input?: string|Buffer, marker?: string, minOut?: number, allowEmpty?: boolean,
 *           timeoutMs?: number, cwd?: string, echo?: boolean }} [opts]
 * @returns {Promise<{ out: string, err: string }>}
 */
export function run(cmd, args, opts = {}) {
  const { input, marker, minOut = 1, allowEmpty = false, timeoutMs, cwd, echo = false } = opts;
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      fn(value);
    };

    let p;
    try {
      p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, cwd });
    } catch (e) {
      finish(reject, new Error(`${cmd}: spawn failed: ${e.message}`));
      return;
    }

    let out = '';
    let err = '';
    p.stdout.setEncoding('utf8');
    p.stderr.setEncoding('utf8');
    p.stdout.on('data', (d) => {
      out += d;
      if (echo) process.stdout.write(d);
    });
    p.stderr.on('data', (d) => {
      err += d;
      if (echo) process.stderr.write(d);
    });
    p.on('error', (e) => finish(reject, new Error(`${cmd}: spawn error: ${e.message}`)));
    // Ignore EPIPE when the child exits before reading stdin; close handler reports the real rc.
    p.stdin.on('error', () => {});

    if (timeoutMs) {
      timer = setTimeout(() => {
        try {
          p.kill();
        } catch {
          /* already gone */
        }
        finish(reject, new Error(`${cmd}: timeout after ${timeoutMs} ms\n${tail(err)}`));
      }, timeoutMs);
    }

    p.on('close', (code, signal) => {
      if (code !== 0) {
        return finish(
          reject,
          new Error(`${cmd} rc=${code}${signal ? ` signal=${signal}` : ''}\n${tail(err)}\n${tail(out, 1000)}`),
        );
      }
      if (!allowEmpty && out.trim().length < minOut) {
        return finish(reject, new Error(`${cmd}: empty output (rc=0 is not proof)\n${tail(err)}`));
      }
      if (marker && !out.includes(marker)) {
        return finish(reject, new Error(`${cmd}: marker ${marker} missing\n${tail(out)}\n${tail(err)}`));
      }
      finish(resolve, { out, err });
    });

    if (input !== undefined && input !== null) p.stdin.end(input);
    else p.stdin.end();
  });
}

/** Run one command on the VPS. Host key verification stays on (known_hosts). */
export function ssh(remoteCmd, opts) {
  return run(SSH, ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', SSH_HOST, remoteCmd], opts);
}

/**
 * Send a local bash script over stdin to `bash -s -- ...args`.
 * Args are restricted to a safe charset so nothing can be injected into the remote shell.
 */
export function sshScript(localPath, args = [], opts = {}) {
  for (const a of args) {
    if (typeof a !== 'string' || !SAFE_ARG.test(a)) {
      throw new Error(`sshScript: unsafe argument rejected: ${JSON.stringify(a)}`);
    }
  }
  const body = readFileSync(localPath, 'utf8').replace(/\r\n/g, '\n');
  if (body.trim().length === 0) throw new Error(`sshScript: ${localPath} is empty`);
  const remote = ['bash -s --', ...args].join(' ');
  return ssh(remote, { ...opts, input: body });
}
