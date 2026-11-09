import { loadEnvironment, readConfig } from './config.js';
import { createStorage } from './storage.js';
import { createMessagingApp } from './app.js';

loadEnvironment();
const config = readConfig();
const storage = createStorage(config);
const repository = storage.repository;
await repository.ready();
const server = createMessagingApp({ config, repository }).listen(config.port, () => {
  console.info(JSON.stringify({ event: 'messaging_server_started', port: config.port, dryRun: config.dryRun }));
});
async function stop() { server.close(async () => { await storage.close(); process.exit(0); }); }
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
