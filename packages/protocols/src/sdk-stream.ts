/** 本文件负责使用官方 SDK 将 SSE 事件还原为完整响应对象。 */

import { MessageStream } from "@anthropic-ai/sdk/lib/MessageStream";
import type { Protocol, SseRow } from "@tracelet/shared";
import { ResponseStream } from "openai/lib/responses/ResponseStream";

const encoder = new TextEncoder();

/** 把已解析的 SSE data 转为官方 SDK 可消费的逐行 JSON 流。 */
function toStream(events: SseRow[]): ReadableStream<Uint8Array> {
  const lines = events
    .map((event) => event.data.trim())
    .filter((data) => data.startsWith("{") && data.endsWith("}"));
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
  const stream = MessageStream.fromReadableStream(toStream(events));
  return stream.finalMessage();
}

/** 使用 OpenAI SDK 的 finalResponse 生成完整 Response。 */
async function buildOpenAI(events: SseRow[]): Promise<unknown> {
  const stream = ResponseStream.fromReadableStream(toStream(events));
  return stream.finalResponse();
}

/** 根据协议调用对应官方 SDK 的流式累加方法。 */
export async function buildResponse(protocol: Protocol, events: SseRow[]): Promise<unknown> {
  return protocol === "anthropic" ? buildAnthropic(events) : buildOpenAI(events);
}
