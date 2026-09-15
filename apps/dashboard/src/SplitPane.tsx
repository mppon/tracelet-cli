/** 本文件负责提供会话区与请求检查器之间的可拖拽分栏。 */

import { useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from "react";

interface SplitPaneProps {
  primary: ReactNode;
  secondary: ReactNode;
  label: string;
}

interface SplitStyle extends CSSProperties {
  "--detail-ratio": string;
}

const initialRatio = 35;
const minDetail = 280;
const minPrimary = 420;

/** 根据容器宽度限制检查器比例，避免两侧内容被压缩到不可用。 */
function fit(value: number, width: number): number {
  const min = Math.max(22, (minDetail / width) * 100);
  const max = Math.min(60, ((width - minPrimary) / width) * 100);
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** 展示支持鼠标、触控和键盘调整的双栏容器。 */
export function SplitPane({ primary, secondary, label }: SplitPaneProps) {
  const [ratio, setRatio] = useState(initialRatio);
  const [active, setActive] = useState(false);
  const dragging = useRef(false);
  const style: SplitStyle = { "--detail-ratio": `${ratio}%` };

  /** 开始拖动并捕获当前指针。 */
  function start(event: PointerEvent<HTMLDivElement>): void {
    dragging.current = true;
    setActive(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  /** 根据指针位置实时计算右侧检查器比例。 */
  function move(event: PointerEvent<HTMLDivElement>): void {
    if (!dragging.current) {
      return;
    }
    const rect = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!rect?.width) {
      return;
    }
    const next = ((rect.right - event.clientX) / rect.width) * 100;
    setRatio(fit(next, rect.width));
  }

  /** 结束拖动并释放当前指针。 */
  function stop(event: PointerEvent<HTMLDivElement>): void {
    dragging.current = false;
    setActive(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  /** 使用方向键微调分栏，使用 Home 恢复默认比例。 */
  function keyResize(event: KeyboardEvent<HTMLDivElement>): void {
    const rect = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!rect?.width) {
      return;
    }
    if (event.key === "Home") {
      setRatio(initialRatio);
      event.preventDefault();
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    const delta = event.key === "ArrowLeft" ? 2 : -2;
    setRatio((current) => fit(current + delta, rect.width));
    event.preventDefault();
  }

  return (
    <div className="main-split" style={style}>
      {primary}
      <div
        aria-label={label}
        aria-orientation="vertical"
        aria-valuemax={60}
        aria-valuemin={22}
        aria-valuenow={Math.round(ratio)}
        className={active ? "split-handle active" : "split-handle"}
        role="separator"
        tabIndex={0}
        onKeyDown={keyResize}
        onPointerCancel={stop}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={stop}
      />
      {secondary}
    </div>
  );
}
