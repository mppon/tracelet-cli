/** 本文件负责格式化 Dashboard 展示的时间、字节和 JSON。 */

import type { Locale } from "./i18n";

/** 将 ISO 时间转换为当前界面的本地时间。 */
export function formatTime(value: string | undefined, locale: Locale): string {
  if (!value) {
    return "—";
  }
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

/** 将字节数转换为符合当前语言格式的紧凑单位。 */
export function formatBytes(value: number, locale: Locale): string {
  if (value < 1024) {
    return `${new Intl.NumberFormat(locale).format(value)} B`;
  }
  if (value < 1024 * 1024) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / 1024)} KB`;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / 1024 / 1024)} MB`;
}

/** 将任意数据格式化为可阅读 JSON。 */
export function formatJson(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

/** 从内部会话 ID 中提取适合列表展示的短名称。 */
export function shortId(value: string): string {
  const id = value.includes(":") ? value.split(":").at(-1) ?? value : value;
  return id.length > 18 ? `${id.slice(0, 9)}…${id.slice(-6)}` : id;
}
