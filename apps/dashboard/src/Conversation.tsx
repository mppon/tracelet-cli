/** 本文件负责展示会话瀑布流、工具调用和底层请求列表。 */

import { useMemo } from "react";
import { formatJson, formatTime, shortId } from "./format";
import { useI18n } from "./i18n";
import type {
  ConversationDetail,
  ConversationItem,
  ConversationKind,
  ConversationTurn,
  ExchangeSummary,
  SessionSummary,
} from "./types";

export type WorkspaceView = "conversation" | "requests";

export type ItemFilter = "all" | ConversationKind;

interface ConversationProps {
  session: SessionSummary | undefined;
  conversation: ConversationDetail | undefined;
  loading: boolean;
  view: WorkspaceView;
  filter: ItemFilter;
  showInternal: boolean;
  selectedExchange: string | undefined;
  /** 切换工作区视图。 */
  onView(view: WorkspaceView): void;
  /** 切换会话内容筛选。 */
  onFilter(filter: ItemFilter): void;
  /** 切换内部任务可见性。 */
  onInternal(value: boolean): void;
  /** 选择需要在右侧检查的 Exchange。 */
  onExchange(id: string): void;
}

/** 返回数组中的最后一个 Exchange ID。 */
function lastId(ids: string[]): string | undefined {
  return ids.at(-1);
}

/** 返回工具状态对应的当前语言文案。 */
function toolStatus(status: ConversationItem["status"], messages: ReturnType<typeof useI18n>["messages"]): string {
  if (status === "error") {
    return messages.conversation.error;
  }
  if (status === "complete") {
    return messages.conversation.complete;
  }
  return messages.conversation.pending;
}

/** 展示消息来源 Exchange 的快捷入口。 */
function ExchangeLink({
  ids,
  selected,
  onSelect,
}: {
  ids: string[];
  selected: string | undefined;
  /** 选择消息关联的最后一次 Exchange。 */
  onSelect(id: string): void;
}) {
  const { messages } = useI18n();
  const id = lastId(ids);
  if (!id) {
    return null;
  }
  return (
    <button
      className={selected === id ? "exchange-link active" : "exchange-link"}
      type="button"
      onClick={() => onSelect(id)}
    >
      {ids.length > 1 ? `${ids.length} ${messages.conversation.exchanges}` : shortId(id)}
    </button>
  );
}

/** 展示位于左右两侧的用户或 AI 消息。 */
function MessageItem({
  item,
  selected,
  onSelect,
}: {
  item: ConversationItem;
  selected: string | undefined;
  /** 选择消息对应的 Exchange。 */
  onSelect(id: string): void;
}) {
  const { locale, messages } = useI18n();
  const user = item?.role === "user";
  return (
    <article className={user ? "conversation-item user" : "conversation-item assistant"}>
      <div className="message-card">
        <div className="message-head">
          <span className="avatar">{user ? "YOU" : "AI"}</span>
          <strong>{user ? messages.conversation.user : messages.conversation.assistant}</strong>
          <time>{formatTime(item?.startedAt, locale)}</time>
          <ExchangeLink ids={item?.exchangeIds ?? []} selected={selected} onSelect={onSelect} />
        </div>
        <div className="message-bubble">{item?.text}</div>
      </div>
    </article>
  );
}

/** 展示可折叠的工具参数和工具结果。 */
function ToolItem({
  item,
  selected,
  onSelect,
}: {
  item: ConversationItem;
  selected: string | undefined;
  /** 选择工具调用对应的 Exchange。 */
  onSelect(id: string): void;
}) {
  const { messages } = useI18n();
  return (
    <article className="tool-item">
      <span className="tool-rail" />
      <details className="tool-card" open>
        <summary>
          <span className="tool-icon">$</span>
          <strong>{item?.name ?? "tool"}</strong>
          <span className={`tool-status ${item?.status ?? "pending"}`}>
            {toolStatus(item?.status, messages)}
          </span>
          <ExchangeLink ids={item?.exchangeIds ?? []} selected={selected} onSelect={onSelect} />
        </summary>
        <div className="tool-content">
          <div className="tool-part">
            <strong>{messages.conversation.toolCall}</strong>
            <pre>{item?.input === undefined ? messages.conversation.noInput : formatJson(item.input)}</pre>
          </div>
          <div className={`tool-part result ${item?.status === "error" ? "error" : ""}`}>
            <strong>{messages.conversation.result}</strong>
            <pre>{item?.output === undefined ? messages.conversation.noOutput : formatJson(item.output)}</pre>
          </div>
        </div>
      </details>
    </article>
  );
}

/** 展示默认收起的 Reasoning 内容。 */
function ReasoningItem({
  item,
  selected,
  onSelect,
}: {
  item: ConversationItem;
  selected: string | undefined;
  /** 选择 Reasoning 对应的 Exchange。 */
  onSelect(id: string): void;
}) {
  const { messages } = useI18n();
  return (
    <details className="reasoning-item">
      <summary>
        <span>{messages.conversation.reasoning}</span>
        <ExchangeLink ids={item?.exchangeIds ?? []} selected={selected} onSelect={onSelect} />
      </summary>
      <p>{item?.text}</p>
    </details>
  );
}

