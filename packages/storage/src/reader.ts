/** 本文件负责扫描本地记录并为 Dashboard 组装查询结果。 */

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { buildResponse, decodeBody, parseRequest } from "@tracelet/protocols";
import type {
  ChunkRow,
  ChunkView,
  ExchangeDetail,
  ExchangeMeta,
  ExchangeSummary,
  ConversationDetail,
  SessionSummary,
  SseRow,
} from "@tracelet/shared";
import { readJson, readJsonl } from "./files.js";
import { buildConversation } from "./conversation.js";

interface StoredMeta {
  dir: string;
  meta: ExchangeMeta;
}

/** 判断一次记录是否属于 Dashboard 需要展示的模型交互。 */
function isVisible(meta: ExchangeMeta): boolean {
  const path = meta.path.split("?", 1)[0];
  if (meta.method !== "POST") {
    return false;
  }
  // 只让实际推理接口进入会话，模型列表和健康检查仍保留在磁盘。
  return meta.protocol === "anthropic"
    ? Boolean(path?.endsWith("/messages"))
    : Boolean(path?.endsWith("/responses") || path?.endsWith("/chat/completions"));
}

/** 判断 Codex Exchange 是否由系统后台任务发起。 */
function isInternal(meta: ExchangeMeta): boolean {
  const value = meta.requestHeaders?.["x-codex-turn-metadata"];
  const text = Array.isArray(value) ? value[0] : value;
  if (!text) {
    return false;
  }
  try {
    return (JSON.parse(text) as { thread_source?: string })?.thread_source === "system";
  } catch {
    return false;
  }
}

/** 使用 Codex 请求 Header 修正旧记录中的会话归属。 */
function normalizeMeta(meta: ExchangeMeta): ExchangeMeta {
  if (meta.protocol !== "openai" || meta.sessionSource !== "run") {
    return meta;
  }

  const session = meta.requestHeaders["session-id"] ?? meta.requestHeaders["thread-id"];
  return typeof session === "string" && session
    ? { ...meta, sessionId: `codex:${session}`, sessionSource: "header" }
    : meta;
}

/** 按记录的 Content-Encoding 返回可展示的请求文本。 */
function decodeText(body: Buffer, meta: ExchangeMeta): string {
  const decoded = decodeBody(body, meta.requestHeaders["content-encoding"]);
  return Buffer.from(decoded).toString("utf8");
}

