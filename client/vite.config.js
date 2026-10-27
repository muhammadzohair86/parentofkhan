import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      // Forward /api to the Express server so the browser never needs CORS in development.
      proxy: { "/api": { target: env.VITE_PROXY_TARGET || "http://localhost:5000", changeOrigin: true } },
    },
  };
});
