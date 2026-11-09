import { loadEnvironment, readConfig } from '../src/config.js';
import { createStorage } from '../src/storage.js';

loadEnvironment();
const storage = createStorage(readConfig());
try { await storage.initialize(); console.info('Messaging database is ready.'); }
finally { await storage.close(); }
