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

/** 确认后清除当前数据目录中的全部历史记录。 */
async function clearRecords(program: Command, yes: boolean): Promise<void> {
  const root = dataDir(getOptions(program).dataDir);

  if (!yes) {
    if (!process.stdin.isTTY) {
      throw new Error("非交互环境请使用 tracelet clear --yes。");
    }

    const accepted = await confirm({
      message: `将永久删除 ${root} 中的全部 Tracelet 记录，是否继续？`,
      default: false,
    });
    if (!accepted) {
      console.log("已取消清理。");
      return;
    }
  }

  await clearData(root);
  console.log(`已清除全部 Tracelet 记录：${root}`);
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

  const clear = program
    .command("clear")
    .description("清除全部本地 Tracelet 历史记录")
    .option("-y, --yes", "跳过确认");

  /** 读取 clear 子命令参数并执行清理。 */
  clear.action(async () => {
    const options = clear.opts<{ yes?: boolean }>();
    await clearRecords(program, options.yes === true);
  });

  return program;
}
