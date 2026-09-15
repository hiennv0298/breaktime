#!/usr/bin/env node
// scripts/deploy.mjs — `npm run deploy [-- --dry-run]` (PLAT-01, D-02, D-03, D-04, D-24).
// One command, fail-fast, in this order:
//    1 clean tree + sha        2 ssh preflight          3 server drift check (exit 2)
//    4 typecheck + vite build  5 precompress            6 size gate
//    7 vitest                  8 playwright + first-load 9 DNS preflight (--dry-run stops here)
//   10 doibung.com poller     11 tar-stream upload      12 atomic activate
//   13 site file (when changed) 14 cleanup keep 10      15 smoke
//   16 poller verdict         17 final state check + DEPLOY_OK
// Every external step needs rc 0 + expected marker + non-empty output (RESEARCH Pitfall 7).
// No flag skips tests or the drift check. deploy never runs the Caddy wiring (that is token-gated infra).
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, ssh, sshArgv, sshScript, SSH, TAR } from './lib/run.mjs';
import { STATE_KEYS, parseStateCheck, evaluateState, DRIFT_MESSAGE } from './lib/stateCheck.mjs';
import { startPoller } from './lib/poller.mjs';
import { validateSha, parseReleaseListing, selectReleasesToDelete } from './lib/releases.mjs';
import { checkDns } from './lib/dnsCheck.mjs';
import { runSmoke } from './lib/smoke.mjs';
import { nodeBin, GIT } from './lib/tools.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const STATE_CHECK = join(ROOT, 'deploy/remote/state-check.sh');
const RELEASE = join(ROOT, 'deploy/remote/release.sh');
const ACTIVATE_SITE = join(ROOT, 'deploy/remote/activate-site.sh');
const SITE_FILE = join(ROOT, 'deploy/caddy/breaktime.caddy');
const FIRST_LOAD = join(ROOT, 'test-results/first-load.json');
const HOST = 'breaktime.doibung.com';
const VPS_IP = '187.53.128.67';
const DOIBUNG = 'https://doibung.com/';
const KEEP = 10;
const TOTAL = 17;

// Everything that ends up in dist/ or decides whether a build may ship. Untracked files count too.
export const CLEAN_PATHS = [
  'src',
  'public',
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
  'tests',
  'assets-src/build-assets.mjs',
  'assets-src/asset-map.json',
  'CREDITS.md',
];

const EXIT = { ok: 0, fail: 1, drift: 2 };
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;

class DeployError extends Error {
  constructor(message, code = EXIT.fail) {
    super(message);
    this.code = code;
  }
}

const tail = (s, n = 40) => String(s ?? '').replace(ANSI_RE, '').trimEnd().split(/\r?\n/).slice(-n).join('\n');

/** Regular files under dir; a symlink or special entry is refused (tar would ship it, find -type f would not count it). */
export function listDistFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, ent.name);
      const st = lstatSync(p);
      if (st.isSymbolicLink()) throw new DeployError(`dist chứa symlink, không deploy: ${p}`);
      if (st.isDirectory()) walk(p);
      else if (st.isFile()) out.push(p);
      else throw new DeployError(`dist chứa entry không phải file thường: ${p}`);
    }
  };
  walk(dir);
  return out;
}

/** Remote half of the tar stream; SHA is validated before it is interpolated (T-01-07-02). */
export function uploadRemoteCommand(sha) {
  validateSha(sha);
  return (
    'set -euo pipefail; B=/srv/sites/breaktime/releases; ' +
    `I="$B/.incoming-${sha}"; ` +
    'test -d "$B"; test ! -L "$B"; rm -rf -- "$I"; mkdir -- "$I"; ' +
    'tar -xzf - --no-same-owner -C "$I"; test -s "$I/index.html"; chmod -R u=rwX,go=rX -- "$I"; ' +
    'echo "__UPLOADED__ $(find "$I" -type f | wc -l)"'
  );
}

