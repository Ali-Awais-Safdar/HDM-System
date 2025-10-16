import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/app/domain/**/*"],
    },
  },
  resolve: {
    alias: {
      "@domain": path.resolve(__dirname, "src/app/domain"),
    },
  },
})


