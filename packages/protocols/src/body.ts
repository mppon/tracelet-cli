/** 本文件负责解码代理保留的 HTTP 请求体副本。 */

import type { HeaderValue } from "@tracelet/shared";
import { decompress } from "fzstd";

/** 返回规范化后的单一 Content-Encoding。 */
function encoding(value: HeaderValue | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim().toLowerCase() ?? "identity";
}

/** 按 Content-Encoding 解码请求体，且不修改传入的原始字节。 */
export function decodeBody(body: Uint8Array, value?: HeaderValue): Uint8Array {
  const name = encoding(value);
  if (name === "identity") {
    return body;
  }
  if (name === "zstd") {
    return decompress(body);
  }

  throw new Error(`暂不支持的 Content-Encoding：${name}`);
}
