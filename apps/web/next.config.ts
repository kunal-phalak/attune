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
  webpack(config, { isServer }) {
    if (isServer) {
      config.externals.push({
        bufferutil: 'commonjs bufferutil',
        'utf-8-validate': 'commonjs utf-8-validate',
      });
    }
    return config;
  },
};

export default nextConfig;
