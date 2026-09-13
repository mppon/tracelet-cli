/** 本文件负责确定 CLI 使用的数据目录和 Dashboard 构建目录。 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** 返回用户指定或默认的 Tracelet 数据目录。 */
export function dataDir(value?: string): string {
  return resolve(value ?? process.env.TRACELET_DATA_DIR ?? resolve(homedir(), ".tracelet", "data"));
}

/** 查找开发环境或构建产物中的 Dashboard 目录。 */
export function dashboardDir(): string {
  const bundled = fileURLToPath(new URL("./dashboard", import.meta.url));
  const workspace = resolve(process.cwd(), "apps/dashboard/dist");
  return existsSync(bundled) ? bundled : workspace;
}
