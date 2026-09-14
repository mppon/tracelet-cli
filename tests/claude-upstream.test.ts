/** 本文件验证 Claude Code 上游地址的环境变量与配置文件优先级。 */

import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { agents, claudeUpstream } from "../apps/cli/src/agents.js";

/** 创建测试配置文件并写入 Claude Code 上游地址。 */
async function save(path: string, url: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify({ env: { ANTHROPIC_BASE_URL: url } }), "utf8");
}

describe("Claude upstream", () => {
  /** 验证 Tracelet 显式变量始终拥有最高优先级。 */
  it("优先使用 TRACELET_CLAUDE_UPSTREAM", async () => {
    const root = await mkdtemp(join(tmpdir(), "tracelet-claude-"));
    const userDir = join(root, "user");
    await save(join(userDir, "settings.json"), "https://user.example.com");

    const url = await claudeUpstream(root, {
      CLAUDE_CONFIG_DIR: userDir,
      TRACELET_CLAUDE_UPSTREAM: "https://override.example.com",
    });
    expect(url).toBe("https://override.example.com");
  });

  /** 验证本地项目配置优先于共享项目配置和用户配置。 */
  it("按作用域读取配置文件", async () => {
    const root = await mkdtemp(join(tmpdir(), "tracelet-claude-"));
    const userDir = join(root, "user");
    await save(join(userDir, "settings.json"), "https://user.example.com");
    await save(join(root, ".claude", "settings.json"), "https://project.example.com");
    await save(join(root, ".claude", "settings.local.json"), "https://local.example.com");

    const url = await claudeUpstream(root, { CLAUDE_CONFIG_DIR: userDir });
    expect(url).toBe("https://local.example.com");
  });

  /** 验证没有显式配置时使用 Anthropic 官方地址。 */
  it("回退到默认地址", async () => {
    const root = await mkdtemp(join(tmpdir(), "tracelet-claude-"));
    const url = await claudeUpstream(root, { CLAUDE_CONFIG_DIR: join(root, "missing") });
    expect(url).toBe("https://api.anthropic.com");
  });

  /** 验证启动参数通过 CLI settings 覆盖 Claude 配置中的 Base URL。 */
  it("启动时强制接入 Tracelet 代理", () => {
    const proxyUrl = "http://127.0.0.1:4318/_tracelet/p/run_test/anthropic";
    const launch = agents.claude.launch(proxyUrl, ["--resume"]);
    const settings = JSON.parse(launch.args[1] ?? "{}") as {
      env?: { ANTHROPIC_BASE_URL?: string };
    };

    expect(launch.args[0]).toBe("--settings");
    expect(settings.env?.ANTHROPIC_BASE_URL).toBe(proxyUrl);
    expect(launch.args.slice(2)).toEqual(["--resume"]);
    expect(launch.env.ANTHROPIC_BASE_URL).toBe(proxyUrl);
    expect(launch.env.NO_PROXY).toContain("127.0.0.1");
    expect(launch.env.no_proxy).toContain("localhost");
  });
});
