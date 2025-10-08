import { defineConfig } from "vitest/config";
import path from "path";

const root = process.cwd();

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: path.resolve(root, "src/$1") },
      { find: /^@domain\/(.*)$/, replacement: path.resolve(root, "src/app/domain/$1") },
      { find: /^@application\/(.*)$/, replacement: path.resolve(root, "src/app/application/$1") },
      { find: /^@infra\/(.*)$/, replacement: path.resolve(root, "src/app/infra/$1") },
      { find: /^@presentation\/(.*)$/, replacement: path.resolve(root, "src/presentation/$1") },
      { find: /^@shared\/(.*)$/, replacement: path.resolve(root, "src/shared/$1") },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    pool: "threads",
    dir: "tests",
  },
});


