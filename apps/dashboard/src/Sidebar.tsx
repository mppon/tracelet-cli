/** 本文件负责展示会话导航和界面语言切换。 */

import { formatTime, shortId } from "./format";
import { useI18n, type Locale } from "./i18n";
import type { SessionSummary } from "./types";

interface SidebarProps {
  sessions: SessionSummary[];
  selected: string | undefined;
  /** 切换当前展示的会话。 */
  onSelect(id: string): void;
}

const locales: Array<{ id: Locale; short: string }> = [
  { id: "zh-CN", short: "中文" },
  { id: "en", short: "EN" },
];

/** 返回会话最后使用的模型名称。 */
function lastModel(session: SessionSummary): string | undefined {
  for (let index = session.exchanges.length - 1; index >= 0; index -= 1) {
    const model = session.exchanges[index]?.model;
    if (model) {
      return model;
    }
  }
  return undefined;
}

/** 展示一个可选择的会话摘要。 */
function SessionCard({
  session,
  active,
  onSelect,
}: {
  session: SessionSummary;
  active: boolean;
  /** 选中当前会话。 */
  onSelect(id: string): void;
}) {
  const { locale, messages } = useI18n();
  const provider = session.protocol === "anthropic" ? "Claude" : "Codex";
  return (
    <button
      className={active ? "session-card active" : "session-card"}
      type="button"
      onClick={() => onSelect(session.id)}
    >
      <span className="session-card-head">
        <span className={`provider ${session.protocol}`}>{provider}</span>
        {session.internal ? <span className="sidebar-internal">{messages.sidebar.internal}</span> : null}
        <time>{formatTime(session.startedAt, locale)}</time>
      </span>
      <strong>{shortId(session.id)}</strong>
      <span className="session-card-foot">
        <span>{lastModel(session) ?? messages.sidebar.unknownModel}</span>
        <span>{session.exchanges.length} {messages.sidebar.exchanges}</span>
      </span>
    </button>
  );
}

/** 展示按时间排列的 Session 列表。 */
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
          <SessionCard
            active={selected === session.id}
            key={session.id}
            session={session}
            onSelect={onSelect}
          />
        ))}
      </div>

      <footer className="sidebar-foot">
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
      </footer>
    </aside>
  );
}
