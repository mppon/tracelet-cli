/** 本文件负责配置 Tracelet 的单元测试与集成测试。 */

import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@tracelet/protocols": fileURLToPath(new URL("./packages/protocols/src/index.ts", import.meta.url)),
      "@tracelet/proxy": fileURLToPath(new URL("./packages/proxy/src/index.ts", import.meta.url)),
      "@tracelet/recorder": fileURLToPath(new URL("./packages/recorder/src/index.ts", import.meta.url)),
      "@tracelet/server": fileURLToPath(new URL("./packages/server/src/index.ts", import.meta.url)),
      "@tracelet/shared": fileURLToPath(new URL("./packages/shared/src/index.ts", import.meta.url)),
      "@tracelet/storage": fileURLToPath(new URL("./packages/storage/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 10_000,
  },
});
