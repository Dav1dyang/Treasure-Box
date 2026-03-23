import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
      { protocol: 'https', hostname: 'storage.googleapis.com' },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/embed/b/:boxId/widget.js',
        destination: '/embed/widget.js',
      },
    ];
  },
};

export default nextConfig;
