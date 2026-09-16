/** 本文件验证 Tracelet 用户配置的默认值和代理模式持久化。 */

import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSettings, proxyMode, saveProxy } from "../apps/cli/src/settings.js";

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
});
