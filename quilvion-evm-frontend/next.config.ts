// next.config.ts
const nextConfig = {
  // ...existing config...
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
};