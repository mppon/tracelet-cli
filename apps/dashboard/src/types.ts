/** 本文件定义 Dashboard 从本地 API 读取的数据结构。 */

export interface ChunkView {
  seq: number;
  tUs: number;
  offset: number;
  length: number;
  text: string;
  base64: string;
}

export interface SseEvent {
  seq: number;
  event: string;
  data: string;
  raw: string;
  firstChunk: number;
  lastChunk: number;
  tUs: number;
}

export interface ExchangeSummary {
  id: string;
  runId: string;
  sessionId: string;
  protocol: "anthropic" | "openai";
  method: string;
  path: string;
  model?: string;
  status?: number;
  startedAt: string;
  completedAt?: string;
  responseBytes: number;
  captureComplete: boolean;
}

export interface SessionSummary {
  id: string;
  protocol: "anthropic" | "openai";
  startedAt: string;
  endedAt?: string;
  exchanges: ExchangeSummary[];
}

export interface ExchangeDetail {
  meta: ExchangeSummary & {
    sessionSource: string;
    requestHeaders: Record<string, string | string[]>;
    responseHeaders?: Record<string, string | string[]>;
    responseStatus?: number;
    requestBytes: number;
    responseBytes: number;
    firstByteAt?: string;
    reconstructError?: string;
    error?: string;
  };
  requestText: string;
  responseText: string;
  request: unknown;
  response: unknown;
  chunks: ChunkView[];
  events: SseEvent[];
}
