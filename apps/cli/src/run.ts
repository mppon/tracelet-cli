/** 本文件负责组合本地服务、运行记录与 agent 子进程生命周期。 */

import type { AgentType, RunMeta } from "@tracelet/shared";
import { makeId, nowIso } from "@tracelet/shared";
import { TraceletServer } from "@tracelet/server";
import { agents } from "./agents.js";
import { dashboardDir, dataDir } from "./paths.js";
import { loadSettings, proxyMode } from "./settings.js";
import { spawnAgent } from "./spawn.js";
import { systemProxy } from "./system-proxy.js";

export interface RunOptions {
  port: number;
  dataDir?: string;
}

/** 启动 Tracelet 服务和指定 agent，并在退出前完成记录落盘。 */
export async function runAgent(agentId: AgentType, args: string[], options: RunOptions): Promise<number> {
  const adapter = agents[agentId];
  if (!(await adapter.detect())) {
    throw new Error(`${adapter.label} command not found: ${adapter.command}`);
  }

  const settings = await loadSettings();
  const mode = proxyMode(settings, agentId);
  // 仅在启用且成功发现系统代理时传递代理地址，否则保持原有直连行为。
  const proxy = mode === "system" ? await systemProxy() : undefined;
  if (mode === "system" && !proxy) {
    console.warn("System proxy not found. Using a direct connection.");
  }

  const server = new TraceletServer({
    dataDir: dataDir(options.dataDir),
    dashboardDir: dashboardDir(),
  });
  await server.listen(options.port);

  const run: RunMeta = {
    id: makeId("run"),
    agent: adapter.id,
    cwd: process.cwd(),
    command: adapter.command,
    startedAt: nowIso(),
  };
  const proxyUrl = await server.addRun(run, adapter.protocol, await adapter.upstream(), proxy);

  console.log(`Tracelet Dashboard: ${server.url()}`);
  console.log(`Starting ${adapter.label}...`);

  let exitCode = 1;
  try {
    exitCode = await spawnAgent(adapter.launch(proxyUrl, args));
    return exitCode;
  } finally {
    await server.finishRun({ ...run, endedAt: nowIso(), exitCode });
    await server.close();
  }
}

/** 启动只读 Dashboard 服务，直到用户发送终止信号。 */
export async function runDashboard(options: RunOptions): Promise<void> {
  const server = new TraceletServer({
    dataDir: dataDir(options.dataDir),
    dashboardDir: dashboardDir(),
  });
  await server.listen(options.port);
  console.log(`Tracelet Dashboard: ${server.url()}`);

  await new Promise<void>((resolve) => {
    /** 收到退出信号后结束等待。 */
    function stop(): void {
      resolve();
    }

    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });

  await server.close();
}
