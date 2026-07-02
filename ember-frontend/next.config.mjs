/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Native / heavy server-only packages must not be bundled by Next — keep
    // them external so they load from node_modules at runtime (required on Vercel).
    serverComponentsExternalPackages: ['pg', '@node-rs/argon2', '@anthropic-ai/sdk', 'rss-parser'],
  },
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }, { protocol: 'http', hostname: 'localhost' }] },
};
export default nextConfig;
