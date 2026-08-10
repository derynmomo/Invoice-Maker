/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Voice notes can be a few MB; raise the body size limit for the
  // transcription route (App Router server actions / route handlers).
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

module.exports = nextConfig;
