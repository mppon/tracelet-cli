/** 本文件验证自定义 Agent 的本地 Base URL 注入方式。 */

import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listSessions } from "@tracelet/storage";
import type { ExchangeMeta, RunMeta } from "@tracelet/shared";
import { describe, expect, it } from "vitest";
import { customAdapter } from "../apps/cli/src/agents.js";
import type { CustomAgent } from "../apps/cli/src/settings.js";

const agent: CustomAgent = {
  label: "My Agent",
  command: "my-agent",
  args: ["--profile", "work space"],
  protocol: "openai",
  upstream: "https://api.openai.com/v1",
  inject: { type: "env" },
};

describe("custom agent launch", () => {
  /** 验证未填写变量名时使用协议默认值，且保留参数边界。 */
  it("uses the protocol default environment variable", () => {
    const launch = customAdapter("custom-my-agent", agent).launch("http://127.0.0.1:4318/p", ["--model", "test"]);
    expect(launch.command).toBe("my-agent");
    expect(launch.args).toEqual(["--profile", "work space", "--model", "test"]);
    expect(launch.env.OPENAI_BASE_URL).toBe("http://127.0.0.1:4318/p");
  });

  /** 验证环境变量可覆盖，参数模板也能替换本地地址。 */
  it("supports custom environment names and argument templates", () => {
    const env = customAdapter("custom-env", { ...agent, inject: { type: "env", name: "MY_BASE_URL" } })
      .launch("http://127.0.0.1:4318/p", []);
    expect(env.env.MY_BASE_URL).toBe("http://127.0.0.1:4318/p");

    const args = customAdapter("custom-args", { ...agent, inject: { type: "args", args: ["--base-url={baseUrl}"] } })
      .launch("http://127.0.0.1:4318/p", ["chat"]);
    expect(args.args).toEqual(["--base-url=http://127.0.0.1:4318/p", "--profile", "work space", "chat"]);
  });

  /** 验证 Dashboard 使用运行时保存的名称，删除配置后仍可识别历史会话。 */
  it("keeps the recorded agent label in session history", async () => {
    const root = await mkdtemp(join(tmpdir(), "tracelet-custom-"));
    const run: RunMeta = {
      id: "run-custom", agent: "custom-my-agent", agentLabel: "My Agent",
      command: "my-agent", cwd: root, startedAt: "2026-09-13T00:00:00.000Z",
    };
    const meta: ExchangeMeta = {
      id: "exchange-custom", runId: run.id, sessionId: `run:${run.id}`, sessionSource: "run",
      protocol: "openai", method: "POST", path: "/v1/responses", stream: false,
      requestHeaders: {}, startedAt: run.startedAt, requestBytes: 0, responseBytes: 0,
      captureComplete: true,
    };
    const runDir = join(root, "runs", "2026-09-13", run.id);
    const exchangeDir = join(runDir, "exchanges", meta.id);
    await mkdir(exchangeDir, { recursive: true });
    await writeFile(join(runDir, "run.json"), JSON.stringify(run));
    await writeFile(join(exchangeDir, "meta.json"), JSON.stringify(meta));

    expect((await listSessions(root))[0]?.agentLabel).toBe("My Agent");
  });
});
