/** 本文件负责以可折叠树结构展示请求和响应 JSON。 */

import { useCallback, useEffect, useRef, useState } from "react";
import { JsonView } from "react-json-view-lite";
import { formatJson } from "./format";
import { useI18n } from "./i18n";

const jsonStyles = {
  container: "json-tree",
  basicChildStyle: "json-child",
  childFieldsContainer: "json-children",
  label: "json-label",
  clickableLabel: "json-label json-clickable",
  nullValue: "json-null",
  undefinedValue: "json-null",
  stringValue: "json-string",
  booleanValue: "json-boolean",
  numberValue: "json-number",
  otherValue: "json-other",
  punctuation: "json-punctuation",
  collapseIcon: "json-toggle json-collapse",
  expandIcon: "json-toggle json-expand",
  collapsedContent: "json-collapsed",
  noQuotesForStringValues: false,
  quotesForFieldNames: true,
  stringifyStringValues: true,
  ariaLables: {
    collapseJson: "Collapse JSON",
    expandJson: "Expand JSON",
  },
};

interface DepthButtonsProps {
  className: string;
  depth: number;
  /** 设置 JSON 树的展开深度。 */
  onChange(depth: number): void;
}

/** 判断数据是否可以交给 JSON 树组件展示。 */
function isJsonData(value: unknown): value is object | unknown[] {
  return value !== null && typeof value === "object";
}

/** 展示 JSON 树的三种展开层级操作。 */
function DepthButtons({ className, depth, onChange }: DepthButtonsProps) {
  const { messages } = useI18n();
  return (
    <div className={className}>
      <button
        aria-pressed={depth === Number.POSITIVE_INFINITY}
        type="button"
        onClick={() => onChange(Number.POSITIVE_INFINITY)}
      >
        {messages.json.expandAll}
      </button>
      <button aria-pressed={depth === 2} type="button" onClick={() => onChange(2)}>
        {messages.json.expandTwo}
      </button>
      <button aria-pressed={depth === 1} type="button" onClick={() => onChange(1)}>
        {messages.json.collapse}
      </button>
    </div>
  );
}

/** 展示支持折叠层级和复制操作的 JSON 树。 */
export function JsonViewer({ label, value }: { label: string; value: unknown }) {
  const { messages } = useI18n();
  const [depth, setDepth] = useState(2);
  const [copied, setCopied] = useState(false);
  const menu = useRef<HTMLDetailsElement>(null);

  /** 切换请求时恢复默认展开层级和复制状态。 */
  useEffect(() => {
    setDepth(2);
    setCopied(false);
  }, [value]);

  /** 按当前展开深度决定节点是否默认展开。 */
  const shouldExpand = useCallback(
    (level: number): boolean => depth === Number.POSITIVE_INFINITY || level < depth,
    [depth],
  );

  /** 将完整格式化 JSON 写入系统剪贴板。 */
  async function copy(): Promise<void> {
    await window.navigator?.clipboard?.writeText(formatJson(value));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  /** 更新树形展开深度，并关闭极窄布局中的操作菜单。 */
  function changeDepth(value: number): void {
    setDepth(value);
    if (menu.current) {
      menu.current.open = false;
    }
  }

  return (
    <div className="json-viewer">
      <div className="json-toolbar">
        <div className="json-heading">
          <strong>{label}</strong>
          <span>{messages.json.format}</span>
        </div>
        <DepthButtons className="json-tree-actions" depth={depth} onChange={changeDepth} />
        <details className="json-more" ref={menu}>
          <summary>{messages.json.view}</summary>
          <DepthButtons className="json-menu" depth={depth} onChange={changeDepth} />
        </details>
        <button aria-live="polite" className="copy-json" type="button" onClick={() => void copy()}>
          {copied ? messages.json.copied : messages.json.copy}
        </button>
      </div>
      <div className="json-scroll">
        {isJsonData(value) ? (
          <JsonView
            aria-label={label}
            clickToExpandNode
            data={value}
            shouldExpandNode={shouldExpand}
            style={{
              ...jsonStyles,
              ariaLables: {
                collapseJson: messages.json.collapseAria,
                expandJson: messages.json.expandAria,
              },
            }}
          />
        ) : (
          <pre className="json-primitive">{formatJson(value)}</pre>
        )}
      </div>
    </div>
  );
}
