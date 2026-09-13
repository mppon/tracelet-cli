/** 本文件负责配置 Tracelet CLI 的单文件构建产物。 */

import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/bin.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  bundle: true,
  clean: true,
  sourcemap: true,
  noExternal: [/^@tracelet\//],
  banner: {
    js: "#!/usr/bin/env node",
  },
});
