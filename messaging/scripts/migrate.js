import { loadEnvironment, readConfig } from '../src/config.js';
import { createPool, migrate } from '../src/repository.js';

loadEnvironment();
const pool = createPool(readConfig());
try { await migrate(pool); console.info('Messaging schema is ready.'); }
finally { await pool.end(); }
