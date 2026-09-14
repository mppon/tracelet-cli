/** 本文件负责从请求和响应链中识别持续会话。 */

import type { HeaderMap, Protocol, SessionMatch } from "@tracelet/shared";

export class SessionResolver {
  private readonly responses = new Map<string, string>();

  /** 根据协议显式标识和已有响应链确定会话。 */
  resolve(protocol: Protocol, headers: HeaderMap, body: unknown, runId: string): SessionMatch {
    const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

    if (protocol === "anthropic") {
      const session = headers?.["x-claude-code-session-id"];
      const agent = headers?.["x-claude-code-agent-id"];
      const parent = headers?.["x-claude-code-parent-agent-id"];

      if (typeof session === "string" && session) {
        return {
          id: `claude:${session}`,
          source: "header",
          ...(typeof agent === "string" ? { agentId: agent } : {}),
          ...(typeof parent === "string" ? { parentAgentId: parent } : {}),
        };
      }
    }

    if (protocol === "openai") {
      const session = headers?.["session-id"] ?? headers?.["thread-id"];
      if (typeof session === "string" && session) {
        return { id: `codex:${session}`, source: "header" };
      }
    }

    const conversation = data?.conversation;
    const conversationId =
      typeof conversation === "string"
        ? conversation
        : conversation && typeof conversation === "object"
          ? (conversation as Record<string, unknown>)?.id
          : undefined;

    if (typeof conversationId === "string" && conversationId) {
      return { id: `openai:${conversationId}`, source: "conversation" };
    }

    const previous = data?.previous_response_id;
    if (typeof previous === "string" && previous) {
      return {
        id: this.responses.get(previous) ?? `run:${runId}`,
        source: this.responses.has(previous) ? "response-chain" : "run",
        previousResponseId: previous,
      };
    }

    return { id: `run:${runId}`, source: "run" };
  }

  /** 将响应 ID 绑定到已识别的内部会话。 */
  bind(responseId: string, sessionId: string): void {
    this.responses.set(responseId, sessionId);
  }
}
