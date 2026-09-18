/** 本文件验证 Claude 与 Codex 记录还原为会话瀑布流的规则。 */

import type { ExchangeDetail, ExchangeSummary, Protocol, SessionSummary } from "@tracelet/shared";
import { buildConversation } from "@tracelet/storage";
import { describe, expect, it } from "vitest";

/** 创建测试所需的 Exchange 详情。 */
function exchange(
  id: string,
  protocol: Protocol,
  request: unknown,
  response: unknown,
  headers: Record<string, string> = {},
): ExchangeDetail {
  const index = Number(id.replace(/\D/g, "")) || 1;
  const startedAt = `2026-09-15T00:00:0${index}.000Z`;
  return {
    meta: {
      id,
      runId: "run-test",
      sessionId: `${protocol}:session-test`,
      sessionSource: "header",
      protocol,
      method: "POST",
      path: protocol === "anthropic" ? "/v1/messages" : "/responses",
      model: "model-test",
      stream: true,
      requestHeaders: headers,
      responseStatus: 200,
      startedAt,
      completedAt: startedAt,
      requestBytes: 100,
      responseBytes: 200,
      captureComplete: true,
    },
    requestText: JSON.stringify(request),
    responseText: JSON.stringify(response),
    request,
    response,
    chunks: [],
    events: [],
  };
}

/** 从详情构造会话列表摘要。 */
function session(protocol: Protocol, exchanges: ExchangeDetail[]): SessionSummary {
  const summaries: ExchangeSummary[] = exchanges.map((item) => ({
    id: item.meta.id,
    runId: item.meta.runId,
    sessionId: item.meta.sessionId,
    protocol: item.meta.protocol,
    method: item.meta.method,
    path: item.meta.path,
    model: item.meta.model,
    status: item.meta.responseStatus,
    startedAt: item.meta.startedAt,
    completedAt: item.meta.completedAt,
    responseBytes: item.meta.responseBytes,
    captureComplete: item.meta.captureComplete,
  }));
  return {
    id: `${protocol}:session-test`,
    protocol,
    startedAt: exchanges[0]!.meta.startedAt,
    endedAt: exchanges.at(-1)?.meta.completedAt,
    exchanges: summaries,
  };
}

