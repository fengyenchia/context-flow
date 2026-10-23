import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": `${import.meta.dirname}/src` } },
  test: {
    root: import.meta.dirname,
    include: ["src/**/*.test.{ts,tsx}", "src/**/*.spec.{ts,tsx}"],
  },
});