/** Parse "__UPLOADED__ <n>" (last occurrence). */
export function parseUploadedCount(out) {
  const all = [...String(out ?? '').matchAll(/^__UPLOADED__ (\d+)\s*$/gm)];
  return all.length ? Number(all[all.length - 1][1]) : NaN;
}

/** tar -czf - -C dist . | ssh doibung '<remote>' — both exit codes, marker and count are checked by the caller. */
export function tarStreamUpload(remoteCmd, { sshCmd = SSH, sshArgs = sshArgv, timeoutMs = 600000 } = {}) {
  return new Promise((resolvePromise) => {
    const tar = spawn(TAR, ['-czf', '-', '-C', 'dist', '.'], { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const up = spawn(sshCmd, sshArgs(remoteCmd), { cwd: ROOT, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    let tarErr = '';
    let tarRc = null;
    let upRc = null;
    let spawnError = '';
    let done = 0;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      tar.kill();
      up.kill();
    }, timeoutMs);
    const finish = () => {
      done += 1;
      if (done < 2) return;
      clearTimeout(timer);
      resolvePromise({ tarRc, upRc, out, err, tarErr, spawnError, timedOut });
    };
    tar.stderr.setEncoding('utf8').on('data', (d) => (tarErr += d));
    up.stdout.setEncoding('utf8').on('data', (d) => (out += d));
    up.stderr.setEncoding('utf8').on('data', (d) => (err += d));
    up.stdin.on('error', (e) => (spawnError += `ssh stdin: ${e.message}; `));
    tar.on('error', (e) => (spawnError += `tar: ${e.message}; `));
    up.on('error', (e) => (spawnError += `ssh: ${e.message}; `));
    tar.stdout.pipe(up.stdin);
    tar.on('close', (code) => {
      tarRc = code;
      finish();
    });
    up.on('close', (code) => {
      upRc = code;
      if (tarRc === null) tar.kill();
      finish();
    });
  });
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Default dependencies; the local simulation replaces the server-facing ones. */
export function defaultDeps() {
  return {
    run,
    ssh,
    sshScript,
    startPoller,
    checkDns,
    runSmoke,
    upload: (remoteCmd) => tarStreamUpload(remoteCmd),
    log: (s) => console.log(s),
    error: (s) => console.error(s),
  };
}

/**
 * @param {string[]} args CLI args after the script name
 * @param {ReturnType<typeof defaultDeps>} deps
 * @returns {Promise<number>} exit code
 */
export async function runDeploy(args, deps = defaultDeps()) {
  const { log, error } = deps;
  const unknown = args.filter((a) => a !== '--dry-run');
  if (unknown.length > 0) {
    error(`DEPLOY_USAGE flag không hợp lệ: ${unknown.join(' ')} (chỉ có --dry-run; không flag nào bỏ qua test hay drift check)`);
    return EXIT.fail;
  }
  const dryRun = args.includes('--dry-run');
  const node = process.execPath;
  let stepNo = 0;
  let poller = null;
  let pollerReport = null;
  let uploadStarted = false;
  let activated = false;
  let SHA = '';
  const summary = {};

  const step = (n, name) => {
    stepNo = n;
    log(`== STEP ${n}/${TOTAL} ${name}`);
  };

  const cleanTree = async () => {
    const { out: top } = await deps.run(GIT, ['rev-parse', '--show-toplevel'], { cwd: ROOT, timeoutMs: 30000 });
    if (resolve(top.trim()).toLowerCase() !== ROOT.toLowerCase()) {
      throw new DeployError(`git toplevel ${top.trim()} không phải ${ROOT}`);
    }
    const { out } = await deps.run(
      GIT,
      ['status', '--porcelain', '--untracked-files=all', '--', ...CLEAN_PATHS],
      { cwd: ROOT, allowEmpty: true, timeoutMs: 60000 },
    );
    if (out.trim().length !== 0) {
      error(tail(out, 30));
      throw new DeployError('Cây làm việc chưa sạch — commit trước khi deploy');
    }
    const { out: head } = await deps.run(GIT, ['rev-parse', '--short=12', 'HEAD'], { cwd: ROOT, timeoutMs: 30000 });
    return validateSha(head.trim());
  };

  const stateCheck = async (requireSiteFrom) => {
    const { out } = await deps.sshScript(STATE_CHECK, [], { marker: 'END=1', timeoutMs: 60000 });
    const parsed = parseStateCheck(out);
    for (const k of STATE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(parsed.values, k)) log(`${k}=${parsed.values[k]}`);
    }
    if (!parsed.ok) {
      throw new DeployError(`STATE_CHECK_PARSE_FAIL missing=${parsed.missing.join(',') || '(none)'} (END=1 phải là dòng cuối)`);
    }
    const siteSha = parsed.values.SITE_FILE_SHA;
    if (siteSha !== '' && !/^[0-9a-f]{64}$/.test(siteSha)) {
      throw new DeployError(`SITE_FILE_SHA không hợp lệ: ${JSON.stringify(siteSha)}`);
    }
    const verdict = evaluateState(parsed.values, { requireSite: requireSiteFrom(parsed.values) });
    if (!verdict.pass) {
      for (const f of verdict.failures) error(`DRIFT ${f}`);
      error(DRIFT_MESSAGE);
      throw new DeployError('server drift', EXIT.drift);
    }
    log('STATE_CHECK_OK');
    return parsed.values;
  };

  const stopPoller = async () => {
    if (!poller || pollerReport) return pollerReport;
    pollerReport = await poller.stop();
    log(
      `POLLER ${DOIBUNG} count=${pollerReport.count} non200=${pollerReport.non200} maxConsecutiveNon200Ms=${pollerReport.maxConsecutiveNon200Ms}`,
    );
    return pollerReport;
  };

  try {
    // 1 ─ every deployed build maps to a commit (T-01-07-05)
    step(1, 'clean tree + sha');
    SHA = await cleanTree();
    log(`SHA=${SHA}`);

    // 2 ─ ssh reachable with host key verification on
    step(2, 'ssh preflight');
    const { out: sshOut } = await deps.ssh('echo __SSH_OK__', { marker: '__SSH_OK__', timeoutMs: 30000 });
    log(sshOut.trim());

    // 3 ─ drift check before anything is built or uploaded (D-02)
    step(3, 'server drift check');
    const state = await stateCheck((v) => v.SITE_FILE_SHA !== '');
    const firstActivation = state.SITE_FILE_SHA === '';

    // 4 ─ typecheck (tsc prints nothing on success: rc + listFilesOnly prove it ran) and build
    step(4, 'typecheck + build');
    const tsc = nodeBin('typescript', 'tsc');
    const vite = nodeBin('vite', 'vite');
    for (const project of ['tsconfig.json', 'tsconfig.node.json']) {
      await deps.run(node, [tsc, '--noEmit', '-p', project], { cwd: ROOT, allowEmpty: true, timeoutMs: 300000 });
    }
    const { out: listed } = await deps.run(node, [tsc, '--noEmit', '-p', 'tsconfig.json', '--listFilesOnly'], {
      cwd: ROOT,
      timeoutMs: 300000,
    });
    const listedFiles = listed.split(/\r?\n/).map((l) => l.trim().replace(/\\/g, '/'));
    if (!listedFiles.some((l) => l.endsWith('/src/main.ts'))) {
      throw new DeployError('tsc --listFilesOnly không liệt kê src/main.ts (typecheck không thật sự chạy)');
    }
    log(`TYPECHECK_OK files=${listedFiles.filter(Boolean).length}`);
    const buildStart = Date.now();
    const { out: buildOut } = await deps.run(node, [vite, 'build'], { cwd: ROOT, marker: 'built in', timeoutMs: 600000 });
    log(tail(buildOut, 4));
    const versionPath = join(DIST, 'version.json');
    if (!existsSync(join(DIST, 'index.html')) || !existsSync(versionPath)) {
      throw new DeployError('dist/index.html hoặc dist/version.json không có sau build');
    }
    const builtSha = JSON.parse(readFileSync(versionPath, 'utf8')).sha;
    if (builtSha !== SHA || statSync(versionPath).mtimeMs < buildStart - 2000) {
      throw new DeployError(`dist/version.json sha=${builtSha} không khớp HEAD ${SHA} hoặc là file cũ`);
    }
    log(`BUILD_OK version.json sha=${builtSha}`);

    // 5 ─ br/gz sidecars for Caddy precompressed
    step(5, 'precompress');
    const { out: preOut } = await deps.run(node, [join(ROOT, 'scripts/precompress.mjs')], {
      cwd: ROOT,
      marker: 'PRECOMPRESS_DONE',
      timeoutMs: 300000,
    });
    log(tail(preOut, 2));

    // 6 ─ TECH-02 hard gate
    step(6, 'size gate');
    const { out: sizeOut } = await deps.run(node, [join(ROOT, 'scripts/size-report.mjs'), '--gate'], {
      cwd: ROOT,
      marker: 'SIZE_GATE_OK',
      timeoutMs: 300000,
    });
    summary.dist = (/^DIST_FILES=.*$/m.exec(sizeOut) ?? [''])[0];
    log(summary.dist);
    log((/^SIZE_GATE_OK.*$/m.exec(sizeOut) ?? [''])[0]);

    // 7 ─ unit tests (D-24)
    step(7, 'vitest');
    const vitest = nodeBin('vitest', 'vitest');
    const vt = await deps.run(node, [vitest, 'run'], { cwd: ROOT, timeoutMs: 600000 });
    const vtText = (vt.out + '\n' + vt.err).replace(ANSI_RE, '');
    if (!/Test Files\s+\d+ passed/.test(vtText) || / failed/.test(vtText)) {
      error(tail(vtText, 30));
      throw new DeployError('vitest không báo "Test Files N passed" hoặc có " failed"');
    }
    log((/^\s*Test Files.*$/m.exec(vtText) ?? [''])[0].trim());
    log((/^\s*Tests\s.*$/m.exec(vtText) ?? [''])[0].trim());

    // 8 ─ e2e on the built dist (vite preview), then the first-load number from this run
    step(8, 'playwright + first-load');
    const pw = nodeBin('@playwright/test', 'playwright');
    const pwRes = await deps.run(node, [pw, 'test'], { cwd: ROOT, timeoutMs: 900000 });
    const pwText = (pwRes.out + '\n' + pwRes.err).replace(ANSI_RE, '');
    if (!pwText.includes(' passed') || pwText.includes(' failed')) {
      error(tail(pwText, 30));
      throw new DeployError('playwright không báo " passed" hoặc có " failed"');
    }
    log((/^\s*\d+ passed.*$/m.exec(pwText) ?? [' passed'])[0].trim());
    const { out: flOut } = await deps.run(node, [join(ROOT, 'scripts/size-report.mjs')], {
      cwd: ROOT,
      marker: 'FIRST_LOAD_TOTAL_RAW=',
      timeoutMs: 300000,
    });
    summary.firstLoad = (/^FIRST_LOAD_TOTAL_RAW=.*$/m.exec(flOut) ?? [''])[0];
    log(summary.firstLoad);
    if (!existsSync(FIRST_LOAD) || statSync(FIRST_LOAD).mtimeMs <= buildStart) {
      throw new DeployError('test-results/first-load.json không được ghi lại sau lần build này');
    }

    // 9 ─ DNS before any upload/site activation (Let's Encrypt failure limit, T-01-07-03)
    step(9, 'DNS preflight');
    const again = await cleanTree();
    if (again !== SHA) throw new DeployError(`HEAD đổi trong lúc deploy: ${SHA} -> ${again}`);
    const dns = await deps.checkDns(HOST, VPS_IP);
    log(`DNS ${HOST} ${JSON.stringify(dns.results)}`);
    if (!dns.ok) {
      throw new DeployError(`DNS ${HOST} chưa trỏ ${VPS_IP} trên cả 1.1.1.1 và 8.8.8.8 — tạo bản ghi A rồi chờ lan truyền`);
    }
    const localFiles = listDistFiles(DIST);
    if (localFiles.length === 0) throw new DeployError('dist rỗng');
    if (dryRun) {
      log(`DRY_RUN_OK ${SHA} files=${localFiles.length} (dừng trước poller/upload)`);
      return EXIT.ok;
    }

    // 10 ─ doibung.com must stay 200 from upload to smoke (PLAT-01)
    step(10, 'doibung.com poller');
    poller = deps.startPoller(DOIBUNG, { intervalMs: 1000 });
    log(`POLLER_STARTED ${DOIBUNG} every 1000 ms`);

    // 11 ─ tar stream over Windows OpenSSH; count must match (rc 0 with nothing uploaded fails)
    step(11, 'upload');
    uploadStarted = true;
    const up = await deps.upload(uploadRemoteCommand(SHA));
    const uploaded = parseUploadedCount(up.out);
    log(`UPLOAD tarRc=${up.tarRc} sshRc=${up.upRc} uploaded=${uploaded} local=${localFiles.length}`);
    if (up.timedOut || up.spawnError || up.tarRc !== 0 || up.upRc !== 0 || uploaded !== localFiles.length) {
      error(tail(`${up.spawnError}\n${up.tarErr}\n${up.err}\n${up.out}`, 30));
      throw new DeployError('upload thất bại (rc, marker __UPLOADED__ hoặc số file không khớp)');
    }
    log(`__UPLOADED__ ${uploaded}`);

    // 12 ─ atomic activation under flock
    step(12, 'activate');
    const { out: actOut } = await deps.sshScript(RELEASE, ['activate', SHA], {
      marker: `__ACTIVATED__ ${SHA}`,
      timeoutMs: 120000,
    });
    activated = true;
    if (!actOut.includes(`__CURRENT__ ${SHA}`) || !actOut.includes('__END__')) {
      throw new DeployError('activate thiếu __CURRENT__/__END__');
    }
    const listing = parseReleaseListing(actOut);
    if (!listing.some((r) => r.name === SHA)) throw new DeployError(`danh sách release không có ${SHA}`);
    log(`__ACTIVATED__ ${SHA} releases=${listing.length}`);

    // 13 ─ site file only when it differs (DNS was checked in step 9)
    step(13, 'site file');
    const siteText = readFileSync(SITE_FILE);
    if (siteText.includes(13)) throw new DeployError('deploy/caddy/breaktime.caddy có CRLF');
    const localSiteSha = sha256File(SITE_FILE);
    if (state.SITE_FILE_SHA === localSiteSha) {
      log(`SITE_FILE_UNCHANGED sha256=${localSiteSha}`);
    } else {
      await deps.ssh('cat > /srv/sites/.breaktime.caddy.new && sha256sum /srv/sites/.breaktime.caddy.new', {
        input: siteText,
        marker: localSiteSha,
        timeoutMs: 60000,
      });
      const { out: siteOut } = await deps.sshScript(ACTIVATE_SITE, [], { marker: '__SITE_RELOADED__', timeoutMs: 180000 });
      if (!siteOut.includes(`sha256=${localSiteSha}`)) throw new DeployError('__SITE_RELOADED__ sha256 không khớp file local');
      log(`__SITE_RELOADED__ sha256=${localSiteSha}`);
    }

    // 14 ─ retention: keep 10 newest + current; the server re-validates every name
    step(14, `cleanup keep ${KEEP}`);
    const names = selectReleasesToDelete(listing, KEEP, SHA);
    if (names.length === 0) {
      log('CLEANUP_NOTHING');
    } else {
      let cleanOut;
      try {
        ({ out: cleanOut } = await deps.sshScript(RELEASE, ['cleanup', SHA, ...names], {
          marker: '__CLEANUP__',
          timeoutMs: 120000,
        }));
      } catch (e) {
        if (e?.rc === 7 && String(e.out ?? '').includes('__CURRENT_MOVED__')) {
          error(tail(e.out, 5));
          throw new DeployError(`__CURRENT_MOVED__: current không còn trỏ vào releases/${SHA} — có deploy khác chạy song song; không xoá gì`);
        }
        throw e;
      }
      const m = /^__CLEANUP__ deleted=(\d+) skipped=(\d+)\s*$/m.exec(cleanOut);
      if (!m || Number(m[1]) + Number(m[2]) !== names.length) {
        throw new DeployError(`cleanup trả sai: ${tail(cleanOut, 5)} (đã gửi ${names.length} tên)`);
      }
      if (Number(m[2]) > 0) {
        error(`CLEANUP_WARN server bỏ qua ${m[2]} tên: ${[...cleanOut.matchAll(/^__SKIP__ (\S+)/gm)].map((x) => x[1]).join(' ')}`);
      }
      log(m[0]);
    }

    // 15 ─ smoke with default TLS verification
    step(15, 'smoke');
    const results = await deps.runSmoke({ sha: SHA, firstActivation });
    if (!Array.isArray(results) || results.length === 0) throw new DeployError('smoke không trả kết quả');
    for (const r of results) log(`SMOKE ${r.ok ? 'OK  ' : 'FAIL'} ${r.name} — ${r.detail}`);
    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) throw new DeployError(`smoke thất bại ${failed.length}/${results.length}`);

    // 16 ─ doibung.com never interrupted
    step(16, 'poller verdict');
    const rep = await stopPoller();
    if (rep.count === 0 || rep.non200 !== 0) {
      for (const s of rep.samples.filter((x) => x.status !== 200 || x.error).slice(0, 20)) {
        error(`POLLER_SAMPLE t=${new Date(s.t).toISOString()} status=${s.status ?? '-'} error=${s.error ?? ''}`);
      }
      throw new DeployError(`doibung.com không 200 suốt deploy: non200=${rep.non200} count=${rep.count}`);
    }

    // 17 ─ server still wired, now with the site live
    step(17, 'final state check');
    await stateCheck(() => true);
    log(`SUMMARY ${summary.dist} ${summary.firstLoad} poller=${rep.count}/${rep.count} 200`);
    log(`DEPLOY_OK ${SHA} https://${HOST}/ https://${HOST}/b/${SHA}/`);
    return EXIT.ok;
  } catch (e) {
    const code = e instanceof DeployError ? e.code : EXIT.fail;
    const msg = e instanceof DeployError ? e.message : `${e?.message ?? e}`;
    if (e?.out && !(e instanceof DeployError)) error(tail(e.out, 20));
    error(`DEPLOY_FAIL step=${stepNo}/${TOTAL} rc=${code} ${msg}`);
    if (uploadStarted && !activated && SHA) {
      try {
        const { out } = await deps.sshScript(RELEASE, ['abort', SHA], { marker: `__ABORTED__ ${SHA}`, timeoutMs: 60000 });
        log(tail(out, 2));
      } catch (abortErr) {
        error(`ABORT_FAILED ${abortErr?.message ?? abortErr}`);
      }
    }
    await stopPoller();
    return code;
  }
}

// Run only when executed directly (importing for tests/simulation has no side effects).
const samePath = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
const invokedDirectly =
  Boolean(process.argv[1]) && samePath(resolve(process.argv[1]), fileURLToPath(import.meta.url));
if (invokedDirectly) {
  runDeploy(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(`DEPLOY_FATAL ${e?.stack ?? e}`);
      process.exit(EXIT.fail);
    },
  );
}
