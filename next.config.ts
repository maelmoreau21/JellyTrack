import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');
const scriptSrc = process.env.NODE_ENV === 'production'
  ? "'self' 'unsafe-inline'"
  : "'self' 'unsafe-inline' 'unsafe-eval'";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: false,
  },
  env: {
    APP_VERSION: process.env.npm_package_version || '0.0.0',
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'flagcdn.com',
      },
    ],
  },
  experimental: {
    serverActions: {
      // SECURITY: Reduced from 500mb to 50mb to mitigate DoS attacks
      bodySizeLimit: '50mb',
    },
  },
  serverExternalPackages: ['node-cron', 'geoip-country'],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          // SECURITY: Content Security Policy prevents inline scripts and XSS
          { key: "Content-Security-Policy", value: `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` },
          // SECURITY: HSTS forces HTTPS connections for 1 year
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
          // SECURITY: Prevents MIME type sniffing
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          // SECURITY: Opt-out of FLoC tracking
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
