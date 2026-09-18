/** 本文件负责从现有请求与响应记录中还原会话、消息和工具调用。 */

import type {
  ConversationDetail,
  ConversationItem,
  ConversationKind,
  ConversationRole,
  ConversationSystemPrompt,
  ConversationTurn,
  ExchangeDetail,
  HeaderValue,
  SessionSummary,
} from "@tracelet/shared";

type DraftKind = ConversationKind | "tool-result";

interface DraftItem {
  sourceId?: string;
  kind: DraftKind;
  role?: ConversationRole;
  text?: string;
  name?: string;
  callId?: string;
  input?: unknown;
  output?: unknown;
  status?: "pending" | "complete" | "error";
}

interface TurnMeta {
  id?: string;
  internal: boolean;
}

/** 将未知值收窄为普通对象。 */
function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/** 将未知值收窄为数组。 */
function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** 返回非空字符串值。 */
function string(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/** 返回单值 Header 文本。 */
function header(value: HeaderValue | undefined): string | undefined {
  return string(Array.isArray(value) ? value[0] : value);
}

/** 安全解析 JSON 字符串。 */
function json(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

/** 生成可用于消息去重的稳定文本。 */
function stable(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** 判断文本是否属于 Agent 注入的运行环境上下文。 */
function isContext(text: string): boolean {
  const value = text.trim();
  return value.startsWith("<system-reminder>")
    || value.startsWith("<environment_context>")
    || value.startsWith("<in-app-browser-context")
    || value.startsWith("<recommended_plugins>")
    || value.startsWith("<skills_instructions>")
    || value.startsWith("# AGENTS.md instructions");
}

/** 在缺少结构化元数据时，判断 Claude 请求是否为内部任务。 */
function isInternalText(text: string): boolean {
  return text.includes("Write the title in the predominant language")
    || text.includes("Generate a concise, single-line task title")
    || text.includes("The user stepped away and is coming back. Recap");
}

/** 从多形态内容中提取可展示文本，并排除运行环境注入内容。 */
function contentText(value: unknown): string | undefined {
  if (typeof value === "string") {
    return isContext(value) ? undefined : string(value);
  }

  const parts = array(value)
    .map((item) => record(item))
    .filter((item) => item?.type === "text" || item?.type === "input_text" || item?.type === "output_text")
    .map((item) => string(item?.text))
    .filter((text): text is string => typeof text === "string" && !isContext(text));
  return string(parts.join("\n\n"));
}

/** 从系统提示词的字符串或内容块中提取完整文本。 */
function promptText(value: unknown): string | undefined {
  if (typeof value === "string") {
    return string(value);
  }

  const parts = array(value)
    .map((item) => record(item))
    .filter((item) => item?.type === "text" || item?.type === "input_text" || item?.type === "output_text")
    .map((item) => string(item?.text))
    .filter((text): text is string => Boolean(text));
  return string(parts.join("\n\n"));
}

/** 从 Claude 或 OpenAI 请求中提取系统与 Developer 提示词。 */
function systemText(exchange: ExchangeDetail): string | undefined {
  const body = record(exchange?.request);
  const parts = [promptText(body?.system), promptText(body?.instructions)]
    .filter((text): text is string => Boolean(text));

  for (const raw of array(body?.input)) {
    const item = record(raw);
    if (item?.type !== "message" || (item?.role !== "system" && item?.role !== "developer")) {
      continue;
    }
    const text = promptText(item?.content);
    if (text) {
      parts.push(text);
    }
  }

  return string(parts.join("\n\n"));
}

/** 从 Reasoning 或 Thinking 内容中提取文本。 */
function reasoningText(value: Record<string, unknown>): string | undefined {
  const summary = array(value?.summary)
    .map((item) => string(record(item)?.text))
    .filter((text): text is string => Boolean(text));
  return string(summary.join("\n\n"))
    ?? string(value?.thinking)
    ?? contentText(value?.content);
}

/** 将 Claude 单条 message 展开为消息、思考和工具草稿。 */
function claudeMessage(value: unknown, responseId?: string): DraftItem[] {
  const message = record(value);
  const role = message?.role === "user" || message?.role === "assistant" ? message.role : undefined;
  if (!role) {
    return [];
  }

  const content = message?.content;
  const result: DraftItem[] = [];
  const text = contentText(content);
  if (text) {
    result.push({
      ...(responseId ? { sourceId: responseId } : {}),
      kind: "message",
      role,
      text,
    });
  }

  for (const raw of array(content)) {
    const item = record(raw);
    const type = string(item?.type);
    if (type === "thinking") {
      const thinking = reasoningText(item ?? {});
      if (thinking) {
        result.push({
          ...(responseId ? { sourceId: `${responseId}:reasoning` } : {}),
          kind: "reasoning",
          role: "assistant",
          text: thinking,
        });
      }
    }
    if (type === "tool_use") {
      const callId = string(item?.id);
      result.push({
        ...(callId ? { sourceId: callId, callId } : {}),
        kind: "tool",
        role: "assistant",
        name: string(item?.name) ?? "tool",
        input: item?.input,
        status: "pending",
      });
    }
    if (type === "tool_result") {
      const callId = string(item?.tool_use_id);
      result.push({
        kind: "tool-result",
        ...(callId ? { callId } : {}),
        output: item?.content,
        status: item?.is_error === true ? "error" : "complete",
      });
    }
  }

  return result;
}

/** 将 Codex Responses item 转为统一会话草稿。 */
function codexItem(value: unknown): DraftItem[] {
  const item = record(value);
  const type = string(item?.type);
  if (!type) {
    return [];
  }

  if (type === "message") {
    const role = item?.role === "user" || item?.role === "assistant" ? item.role : undefined;
    const text = role ? contentText(item?.content) : undefined;
    const sourceId = string(item?.id);
    return role && text ? [{
      ...(sourceId ? { sourceId } : {}),
      kind: "message",
      role,
      text,
    }] : [];
  }

  if (type === "reasoning") {
    const text = reasoningText(item ?? {});
    const sourceId = string(item?.id);
    return text ? [{
      ...(sourceId ? { sourceId } : {}),
      kind: "reasoning",
      role: "assistant",
      text,
    }] : [];
  }

  if (type.endsWith("_call_output")) {
    const callId = string(item?.call_id);
    return [{
      kind: "tool-result",
      ...(callId ? { callId } : {}),
      output: item?.output,
      status: "complete",
    }];
  }

  if (type.endsWith("_call")) {
    const callId = string(item?.call_id) ?? string(item?.id);
    const input = item?.arguments ?? item?.input ?? item?.action;
    return [{
      ...(callId ? { sourceId: callId, callId } : {}),
      kind: "tool",
      role: "assistant",
      name: string(item?.name) ?? type.replace(/_call$/, ""),
      input: json(input),
      status: "pending",
    }];
  }

  return [];
}

/** 提取一次请求携带的全部会话草稿。 */
function requestItems(exchange: ExchangeDetail): DraftItem[] {
  const body = record(exchange?.request);
  if (exchange?.meta?.protocol === "anthropic") {
    return array(body?.messages).flatMap((message) => claudeMessage(message));
  }
  return array(body?.input).flatMap((item) => codexItem(item));
}

/** 提取一次已还原响应产生的全部会话草稿。 */
function responseItems(exchange: ExchangeDetail): DraftItem[] {
  const body = record(exchange?.response);
  if (exchange?.meta?.protocol === "anthropic") {
    return claudeMessage(body, string(body?.id));
  }
  return array(body?.output).flatMap((item) => codexItem(item));
}

/** 读取 Codex Turn 元数据，并识别内部任务。 */
function turnMeta(exchange: ExchangeDetail): TurnMeta {
  const body = record(exchange?.request);
  const client = record(body?.client_metadata);
  const encoded = header(exchange?.meta?.requestHeaders?.["x-codex-turn-metadata"]);
  const metadata = record(json(encoded));
  const source = string(client?.thread_source) ?? string(metadata?.thread_source);
  const id = string(client?.turn_id) ?? string(metadata?.turn_id);
  const claudeInternal = exchange?.meta?.protocol === "anthropic"
    && isInternalText(requestItems(exchange)
      .filter((item) => item?.kind === "message")
      .map((item) => item?.text ?? "")
      .join("\n"));

  return {
    ...(id ? { id } : {}),
    internal: source === "system" || claudeInternal,
  };
}

/** 生成会话草稿的内容指纹。 */
function fingerprint(item: DraftItem): string {
  return stable({
    kind: item?.kind,
    role: item?.role,
    text: item?.text,
    name: item?.name,
    callId: item?.callId,
    input: item?.input,
    output: item?.output,
  });
}

/** 返回数组中最后一个用户消息的位置。 */
function lastUser(items: DraftItem[]): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item?.kind === "message" && item?.role === "user") {
      return index;
    }
  }
  return -1;
}

