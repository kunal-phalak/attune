import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'drizzle-kit';

const repositoryEnvironment = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env.local');
if (existsSync(repositoryEnvironment)) loadEnvFile(repositoryEnvironment);

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for Drizzle migrations.');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL },
  strict: true,
  verbose: true,
});
