/** 本文件负责把请求、响应、chunk 和 SSE 事件追加到本地文件。 */

import { mkdir, open, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import type { ChunkRow, ExchangeMeta, SseRow } from "@tracelet/shared";
import { writeJson } from "./files.js";

type Side = "request" | "response";

export class ExchangeWriter {
  readonly dir: string;
  private meta: ExchangeMeta;
  private req?: FileHandle;
  private reqIndex?: FileHandle;
  private res?: FileHandle;
  private resIndex?: FileHandle;
  private eventFile?: FileHandle;
  private reqSeq = 0;
  private resSeq = 0;
  private reqOffset = 0;
  private resOffset = 0;
  private pending = Promise.resolve();
  private writeError?: Error;

  /** 创建一个 exchange 文件写入器。 */
  constructor(dir: string, meta: ExchangeMeta) {
    this.dir = dir;
    this.meta = meta;
  }

  /** 创建目录并打开全部追加文件。 */
  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    [this.req, this.reqIndex, this.res, this.resIndex, this.eventFile] = await Promise.all([
      open(join(this.dir, "request.bin"), "a"),
      open(join(this.dir, "request-chunks.jsonl"), "a"),
      open(join(this.dir, "response.bin"), "a"),
      open(join(this.dir, "response-chunks.jsonl"), "a"),
      open(join(this.dir, "sse-events.jsonl"), "a"),
    ]);
    await writeJson(join(this.dir, "meta.json"), this.meta);
  }

  /** 追加一个请求 body chunk，并返回其索引。 */
  addReq(chunk: Uint8Array, tUs: number): number {
    return this.addChunk("request", chunk, tUs);
  }

  /** 追加一个响应 body chunk，并返回其索引。 */
  addRes(chunk: Uint8Array, tUs: number): number {
    return this.addChunk("response", chunk, tUs);
  }

  /** 将解析完成的 SSE 事件追加到事件日志。 */
  addEvent(event: SseRow): void {
    this.enqueue(async () => {
      await this.eventFile?.write(`${JSON.stringify(event)}\n`);
    });
  }

  /** 合并并持久化 exchange 元数据。 */
  patch(next: Partial<ExchangeMeta>): void {
    this.meta = { ...this.meta, ...next };
    const snapshot = { ...this.meta };

    this.enqueue(async () => {
      await writeJson(join(this.dir, "meta.json"), snapshot);
    });
  }

  /** 保存由官方 SDK 生成的完整响应对象。 */
  saveResponse(response: unknown): void {
    this.enqueue(async () => {
      await writeJson(join(this.dir, "reconstructed.json"), response);
    });
  }

  /** 等待全部写入完成并关闭文件。 */
  async close(): Promise<Error | undefined> {
    await this.pending;
    if (this.writeError) {
      this.meta = { ...this.meta, captureComplete: false, error: this.writeError.message };
      await writeJson(join(this.dir, "meta.json"), this.meta);
    }
    await Promise.all([
      this.req?.close(),
      this.reqIndex?.close(),
      this.res?.close(),
      this.resIndex?.close(),
      this.eventFile?.close(),
    ]);
    return this.writeError;
  }

  /** 追加原始字节和对应 chunk 索引。 */
  private addChunk(side: Side, chunk: Uint8Array, tUs: number): number {
    const data = Buffer.from(chunk);
    const seq = side === "request" ? this.reqSeq++ : this.resSeq++;
    const offset = side === "request" ? this.reqOffset : this.resOffset;
    const row: ChunkRow = { seq, tUs, offset, length: data.byteLength };

    if (side === "request") {
      this.reqOffset += data.byteLength;
    } else {
      this.resOffset += data.byteLength;
    }

    this.enqueue(async () => {
      const body = side === "request" ? this.req : this.res;
      const index = side === "request" ? this.reqIndex : this.resIndex;
      await body?.write(data);
      await index?.write(`${JSON.stringify(row)}\n`);
    });

    return seq;
  }

  /** 串行执行文件操作，避免同一 exchange 内的写入乱序。 */
  private enqueue(task: () => Promise<void>): void {
    this.pending = this.pending.then(task).catch((error: unknown) => {
      this.writeError = error instanceof Error ? error : new Error(String(error));
    });
  }
}
