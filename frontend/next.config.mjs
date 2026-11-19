/** @type {import('next').NextConfig} */
const backend = process.env.BACKEND_URL || "http://127.0.0.1:8000";

const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Sembunyikan lencana "N" Next.js saat `npm run dev` (versi produksi memang tidak menampilkannya).
  devIndicators: false,
  // Semua /api/* diteruskan ke FastAPI sehingga cookie sesi tetap same-origin.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
  experimental: {
    // Chatbot dapat menunggu Gemini (retry + backoff) lebih dari 30 detik.
    proxyTimeout: 120_000,
  },
};

export default nextConfig;
