/** 本文件负责定义 Commander 命令和无参数时的交互菜单。 */

import { confirm, select } from "@inquirer/prompts";
import type { AgentType } from "@tracelet/shared";
import { Command, Option } from "commander";
import { agents } from "./agents.js";
import { clearData } from "./clear.js";
import { dataDir } from "./paths.js";
import { runAgent, runDashboard, type RunOptions } from "./run.js";

/** 将端口字符串转换为合法整数。 */
function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`Invalid port: ${value}`);
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
    throw new Error("Use tracelet claude or tracelet codex in a non-interactive environment.");
  }

  const [claudeReady, codexReady] = await Promise.all([
    agents.claude.detect(),
    agents.codex.detect(),
  ]);
  const agent = await select<AgentType>({
    message: "Select an agent to trace",
    choices: [
      {
        name: "Claude Code",
        value: "claude",
        ...(!claudeReady ? { disabled: "claude command not found" } : {}),
      },
      {
        name: "Codex",
        value: "codex",
        ...(!codexReady ? { disabled: "codex command not found" } : {}),
      },
    ],
  });
  process.exitCode = await runAgent(agent, [], getOptions(program));
}

/** 确认后清除当前数据目录中的全部历史记录。 */
async function clearRecords(program: Command, yes: boolean): Promise<void> {
  const root = dataDir(getOptions(program).dataDir);

  if (!yes) {
    if (!process.stdin.isTTY) {
      throw new Error("Use tracelet clear --yes in a non-interactive environment.");
    }

    const accepted = await confirm({
      message: `This will permanently delete all Tracelet records in ${root}. Continue?`,
      default: false,
    });
    if (!accepted) {
      console.log("Clear cancelled.");
      return;
    }
  }

  await clearData(root);
  console.log(`All Tracelet records cleared: ${root}`);
}

/** 创建并配置 Tracelet Commander 程序。 */
export function createProgram(): Command {
  const program = new Command();
  program
    .name("tracelet")
    .description("Record LLM requests and streaming responses from Claude Code and Codex")
    .version("0.1.0")
    .enablePositionalOptions()
    .addOption(new Option("-p, --port <port>", "Local server port").default(4318).argParser(parsePort))
    .option("--data-dir <path>", "Local trace directory")
    .action(() => interactive(program));

  for (const agentId of ["claude", "codex"] as const) {
    program
      .command(`${agentId} [args...]`)
      .description(`Start and trace ${agents[agentId].label}`)
      .allowUnknownOption()
      .passThroughOptions()
      .action(async (args: string[]) => {
        process.exitCode = await runAgent(agentId, args, getOptions(program));
      });
  }

  program
    .command("dashboard")
    .description("View local Tracelet history")
    .action(() => runDashboard(getOptions(program)));

  const clear = program
    .command("clear")
    .description("Clear all local Tracelet history")
    .option("-y, --yes", "Skip confirmation");

  /** 读取 clear 子命令参数并执行清理。 */
  clear.action(async () => {
    const options = clear.opts<{ yes?: boolean }>();
    await clearRecords(program, options.yes === true);
  });

  return program;
}
