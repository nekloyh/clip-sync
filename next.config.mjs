/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,

  // No `images` block: attachments are plain <img> tags pointing at our own
  // authenticated route, so next/image is not involved. The previous
  // `remotePatterns: [{ hostname: '**' }]` allowed the optimizer to be pointed
  // at any host on the internet for nothing in return.

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          // Room URLs are credentials for rooms without a PIN — keep them out
          // of crawlers and out of Referer headers.
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
