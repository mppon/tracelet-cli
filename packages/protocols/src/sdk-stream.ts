/** 本文件负责使用官方 SDK 将 SSE 事件还原为完整响应对象。 */

import { MessageStream } from "@anthropic-ai/sdk/lib/MessageStream";
import type { Protocol, SseRow } from "@tracelet/shared";
import { ResponseStream } from "openai/lib/responses/ResponseStream";

const encoder = new TextEncoder();

/** 提取官方 SDK 可消费的逐行 JSON 事件。 */
function jsonLines(events: SseRow[]): string[] {
  return events
    .map((event) => event.data.trim())
    .filter((data) => data.startsWith("{") && data.endsWith("}"));
}

/** 返回最后一个 response.completed 事件的位置。 */
function completedIndex(values: Record<string, unknown>[]): number {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index]?.type === "response.completed") {
      return index;
    }
  }
  return -1;
}

/** 兼容 Codex lite 终态中 output 为空的流式响应。 */
function fixLite(lines: string[]): string[] {
  const values = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  const created = values.findIndex((value) => value.type === "response.created");
  const firstItem = values.findIndex((value) => value.type === "response.output_item.added");
  const completed = completedIndex(values);
  const terminal = values[completed]?.response as { output?: unknown[] } | undefined;

  if (created < 0 || firstItem <= created || completed <= firstItem || terminal?.output?.length !== 0) {
    return lines;
  }

  // 保留前置生命周期事件，再由 SDK 在 lite 终态上继续累加完整 output。
  return [
    ...lines.slice(0, firstItem),
    lines[completed]!,
    ...lines.slice(firstItem, completed),
    ...lines.slice(completed + 1),
  ];
}

/** 把逐行 JSON 转为官方 SDK 可消费的 ReadableStream。 */
function toStream(lines: string[]): ReadableStream<Uint8Array> {
  let index = 0;

  return new ReadableStream<Uint8Array>({
    /** 每次拉取时向 SDK 提供一个完整的 JSON 事件。 */
    pull(controller) {
      const line = lines[index];
      if (line === undefined) {
        controller.close();
        return;
      }

      controller.enqueue(encoder.encode(`${line}\n`));
      index += 1;
    },
  });
}

/** 使用 Anthropic SDK 的 finalMessage 生成完整 Message。 */
async function buildAnthropic(events: SseRow[]): Promise<unknown> {
  const stream = MessageStream.fromReadableStream(toStream(jsonLines(events)));
  return stream.finalMessage();
}

/** 使用 OpenAI SDK 的 finalResponse 生成完整 Response。 */
async function buildOpenAI(events: SseRow[]): Promise<unknown> {
  const stream = ResponseStream.fromReadableStream(toStream(fixLite(jsonLines(events))));
  return stream.finalResponse();
}

/** 根据协议调用对应官方 SDK 的流式累加方法。 */
export async function buildResponse(protocol: Protocol, events: SseRow[]): Promise<unknown> {
  return protocol === "anthropic" ? buildAnthropic(events) : buildOpenAI(events);
}
