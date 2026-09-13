/** 本文件负责管理 run 与 exchange 的目录生命周期。 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { ExchangeMeta, RunMeta } from "@tracelet/shared";
import { getRunDir, writeJson } from "./files.js";
import { ExchangeWriter } from "./writer.js";

export class FileStore {
  readonly root: string;
  private readonly runs = new Map<string, string>();

  /** 创建指定数据目录的文件存储。 */
  constructor(root: string) {
    this.root = root;
  }

  /** 初始化存储根目录。 */
  async init(): Promise<void> {
    await mkdir(join(this.root, "runs"), { recursive: true });
  }

  /** 创建一次运行记录并返回其目录。 */
  async startRun(run: RunMeta): Promise<string> {
    const dir = getRunDir(this.root, run.startedAt, run.id);
    this.runs.set(run.id, dir);
    await writeJson(join(dir, "run.json"), run);
    return dir;
  }

  /** 更新一次运行的结束状态。 */
  async finishRun(run: RunMeta): Promise<void> {
    const dir = this.runs.get(run.id) ?? getRunDir(this.root, run.startedAt, run.id);
    await writeJson(join(dir, "run.json"), run);
  }

  /** 为一次模型请求创建独立的追加写入器。 */
  async startExchange(meta: ExchangeMeta): Promise<ExchangeWriter> {
    const runDir = this.runs.get(meta.runId);
    if (!runDir) {
      throw new Error(`运行不存在：${meta.runId}`);
    }

    const writer = new ExchangeWriter(join(runDir, "exchanges", meta.id), meta);
    await writer.init();
    return writer;
  }
}
