/** 本文件负责展示会话及其模型请求导航列表。 */

import type { SessionSummary } from "./types";
import { formatTime, shortId } from "./format";
import { useI18n, type Locale } from "./i18n";

interface SidebarProps {
  sessions: SessionSummary[];
  selected: string | undefined;
  /** 切换当前展示的 exchange。 */
  onSelect(id: string): void;
}

const locales: Array<{ id: Locale; short: string }> = [
  { id: "zh-CN", short: "中文" },
  { id: "en", short: "EN" },
];

/** 展示按 Session 分组的 Exchange 列表。 */
export function Sidebar({ sessions, selected, onSelect }: SidebarProps) {
  const { locale, messages, setLocale } = useI18n();

  return (
    <aside className="sidebar">
      <header className="brand">
        <span className="brand-mark">T</span>
        <div className="brand-copy">
          <h1>Tracelet</h1>
          <p>{messages.sidebar.subtitle}</p>
        </div>
        <div className="locale-switch" role="group" aria-label={messages.language.label}>
          {locales.map((item) => (
            <button
              aria-pressed={locale === item.id}
              className={locale === item.id ? "active" : ""}
              key={item.id}
              title={item.id === "zh-CN" ? messages.language.chinese : messages.language.english}
              type="button"
              onClick={() => setLocale(item.id)}
            >
              {item.short}
            </button>
          ))}
        </div>
      </header>

      <div className="list-heading">
        <span>{messages.sidebar.sessions}</span>
        <span className="count">{sessions.length}</span>
      </div>

      <div className="session-list">
        {sessions.length === 0 ? (
          <div className="sidebar-empty">
            <span className="empty-glyph">{"{ }"}</span>
            <p>{messages.sidebar.noRecords}</p>
          </div>
        ) : null}

        {sessions.map((session) => (
          <section className="session" key={session.id}>
            <div className="session-head">
              <span className={`provider ${session.protocol}`}>{session.protocol === "anthropic" ? "Claude" : "OpenAI"}</span>
              <strong>{shortId(session.id)}</strong>
              <time>{formatTime(session.startedAt, locale)}</time>
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
                    <strong>{exchange.model ?? messages.sidebar.unknownModel}</strong>
                    <small>{exchange.path}</small>
                  </span>
                  <span
                    className={exchange.captureComplete ? "dot complete" : "dot pending"}
                    title={exchange.captureComplete ? messages.sidebar.complete : messages.sidebar.recording}
                  />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}
