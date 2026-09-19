/** 本文件验证 Tracelet 用户配置的默认值和代理模式持久化。 */

import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSettings, proxyMode, removeAgent, saveAgent, saveProxy, type CustomAgent } from "../apps/cli/src/settings.js";

const custom: CustomAgent = {
  label: "My Agent",
  command: "my-agent",
  args: ["--profile", "work space"],
  protocol: "openai",
  upstream: "https://api.openai.com/v1",
  inject: { type: "env" },
};

describe("Tracelet settings", () => {
  /** 验证配置文件不存在时默认使用直连。 */
  it("defaults to direct", async () => {
    const root = await mkdtemp(join(tmpdir(), "tracelet-settings-"));
    const settings = await loadSettings(join(root, "settings.json"));
    expect(proxyMode(settings, "claude")).toBe("direct");
    expect(proxyMode(settings, "codex")).toBe("direct");
  });

  /** 验证可以为不同 Agent 保存独立的代理模式。 */
  it("saves proxy mode per agent", async () => {
    const root = await mkdtemp(join(tmpdir(), "tracelet-settings-"));
    const path = join(root, "settings.json");
    await writeFile(path, JSON.stringify({ extra: true }), "utf8");

    await saveProxy("claude", "system", path);

    const settings = await loadSettings(path);
    expect(proxyMode(settings, "claude")).toBe("system");
    expect(proxyMode(settings, "codex")).toBe("direct");
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
      extra: true,
      proxy: {
        default: { mode: "direct" },
        agents: { claude: { mode: "system" } },
      },
    });
  });

  /** 验证配置全部 Agent 时清除已有的单独覆盖项。 */
  it("resets overrides for all agents", async () => {
    const root = await mkdtemp(join(tmpdir(), "tracelet-settings-"));
    const path = join(root, "settings.json");
    await saveProxy("claude", "system", path);

    await saveProxy("all", "system", path);

    const settings = await loadSettings(path);
    expect(proxyMode(settings, "claude")).toBe("system");
    expect(proxyMode(settings, "codex")).toBe("system");
    expect(settings.proxy.agents).toEqual({});
  });

  /** 验证自定义 Agent 与其代理配置可独立持久化，删除时不清除其他设置。 */
  it("saves and removes a custom agent", async () => {
    const root = await mkdtemp(join(tmpdir(), "tracelet-settings-"));
    const path = join(root, "settings.json");
    await writeFile(path, JSON.stringify({ extra: true }), "utf8");
    await saveAgent("custom-my-agent", custom, path);
    await saveProxy("custom-my-agent", "system", path);
    expect((await loadSettings(path)).customAgents["custom-my-agent"]).toEqual(custom);
    expect(proxyMode(await loadSettings(path), "custom-my-agent")).toBe("system");

    await removeAgent("custom-my-agent", path);
    const settings = await loadSettings(path);
    expect(settings.customAgents).toEqual({});
    expect(settings.proxy.agents).toEqual({});
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({ extra: true });
  });

  /** 验证自定义配置拒绝无效 ID 和缺少占位符的参数模板。 */
  it("validates custom agent configuration", async () => {
    const root = await mkdtemp(join(tmpdir(), "tracelet-settings-"));
    const path = join(root, "settings.json");
    await expect(saveAgent("claude", custom, path)).rejects.toThrow("Invalid custom agent");
    await expect(saveAgent("custom-test", { ...custom, inject: { type: "args", args: ["--base-url"] } }, path))
      .rejects.toThrow("Invalid Base URL argument template");
  });
});
