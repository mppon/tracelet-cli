/** 本文件负责扫描本地记录并为 Dashboard 组装查询结果。 */

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  ChunkRow,
  ChunkView,
  ExchangeDetail,
  ExchangeMeta,
  ExchangeSummary,
  SessionSummary,
  SseRow,
} from "@tracelet/shared";
import { readJson, readJsonl } from "./files.js";

interface StoredMeta {
  dir: string;
  meta: ExchangeMeta;
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
          result.push({ dir, meta: await readJson<ExchangeMeta>(join(dir, "meta.json")) });
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
    const current = groups.get(item.meta.sessionId);
    if (current) {
      current.exchanges.push(toSummary(item.meta));
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
      exchanges: [toSummary(item.meta)],
    });
  }

  return [...groups.values()].sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

/** 读取一次 exchange 的完整请求、响应、chunk 和事件。 */
export async function getExchange(root: string, id: string): Promise<ExchangeDetail | undefined> {
  const stored = (await scan(root)).find((item) => item.meta.id === id);
  if (!stored) {
    return undefined;
  }

  const [requestBody, responseBody, chunkRows, events] = await Promise.all([
    readFile(join(stored.dir, "request.bin")),
    readFile(join(stored.dir, "response.bin")),
    readJsonl<ChunkRow>(join(stored.dir, "response-chunks.jsonl")),
    readJsonl<SseRow>(join(stored.dir, "sse-events.jsonl")),
  ]);
  const requestText = requestBody.toString("utf8");
  const responseText = responseBody.toString("utf8");
  const chunks: ChunkView[] = chunkRows.map((row) => {
    const data = responseBody.subarray(row.offset, row.offset + row.length);
    return { ...row, text: data.toString("utf8"), base64: data.toString("base64") };
  });

  let request: unknown = requestText;
  let response: unknown = responseText;

  try {
    request = JSON.parse(requestText) as unknown;
  } catch {
    // 非 JSON 请求仍通过原始文本展示。
  }

  try {
    response = await readJson<unknown>(join(stored.dir, "reconstructed.json"));
  } catch {
    // 未完成的流仍通过原始 SSE 文本展示。
  }

  return { meta: stored.meta, requestText, responseText, request, response, chunks, events };
}
