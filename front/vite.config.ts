import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, ".", "");

  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: Number(environment.FRONTEND_PORT ?? 5173),
      proxy: {
        "/api": environment.API_PROXY_TARGET ?? "http://127.0.0.1:3000",
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
    },
  };
});