/** 返回会话最后一次请求使用的模型。 */
function lastModel(session: SessionSummary): string | undefined {
  for (let index = session.exchanges.length - 1; index >= 0; index -= 1) {
    const model = session.exchanges[index]?.model;
    if (model) {
      return model;
    }
  }
  return undefined;
}

class Builder {
  private readonly session: SessionSummary;
  private readonly turns: ConversationTurn[] = [];
  private readonly turnMap = new Map<string, ConversationTurn>();
  private readonly tools = new Map<string, ConversationItem>();
  private readonly ids = new Set<string>();
  private readonly seen = new Set<string>();
  private readonly max = new Map<string, number>();
  private systemPrompt?: ConversationSystemPrompt;
  private current?: ConversationTurn;
  private turnSeq = 0;
  private itemSeq = 0;

  /** 创建指定会话的增量还原状态。 */
  constructor(session: SessionSummary) {
    this.session = session;
  }

  /** 将一次 Exchange 合并到当前会话。 */
  add(exchange: ExchangeDetail): void {
    const prompt = systemText(exchange);
    if (prompt && !this.systemPrompt) {
      this.systemPrompt = { text: prompt, exchangeIds: [exchange.meta.id] };
    } else if (prompt && this.systemPrompt?.text === prompt) {
      this.link(this.systemPrompt.exchangeIds, exchange.meta.id);
    }

    const meta = turnMeta(exchange);
    const input = this.snapshot(requestItems(exchange));
    const userIndex = lastUser(input);

    input.forEach((item, index) => {
      const newTurn = item?.kind === "message" && item?.role === "user";
      const explicit = newTurn && index === userIndex ? meta.id : undefined;
      const turn = newTurn
        ? this.turn(explicit, meta.internal, exchange, true)
        : this.turn(meta.id, meta.internal, exchange, false);
      this.item(turn, item, exchange);
    });

    for (const item of this.fresh(responseItems(exchange))) {
      const turn = this.turn(meta.id, meta.internal, exchange, false);
      this.item(turn, item, exchange);
    }

    if (this.current && exchange?.meta?.completedAt) {
      this.current.completedAt = exchange.meta.completedAt;
    }
  }

