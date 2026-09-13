/** 本文件负责加载会话数据并组合 Dashboard 主布局。 */

import { useCallback, useEffect, useState } from "react";
import { fetchExchange, fetchSessions, watchChanges } from "./api";
import { Detail } from "./Detail";
import { Sidebar } from "./Sidebar";
import type { ExchangeDetail, SessionSummary } from "./types";

/** 管理会话列表、当前选择和实时刷新。 */
export function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selected, setSelected] = useState<string>();
  const [detail, setDetail] = useState<ExchangeDetail>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  /** 刷新会话列表，并在首次加载时选择最新请求。 */
  const loadSessions = useCallback(async (): Promise<void> => {
    try {
      const next = await fetchSessions();
      setSessions(next);
      setSelected((current) => current ?? next.at(0)?.exchanges.at(-1)?.id);
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, []);

  /** 首次加载会话，并订阅服务端记录变化。 */
  useEffect(() => {
    void loadSessions();
    return watchChanges(() => void loadSessions());
  }, [loadSessions]);

  /** 在选择或会话数据变化时刷新当前请求详情。 */
  useEffect(() => {
    if (!selected) {
      setDetail(undefined);
      return;
    }

    setLoading(true);
    fetchExchange(selected)
      .then((next) => {
        setDetail(next);
        setError(undefined);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => setLoading(false));
  }, [selected, sessions]);

  return (
    <div className="app-shell">
      <Sidebar sessions={sessions} selected={selected} onSelect={setSelected} />
      <Detail detail={detail} loading={loading} />
      {error ? <div className="toast" role="alert">{error}</div> : null}
    </div>
  );
}
