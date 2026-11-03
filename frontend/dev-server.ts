import type { ServerOptions } from "vite";

export function developmentServer(
  env: NodeJS.ProcessEnv,
): Pick<ServerOptions, "proxy" | "allowedHosts"> {
  const name = env.CODESPACE_NAME;
  const domain = env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  const host = name && domain ? `${name}-5174.${domain}` : null;
  return {
    // Allow this Codespace only. Do not accept every external hostname.
    allowedHosts: host ? [host] : [],
    proxy: {
      "/api": {
        target: env.DREAMCRAFT_API_PROXY_TARGET || "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  };
}
