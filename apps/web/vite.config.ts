import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  envDir: "../..",
  server: { port: 5173 },
  test: {
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["e2e/**", "node_modules/**", "dist/**", "test-results/**"],
  },
});
