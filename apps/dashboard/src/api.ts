/** 本文件负责访问 Tracelet 本地查询接口和实时事件流。 */

import type { ExchangeDetail, SessionSummary } from "./types";

/** 读取全部会话及其请求摘要。 */
export async function fetchSessions(): Promise<SessionSummary[]> {
  const response = await fetch("/api/sessions");
  if (!response.ok) {
    throw new Error(`加载会话失败：${response.status}`);
  }
  const body = (await response.json()) as { sessions?: SessionSummary[] };
  return body?.sessions ?? [];
}

/** 读取一次模型请求的完整记录。 */
export async function fetchExchange(id: string): Promise<ExchangeDetail> {
  const response = await fetch(`/api/exchanges/${encodeURIComponent(id)}`);
  if (!response.ok) {
    throw new Error(`加载请求失败：${response.status}`);
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
