import { loadEnvironment, readConfig } from './config.js';
import { createPool, MessageRepository } from './repository.js';
import { createMessagingApp } from './app.js';

loadEnvironment();
const config = readConfig();
const pool = createPool(config);
const repository = new MessageRepository(pool);
await repository.ready();
const server = createMessagingApp({ config, repository }).listen(config.port, () => {
  console.info(JSON.stringify({ event: 'messaging_server_started', port: config.port, dryRun: config.dryRun }));
});
async function stop() { server.close(async () => { await pool.end(); process.exit(0); }); }
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
