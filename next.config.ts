import type { NextConfig } from "next";

function isTruthy(value: string | undefined): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: [
    "carbon-gen.shopcarbon.com",
    "carbon-gen.shopcarbon.co",
    "carbon-gen.shopcarbon12.workers.dev",
    "app.shopcarbon.com",
  ],
  async headers() {
    const isProd = process.env.NODE_ENV === "production";
    const csp = [
      "default-src 'self'",
      "img-src 'self' data: blob: https:",
      isProd
        ? "script-src 'self' 'unsafe-inline'"
        : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
      // Allow local-network printer endpoints (http://<LAN-IP>/pstprnt) from HTTPS app pages.
      isProd ? "connect-src 'self' http: https:" : "connect-src 'self' ws: http: https:",
      "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;

const enableOpenNextCloudflareDev =
  process.env.NODE_ENV === "development" &&
  !process.env.VERCEL &&
  isTruthy(process.env.OPENNEXT_CLOUDFLARE_DEV);

if (enableOpenNextCloudflareDev) {
  import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());
}
