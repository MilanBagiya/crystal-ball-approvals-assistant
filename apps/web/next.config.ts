import type { NextConfig } from 'next';

// The browser only ever talks to the Next origin; /api/* is proxied to Express,
// so there's no CORS setup and the API key never reaches the client.
const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  transpilePackages: ['@approvals/contracts'],
  // Don't let `next dev` write an AGENTS.md into the repo.
  agentRules: false,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;
