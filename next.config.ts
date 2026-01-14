import type { NextConfig } from "next";
import packageJson from './package.json';

const nextConfig: NextConfig = {
  output: 'standalone',
  env: {
    APP_VERSION: packageJson.version,
  },
  // Set turbopack root to avoid lockfile warning
  turbopack: {
    root: process.cwd(),
  },
  // Add CORS headers for payload API routes
  async headers() {
    return [
      {
        // Match all payload API routes
        source: '/api/callback/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH' },
          { key: 'Access-Control-Allow-Headers', value: '*' },
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Max-Age', value: '86400' },
          { key: 'Access-Control-Allow-Private-Network', value: 'true' },
          { key: 'Access-Control-Expose-Headers', value: '*' },
        ],
      },
      {
        source: '/api/callback',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH' },
          { key: 'Access-Control-Allow-Headers', value: '*' },
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Max-Age', value: '86400' },
          { key: 'Access-Control-Allow-Private-Network', value: 'true' },
          { key: 'Access-Control-Expose-Headers', value: '*' },
        ],
      },
      {
        source: '/api/persist/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH' },
          { key: 'Access-Control-Allow-Headers', value: '*' },
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Max-Age', value: '86400' },
          { key: 'Access-Control-Allow-Private-Network', value: 'true' },
          { key: 'Access-Control-Expose-Headers', value: '*' },
        ],
      },
      {
        source: '/api/persist',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH' },
          { key: 'Access-Control-Allow-Headers', value: '*' },
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Max-Age', value: '86400' },
          { key: 'Access-Control-Allow-Private-Network', value: 'true' },
          { key: 'Access-Control-Expose-Headers', value: '*' },
        ],
      },
      {
        source: '/api/traffic/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH' },
          { key: 'Access-Control-Allow-Headers', value: '*' },
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Max-Age', value: '86400' },
          { key: 'Access-Control-Allow-Private-Network', value: 'true' },
          { key: 'Access-Control-Expose-Headers', value: '*' },
        ],
      },
      {
        source: '/api/traffic',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH' },
          { key: 'Access-Control-Allow-Headers', value: '*' },
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Max-Age', value: '86400' },
          { key: 'Access-Control-Allow-Private-Network', value: 'true' },
          { key: 'Access-Control-Expose-Headers', value: '*' },
        ],
      },
      {
        source: '/api/enumeration/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH' },
          { key: 'Access-Control-Allow-Headers', value: '*' },
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Max-Age', value: '86400' },
          { key: 'Access-Control-Allow-Private-Network', value: 'true' },
          { key: 'Access-Control-Expose-Headers', value: '*' },
        ],
      },
      {
        source: '/api/enumeration',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH' },
          { key: 'Access-Control-Allow-Headers', value: '*' },
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Max-Age', value: '86400' },
          { key: 'Access-Control-Allow-Private-Network', value: 'true' },
          { key: 'Access-Control-Expose-Headers', value: '*' },
        ],
      },
    ];
  },
};

export default nextConfig;
