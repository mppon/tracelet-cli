/** 本文件负责协调原始流记录、SSE 分帧、会话识别和 SDK 响应还原。 */

import type { IncomingHttpHeaders } from "node:http";
import { buildResponse, decodeBody, parseRequest } from "@tracelet/protocols";
import {
  elapsedUs,
  makeId,
  nowIso,
  redactHeaders,
  type ExchangeMeta,
  type Protocol,
  type SseRow,
} from "@tracelet/shared";
import { type ExchangeWriter, FileStore } from "@tracelet/storage";
import { SessionResolver } from "./session.js";
import { SseParser } from "./sse.js";

export interface CaptureStart {
  runId: string;
  protocol: Protocol;
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
}

type ChangeHandler = (meta: ExchangeMeta) => void;

export class Capture {
  private readonly writer: ExchangeWriter;
  private readonly resolver: SessionResolver;
  private readonly onChange: ChangeHandler;
  private readonly clock = process.hrtime.bigint();
  private readonly reqParts: Buffer[] = [];
  private readonly resParts: Buffer[] = [];
  private readonly events: SseRow[] = [];
  private readonly parser: SseParser;
  private meta: ExchangeMeta;
  private done = false;

  /** 创建一次请求的完整捕获上下文。 */
  constructor(
    writer: ExchangeWriter,
    resolver: SessionResolver,
    meta: ExchangeMeta,
    onChange: ChangeHandler,
  ) {
    this.writer = writer;
    this.resolver = resolver;
    this.meta = meta;
    this.onChange = onChange;
    this.parser = new SseParser((event) => this.addEvent(event));
  }

  /** 记录一个请求 body chunk。 */
  reqChunk(chunk: Uint8Array): void {
    const data = Buffer.from(chunk);
    this.reqParts.push(data);
    this.meta.requestBytes += data.byteLength;
    this.writer.addReq(data, elapsedUs(this.clock));
  }

  /** 在请求 body 完成后解析模型参数并识别会话。 */
  reqEnd(): void {
    try {
      const raw = Buffer.concat(this.reqParts);
      const body = decodeBody(raw, this.meta.requestHeaders["content-encoding"]);
      const text = Buffer.from(body).toString("utf8");
      const parsed = parseRequest(text);
      const session = this.resolver.resolve(
        this.meta.protocol,
        this.meta.requestHeaders,
        parsed.body,
        this.meta.runId,
      );

      this.meta = {
        ...this.meta,
        sessionId: session.id,
        sessionSource: session.source,
        stream: parsed.stream,
        ...(parsed.model ? { model: parsed.model } : {}),
        ...(session.agentId ? { agentId: session.agentId } : {}),
        ...(session.parentAgentId ? { parentAgentId: session.parentAgentId } : {}),
      };
      this.writer.patch(this.meta);
    } catch {
      // 无法解析的请求仍然保留原始字节并归入当前 run。
    }
  }

  /** 记录上游响应状态和脱敏 Header。 */
  resStart(status: number, headers: IncomingHttpHeaders): void {
    this.meta = {
      ...this.meta,
      responseStatus: status,
      responseHeaders: redactHeaders(headers),
    };
    this.writer.patch(this.meta);
  }

  /** 记录并解析一个上游响应 chunk。 */
  resChunk(chunk: Uint8Array): void {
    const data = Buffer.from(chunk);
    const tUs = elapsedUs(this.clock);
    const seq = this.writer.addRes(data, tUs);

    if (!this.meta.firstByteAt) {
      this.meta.firstByteAt = nowIso();
    }

    this.resParts.push(data);
    this.meta.responseBytes += data.byteLength;
    this.parser.push(data, seq, tUs);
  }

  /** 完成记录，并通过对应官方 SDK 生成完整响应对象。 */
  async end(): Promise<void> {
    if (this.done) {
      return;
    }
    this.done = true;
    this.parser.end();

    try {
      const response = this.meta.stream
        ? await buildResponse(this.meta.protocol, this.events)
        : (JSON.parse(Buffer.concat(this.resParts).toString("utf8")) as unknown);

      this.writer.saveResponse(response);
      this.bindResponse(response);
    } catch (error) {
      this.meta.reconstructError = error instanceof Error ? error.message : String(error);
    }

    this.meta.completedAt = nowIso();
    this.meta.captureComplete = true;
    this.writer.patch(this.meta);
    const writeError = await this.writer.close();

    if (writeError) {
      this.meta.captureComplete = false;
      this.meta.error = writeError.message;
    }

    this.onChange(this.meta);
  }

  /** 标记上游请求失败并结束当前记录。 */
  async fail(error: Error): Promise<void> {
    if (this.done) {
      return;
    }
    this.done = true;
    this.meta = {
      ...this.meta,
      error: error.message,
      completedAt: nowIso(),
      captureComplete: false,
    };
    this.writer.patch(this.meta);
    await this.writer.close();
    this.onChange(this.meta);
  }

  /** 持久化一个完整 SSE 事件。 */
  private addEvent(event: SseRow): void {
    this.events.push(event);
    this.writer.addEvent(event);
  }

  /** 从官方 SDK 响应对象中提取 ID 并延续 OpenAI 响应链。 */
  private bindResponse(response: unknown): void {
    if (this.meta.protocol !== "openai" || !response || typeof response !== "object") {
      return;
    }

    const id = (response as Record<string, unknown>)?.id;
    if (typeof id === "string" && id) {
      this.resolver.bind(id, this.meta.sessionId);
    }
  }
}

export class Recorder {
  private readonly store: FileStore;
  private readonly resolver = new SessionResolver();
  private readonly onChange: ChangeHandler;
  private readonly active = new Set<Promise<void>>();

  /** 创建共享文件存储和会话状态的记录器。 */
  constructor(store: FileStore, onChange: ChangeHandler = () => undefined) {
    this.store = store;
    this.onChange = onChange;
  }

  /** 开始捕获一次模型 HTTP 请求。 */
  async start(input: CaptureStart): Promise<Capture> {
    const meta: ExchangeMeta = {
      id: makeId("ex"),
      runId: input.runId,
      sessionId: `run:${input.runId}`,
      sessionSource: "run",
      protocol: input.protocol,
      method: input.method,
      path: input.path,
      stream: false,
      requestHeaders: redactHeaders(input.headers),
      startedAt: nowIso(),
      requestBytes: 0,
      responseBytes: 0,
      captureComplete: false,
    };
    const writer = await this.store.startExchange(meta);
    this.onChange(meta);
    return new Capture(writer, this.resolver, meta, this.onChange);
  }

  /** 跟踪后台收尾任务，确保服务退出前文件已写完。 */
  track(task: Promise<void>): void {
    this.active.add(task);
    task.finally(() => this.active.delete(task)).catch(() => undefined);
  }

  /** 等待所有正在写入的 exchange 完成。 */
  async drain(): Promise<void> {
    await Promise.allSettled([...this.active]);
  }
}
