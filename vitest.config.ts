import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/application/global-setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/app/domain/**/*"],
    },
  },
  resolve: {
    alias: {
      "@/": path.resolve(__dirname, "src/"),
      "@domain": path.resolve(__dirname, "src/app/domain"),
      "@infra": path.resolve(__dirname, "src/app/infra"),
      "@application": path.resolve(__dirname, "src/app/application"),
      "@presentation": path.resolve(__dirname, "src/presentation"),
      "@shared": path.resolve(__dirname, "src/shared"),
    },
  },
})


