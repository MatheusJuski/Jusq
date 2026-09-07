/** @type {import('next').NextConfig} */
const nextConfig = {
  // @jusqs/types é publicado como TypeScript cru, sem build step.
  transpilePackages: ['@jusqs/types'],

  eslint: {
    // O lint do monorepo é um só, na raiz, e roda por `pnpm lint`. O `next
    // build` procuraria uma config dentro de `apps/web`, não acharia, e
    // avisaria a cada build sobre um plugin que já está configurado.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
