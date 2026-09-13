/** 本文件负责规范化并脱敏需要持久化的 HTTP Header。 */

import type { IncomingHttpHeaders } from "node:http";
import type { HeaderMap } from "./types.js";

const secrets = new Set([
  "authorization",
  "proxy-authorization",
  "x-api-key",
  "cookie",
  "set-cookie",
]);

/** 把 Node Header 转成可序列化对象，并隐藏认证信息。 */
export function redactHeaders(headers: IncomingHttpHeaders): HeaderMap {
  const result: HeaderMap = {};

  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }

    // 认证 Header 只保留存在性，避免令牌进入记录文件。
    result[name] = secrets.has(name.toLowerCase()) ? "[REDACTED]" : value;
  }

  return result;
}
