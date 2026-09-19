/** 本文件负责自定义 Agent 的新增、编辑、删除及启动交互。 */

import { confirm, input, select } from "@inquirer/prompts";
import type { Protocol } from "@tracelet/shared";
import { loadSettings, removeAgent, saveAgent, type CustomAgent } from "./settings.js";

type Field = "label" | "command" | "args" | "protocol" | "upstream" | "inject" | "save" | "cancel";

/** 返回协议对应的默认 Base URL 环境变量名。 */
function baseEnv(protocol: Protocol): string {
  return protocol === "anthropic" ? "ANTHROPIC_BASE_URL" : "OPENAI_BASE_URL";
}

/** 校验非空输入。 */
function required(value: string): true | string {
  return value.trim() ? true : "This field is required.";
}

/** 解析保持参数边界的 JSON 字符串数组。 */
function parseArgs(value: string): string[] {
  const args = JSON.parse(value) as unknown;
  if (!Array.isArray(args) || !args.every((arg) => typeof arg === "string")) {
    throw new Error("Enter a JSON array of strings.");
  }
  return args;
}

/** 提示输入命令参数数组，避免按空格切分带引号的参数。 */
async function askArgs(message: string, args: string[], needsUrl = false): Promise<string[]> {
  const value = await input({
    message,
    default: JSON.stringify(args),
    validate: (text) => {
      try {
        const parsed = parseArgs(text);
        if (needsUrl && !parsed.some((arg) => arg.includes("{baseUrl}"))) {
          return "Include {baseUrl} in one argument.";
        }
        return true;
      } catch {
        return "Enter a JSON array of strings, for example [\"--profile\",\"work\"].";
      }
    },
  });
  return parseArgs(value);
}

/** 校验上游 HTTP 地址。 */
function validUrl(value: string): true | string {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol)
      ? true : "Use an http:// or https:// URL.";
  } catch {
    return "Enter a valid upstream URL.";
  }
}

/** 选择协议及其默认上游地址。 */
async function askProtocol(current?: Protocol): Promise<Protocol> {
  return select<Protocol>({
    message: "Protocol",
    choices: [
      { name: "Anthropic Messages", value: "anthropic" },
      { name: "OpenAI Responses", value: "openai" },
    ],
    default: current,
  });
}

/** 选择通过环境变量或命令参数注入本地 Base URL。 */
async function askInject(protocol: Protocol, current?: CustomAgent["inject"]): Promise<CustomAgent["inject"]> {
  const type = await select<"env" | "args">({
    message: "How should Tracelet pass its local Base URL?",
    choices: [
      { name: "Environment variable (recommended)", value: "env" },
      { name: "Command arguments", value: "args" },
    ],
    default: current?.type ?? "env",
  });
  if (type === "env") {
    const fallback = baseEnv(protocol);
    const name = await input({
      message: `Environment variable (blank uses ${fallback})`,
      default: current?.type === "env" ? current.name ?? "" : "",
      validate: (value) => !value || /^[A-Za-z_][A-Za-z0-9_]*$/.test(value)
        ? true : "Enter a valid environment variable name.",
    });
    return { type: "env", ...(name ? { name } : {}) };
  }
  const args = await askArgs("Base URL arguments (JSON array containing {baseUrl})",
    current?.type === "args" ? current.args : ["--base-url", "{baseUrl}"], true);
  return { type: "args", args };
}

/** 为新 Agent 生成不与现有配置冲突的固定内部 ID。 */
function nextId(label: string, used: Record<string, CustomAgent>): string {
  const slug = label.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "agent";
  const base = `custom-${slug}`;
  let id = base;
  let count = 2;
  while (used[id]) {
    id = `${base}-${count++}`;
  }
  return id;
}

/** 展示待保存的 Agent 配置摘要。 */
function showAgent(id: string, agent: CustomAgent): void {
  console.log(`\n${agent.label} (${id})`);
  console.log(`  Command: ${JSON.stringify([agent.command, ...agent.args])}`);
  console.log(`  Protocol: ${agent.protocol}`);
  console.log(`  Upstream: ${agent.upstream}`);
  console.log(`  Base URL: ${agent.inject.type === "env"
    ? `env ${agent.inject.name ?? baseEnv(agent.protocol)}`
    : `args ${JSON.stringify(agent.inject.args)}`}\n`);
}