/** 根据内容类型展示一个会话节点。 */
function Item({
  item,
  selected,
  onSelect,
}: {
  item: ConversationItem;
  selected: string | undefined;
  /** 选择当前节点关联的 Exchange。 */
  onSelect(id: string): void;
}) {
  if (item?.kind === "tool") {
    return <ToolItem item={item} selected={selected} onSelect={onSelect} />;
  }
  if (item?.kind === "reasoning") {
    return <ReasoningItem item={item} selected={selected} onSelect={onSelect} />;
  }
  return <MessageItem item={item} selected={selected} onSelect={onSelect} />;
}

/** 展示一个 Turn 内经过筛选的全部节点。 */
function Turn({
  turn,
  filter,
  selected,
  onSelect,
}: {
  turn: ConversationTurn;
  filter: ItemFilter;
  selected: string | undefined;
  /** 选择 Turn 内节点对应的 Exchange。 */
  onSelect(id: string): void;
}) {
  const { messages } = useI18n();
  const items = filter === "all" ? turn?.items : turn?.items?.filter((item) => item?.kind === filter);
  if (!items?.length) {
    return null;
  }
  return (
    <section className={turn?.internal ? "conversation-turn internal" : "conversation-turn"}>
      {turn?.internal ? <span className="internal-badge">{messages.conversation.internal}</span> : null}
      {items.map((item) => (
        <Item item={item} key={item.id} selected={selected} onSelect={onSelect} />
      ))}
    </section>
  );
}

/** 展示按时间排序的底层 Exchange 请求。 */
function Requests({
  exchanges,
  selected,
  onSelect,
}: {
  exchanges: ExchangeSummary[];
  selected: string | undefined;
  /** 选择请求并在检查器中打开。 */
  onSelect(id: string): void;
}) {
  const { locale, messages } = useI18n();
  return (
    <div className="request-view">
      {exchanges.map((exchange, index) => (
        <button
          className={selected === exchange.id ? "request-card active" : "request-card"}
          key={exchange.id}
          type="button"
          onClick={() => onSelect(exchange.id)}
        >
          <span className="request-index">{String(index + 1).padStart(2, "0")}</span>
          <span className="request-main">
            <strong>{exchange.method} · {exchange.model ?? messages.detail.unknownModel}</strong>
            <small>{exchange.path}</small>
          </span>
          <span className="request-side">
            <strong>{exchange.status ?? "—"}</strong>
            <time>{formatTime(exchange.startedAt, locale)}</time>
          </span>
        </button>
      ))}
    </div>
  );
}

/** 展示会话工作区和视图筛选控制。 */
export function Conversation({
  session,
  conversation,
  loading,
  view,
  filter,
  showInternal,
  selectedExchange,
  onView,
  onFilter,
  onInternal,
  onExchange,
}: ConversationProps) {
  const { locale, messages } = useI18n();
  const filters: Array<{ id: ItemFilter; label: string }> = [
    { id: "all", label: messages.conversation.all },
    { id: "message", label: messages.conversation.messages },
    { id: "tool", label: messages.conversation.tools },
    { id: "reasoning", label: messages.conversation.reasoning },
  ];
  const turns = useMemo(
    () => conversation?.turns?.filter((turn) => showInternal || !turn?.internal) ?? [],
    [conversation, showInternal],
  );
  const hasItems = turns.some((turn) => turn?.items?.some((item) => filter === "all" || item?.kind === filter));

  if (!session) {
    return (
      <main className="workspace empty-state">
        <div className="empty-glyph">{"{ }"}</div>
        <h2>{messages.conversation.emptyTitle}</h2>
        <p>{messages.conversation.emptyHint}</p>
      </main>
    );
  }

  return (
    <main className="workspace">
      <header className="workspace-head">
        <div className="workspace-title">
          <h2>{shortId(session.id)}</h2>
          <p>
            {conversation?.model ?? session.exchanges.at(-1)?.model ?? messages.detail.unknownModel}
            {" · "}{formatTime(session.startedAt, locale)}
          </p>
        </div>
        <div className="view-switch" role="tablist" aria-label={messages.conversation.conversation}>
          <button
            aria-selected={view === "conversation"}
            className={view === "conversation" ? "active" : ""}
            type="button"
            onClick={() => onView("conversation")}
          >
            {messages.conversation.conversation}
          </button>
          <button
            aria-selected={view === "requests"}
            className={view === "requests" ? "active" : ""}
            type="button"
            onClick={() => onView("requests")}
          >
            {messages.conversation.requests} · {session.exchanges.length}
          </button>
        </div>
      </header>

      {view === "conversation" ? (
        <div className="conversation-toolbar">
          {filters.map((item) => (
            <button
              className={filter === item.id ? "filter-chip active" : "filter-chip"}
              key={item.id}
              type="button"
              onClick={() => onFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
          <label className={showInternal ? "internal-toggle active" : "internal-toggle"}>
            <input
              checked={showInternal}
              type="checkbox"
              onChange={(event) => onInternal(event.currentTarget.checked)}
            />
            <span />
            {messages.conversation.showInternal}
          </label>
        </div>
      ) : null}

      {view === "requests" ? (
        <Requests exchanges={session.exchanges} selected={selectedExchange} onSelect={onExchange} />
      ) : loading && !conversation ? (
        <div className="workspace-loading"><span className="loader" />{messages.conversation.loading}</div>
      ) : (
        <div className="conversation-view">
          {!hasItems ? <div className="conversation-empty">{messages.conversation.noItems}</div> : null}
          {turns.map((turn) => (
            <Turn
              filter={filter}
              key={turn.id}
              selected={selectedExchange}
              turn={turn}
              onSelect={onExchange}
            />
          ))}
        </div>
      )}
    </main>
  );
}
