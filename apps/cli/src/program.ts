/** 本文件负责定义 Commander 命令和无参数时的交互菜单。 */

import { select } from "@inquirer/prompts";
import type { AgentType } from "@tracelet/shared";
import { Command, Option } from "commander";
import { agents } from "./agents.js";
import { runAgent, runDashboard, type RunOptions } from "./run.js";

/** 将端口字符串转换为合法整数。 */
function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`无效端口：${value}`);
  }
  return port;
}

/** 从 Commander 根命令读取共享运行参数。 */
function getOptions(program: Command): RunOptions {
  const options = program.opts<{ port: number; dataDir?: string }>();
  return {
    port: options.port,
    ...(options.dataDir ? { dataDir: options.dataDir } : {}),
  };
}

/** 展示可用 agent 菜单并运行用户选择项。 */
async function interactive(program: Command): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new Error("非交互环境请使用 tracelet claude 或 tracelet codex。");
  }

  const [claudeReady, codexReady] = await Promise.all([
    agents.claude.detect(),
    agents.codex.detect(),
  ]);
  const agent = await select<AgentType>({
    message: "请选择要追踪的 Agent",
    choices: [
      {
        name: "Claude Code",
        value: "claude",
        ...(!claudeReady ? { disabled: "未检测到 claude 命令" } : {}),
      },
      {
        name: "Codex",
        value: "codex",
        ...(!codexReady ? { disabled: "未检测到 codex 命令" } : {}),
      },
    ],
  });
  process.exitCode = await runAgent(agent, [], getOptions(program));
}

/** 创建并配置 Tracelet Commander 程序。 */
export function createProgram(): Command {
  const program = new Command();
  program
    .name("tracelet")
    .description("记录 Claude Code 与 Codex 的 LLM 请求和流式响应")
    .version("0.1.0")
    .enablePositionalOptions()
    .addOption(new Option("-p, --port <port>", "本地服务端口").default(4318).argParser(parsePort))
    .option("--data-dir <path>", "本地记录目录")
    .action(() => interactive(program));

  for (const agentId of ["claude", "codex"] as const) {
    program
      .command(`${agentId} [args...]`)
      .description(`启动并记录 ${agents[agentId].label}`)
      .allowUnknownOption()
      .passThroughOptions()
      .action(async (args: string[]) => {
        process.exitCode = await runAgent(agentId, args, getOptions(program));
      });
  }

  program
    .command("dashboard")
    .description("查看本地 Tracelet 历史记录")
    .action(() => runDashboard(getOptions(program)));

  return program;
}
