/** 本文件负责过滤代理转发时不能逐跳传递的 HTTP Header。 */

import type { IncomingHttpHeaders, OutgoingHttpHeaders } from "node:http";

const hopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

/** 复制端到端 Header，并为上游请求设置正确 Host。 */
export function requestHeaders(headers: IncomingHttpHeaders, host: string): OutgoingHttpHeaders {
  const result: OutgoingHttpHeaders = {};

  for (const [name, value] of Object.entries(headers)) {
    if (!hopHeaders.has(name.toLowerCase()) && value !== undefined) {
      result[name] = value;
    }
  }

  result.host = host;
  return result;
}

/** 过滤上游响应中的逐跳 Header。 */
export function responseHeaders(headers: IncomingHttpHeaders): OutgoingHttpHeaders {
  const result: OutgoingHttpHeaders = {};

  for (const [name, value] of Object.entries(headers)) {
    if (!hopHeaders.has(name.toLowerCase()) && value !== undefined) {
      result[name] = value;
    }
  }

  return result;
}
