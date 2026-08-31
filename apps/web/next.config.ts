import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

import type { NextConfig } from 'next';

const workspaceEnvironment = resolve(process.cwd(), '../../.env.local');
if (existsSync(workspaceEnvironment)) {
  loadEnvFile(workspaceEnvironment);
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['@neondatabase/serverless', 'bufferutil', 'utf-8-validate', 'ws'],
};

export default nextConfig;
