/** @type {import('next').NextConfig} */
const nextConfig = {
  // @jusqs/types é publicado como TypeScript cru, sem build step.
  transpilePackages: ['@jusqs/types'],
};

export default nextConfig;
