/** 本文件负责读取和保存用户目录中的 Tracelet 配置。 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Protocol } from "@tracelet/shared";
import { settingsFile } from "./paths.js";

export type ProxyMode = "direct" | "system";
export type ProxyTarget = string;

export interface CustomAgent {
  label: string;
  command: string;
  args: string[];
  protocol: Protocol;
  upstream: string;
  inject: { type: "env"; name?: string } | { type: "args"; args: string[] };
}

export interface ProxyConfig {
  mode: ProxyMode;
}

export interface Settings {
  customAgents: Record<string, CustomAgent>;
  proxy: {
    default: ProxyConfig;
    agents: Record<string, ProxyConfig>;
  };
}

/** 校验自定义 Agent 的完整配置并返回可安全保存的副本。 */
function readAgent(value: unknown, id: string): CustomAgent {
  if (!/^custom-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || !isObject(value)) {
    throw new Error(`Invalid custom agent: ${id}`);
  }
  const { label, command, args, protocol, upstream, inject } = value;
  if (typeof label !== "string" || !label.trim() || typeof command !== "string" || !command.trim()
    || !Array.isArray(args) || !args.every((arg) => typeof arg === "string")
    || (protocol !== "anthropic" && protocol !== "openai") || typeof upstream !== "string"
    || !isObject(inject) || (inject.type !== "env" && inject.type !== "args")) {
    throw new Error(`Invalid custom agent: ${id}`);
  }
  try {
    if (!["http:", "https:"].includes(new URL(upstream).protocol)) {
      throw new Error("Unsupported protocol");
    }
  } catch {
    throw new Error(`Invalid upstream URL for custom agent: ${id}`);
  }
  if (inject.type === "env") {
    if (inject.name !== undefined && (typeof inject.name !== "string"
      || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(inject.name))) {
      throw new Error(`Invalid environment variable for custom agent: ${id}`);
    }
    return { label: label.trim(), command: command.trim(), args, protocol, upstream, inject: {
      type: "env", ...(inject.name ? { name: inject.name } : {}),
    } };
  }
  if (!Array.isArray(inject.args) || !inject.args.every((arg) => typeof arg === "string")
    || !inject.args.some((arg) => arg.includes("{baseUrl}"))) {
    throw new Error(`Invalid Base URL argument template for custom agent: ${id}`);
  }
  return { label: label.trim(), command: command.trim(), args, protocol, upstream,
    inject: { type: "args", args: inject.args } };
}

/** 判断配置值是否为普通对象。 */
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 读取原始配置对象，文件不存在时返回空配置。 */
async function readRaw(path: string): Promise<Record<string, unknown>> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (!isObject(value)) {
      throw new Error("Settings root must be an object");
    }
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return {};
    }
    throw new Error(`Failed to read Tracelet settings: ${path}`, { cause: error });
  }
}

/** 读取并校验单个代理配置。 */
function readProxy(value: unknown, name: string): ProxyConfig {
  if (!isObject(value) || (value.mode !== "direct" && value.mode !== "system")) {
    throw new Error(`Invalid proxy mode: ${name}`);
  }
  return { mode: value.mode };
}

/** 将原始对象转换为按 Agent 区分的 Tracelet 配置。 */
function parseSettings(value: Record<string, unknown>, path: string): Settings {
  if (value.customAgents !== undefined && !isObject(value.customAgents)) {
    throw new Error(`Invalid custom agents: ${path}`);
  }
  const customAgents: Record<string, CustomAgent> = {};
  if (isObject(value.customAgents)) {
    for (const [id, config] of Object.entries(value.customAgents)) {
      customAgents[id] = readAgent(config, id);
    }
  }
  if (value.proxy !== undefined && !isObject(value.proxy)) {
    throw new Error(`Invalid proxy settings: ${path}`);
  }

  const proxy = isObject(value.proxy) ? value.proxy : {};
  const defaultConfig = proxy.default === undefined
    ? { mode: "direct" as const }
    : readProxy(proxy.default, "default");
  if (proxy.agents !== undefined && !isObject(proxy.agents)) {
    throw new Error(`Invalid agent proxy settings: ${path}`);
  }

  const agents: Record<string, ProxyConfig> = {};
  if (isObject(proxy.agents)) {
    for (const [agentId, config] of Object.entries(proxy.agents)) {
      agents[agentId] = readProxy(config, agentId);
    }
  }

  return { customAgents, proxy: { default: defaultConfig, agents } };
}

/** 保存配置对象并保持用户设置文件仅当前用户可读。 */
async function writeSettings(path: string, value: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

/** 读取并校验 Tracelet 配置，缺省 Agent 使用默认直连配置。 */
export async function loadSettings(path = settingsFile()): Promise<Settings> {
  return parseSettings(await readRaw(path), path);
}

/** 返回指定 Agent 最终使用的代理模式。 */
export function proxyMode(settings: Settings, agentId: string): ProxyMode {
  return settings.proxy.agents[agentId]?.mode ?? settings.proxy.default.mode;
}

/** 保存单个或全部 Agent 的代理模式，同时保留其他顶层配置。 */
export async function saveProxy(target: ProxyTarget, mode: ProxyMode, path = settingsFile()): Promise<void> {
  const value = await readRaw(path);
  const current = parseSettings(value, path);
  const agents = { ...current.proxy.agents };
  let defaultConfig = current.proxy.default;

  if (target === "all") {
    // 全部 Agent 使用新的默认值，并移除已有的单独覆盖项。
    defaultConfig = { mode };
    for (const agentId of Object.keys(agents)) {
      delete agents[agentId];
    }
  } else if (mode === defaultConfig.mode) {
    delete agents[target];
  } else {
    agents[target] = { mode };
  }

  const next = { ...value, proxy: { default: defaultConfig, agents } };

  // settings.json 独立于记录目录，始终保存在当前用户的 Tracelet 目录下。
  await writeSettings(path, next);
}

/** 新增或更新一个自定义 Agent，同时保留其他设置。 */
export async function saveAgent(id: string, agent: CustomAgent, path = settingsFile()): Promise<void> {
  const value = await readRaw(path);
  const current = parseSettings(value, path);
  const customAgents = { ...current.customAgents, [id]: readAgent(agent, id) };
  await writeSettings(path, { ...value, customAgents });
}

/** 删除自定义 Agent 及其代理覆盖配置，但不触及历史记录。 */
export async function removeAgent(id: string, path = settingsFile()): Promise<void> {
  const value = await readRaw(path);
  const current = parseSettings(value, path);
  const customAgents = { ...current.customAgents };
  const proxyAgents = { ...current.proxy.agents };
  delete customAgents[id];
  delete proxyAgents[id];
  await writeSettings(path, { ...value, customAgents,
    proxy: { default: current.proxy.default, agents: proxyAgents } });
}
