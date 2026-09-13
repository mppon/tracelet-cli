/** 本文件负责展示请求指标、完整对象和 SSE chunk 内容。 */

import { useMemo, useState } from "react";
import { formatBytes, formatJson, formatTime } from "./format";
import { useI18n, type Locale, type Messages } from "./i18n";
import { JsonViewer } from "./JsonViewer";
import type { ChunkView, ExchangeDetail } from "./types";

type Tab = "overview" | "request" | "response" | "chunks";

interface DetailProps {
  detail: ExchangeDetail | undefined;
  loading: boolean;
}

const tabs: Tab[] = ["overview", "request", "response", "chunks"];

/** 计算并格式化请求持续时间。 */
function duration(detail: ExchangeDetail, locale: Locale): string {
  const start = new Date(detail.meta.startedAt).getTime();
  const end = detail.meta.completedAt ? new Date(detail.meta.completedAt).getTime() : Date.now();
  const value = Math.max(0, end - start);
  return value < 1000
    ? `${new Intl.NumberFormat(locale).format(value)} ms`
    : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value / 1000)} s`;
}

/** 返回当前语言下的标签名称。 */
function tabLabel(tab: Tab, messages: Messages): string {
  return messages.detail.tabs?.[tab];
}

/** 将内部会话来源转换为可读文案。 */
function sourceLabel(source: string, messages: Messages): string {
  if (source === "header") {
    return messages.detail.sources.header;
  }
  if (source === "conversation") {
    return messages.detail.sources.conversation;
  }
  if (source === "response-chain") {
    return messages.detail.sources.responseChain;
  }
  if (source === "run") {
    return messages.detail.sources.run;
  }
  return source;
}

/** 展示带标题栏的格式化代码内容。 */
function CodeBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="code-frame">
      <div className="code-toolbar">
        <span>{label}</span>
      </div>
      <pre className="code"><code>{formatJson(value)}</code></pre>
    </div>
  );
}

/** 展示单个请求指标。 */
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
    </div>
  );
}

/** 展示一次请求的固定指标栏。 */
function Metrics({ detail }: { detail: ExchangeDetail }) {
  const { locale, messages } = useI18n();
  return (
    <div className="metrics">
      <Metric label={messages.detail.metrics.duration} value={duration(detail, locale)} />
      <Metric label={messages.detail.metrics.request} value={formatBytes(detail.meta.requestBytes, locale)} />
      <Metric label={messages.detail.metrics.response} value={formatBytes(detail.meta.responseBytes, locale)} />
      <Metric label={messages.detail.metrics.chunks} value={String(detail.chunks.length)} />
    </div>
  );
}

/** 展示一次请求的协议、会话与路径信息。 */
function Overview({ detail }: { detail: ExchangeDetail }) {
  const { locale, messages } = useI18n();
  return (
    <div className="overview-grid">
      <section className="info-block">
        <h3>{messages.detail.fields.request}</h3>
        <dl>
          <dt>{messages.detail.fields.model}</dt><dd>{detail.meta.model ?? "—"}</dd>
          <dt>{messages.detail.fields.protocol}</dt><dd>{detail.meta.protocol}</dd>
          <dt>{messages.detail.fields.httpStatus}</dt><dd>{detail.meta.responseStatus ?? "—"}</dd>
          <dt>{messages.detail.fields.path}</dt><dd>{detail.meta.path}</dd>
          <dt>{messages.detail.fields.startedAt}</dt><dd>{formatTime(detail.meta.startedAt, locale)}</dd>
          <dt>{messages.detail.fields.session}</dt><dd>{detail.meta.sessionId}</dd>
          <dt>{messages.detail.fields.sessionSource}</dt>
          <dd>{sourceLabel(detail.meta.sessionSource, messages)}</dd>
        </dl>
      </section>
      {detail.meta.reconstructError ? (
        <div className="warning">
          <strong>{messages.detail.reconstructError}</strong>
          <span>{detail.meta.reconstructError}</span>
        </div>
      ) : null}
    </div>
  );
}

/** 展示单个原始响应 chunk。 */
function ChunkDetail({ chunk }: { chunk: ChunkView | undefined }) {
  const { locale, messages } = useI18n();
  if (!chunk) {
    return <div className="chunk-empty">{messages.detail.selectChunk}</div>;
  }

  return (
    <div className="chunk-detail">
      <div className="chunk-meta">
        <span>#{chunk.seq}</span>
        <span>+{new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(chunk.tUs / 1000)} ms</span>
        <span>{formatBytes(chunk.length, locale)}</span>
        <span>{messages.detail.offset} {chunk.offset}</span>
      </div>
      <CodeBlock label={`Chunk #${chunk.seq}`} value={chunk.text} />
      <details>
        <summary>Base64</summary>
        <CodeBlock label="Base64" value={chunk.base64} />
      </details>
    </div>
  );
}

