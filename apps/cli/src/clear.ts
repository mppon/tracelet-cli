/** 本文件负责安全清除 Tracelet 已记录的全部运行与会话数据。 */

import { mkdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, parse, resolve } from "node:path";

/** 校验数据目录并返回其运行记录目录。 */
function runsDir(root: string): string {
  const data = resolve(root);

  // 禁止将文件系统根目录或用户目录直接作为清理目标。
  if (data === parse(data).root || data === resolve(homedir())) {
    throw new Error(`Refusing to clear unsafe data directory: ${data}`);
  }

  return join(data, "runs");
}

/** 删除全部运行记录，并重新创建空的运行记录目录。 */
export async function clearData(root: string): Promise<void> {
  const runs = runsDir(root);

  // 只删除 runs，保留数据根目录及其中可能存在的其他文件。
  await rm(runs, { recursive: true, force: true });
  await mkdir(runs, { recursive: true });
}
