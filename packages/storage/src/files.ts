/** 本文件负责 Tracelet 记录文件的安全读写和路径组织。 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** 根据运行时间生成稳定的日期目录。 */
export function dateKey(iso: string): string {
  return iso.slice(0, 10);
}

/** 计算一次运行的本地目录。 */
export function getRunDir(root: string, iso: string, runId: string): string {
  return join(root, "runs", dateKey(iso), runId);
}

/** 通过临时文件和 rename 原子写入 JSON。 */
export async function writeJson(path: string, value: unknown): Promise<void> {
  const temp = `${path}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temp, path);
}

/** 读取并解析一个 JSON 文件。 */
export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

/** 读取 JSONL，并忽略崩溃时可能残留的不完整尾行。 */
export async function readJsonl<T>(path: string): Promise<T[]> {
  let text = "";

  try {
    text = await readFile(path, "utf8");
  } catch {
    return [];
  }

  const rows: T[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) {
      continue;
    }

    try {
      rows.push(JSON.parse(line) as T);
    } catch {
      break;
    }
  }

  return rows;
}
