import { createPool, migrate, MessageRepository } from './repository.js';
import { createMongoStorage } from './mongo-repository.js';

export function createStorage(config, logger = console) {
  if (config.databaseProvider === 'mongodb') return createMongoStorage(config);
  const pool = createPool(config);
  pool.on('error', () => logger.error(JSON.stringify({ event: 'messaging_database_error' })));
  return { repository: new MessageRepository(pool), initialize: () => migrate(pool), close: () => pool.end() };
}
