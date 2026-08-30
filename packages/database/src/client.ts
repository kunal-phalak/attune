import { neonConfig, Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';

import * as schema from './schema';

neonConfig.webSocketConstructor = ws;

type AttuneDatabase = ReturnType<typeof createDatabase>;

interface DatabaseGlobal {
  attuneDatabase?: AttuneDatabase;
  attunePool?: Pool;
}

function createDatabase(pool: Pool) {
  return drizzle({ client: pool, schema });
}

function databaseGlobal(): typeof globalThis & DatabaseGlobal {
  return globalThis;
}

export function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getDatabase(): AttuneDatabase {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for authoritative Attune persistence.');
  }

  const root = databaseGlobal();
  root.attunePool ??= new Pool({ connectionString });
  root.attuneDatabase ??= createDatabase(root.attunePool);
  return root.attuneDatabase;
}
