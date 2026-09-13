/** 本文件验证 Claude 显式会话和 OpenAI 响应链识别。 */

import { describe, expect, it } from "vitest";
import { SessionResolver } from "@tracelet/recorder";

describe("SessionResolver", () => {
  /** 验证 Claude Code 请求使用官方 Session Header 聚合。 */
  it("识别 Claude 会话", () => {
    const resolver = new SessionResolver();
    const match = resolver.resolve(
      "anthropic",
      { "x-claude-code-session-id": "session-a", "x-claude-code-agent-id": "agent-a" },
      {},
      "run-a",
    );

    expect(match).toMatchObject({ id: "claude:session-a", source: "header", agentId: "agent-a" });
  });

  /** 验证 OpenAI previous_response_id 会延续已有会话。 */
  it("识别 OpenAI 响应链", () => {
    const resolver = new SessionResolver();
    resolver.bind("resp-a", "run:run-a");
    const match = resolver.resolve("openai", {}, { previous_response_id: "resp-a" }, "run-b");

    expect(match).toMatchObject({ id: "run:run-a", source: "response-chain" });
  });
});
