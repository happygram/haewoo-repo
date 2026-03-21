import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_DEV_API_PROXY || "http://127.0.0.1:3001";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      // 로컬 dev: /api → 백엔드 (프로덕션은 nginx 등에서 동일 출처로 처리)
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});

