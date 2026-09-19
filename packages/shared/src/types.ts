/** 本文件定义 Tracelet 各模块共享的数据结构。 */

export type AgentType = "claude" | "codex";

export type Protocol = "anthropic" | "openai";

export type SessionSource = "header" | "conversation" | "response-chain" | "run";

export type HeaderValue = string | string[];

export type HeaderMap = Record<string, HeaderValue>;

export interface RunMeta {
  id: string;
  agent: string;
  agentLabel?: string;
  cwd: string;
  command: string;
  startedAt: string;
  endedAt?: string;
  exitCode?: number;
}

export interface ExchangeMeta {
  id: string;
  runId: string;
  sessionId: string;
  sessionSource: SessionSource;
  protocol: Protocol;
  method: string;
  path: string;
  model?: string;
  stream: boolean;
  agentId?: string;
  parentAgentId?: string;
  requestHeaders: HeaderMap;
  responseHeaders?: HeaderMap;
  responseStatus?: number;
  startedAt: string;
  firstByteAt?: string;
  completedAt?: string;
  requestBytes: number;
  responseBytes: number;
  captureComplete: boolean;
  error?: string;
  reconstructError?: string;
}

export interface ChunkRow {
  seq: number;
  tUs: number;
  offset: number;
  length: number;
}

export interface ChunkView extends ChunkRow {
  text: string;
  base64: string;
}

export interface SseRow {
  seq: number;
  event: string;
  data: string;
  raw: string;
  firstChunk: number;
  lastChunk: number;
  tUs: number;
}

export interface ParsedRequest {
  model?: string;
  stream: boolean;
  body: unknown;
}

export interface SessionMatch {
  id: string;
  source: SessionSource;
  agentId?: string;
  parentAgentId?: string;
  previousResponseId?: string;
}

export interface RouteInfo {
  runId: string;
  protocol: Protocol;
  upstream: string;
  prefix: string;
  proxy?: string;
}

export interface ExchangeSummary {
  id: string;
  runId: string;
  sessionId: string;
  protocol: Protocol;
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
  protocol: Protocol;
  agentLabel?: string;
  startedAt: string;
  endedAt?: string;
  internal?: boolean;
  exchanges: ExchangeSummary[];
}

export type ConversationKind = "message" | "tool" | "reasoning";

export type ConversationRole = "user" | "assistant";

export interface ConversationItem {
  id: string;
  kind: ConversationKind;
  role?: ConversationRole;
  text?: string;
  name?: string;
  callId?: string;
  input?: unknown;
  output?: unknown;
  status?: "pending" | "complete" | "error";
  startedAt: string;
  exchangeIds: string[];
}

export interface ConversationTurn {
  id: string;
  internal: boolean;
  startedAt: string;
  completedAt?: string;
  exchangeIds: string[];
  items: ConversationItem[];
}

export interface ConversationSystemPrompt {
  text: string;
  exchangeIds: string[];
}

export interface ConversationDetail {
  sessionId: string;
  protocol: Protocol;
  model?: string;
  systemPrompt?: ConversationSystemPrompt;
  startedAt: string;
  endedAt?: string;
  exchangeIds: string[];
  turns: ConversationTurn[];
}

export interface ExchangeDetail {
  meta: ExchangeMeta;
  requestText: string;
  responseText: string;
  request: unknown;
  response: unknown;
  chunks: ChunkView[];
  events: SseRow[];
}
