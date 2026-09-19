/** 本文件负责定义 Commander 命令和无参数时的交互菜单。 */

import { confirm, select } from "@inquirer/prompts";
import { readFileSync } from "node:fs";
import { Command, Option } from "commander";
import { agents, customAdapter } from "./agents.js";
import { clearData } from "./clear.js";
import { manageAgents } from "./custom-menu.js";
import { dataDir } from "./paths.js";
import { runAgent, runDashboard, type RunOptions } from "./run.js";
import {
  loadSettings,
  proxyMode,
  saveProxy,
  type ProxyMode,
  type ProxyTarget,
} from "./settings.js";

// 源码和构建产物都位于 package.json 的下一级目录，始终读取 CLI 包自身的版本。
const { version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

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
    throw new Error("Use tracelet claude, tracelet codex, or tracelet run <id> in a non-interactive environment.");
  }

  for (;;) {
    const settings = await loadSettings();
    const [claudeReady, codexReady] = await Promise.all([
      agents.claude.detect(),
      agents.codex.detect(),
    ]);
    const custom = await Promise.all(Object.entries(settings.customAgents).map(async ([id, config]) => ({
      name: config.label,
      value: id,
      ...(!(await customAdapter(id, config).detect())
        ? { disabled: `${config.command} command not found` } : {}),
    })));
    const agent = await select<string>({
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
        ...custom,
        { name: "Manage custom agents...", value: "manage" },
      ],
    });
    if (agent === "manage") {
      const launch = await manageAgents();
      if (launch) {
        process.exitCode = await runAgent(launch, [], getOptions(program));
        return;
      }
      continue;
    }
    process.exitCode = await runAgent(agent, [], getOptions(program));
    return;
  }
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

/** 通过 Agent 和 On/Off 菜单配置系统代理。 */
async function configureProxy(): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new Error("The proxy command requires an interactive terminal.");
  }

  const settings = await loadSettings();
  const target = await select<ProxyTarget>({
    message: "Select an agent to configure",
    choices: [
      {
        name: `Claude Code (${proxyMode(settings, "claude") === "system" ? "On" : "Off"})`,
        value: "claude",
      },
      {
        name: `Codex (${proxyMode(settings, "codex") === "system" ? "On" : "Off"})`,
        value: "codex",
      },
      { name: "All agents", value: "all" },
      ...Object.entries(settings.customAgents).map(([id, agent]) => ({
        name: `${agent.label} (${proxyMode(settings, id) === "system" ? "On" : "Off"})`,
        value: id,
      })),
    ],
  });
  const current = target === "all" ? settings.proxy.default.mode : proxyMode(settings, target);
  const mode = await select<ProxyMode>({
    message: "Use the system proxy for upstream requests?",
    choices: [
      { name: "On", value: "system" },
      { name: "Off", value: "direct" },
    ],
    default: current,
  });
  await saveProxy(target, mode);
  const label = target === "all" ? "all agents"
    : target === "claude" || target === "codex" ? agents[target].label
      : settings.customAgents[target]?.label ?? target;
  console.log(`System proxy ${mode === "system" ? "enabled" : "disabled"} for ${label}.`);
}

/** 创建并配置 Tracelet Commander 程序。 */
export function createProgram(): Command {
  const program = new Command();
  program
    .name("tracelet")
    .description("Record LLM requests and streaming responses from built-in and custom agents")
    .version(version)
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
    .command("agent")
    .description("Add, edit, or delete custom agents")
    .action(async () => {
      const launch = await manageAgents();
      if (launch) process.exitCode = await runAgent(launch, [], getOptions(program));
    });

  program
    .command("run <id> [args...]")
    .description("Start and trace a custom agent by ID")
    .allowUnknownOption()
    .passThroughOptions()
    .action(async (id: string, args: string[]) => {
      process.exitCode = await runAgent(id, args, getOptions(program));
    });

  program
    .command("dashboard")
    .description("View local Tracelet history")
    .action(() => runDashboard(getOptions(program)));

  program
    .command("proxy")
    .description("Configure system proxy usage")
    .action(configureProxy);

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
