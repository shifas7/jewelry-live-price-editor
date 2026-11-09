import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadEnvironment, readConfig } from '../src/config.js';

loadEnvironment();
const config = readConfig();
const parsed = new URL(config.databaseUrl);
if (config.databaseProvider !== 'mongodb' || parsed.protocol !== 'mongodb+srv:' ||
    !parsed.hostname.endsWith('.mongodb.net') || config.mongoDatabase !== 'bhima_messaging_staging') {
  throw new Error('Atlas tests require the dedicated bhima_messaging_staging database');
}
const result = spawnSync(process.execPath, ['--test', fileURLToPath(new URL('../test/mongo.integration.js', import.meta.url))], {
  encoding: 'utf8', windowsHide: true, timeout: 90000, maxBuffer: 1024 * 1024,
  env: { ...process.env, BHIMA_ATLAS_TEST: '1', TEST_MONGODB_URI: config.databaseUrl,
    TEST_MONGODB_DATABASE: config.mongoDatabase, TEST_MONGODB_PREFIX: `bhima_test_${randomBytes(8).toString('hex')}` },
});
const redact = value => String(value || '').split(config.databaseUrl).join('[REDACTED]');
process.stdout.write(redact(result.stdout)); process.stderr.write(redact(result.stderr));
if (result.error) console.error(`Atlas test process failed: ${result.error.code || result.error.name}`);
process.exitCode = result.status ?? 1;
