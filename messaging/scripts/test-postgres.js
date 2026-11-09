import { mkdtemp, realpath, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import net from 'node:net';
import pg from 'pg';
import { fileURLToPath } from 'node:url';

// A separate temporary cluster is used; the installed PostgreSQL service and its
// databases are never connected to, stopped, migrated, or otherwise modified.
const tempBase = await realpath(tmpdir());
const root = await mkdtemp(join(tempBase, 'bhima-messaging-test-'));
const data = join(root, 'data');
const password = randomBytes(24).toString('hex');
const passwordFile = join(root, 'password');
await writeFile(passwordFile, password, { mode: 0o600 });
const pgBin = process.env.PG_BIN;
const command = name => pgBin ? join(pgBin, `${name}${process.platform === 'win32' ? '.exe' : ''}`) : name;
function run(name, args, timeout = 30000) {
  const result = spawnSync(command(name), args, { encoding: 'utf8', windowsHide: true, timeout });
  if (result.status !== 0) throw new Error(`${name} failed: ${(result.stderr || result.error?.message || result.stdout || '').slice(-700)}`);
}
const probe = net.createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
let started = false;
try {
  run('initdb', ['-D', data, '-U', 'bhima_test', '--auth=scram-sha-256', '--pwfile', passwordFile, '--encoding=UTF8', '--no-locale']);
  run('pg_ctl', ['-D', data, '-l', join(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']);
  started = true;
  const url = new URL(`postgresql://bhima_test:${password}@127.0.0.1:${port}/postgres`);
  const pool = new pg.Pool({ connectionString: url.toString() });
  const database = `bhima_test_${randomBytes(8).toString('hex')}`;
  try { await pool.query(`CREATE DATABASE "${database}"`); }
  finally { await pool.end(); }
  url.pathname = `/${database}`;
  const result = spawnSync(process.execPath, ['--test', fileURLToPath(new URL('../test/repository.integration.js', import.meta.url))], {
    stdio: 'inherit', windowsHide: true, timeout: 60000,
    env: { ...process.env, BHIMA_TEMP_PG: '1', TEST_DATABASE_URL: url.toString() },
  });
  process.exitCode = result.status ?? 1;
} finally {
  let stopped = !started;
  if (started) {
    try { run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']); stopped = true; }
    catch { console.error('Temporary PostgreSQL could not stop; its test files were preserved.'); }
  }
  if (stopped) {
    const target = await realpath(root);
    if (dirname(target) !== tempBase || !basename(target).startsWith('bhima-messaging-test-') || resolve(target) === resolve(tempBase)) {
      throw new Error('Refusing cleanup outside the generated temporary test directory');
    }
    await rm(target, { recursive: true, force: true });
  }
}
