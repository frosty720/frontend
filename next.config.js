/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Temporarily disabled to debug console errors
  typescript: {
    // Allow production builds to complete even if there are TypeScript errors
    // This is needed because wagmi 2.19+ has breaking type changes for custom connectors
    ignoreBuildErrors: true,
  },
  async rewrites() {
    // Only use rewrites in development
    if (process.env.NODE_ENV === 'development') {
      return [
        {
          source: '/api/:path*',
          destination: 'http://localhost:3000/api/:path*', // Proxy to backend
        },
      ];
    }
    return [];
  },
};

module.exports = nextConfig;

