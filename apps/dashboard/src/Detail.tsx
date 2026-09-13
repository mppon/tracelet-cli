/** 本文件负责展示请求概览、完整对象、SSE chunk 和原始 HTTP 内容。 */

import { useMemo, useState } from "react";
import { formatBytes, formatJson, formatTime } from "./format";
import type { ChunkView, ExchangeDetail } from "./types";

type Tab = "overview" | "request" | "response" | "chunks" | "raw";

interface DetailProps {
  detail: ExchangeDetail | undefined;
  loading: boolean;
}

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "概览" },
  { id: "request", label: "完整请求" },
  { id: "response", label: "完整响应" },
  { id: "chunks", label: "SSE Chunks" },
  { id: "raw", label: "Raw HTTP" },
];

/** 计算请求持续时间。 */
function duration(detail: ExchangeDetail): string {
  const start = new Date(detail.meta.startedAt).getTime();
  const end = detail.meta.completedAt ? new Date(detail.meta.completedAt).getTime() : Date.now();
  return `${Math.max(0, end - start)} ms`;
}

/** 展示格式化代码块。 */
function CodeBlock({ value }: { value: unknown }) {
  return <pre className="code"><code>{formatJson(value)}</code></pre>;
}

/** 展示一次请求的核心时延与字节信息。 */
function Overview({ detail }: { detail: ExchangeDetail }) {
  return (
    <div className="overview-grid">
      <div className="metric"><span>状态</span><strong>{detail.meta.status ?? "进行中"}</strong></div>
      <div className="metric"><span>总耗时</span><strong>{duration(detail)}</strong></div>
      <div className="metric"><span>响应大小</span><strong>{formatBytes(detail.meta.responseBytes)}</strong></div>
      <div className="metric"><span>Chunk 数</span><strong>{detail.chunks.length}</strong></div>
      <section className="info-block">
        <h3>请求</h3>
        <dl>
          <dt>模型</dt><dd>{detail.meta.model ?? "—"}</dd>
          <dt>协议</dt><dd>{detail.meta.protocol}</dd>
          <dt>路径</dt><dd>{detail.meta.path}</dd>
          <dt>开始时间</dt><dd>{formatTime(detail.meta.startedAt)}</dd>
          <dt>会话来源</dt><dd>{detail.meta.sessionSource}</dd>
        </dl>
      </section>
      {detail.meta.reconstructError ? (
        <div className="warning">官方 SDK 未能还原完整响应：{detail.meta.reconstructError}</div>
      ) : null}
    </div>
  );
}

/** 展示单个原始响应 chunk。 */
function ChunkDetail({ chunk }: { chunk: ChunkView | undefined }) {
  if (!chunk) {
    return <div className="empty">选择一个 chunk 查看原始内容。</div>;
  }

  return (
    <div className="chunk-detail">
      <div className="chunk-meta">
        <span>#{chunk.seq}</span>
        <span>+{(chunk.tUs / 1000).toFixed(2)} ms</span>
        <span>{formatBytes(chunk.length)}</span>
        <span>offset {chunk.offset}</span>
      </div>
      <CodeBlock value={chunk.text} />
      <details>
        <summary>Base64</summary>
        <CodeBlock value={chunk.base64} />
      </details>
    </div>
  );
}

/** 展示 chunk 到达顺序，并允许查看每块原始字节。 */
function Chunks({ detail }: { detail: ExchangeDetail }) {
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
            <span>+{(item.tUs / 1000).toFixed(2)} ms</span>
            <span>{formatBytes(item.length)}</span>
          </button>
        ))}
      </div>
      <ChunkDetail chunk={chunk} />
    </div>
  );
}

/** 根据选中标签展示一次 exchange 的对应数据层级。 */
function TabContent({ tab, detail }: { tab: Tab; detail: ExchangeDetail }) {
  if (tab === "overview") {
    return <Overview detail={detail} />;
  }
  if (tab === "request") {
    return <CodeBlock value={detail.request} />;
  }
  if (tab === "response") {
    return <CodeBlock value={detail.response} />;
  }
  if (tab === "chunks") {
    // 切换 exchange 时重建局部状态，避免沿用上一条记录的 chunk 序号。
    return <Chunks key={detail.meta.id} detail={detail} />;
  }
  return <CodeBlock value={`REQUEST\n${detail.requestText}\n\nRESPONSE\n${detail.responseText}`} />;
}

/** 展示当前选中 exchange 的所有详情标签。 */
export function Detail({ detail, loading }: DetailProps) {
  const [tab, setTab] = useState<Tab>("overview");

  if (loading) {
    return <main className="detail empty">正在读取记录…</main>;
  }
  if (!detail) {
    return <main className="detail empty">从左侧选择一次模型请求。</main>;
  }

  return (
    <main className="detail">
      <header className="detail-head">
        <div>
          <span className="eyebrow">{detail.meta.method} · {detail.meta.protocol}</span>
          <h2>{detail.meta.model ?? "Unknown model"}</h2>
          <p>{detail.meta.path}</p>
        </div>
        <span className={detail.meta.captureComplete ? "status complete" : "status pending"}>
          {detail.meta.captureComplete ? "已完成" : "记录中"}
        </span>
      </header>

      <nav className="tabs" aria-label="请求详情">
        {tabs.map((item) => (
          <button
            aria-selected={tab === item.id}
            className={tab === item.id ? "tab active" : "tab"}
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <section className="tab-content">
        <TabContent tab={tab} detail={detail} />
      </section>
    </main>
  );
}
