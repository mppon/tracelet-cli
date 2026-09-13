/** 本文件负责格式化 Dashboard 展示的时间、字节和 JSON。 */

/** 将 ISO 时间转换为本地可读时间。 */
export function formatTime(value?: string): string {
  return value ? new Date(value).toLocaleString() : "—";
}

/** 将字节数转换为紧凑单位。 */
export function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
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
