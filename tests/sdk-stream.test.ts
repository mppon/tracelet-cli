/** 本文件验证官方 Anthropic 与 OpenAI SDK 能从已记录事件生成完整响应。 */

import { describe, expect, it } from "vitest";
import { buildResponse } from "@tracelet/protocols";
import type { SseRow } from "@tracelet/shared";

/** 将对象转换为测试使用的 SSE 事件记录。 */
function row(seq: number, value: unknown): SseRow {
  return {
    seq,
    event: "message",
    data: JSON.stringify(value),
    raw: `data: ${JSON.stringify(value)}`,
    firstChunk: seq,
    lastChunk: seq,
    tUs: seq * 100,
  };
}

describe("官方 SDK 响应还原", () => {
  /** 验证 Anthropic SDK finalMessage 会累加文本 delta。 */
  it("使用 Anthropic finalMessage", async () => {
    const events = [
      row(0, {
        type: "message_start",
        message: {
          id: "msg_test",
          type: "message",
          role: "assistant",
          content: [],
          model: "claude-test",
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 3, output_tokens: 0 },
        },
      }),
      row(1, { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
      row(2, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "你好" } }),
      row(3, { type: "content_block_stop", index: 0 }),
      row(4, {
        type: "message_delta",
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { output_tokens: 2 },
      }),
      row(5, { type: "message_stop" }),
    ];

    const response = (await buildResponse("anthropic", events)) as {
      id?: string;
      content?: Array<{ type?: string; text?: string }>;
    };
    expect(response?.id).toBe("msg_test");
    expect(response?.content?.[0]?.text).toBe("你好");
  });

  /** 验证 OpenAI SDK finalResponse 返回 completed 事件中的完整对象。 */
  it("使用 OpenAI finalResponse", async () => {
    const complete = {
      id: "resp_test",
      object: "response",
      created_at: 1,
      status: "completed",
      completed_at: 2,
      error: null,
      incomplete_details: null,
      instructions: null,
      max_output_tokens: null,
      model: "gpt-test",
      output: [
        {
          id: "msg_test",
          type: "message",
          status: "completed",
          role: "assistant",
          content: [{ type: "output_text", text: "你好", annotations: [] }],
        },
      ],
      parallel_tool_calls: true,
      previous_response_id: null,
      reasoning: { effort: null, summary: null },
      store: false,
      temperature: 1,
      text: { format: { type: "text" } },
      tool_choice: "auto",
      tools: [],
      top_p: 1,
      truncation: "disabled",
      usage: {
        input_tokens: 3,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 2,
        output_tokens_details: { reasoning_tokens: 0 },
        total_tokens: 5,
      },
    };
    const events = [
      row(0, { type: "response.created", sequence_number: 0, response: { ...complete, status: "in_progress" } }),
      row(1, { type: "response.completed", sequence_number: 1, response: complete }),
    ];

    const response = (await buildResponse("openai", events)) as { id?: string; output_text?: string };
    expect(response?.id).toBe("resp_test");
    expect(response?.output_text).toBe("你好");
  });
});