/** 展示 chunk 到达顺序，并允许查看每块原始字节。 */
function Chunks({ detail }: { detail: ExchangeDetail }) {
  const { locale } = useI18n();
  const [selected, setSelected] = useState(detail.chunks.at(0)?.seq);
  const chunk = useMemo(
    () => detail.chunks.find((item) => item.seq === selected),
    [detail.chunks, selected],
  );

  return (
    <div className="chunks-layout">
      <div className="chunk-list">
        {detail.chunks.map((item) => (
          <button
            className={item.seq === selected ? "chunk-row active" : "chunk-row"}
            key={item.seq}
            type="button"
            onClick={() => setSelected(item.seq)}
          >
            <strong>#{item.seq}</strong>
            <span>+{new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(item.tUs / 1000)} ms</span>
            <span>{formatBytes(item.length, locale)}</span>
          </button>
        ))}
      </div>
      <ChunkDetail chunk={chunk} />
    </div>
  );
}

/** 根据选中标签展示一次 exchange 的对应数据层级。 */
function TabContent({ tab, detail }: { tab: Tab; detail: ExchangeDetail }) {
  const { messages } = useI18n();
  if (tab === "overview") {
    return <Overview detail={detail} />;
  }
  if (tab === "request") {
    return <JsonViewer label={messages.detail.tabs.request} value={detail.request} />;
  }
  if (tab === "response") {
    return <JsonViewer label={messages.detail.tabs.response} value={detail.response} />;
  }
  // 切换 exchange 时重建局部状态，避免沿用上一条记录的 chunk 序号。
  return <Chunks key={detail.meta.id} detail={detail} />;
}

/** 展示当前选中 exchange 的所有详情标签。 */
export function Detail({ detail, loading }: DetailProps) {
  const { messages } = useI18n();
  const [tab, setTab] = useState<Tab>("overview");

  if (loading) {
    return <main className="detail empty-state"><span className="loader" />{messages.detail.loading}</main>;
  }
  if (!detail) {
    return (
      <main className="detail empty-state">
        <div className="empty-glyph">{"{ }"}</div>
        <h2>{messages.detail.emptyTitle}</h2>
        <p>{messages.detail.emptyHint}</p>
      </main>
    );
  }

  return (
    <main className="detail">
      <header className="detail-head">
        <div className="detail-title">
          <span className="eyebrow">{detail.meta.method} · {detail.meta.protocol}</span>
          <h2>{detail.meta.model ?? messages.detail.unknownModel}</h2>
          <p>{detail.meta.path}</p>
        </div>
        <span className={detail.meta.captureComplete ? "status complete" : "status pending"}>
          <span className="status-dot" />
          {detail.meta.captureComplete ? messages.detail.complete : messages.detail.recording}
        </span>
      </header>

      <Metrics detail={detail} />

      <nav className="tabs" aria-label={messages.detail.navLabel}>
        {tabs.map((item) => (
          <button
            aria-selected={tab === item}
            className={tab === item ? "tab active" : "tab"}
            key={item}
            type="button"
            onClick={() => setTab(item)}
          >
            {tabLabel(item, messages)}
          </button>
        ))}
      </nav>

      <section className="tab-content">
        <TabContent tab={tab} detail={detail} />
      </section>
    </main>
  );
}
