/** 本文件负责检测 Claude Code 与 Codex，并生成无全局副作用的启动参数。 */

import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AgentType, Protocol } from "@tracelet/shared";
import type { CustomAgent } from "./settings.js";

const exec = promisify(execFile);
const codexProvider = "tracelet";

export interface LaunchInfo {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

export interface AgentAdapter {
  id: string;
  label: string;
  command: string;
  protocol: Protocol;
  /** 检测本机是否安装当前 agent。 */
  detect(): Promise<boolean>;
  /** 获取当前 agent 原本使用的上游地址。 */
  upstream(): Promise<string>;
  /** 生成只对本次子进程生效的代理启动参数。 */
  launch(proxyUrl: string, args: string[]): LaunchInfo;
}

interface ClaudeSettings {
  env?: Record<string, unknown>;
}

/** 将 Tracelet 本地地址加入子进程的代理绕过列表。 */
function launchEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const values = [env.NO_PROXY, env.no_proxy, "127.0.0.1", "localhost", "::1"]
    .flatMap((value) => value?.split(",") ?? [])
    .map((value) => value.trim())
    .filter(Boolean);
  const noProxy = [...new Set(values)].join(",");
  return { ...env, NO_PROXY: noProxy, no_proxy: noProxy };
}

/** 检查命令是否存在于当前 PATH。 */
async function hasBin(command: string): Promise<boolean> {
  const paths = command.includes("/") || command.includes("\\")
    ? [""] : process.env.PATH?.split(delimiter) ?? [];
  const names = process.platform === "win32" && !/\.[^\\/]+$/.test(command)
    ? [command, ...(process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").map((ext) => `${command}${ext}`)]
    : [command];

  for (const path of paths) {
    for (const name of names) {
      try {
        await access(join(path, name), constants.X_OK);
        return true;
      } catch {
        // 当前候选项未命中时继续检查 PATH 或 Windows 扩展名。
      }
    }
  }

  return false;
}

/** 依据保存的配置创建仅影响当前子进程的自定义 Agent 启动器。 */
export function customAdapter(id: string, config: CustomAgent): AgentAdapter {
  return {
    id,
    label: config.label,
    command: config.command,
    protocol: config.protocol,
    detect: () => hasBin(config.command),
    upstream: async () => config.upstream,
    launch: (proxyUrl, args) => {
      const env = launchEnv();
      const inject = config.inject.type === "env" ? []
        : config.inject.args.map((arg) => arg.replaceAll("{baseUrl}", proxyUrl));
      if (config.inject.type === "env") {
        // 未指定变量名时使用协议的标准 Base URL 环境变量。
        const name = config.inject.name ?? (config.protocol === "anthropic"
          ? "ANTHROPIC_BASE_URL" : "OPENAI_BASE_URL");
        env[name] = proxyUrl;
      }
      return { command: config.command, args: [...inject, ...config.args, ...args], env };
    },
  };
}

/** 判断 Codex 当前是否使用 ChatGPT 登录。 */
async function usesChatGpt(): Promise<boolean> {
  try {
    const result = await exec("codex", ["login", "status"]);
    return result.stderr.includes("ChatGPT");
  } catch {
    return false;
  }
}

/** 从单个 Claude Code 配置文件读取上游地址。 */
async function readClaudeUrl(path: string): Promise<string | undefined> {
  try {
    const settings = JSON.parse(await readFile(path, "utf8")) as ClaudeSettings;
    const url = settings.env?.ANTHROPIC_BASE_URL;
    return typeof url === "string" && url ? url : undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return undefined;
    }

    throw new Error(`Failed to read Claude Code configuration: ${path}`, { cause: error });
  }
}

/** 按 Claude Code 配置作用域返回从高到低的配置文件路径。 */
function claudeFiles(cwd: string, env: NodeJS.ProcessEnv): string[] {
  const userDir = env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
  return [
    join(cwd, ".claude", "settings.local.json"),
    join(cwd, ".claude", "settings.json"),
    join(userDir, "settings.json"),
  ];
}

/** 按显式覆盖、配置文件和官方地址的顺序确定 Claude 上游。 */
export async function claudeUpstream(
  cwd = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  if (env.TRACELET_CLAUDE_UPSTREAM) {
    return env.TRACELET_CLAUDE_UPSTREAM;
  }

  for (const path of claudeFiles(cwd, env)) {
    const url = await readClaudeUrl(path);
    if (url) {
      return url;
    }
  }

  return "https://api.anthropic.com";
}

/** 根据 Codex 登录方式选择原始 OpenAI 上游地址。 */
async function codexUpstream(): Promise<string> {
  if (process.env.TRACELET_CODEX_UPSTREAM) {
    return process.env.TRACELET_CODEX_UPSTREAM;
  }

  return (await usesChatGpt())
    ? "https://chatgpt.com/backend-api/codex"
    : "https://api.openai.com/v1";
}

/** 生成 Claude Code 的临时 settings 和环境变量。 */
function launchClaude(proxyUrl: string, args: string[]): LaunchInfo {
  // Claude 配置中的 env 会在启动时生效，因此用 CLI settings 再次覆盖 Base URL。
  const settings = JSON.stringify({ env: { ANTHROPIC_BASE_URL: proxyUrl } });
  return {
    command: "claude",
    args: ["--settings", settings, ...args],
    env: { ...launchEnv(), ANTHROPIC_BASE_URL: proxyUrl },
  };
}

/** 生成禁用 WebSocket 的 Codex 临时 Provider 配置。 */
function providerConfig(proxyUrl: string): string {
  return `{ name = "Tracelet", base_url = ${JSON.stringify(proxyUrl)}, wire_api = "responses", requires_openai_auth = true, supports_websockets = false }`;
}

/** 生成只对当前进程生效的 Codex Provider 覆盖参数。 */
function launchCodex(proxyUrl: string, args: string[]): LaunchInfo {
  return {
    command: "codex",
    // 参数通过 spawn 数组传递，不经过 shell 展开。
    args: [
      "-c",
      `model_provider=${JSON.stringify(codexProvider)}`,
      "-c",
      `model_providers.${codexProvider}=${providerConfig(proxyUrl)}`,
      ...args,
    ],
    env: launchEnv(),
  };
}

export const agents: Record<AgentType, AgentAdapter> = {
  claude: {
    id: "claude",
    label: "Claude Code",
    command: "claude",
    protocol: "anthropic",
    detect: () => hasBin("claude"),
    upstream: claudeUpstream,
    launch: launchClaude,
  },
  codex: {
    id: "codex",
    label: "Codex",
    command: "codex",
    protocol: "openai",
    detect: () => hasBin("codex"),
    upstream: codexUpstream,
    launch: launchCodex,
  },
};
