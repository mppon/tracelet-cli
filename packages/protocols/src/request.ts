/** 本文件负责解析代理捕获到的完整 LLM 请求体。 */

import type { ParsedRequest } from "@tracelet/shared";

/** 解析请求 JSON，并提取 Dashboard 常用字段。 */
export function parseRequest(text: string): ParsedRequest {
  const body = JSON.parse(text) as Record<string, unknown>;
  const model = typeof body?.model === "string" ? body.model : undefined;

  return {
    ...(model ? { model } : {}),
    stream: body?.stream === true,
    body,
  };
}
