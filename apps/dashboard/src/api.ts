/** 本文件负责访问 Tracelet 本地查询接口和实时事件流。 */

import type { ConversationDetail, ExchangeDetail, SessionSummary } from "./types";

export type ApiKind = "sessions" | "conversation" | "exchange";

export class ApiError extends Error {
  readonly kind: ApiKind;
  readonly status: number;

  /** 创建供界面按当前语言展示的结构化 API 错误。 */
  constructor(kind: ApiKind, status: number) {
    super(`${kind}:${status}`);
    this.kind = kind;
    this.status = status;
  }
}

/** 读取全部会话及其请求摘要。 */
export async function fetchSessions(): Promise<SessionSummary[]> {
  const response = await fetch("/api/sessions");
  if (!response.ok) {
    throw new ApiError("sessions", response.status);
  }
  const body = (await response.json()) as { sessions?: SessionSummary[] };
  return body?.sessions ?? [];
}

/** 读取一个 Session 动态还原后的完整会话。 */
export async function fetchConversation(id: string): Promise<ConversationDetail> {
  const response = await fetch(`/api/conversations/${encodeURIComponent(id)}`);
  if (!response.ok) {
    throw new ApiError("conversation", response.status);
  }
  return (await response.json()) as ConversationDetail;
}

/** 读取一次模型请求的完整记录。 */
export async function fetchExchange(id: string): Promise<ExchangeDetail> {
  const response = await fetch(`/api/exchanges/${encodeURIComponent(id)}`);
  if (!response.ok) {
    throw new ApiError("exchange", response.status);
  }
  return (await response.json()) as ExchangeDetail;
}

/** 订阅记录变化，并返回关闭订阅的方法。 */
export function watchChanges(onChange: () => void): () => void {
  const source = new EventSource("/api/live");
  source.addEventListener("change", onChange);

  /** 关闭当前 Dashboard 的事件流连接。 */
  function close(): void {
    source.removeEventListener("change", onChange);
    source.close();
  }

  return close;
}
