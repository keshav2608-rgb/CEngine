import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/** Identifies this build; the service worker is registered per build so deploys trigger updates. */
const buildId = process.env.BUILD_ID || Date.now().toString(36);

function origin(url: string | undefined, fallback: string): string {
  try {
    return new URL(url || fallback).origin;
  } catch {
    return fallback;
  }
}

const apiOrigin = origin(process.env.NEXT_PUBLIC_API_URL, "http://localhost:5000");
const socketOrigin = origin(process.env.NEXT_PUBLIC_SOCKET_URL, apiOrigin);
const wsOrigin = socketOrigin.replace(/^http/, "ws");
// Where uploaded (encrypted) files and avatars are served from when using S3/R2 storage
const storageOrigin = process.env.NEXT_PUBLIC_STORAGE_URL
  ? origin(process.env.NEXT_PUBLIC_STORAGE_URL, apiOrigin)
  : "";
// HTTPS-only rules apply to real deployments (an https API), not to a local production build
const httpsDeploy = !isDev && apiOrigin.startsWith("https:");

/*
 * Content Security Policy. The app uses Partial Prerendering, which rules out per-request
 * nonces, so inline scripts are allowed (Next's hydration data and the theme boot script);
 * everything else is locked to this origin plus the API/socket server. This keeps the
 * page (and the encryption keys it holds) from loading or sending data anywhere else.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // blob: for decrypted images/files, data: for small inline assets
  `img-src 'self' blob: data: ${apiOrigin} ${storageOrigin}`.trim(),
  `media-src 'self' blob: ${apiOrigin} ${storageOrigin}`.trim(),
  "font-src 'self'",
  `connect-src 'self' ${apiOrigin} ${socketOrigin} ${wsOrigin} ${storageOrigin}`.trim(),
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(httpsDeploy ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Don't leak chat URLs to sites opened from links in messages
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  ...(httpsDeploy
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000" }]
    : []),
];

const nextConfig: NextConfig = {
  /* config options here */
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      {
        // The worker script must always be revalidated, or updates would be delayed
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
