import { defineConfig } from "vitest/config";

// https://vitejs.dev/config/
export default defineConfig({
  test: {
    include: ["tests/**/**.{test,spec}.{tsx,ts}"],
    passWithNoTests: true,
  },
  plugins: [],
});
