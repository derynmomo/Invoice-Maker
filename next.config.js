/** @type {import('next').NextConfig} */

// Mobile (Capacitor) builds use a fully static export so the app can be
// bundled and served from on-device storage. Normal `next build` keeps the
// server API route (PDF generation) for the hosted web app.
const isExport = process.env.EXPORT_BUILD === 'true';

const nextConfig = {
  reactStrictMode: true,
};

if (isExport) {
  nextConfig.output = 'export';
  nextConfig.images = { unoptimized: true };
  nextConfig.experimental = {
    // Voice notes can be a few MB; raise the body size limit for the
    // transcription route (App Router server actions / route handlers).
    serverActions: { bodySizeLimit: '10mb' },
  };
} else {
  nextConfig.experimental = {
    serverActions: { bodySizeLimit: '10mb' },
  };
}

module.exports = nextConfig;