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
  webpack(config, { isServer, webpack }) {
    if (!isServer) {
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^(?:fs|module|path|url)$/,
          contextRegExp: /@salusoft89[/\\]planegcs[/\\]dist[/\\]planegcs_dist/,
        }),
      );
      config.module.rules.push({
        test: /planegcs_dist[/\\]planegcs\.js$/,
        parser: { url: false },
      });
    }
    return config;
  },
  serverExternalPackages: ['@neondatabase/serverless', '@salusoft89/planegcs'],
};

export default nextConfig;
