/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
  serverExternalPackages: ['pdf-parse', 'mammoth', 'word-extractor'],
};

export default nextConfig;
