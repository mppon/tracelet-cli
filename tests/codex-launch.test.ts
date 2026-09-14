/** 本文件验证 Codex 通过临时 Provider 接入 Tracelet 并禁用 WebSocket。 */

import { describe, expect, it } from "vitest";
import { agents } from "../apps/cli/src/agents.js";

describe("Codex launch", () => {
  /** 验证临时 Provider 配置及用户参数的传递顺序。 */
  it("使用 HTTP Responses Provider", () => {
    const proxyUrl = "http://127.0.0.1:4318/_tracelet/p/run_test/openai";
    const launch = agents.codex.launch(proxyUrl, ["resume", "--last"]);

    expect(launch.command).toBe("codex");
    expect(launch.args).toEqual([
      "-c",
      'model_provider="tracelet"',
      "-c",
      `model_providers.tracelet={ name = "Tracelet", base_url = "${proxyUrl}", wire_api = "responses", requires_openai_auth = true, supports_websockets = false }`,
      "resume",
      "--last",
    ]);
    expect(launch.env.NO_PROXY).toContain("127.0.0.1");
    expect(launch.env.no_proxy).toContain("localhost");
  });
});