/** 读取目录；目录不存在时返回空列表。 */
async function readDirs(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

/** 扫描全部 exchange 元数据。 */
async function scan(root: string): Promise<StoredMeta[]> {
  const result: StoredMeta[] = [];
  const runsRoot = join(root, "runs");

  for (const date of await readDirs(runsRoot)) {
    const dateDir = join(runsRoot, date);
    for (const run of await readDirs(dateDir)) {
      const exchangesDir = join(dateDir, run, "exchanges");
      for (const exchange of await readDirs(exchangesDir)) {
        const dir = join(exchangesDir, exchange);
        try {
          const meta = await readJson<ExchangeMeta>(join(dir, "meta.json"));
          result.push({ dir, meta: normalizeMeta(meta) });
        } catch {
          // 未完成的损坏记录不进入 Dashboard 列表。
        }
      }
    }
  }

  return result.sort((left, right) => left.meta.startedAt.localeCompare(right.meta.startedAt));
}

/** 将 exchange 元数据缩减为列表摘要。 */
function toSummary(meta: ExchangeMeta): ExchangeSummary {
  return {
    id: meta.id,
    runId: meta.runId,
    sessionId: meta.sessionId,
    protocol: meta.protocol,
    method: meta.method,
    path: meta.path,
    ...(meta.model ? { model: meta.model } : {}),
    ...(meta.responseStatus ? { status: meta.responseStatus } : {}),
    startedAt: meta.startedAt,
    ...(meta.completedAt ? { completedAt: meta.completedAt } : {}),
    responseBytes: meta.responseBytes,
    captureComplete: meta.captureComplete,
  };
}

/** 按会话聚合所有请求，供 Dashboard 左侧导航使用。 */
export async function listSessions(root: string): Promise<SessionSummary[]> {
  const groups = new Map<string, SessionSummary>();

  for (const item of await scan(root)) {
    if (!isVisible(item.meta)) {
      continue;
    }

    const current = groups.get(item.meta.sessionId);
    if (current) {
      current.exchanges.push(toSummary(item.meta));
      current.internal = current.internal === true && isInternal(item.meta);
      if (item.meta.completedAt) {
        current.endedAt = item.meta.completedAt;
      }
      continue;
    }

    groups.set(item.meta.sessionId, {
      id: item.meta.sessionId,
      protocol: item.meta.protocol,
      startedAt: item.meta.startedAt,
      ...(item.meta.completedAt ? { endedAt: item.meta.completedAt } : {}),
      ...(isInternal(item.meta) ? { internal: true } : {}),
      exchanges: [toSummary(item.meta)],
    });
  }

  return [...groups.values()].sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

/** 读取一次 exchange 的完整请求、响应、chunk 和事件。 */
async function readExchange(stored: StoredMeta): Promise<ExchangeDetail> {
  const [requestBody, responseBody, chunkRows, events] = await Promise.all([
    readFile(join(stored.dir, "request.bin")),
    readFile(join(stored.dir, "response.bin")),
    readJsonl<ChunkRow>(join(stored.dir, "response-chunks.jsonl")),
    readJsonl<SseRow>(join(stored.dir, "sse-events.jsonl")),
  ]);
  let requestText = requestBody.toString("utf8");
  try {
    requestText = decodeText(requestBody, stored.meta);
  } catch {
    // 不支持的编码仍回退到原始文本，保证旧记录可以打开。
  }
  const responseText = responseBody.toString("utf8");
  const chunks: ChunkView[] = chunkRows.map((row) => {
    const data = responseBody.subarray(row.offset, row.offset + row.length);
    return { ...row, text: data.toString("utf8"), base64: data.toString("base64") };
  });

  let meta = stored.meta;
  let request: unknown = requestText;
  let response: unknown = responseText;

  try {
    const parsed = parseRequest(requestText);
    request = parsed.body;
    meta = {
      ...meta,
      stream: parsed.stream,
      ...(parsed.model ? { model: parsed.model } : {}),
    };
  } catch {
    // 非 JSON 请求仍通过原始文本展示。
  }

  try {
    response = await readJson<unknown>(join(stored.dir, "reconstructed.json"));
  } catch {
    try {
      if (events.length > 0) {
        response = await buildResponse(meta.protocol, events);
        const { reconstructError: _error, ...validMeta } = meta;
        meta = validMeta;
      }
    } catch {
      // 无法还原的流仍通过原始 SSE 文本展示。
    }
  }

  return { meta, requestText, responseText, request, response, chunks, events };
}

/** 读取一次 exchange 的完整请求、响应、chunk 和事件。 */
export async function getExchange(root: string, id: string): Promise<ExchangeDetail | undefined> {
  const stored = (await scan(root)).find((item) => item.meta.id === id);
  return stored ? readExchange(stored) : undefined;
}

/** 从现有 Exchange 动态还原指定会话。 */
export async function getConversation(root: string, sessionId: string): Promise<ConversationDetail | undefined> {
  const stored = (await scan(root)).filter(
    (item) => item.meta.sessionId === sessionId && isVisible(item.meta),
  );
  if (stored.length === 0) {
    return undefined;
  }

  const exchanges = await Promise.all(stored.map((item) => readExchange(item)));
  const first = stored[0]!.meta;
  const last = stored.at(-1)!.meta;
  const session: SessionSummary = {
    id: sessionId,
    protocol: first.protocol,
    startedAt: first.startedAt,
    ...(last.completedAt ? { endedAt: last.completedAt } : {}),
    exchanges: stored.map((item) => toSummary(item.meta)),
  };
  return buildConversation(session, exchanges);
}
