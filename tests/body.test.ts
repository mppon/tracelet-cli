/** 本文件验证压缩请求副本的解码与解析。 */

import { decodeBody, parseRequest } from "@tracelet/protocols";
import { describe, expect, it } from "vitest";

const zstd = "KLUv/QRYaQEAeyJtb2RlbCI6ImdwdC10ZXN0Iiwic3RyZWFtIjp0cnVlLCJpbnB1dCI6W119dvbudA==";

describe("请求解码", () => {
  /** 验证 Codex zstd 请求可以从副本恢复为 JSON。 */
  it("解码 zstd", () => {
    const body = decodeBody(Buffer.from(zstd, "base64"), "zstd");
    const parsed = parseRequest(Buffer.from(body).toString("utf8"));

    expect(parsed).toMatchObject({ model: "gpt-test", stream: true });
    expect(parsed.body).toMatchObject({ input: [] });
  });
});
