/** 本文件负责将任意网络 chunk 增量切分为完整 SSE 事件。 */

import type { SseRow } from "@tracelet/shared";

type EventHandler = (event: SseRow) => void;

export class SseParser {
  private readonly decoder = new TextDecoder();
  private readonly onEvent: EventHandler;
  private buffer = "";
  private eventSeq = 0;
  private firstChunk = 0;
  private lastChunk = 0;
  private lastTimeUs = 0;

  /** 创建一个将完整事件交给回调的 SSE 解析器。 */
  constructor(onEvent: EventHandler) {
    this.onEvent = onEvent;
  }

  /** 输入一个原始响应 chunk，并尽可能产出完整事件。 */
  push(chunk: Uint8Array, chunkSeq: number, tUs: number): void {
    if (!this.buffer) {
      this.firstChunk = chunkSeq;
    }

    this.lastChunk = chunkSeq;
    this.lastTimeUs = tUs;
    this.buffer += this.decoder.decode(chunk, { stream: true });
    this.flush(false);
  }

  /** 结束字符解码，并提交最后一个没有空行结尾的事件。 */
  end(): void {
    this.buffer += this.decoder.decode();
    this.flush(true);
  }

  /** 从当前缓冲区依次提取 SSE 事件。 */
  private flush(final: boolean): void {
    let match = this.buffer.match(/\r?\n\r?\n/);

    while (match?.index !== undefined) {
      const raw = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      this.emit(raw);
      this.firstChunk = this.lastChunk;
      match = this.buffer.match(/\r?\n\r?\n/);
    }

    if (final && this.buffer.trim()) {
      this.emit(this.buffer);
      this.buffer = "";
    }
  }

  /** 解析一个完整 SSE block 的 event 和 data 字段。 */
  private emit(raw: string): void {
    if (!raw.trim()) {
      return;
    }

    let event = "message";
    const data: string[] = [];

    for (const line of raw.split(/\r?\n/)) {
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        data.push(line.slice(5).trimStart());
      } else if (line.startsWith(":")) {
        event = "comment";
        data.push(line.slice(1).trimStart());
      }
    }

    this.onEvent({
      seq: this.eventSeq++,
      event,
      data: data.join("\n"),
      raw,
      firstChunk: this.firstChunk,
      lastChunk: this.lastChunk,
      tUs: this.lastTimeUs,
    });
  }
}