  /** 返回完成去重和工具关联的会话对象。 */
  build(): ConversationDetail {
    const model = lastModel(this.session);
    return {
      sessionId: this.session.id,
      protocol: this.session.protocol,
      ...(model ? { model } : {}),
      ...(this.systemPrompt ? { systemPrompt: this.systemPrompt } : {}),
      startedAt: this.session.startedAt,
      ...(this.session.endedAt ? { endedAt: this.session.endedAt } : {}),
      exchangeIds: this.session.exchanges.map((item) => item.id),
      turns: this.turns.filter((turn) => turn?.items?.length > 0),
    };
  }

  /** 从请求快照中筛选尚未出现的内容。 */
  private snapshot(items: DraftItem[]): DraftItem[] {
    const counts = new Map<string, number>();
    return items.filter((item) => {
      const base = fingerprint(item);
      const occurrence = (counts.get(base) ?? 0) + 1;
      counts.set(base, occurrence);
      const token = `${base}:${occurrence}`;
      const sourceId = item?.sourceId;
      const duplicate = this.seen.has(token) || Boolean(sourceId && this.ids.has(sourceId));
      this.seen.add(token);
      this.max.set(base, Math.max(this.max.get(base) ?? 0, occurrence));
      if (sourceId) {
        this.ids.add(sourceId);
      }
      return !duplicate;
    });
  }

