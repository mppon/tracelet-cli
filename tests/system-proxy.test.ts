/** 本文件验证 macOS 和 Windows 固定系统代理配置的解析。 */

import { describe, expect, it } from "vitest";
import { parseMacProxy, parseWindowsProxy } from "../apps/cli/src/system-proxy.js";

describe("system proxy", () => {
  /** 验证 macOS 优先使用已启用的 HTTPS 代理。 */
  it("parses macOS HTTPS proxy", () => {
    const output = `<dictionary> {
  HTTPEnable : 1
  HTTPPort : 8080
  HTTPProxy : 127.0.0.1
  HTTPSEnable : 1
  HTTPSPort : 7897
  HTTPSProxy : 127.0.0.1
}`;
    expect(parseMacProxy(output)).toBe("http://127.0.0.1:7897");
  });

  /** 验证 macOS 没有 HTTPS 代理时回退到 HTTP 代理。 */
  it("falls back to macOS HTTP proxy", () => {
    const output = `<dictionary> {
  HTTPEnable : 1
  HTTPPort : 7897
  HTTPProxy : 127.0.0.1
  HTTPSEnable : 0
}`;
    expect(parseMacProxy(output)).toBe("http://127.0.0.1:7897");
  });

  /** 验证 Windows 支持按协议拆分的代理地址。 */
  it("parses Windows protocol proxy", () => {
    const output = `HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings
    ProxyEnable    REG_DWORD    0x1
    ProxyServer    REG_SZ       http=127.0.0.1:8080;https=127.0.0.1:7897`;
    expect(parseWindowsProxy(output)).toBe("http://127.0.0.1:7897");
  });

  /** 验证 Windows 支持单一代理地址。 */
  it("parses Windows shared proxy", () => {
    const output = `ProxyEnable    REG_DWORD    0x1
    ProxyServer    REG_SZ       127.0.0.1:7897`;
    expect(parseWindowsProxy(output)).toBe("http://127.0.0.1:7897");
  });

  /** 验证系统代理关闭时返回直连。 */
  it("returns direct when disabled", () => {
    const mac = "<dictionary> {\n  HTTPSEnable : 0\n}";
    const windows = "ProxyEnable    REG_DWORD    0x0\nProxyServer    REG_SZ    127.0.0.1:7897";
    expect(parseMacProxy(mac)).toBeUndefined();
    expect(parseWindowsProxy(windows)).toBeUndefined();
  });
});
