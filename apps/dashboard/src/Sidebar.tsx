/** 本文件负责展示会话及其模型请求导航列表。 */

import type { SessionSummary } from "./types";
import { formatTime, shortId } from "./format";

interface SidebarProps {
  sessions: SessionSummary[];
  selected: string | undefined;
  /** 切换当前展示的 exchange。 */
  onSelect(id: string): void;
}

/** 展示按 Session 分组的 Exchange 列表。 */
export function Sidebar({ sessions, selected, onSelect }: SidebarProps) {
  return (
    <aside className="sidebar">
      <header className="brand">
        <span className="brand-mark">T</span>
        <div>
          <h1>Tracelet</h1>
          <p>Local LLM traces</p>
        </div>
      </header>

      <div className="session-list">
        {sessions.length === 0 ? (
          <div className="empty small">暂无记录，先运行一次 Claude Code 或 Codex。</div>
        ) : null}

        {sessions.map((session) => (
          <section className="session" key={session.id}>
            <div className="session-head">
              <span className={`provider ${session.protocol}`}>{session.protocol === "anthropic" ? "Claude" : "OpenAI"}</span>
              <strong>{shortId(session.id)}</strong>
              <time>{formatTime(session.startedAt)}</time>
            </div>
            <div className="exchange-list">
              {session.exchanges.map((exchange, index) => (
                <button
                  className={selected === exchange.id ? "exchange active" : "exchange"}
                  key={exchange.id}
                  type="button"
                  onClick={() => onSelect(exchange.id)}
                >
                  <span className="exchange-index">{index + 1}</span>
                  <span className="exchange-main">
                    <strong>{exchange.model ?? "unknown model"}</strong>
                    <small>{exchange.path}</small>
                  </span>
                  <span className={exchange.captureComplete ? "dot complete" : "dot pending"} />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}
