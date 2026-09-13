/** 本文件验证任意网络分片下的 SSE 事件切分结果。 */

import { describe, expect, it } from "vitest";
import type { SseRow } from "@tracelet/shared";
import { SseParser } from "@tracelet/recorder";

describe("SseParser", () => {
  /** 验证一个 SSE 事件横跨多个网络 chunk 时仍只生成一个事件。 */
  it("跨 chunk 还原事件", () => {
    const events: SseRow[] = [];
    const parser = new SseParser((event) => events.push(event));

    parser.push(Buffer.from("event: content_block_delta\ndata: {\"type\":"), 0, 100);
    parser.push(Buffer.from("\"content_block_delta\"}\n\n"), 1, 200);
    parser.end();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event: "content_block_delta",
      data: '{"type":"content_block_delta"}',
      firstChunk: 0,
      lastChunk: 1,
    });
  });
});
