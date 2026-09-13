/** 本文件负责启动 agent 子进程并保持终端及退出信号一致。 */

import { spawn } from "node:child_process";
import type { LaunchInfo } from "./agents.js";

/** 启动 agent，并返回其最终退出码。 */
export async function spawnAgent(input: LaunchInfo): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      env: input.env,
      stdio: "inherit",
    });

    /** 把 Ctrl+C 转发给正在运行的 agent。 */
    function onSigint(): void {
      child.kill("SIGINT");
    }

    /** 把终止信号转发给正在运行的 agent。 */
    function onSigterm(): void {
      child.kill("SIGTERM");
    }

    /** 清理信号监听器，避免连续运行时重复触发。 */
    function cleanup(): void {
      process.off("SIGINT", onSigint);
      process.off("SIGTERM", onSigterm);
    }

    process.on("SIGINT", onSigint);
    process.on("SIGTERM", onSigterm);

    child.once("error", (error) => {
      cleanup();
      reject(error);
    });
    child.once("close", (code) => {
      cleanup();
      resolve(code ?? 1);
    });
  });
}