  /** 将响应中的新内容加入全局去重集合。 */
  private fresh(items: DraftItem[]): DraftItem[] {
    return items.filter((item) => {
      const sourceId = item?.sourceId;
      if (sourceId && this.ids.has(sourceId)) {
        return false;
      }
      const base = fingerprint(item);
      const occurrence = (this.max.get(base) ?? 0) + 1;
      this.max.set(base, occurrence);
      this.seen.add(`${base}:${occurrence}`);
      if (sourceId) {
        this.ids.add(sourceId);
      }
      return true;
    });
  }

  /** 获取已有 Turn，或在需要时创建新 Turn。 */
  private turn(
    explicit: string | undefined,
    internal: boolean,
    exchange: ExchangeDetail,
    force: boolean,
  ): ConversationTurn {
    const known = explicit ? this.turnMap.get(explicit) : undefined;
    if (known && !force) {
      this.link(known.exchangeIds, exchange.meta.id);
      this.current = known;
      return known;
    }
    if (!force && this.current) {
      this.link(this.current.exchangeIds, exchange.meta.id);
      this.current.internal = this.current.internal && internal;
      return this.current;
    }

    const id = explicit ?? `${this.session.id}:turn:${++this.turnSeq}`;
    const turn: ConversationTurn = {
      id,
      internal,
      startedAt: exchange.meta.startedAt,
      ...(exchange.meta.completedAt ? { completedAt: exchange.meta.completedAt } : {}),
      exchangeIds: [exchange.meta.id],
      items: [],
    };
    this.turns.push(turn);
    this.turnMap.set(id, turn);
    this.current = turn;
    return turn;
  }

  /** 将草稿追加为消息、思考或工具节点。 */
  private item(turn: ConversationTurn, draft: DraftItem, exchange: ExchangeDetail): void {
    if (draft?.kind === "tool-result") {
      this.toolResult(turn, draft, exchange);
      return;
    }

    if (draft?.kind === "tool") {
      const callId = draft?.callId;
      const known = callId ? this.tools.get(callId) : undefined;
      if (known) {
        known.input ??= draft.input;
        this.link(known.exchangeIds, exchange.meta.id);
        return;
      }
    }

    const item: ConversationItem = {
      id: draft?.sourceId ?? `${exchange.meta.id}:item:${++this.itemSeq}`,
      kind: draft.kind as ConversationKind,
      ...(draft.role ? { role: draft.role } : {}),
      ...(draft.text ? { text: draft.text } : {}),
      ...(draft.name ? { name: draft.name } : {}),
      ...(draft.callId ? { callId: draft.callId } : {}),
      ...(draft.input !== undefined ? { input: draft.input } : {}),
      ...(draft.output !== undefined ? { output: draft.output } : {}),
      ...(draft.status ? { status: draft.status } : {}),
      startedAt: exchange.meta.startedAt,
      exchangeIds: [exchange.meta.id],
    };
    turn.items.push(item);
    if (item.kind === "tool" && item.callId) {
      this.tools.set(item.callId, item);
    }
  }

  /** 将工具结果绑定到同一调用卡片。 */
  private toolResult(turn: ConversationTurn, draft: DraftItem, exchange: ExchangeDetail): void {
    const known = draft?.callId ? this.tools.get(draft.callId) : undefined;
    if (known) {
      known.output = draft.output;
      known.status = draft.status ?? "complete";
      this.link(known.exchangeIds, exchange.meta.id);
      this.link(turn.exchangeIds, exchange.meta.id);
      return;
    }

    this.item(turn, {
      kind: "tool",
      role: "assistant",
      name: "tool",
      ...(draft?.callId ? { callId: draft.callId } : {}),
      output: draft.output,
      status: draft.status ?? "complete",
    }, exchange);
  }

  /** 向 ID 列表追加不重复的 Exchange。 */
  private link(ids: string[], id: string): void {
    if (!ids.includes(id)) {
      ids.push(id);
    }
  }
}

/** 从按时间排序的 Exchange 中还原完整会话。 */
export function buildConversation(
  session: SessionSummary,
  exchanges: ExchangeDetail[],
): ConversationDetail {
  const builder = new Builder(session);
  const ordered = [...exchanges].sort((left, right) => left.meta.startedAt.localeCompare(right.meta.startedAt));
  ordered.forEach((exchange) => builder.add(exchange));
  return builder.build();
}
