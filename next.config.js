/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server build for Docker (.next/standalone).
  output: 'standalone',
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000'] },
  },
}

module.exports = nextConfig
