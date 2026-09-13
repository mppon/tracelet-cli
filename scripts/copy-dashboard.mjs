/** 本文件负责把 Dashboard 构建产物复制到 CLI 发布目录。 */

import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "apps/dashboard/dist");
const target = resolve(root, "apps/cli/dist/dashboard");

/** 将最新 Dashboard 静态资源复制到 CLI 构建目录。 */
async function copyDashboard() {
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await cp(source, target, { recursive: true });
}

await copyDashboard();