describe("Conversation builder", () => {
  /** 验证 Claude 顶层 system 内容会出现在会话顶部且不会重复。 */
  it("提取 Claude 系统提示词", () => {
    const system = [
      { type: "text", text: "You are Claude Code." },
      { type: "text", text: "Follow the project instructions." },
    ];
    const exchanges = [
      exchange("ex1", "anthropic", {
        system,
        messages: [{ role: "user", content: "你好" }],
      }, { id: "msg-1", role: "assistant", content: "你好" }),
      exchange("ex2", "anthropic", {
        system,
        messages: [{ role: "user", content: "继续" }],
      }, { id: "msg-2", role: "assistant", content: "好的" }),
    ];

    const result = buildConversation(session("anthropic", exchanges), exchanges);

    expect(result.systemPrompt).toEqual({
      text: "You are Claude Code.\n\nFollow the project instructions.",
      exchangeIds: ["ex1", "ex2"],
    });
  });

  /** 验证 Codex instructions 与 Developer 消息会合并为系统提示词。 */
  it("提取 Codex 系统提示词", () => {
    const current = exchange("ex1", "openai", {
      instructions: "Base instructions",
      input: [
        {
          type: "message",
          role: "developer",
          content: [{ type: "input_text", text: "Workspace instructions" }],
        },
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "你好" }],
        },
      ],
    }, { output: [] });

    const result = buildConversation(session("openai", [current]), [current]);

    expect(result.systemPrompt?.text).toBe("Base instructions\n\nWorkspace instructions");
  });

  /** 验证 Claude 请求快照不会造成重复消息，工具结果会绑定原调用。 */
  it("还原 Claude 消息和工具调用", () => {
    const user = { role: "user", content: "请查看当前目录" };
    const assistant = {
      role: "assistant",
      content: [
        { type: "text", text: "我来检查。" },
        { type: "tool_use", id: "tool-1", name: "Bash", input: { command: "pwd" } },
      ],
    };
    const exchanges = [
      exchange("ex1", "anthropic", { model: "claude-test", messages: [user] }, {
        id: "msg-1",
        ...assistant,
      }),
      exchange("ex2", "anthropic", {
        model: "claude-test",
        messages: [
          user,
          assistant,
          { role: "user", content: [{ type: "tool_result", tool_use_id: "tool-1", content: "/tmp" }] },
        ],
      }, {
        id: "msg-2",
        role: "assistant",
        content: [{ type: "text", text: "当前目录是 /tmp。" }],
      }),
    ];

    const result = buildConversation(session("anthropic", exchanges), exchanges);
    const turn = result.turns[0];
    const tool = turn?.items.find((item) => item.kind === "tool");

    expect(result.turns).toHaveLength(1);
    expect(turn?.items.filter((item) => item.kind === "message").map((item) => item.text)).toEqual([
      "请查看当前目录",
      "我来检查。",
      "当前目录是 /tmp。",
    ]);
    expect(tool).toMatchObject({
      name: "Bash",
      callId: "tool-1",
      output: "/tmp",
      status: "complete",
      exchangeIds: ["ex1", "ex2"],
    });
  });

  /** 验证 Claude 标题生成请求会被标记为内部 Turn。 */
  it("识别 Claude 内部任务", () => {
    const exchanges = [exchange("ex1", "anthropic", {
      messages: [{ role: "user", content: "Write the title in the predominant language" }],
    }, {
      id: "msg-title",
      role: "assistant",
      content: [{ type: "text", text: "Task title" }],
    })];

    const result = buildConversation(session("anthropic", exchanges), exchanges);
    expect(result.turns[0]?.internal).toBe(true);
  });

  /** 验证 Codex 只使用结构化来源判断内部任务，不扫描历史消息文字。 */
  it("仅根据 thread_source 识别 Codex 内部任务", () => {
    const historicalPrompt = {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "Generate a concise, single-line task title" }],
    };
    const userHeaders = {
      "x-codex-turn-metadata": JSON.stringify({ turn_id: "turn-user", thread_source: "user" }),
    };
    const systemHeaders = {
      "x-codex-turn-metadata": JSON.stringify({ turn_id: "turn-system", thread_source: "system" }),
    };
    const response = {
      output: [{
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "完成" }],
      }],
    };
    const userExchange = exchange("ex1", "openai", { input: [historicalPrompt] }, response, userHeaders);
    const systemExchange = exchange("ex2", "openai", { input: [historicalPrompt] }, response, systemHeaders);

    const userResult = buildConversation(session("openai", [userExchange]), [userExchange]);
    const systemResult = buildConversation(session("openai", [systemExchange]), [systemExchange]);

    expect(userResult.turns[0]?.internal).toBe(false);
    expect(systemResult.turns[0]?.internal).toBe(true);
  });

  /** 验证同一 Codex turn_id 的多次请求会合并为一个 Turn。 */
  it("还原 Codex Turn 和工具结果", () => {
    const metadata = { "x-codex-turn-metadata": JSON.stringify({ turn_id: "turn-1", thread_source: "cli" }) };
    const user = {
      id: "user-1",
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "读取文件" }],
    };
    const call = {
      type: "function_call",
      call_id: "call-1",
      name: "read_file",
      arguments: "{\"path\":\"a.ts\"}",
    };
    const exchanges = [
      exchange("ex1", "openai", { input: [user] }, { output: [call] }, metadata),
      exchange("ex2", "openai", {
        input: [user, call, { type: "function_call_output", call_id: "call-1", output: "file body" }],
      }, {
        output: [{
          id: "assistant-1",
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "文件已读取。" }],
        }],
      }, metadata),
    ];

    const result = buildConversation(session("openai", exchanges), exchanges);
    const tool = result.turns[0]?.items.find((item) => item.kind === "tool");

    expect(result.turns).toHaveLength(1);
    expect(result.turns[0]?.id).toBe("turn-1");
    expect(result.turns[0]?.items.filter((item) => item.kind === "message")).toHaveLength(2);
    expect(tool).toMatchObject({
      name: "read_file",
      input: { path: "a.ts" },
      output: "file body",
      status: "complete",
      exchangeIds: ["ex1", "ex2"],
    });
  });
});