/** 引导创建新 Agent，保存后可立即启动。 */
async function addAgent(): Promise<string | undefined> {
  const settings = await loadSettings();
  const label = await input({ message: "Agent name", validate: required });
  const id = nextId(label, settings.customAgents);
  const command = await input({ message: "Executable command", validate: required });
  const args = await askArgs("Default arguments (JSON array)", []);
  const protocol = await askProtocol();
  const inject = await askInject(protocol);
  const envName = inject.type === "env" ? inject.name ?? baseEnv(protocol) : baseEnv(protocol);
  const upstream = await input({
    message: "Original upstream URL",
    default: process.env[envName] ?? (protocol === "anthropic"
      ? "https://api.anthropic.com" : "https://api.openai.com/v1"),
    validate: validUrl,
  });
  const agent: CustomAgent = { label, command, args, protocol, upstream, inject };
  showAgent(id, agent);
  if (!(await confirm({ message: "Save this agent?", default: true }))) {
    return undefined;
  }
  await saveAgent(id, agent);
  console.log(`Agent saved: ${id}`);
  return await confirm({ message: "Launch it now?", default: false }) ? id : undefined;
}

/** 从已保存列表中选择自定义 Agent。 */
async function chooseAgent(message: string): Promise<string | undefined> {
  const entries = Object.entries((await loadSettings()).customAgents);
  if (entries.length === 0) {
    console.log("No custom agents configured.");
    return undefined;
  }
  return select<string>({
    message,
    choices: [
      ...entries.map(([id, agent]) => ({ name: `${agent.label} (${id})`, value: id })),
      { name: "Back", value: "back" },
    ],
  });
}

/** 在内存草稿中按字段修改 Agent，保存前不影响已有配置。 */
async function editAgent(): Promise<void> {
  const id = await chooseAgent("Select an agent to edit");
  if (!id || id === "back") return;
  const draft = structuredClone((await loadSettings()).customAgents[id]!);
  showAgent(id, draft);
  for (;;) {
    const field = await select<Field>({
      message: "Select a field to edit",
      // 一次展示全部字段，并在首尾停止方向键导航。
      pageSize: 8,
      loop: false,
      choices: [
        { name: `Name: ${draft.label}`, value: "label" },
        { name: `Command: ${draft.command}`, value: "command" },
        { name: `Default arguments: ${JSON.stringify(draft.args)}`, value: "args" },
        { name: `Protocol: ${draft.protocol}`, value: "protocol" },
        { name: `Upstream: ${draft.upstream}`, value: "upstream" },
        { name: "Base URL injection", value: "inject" },
        { name: "Save changes", value: "save" },
        { name: "Cancel", value: "cancel" },
      ],
    });
    if (field === "cancel") return;
    if (field === "save") {
      await saveAgent(id, draft);
      console.log(`Agent updated: ${id}`);
      return;
    }
    if (field === "label") draft.label = await input({ message: "Agent name", default: draft.label, validate: required });
    if (field === "command") draft.command = await input({ message: "Executable command", default: draft.command, validate: required });
    if (field === "args") draft.args = await askArgs("Default arguments (JSON array)", draft.args);
    if (field === "protocol") draft.protocol = await askProtocol(draft.protocol);
    if (field === "upstream") draft.upstream = await input({ message: "Original upstream URL", default: draft.upstream, validate: validUrl });
    if (field === "inject") draft.inject = await askInject(draft.protocol, draft.inject);
  }
}

/** 确认删除自定义配置及代理覆盖项，保留所有历史记录。 */
async function deleteAgent(): Promise<void> {
  const id = await chooseAgent("Select an agent to delete");
  if (!id || id === "back") return;
  const agent = (await loadSettings()).customAgents[id]!;
  if (!(await confirm({ message: `Delete ${agent.label} (${id})? Recorded history will be kept.`, default: false }))) {
    console.log("Delete cancelled.");
    return;
  }
  await removeAgent(id);
  console.log(`Agent deleted: ${id}. Recorded history was kept.`);
}

/** 循环展示自定义 Agent 管理菜单，返回可选的立即启动目标。 */
export async function manageAgents(): Promise<string | undefined> {
  if (!process.stdin.isTTY) throw new Error("The agent command requires an interactive terminal.");
  for (;;) {
    const action = await select<"add" | "edit" | "delete" | "back">({
      message: "Manage custom agents",
      choices: [
        { name: "Add agent", value: "add" },
        { name: "Edit agent", value: "edit" },
        { name: "Delete agent", value: "delete" },
        { name: "Back", value: "back" },
      ],
    });
    if (action === "back") return undefined;
    if (action === "add") {
      const id = await addAgent();
      if (id) return id;
    }
    if (action === "edit") await editAgent();
    if (action === "delete") await deleteAgent();
  }
}
