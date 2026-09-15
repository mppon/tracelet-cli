/** 本文件负责加载会话数据并组合 Dashboard 三栏主布局。 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, fetchConversation, fetchExchange, fetchSessions, watchChanges } from "./api";
import { Conversation, type ItemFilter, type WorkspaceView } from "./Conversation";
import { Detail } from "./Detail";
import { useI18n, type Messages } from "./i18n";
import { Sidebar } from "./Sidebar";
import { SplitPane } from "./SplitPane";
import type { ConversationDetail, ExchangeDetail, SessionSummary } from "./types";

/** 将结构化请求错误转换为当前语言的提示。 */
function errorText(reason: unknown, messages: Messages): string {
  if (reason instanceof ApiError) {
    const labels = {
      sessions: messages.app.loadSessionsError,
      conversation: messages.app.loadConversationError,
      exchange: messages.app.loadExchangeError,
    };
    return `${labels[reason.kind]}: HTTP ${reason.status}`;
  }
  return reason instanceof Error ? reason.message : String(reason);
}

/** 返回列表中优先展示的普通会话。 */
function firstSession(sessions: SessionSummary[]): SessionSummary | undefined {
  return sessions.find((session) => !session?.internal) ?? sessions.at(0);
}

/** 管理会话、请求检查器和实时刷新状态。 */
export function App() {
  const { messages } = useI18n();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionId, setSessionId] = useState<string>();
  const [conversation, setConversation] = useState<ConversationDetail>();
  const [exchangeId, setExchangeId] = useState<string>();
  const [detail, setDetail] = useState<ExchangeDetail>();
  const [conversationLoading, setConversationLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showInternal, setShowInternal] = useState(false);
  const [view, setView] = useState<WorkspaceView>("conversation");
  const [filter, setFilter] = useState<ItemFilter>("all");
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<unknown>();

  const session = useMemo(
    () => sessions.find((item) => item.id === sessionId),
    [sessionId, sessions],
  );
  const visibleSessions = useMemo(
    () => sessions.filter((item) => showInternal || !item?.internal),
    [sessions, showInternal],
  );

  /** 刷新会话列表，并在首次加载时选择最新的普通会话。 */
  const loadSessions = useCallback(async (): Promise<void> => {
    try {
      const next = await fetchSessions();
      setSessions(next);
      setSessionId((current) => next.some((item) => item.id === current) ? current : firstSession(next)?.id);
      setRevision((value) => value + 1);
      setError(undefined);
    } catch (reason) {
      setError(reason);
    }
  }, []);

  /** 首次加载会话，并订阅服务端记录变化。 */
  useEffect(() => {
    void loadSessions();
    return watchChanges(() => void loadSessions());
  }, [loadSessions]);

  /** 在会话变化或新增记录时重新还原当前会话。 */
  useEffect(() => {
    if (!sessionId || !session) {
      setConversation(undefined);
      setExchangeId(undefined);
      return;
    }

    setConversationLoading(true);
    fetchConversation(sessionId)
      .then((next) => {
        setConversation(next);
        // 保留用户正在检查的请求；切换会话时默认展示最后一次请求。
        setExchangeId((current) => session.exchanges.some((item) => item.id === current)
          ? current
          : session.exchanges.at(-1)?.id);
        setError(undefined);
      })
      .catch((reason: unknown) => setError(reason))
      .finally(() => setConversationLoading(false));
  }, [revision, session, sessionId]);

  /** 在请求选择或记录更新时刷新右侧详情。 */
  useEffect(() => {
    if (!exchangeId) {
      setDetail(undefined);
      return;
    }

    setDetailLoading(true);
    fetchExchange(exchangeId)
      .then((next) => {
        setDetail(next);
        setError(undefined);
      })
      .catch((reason: unknown) => setError(reason))
      .finally(() => setDetailLoading(false));
  }, [exchangeId, revision]);

  /** 切换会话并默认选中其最后一次底层请求。 */
  function selectSession(id: string): void {
    const next = sessions.find((item) => item.id === id);
    setSessionId(id);
    setExchangeId(next?.exchanges.at(-1)?.id);
    setConversation(undefined);
  }

  /** 控制内部任务的显示，并避免保留一个已隐藏的独立会话。 */
  function toggleInternal(value: boolean): void {
    setShowInternal(value);
    if (!value && session?.internal) {
      const next = firstSession(sessions.filter((item) => !item?.internal));
      setSessionId(next?.id);
      setExchangeId(next?.exchanges.at(-1)?.id);
    }
  }

  return (
    <div className="app-shell">
      <Sidebar sessions={visibleSessions} selected={sessionId} onSelect={selectSession} />
      <SplitPane
        label={messages.conversation.resizePane}
        primary={(
          <Conversation
            conversation={conversation}
            filter={filter}
            loading={conversationLoading}
            selectedExchange={exchangeId}
            session={session}
            showInternal={showInternal}
            view={view}
            onExchange={setExchangeId}
            onFilter={setFilter}
            onInternal={toggleInternal}
            onView={setView}
          />
        )}
        secondary={<Detail detail={detail} loading={detailLoading} />}
      />
      {error ? <div className="toast" role="alert">{errorText(error, messages)}</div> : null}
    </div>
  );
}
