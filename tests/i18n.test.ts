/** 本文件验证 Dashboard 语言选择的持久化与浏览器语言优先级。 */

import { describe, expect, it } from "vitest";
import { pickLocale } from "../apps/dashboard/src/i18n/index.js";

describe("Dashboard locale", () => {
  /** 验证已保存的用户选择优先于浏览器语言。 */
  it("优先使用持久化语言", () => {
    expect(pickLocale("en", "zh-CN")).toBe("en");
    expect(pickLocale("zh-CN", "en-US")).toBe("zh-CN");
  });

  /** 验证未保存偏好时根据浏览器语言选择。 */
  it("识别浏览器语言", () => {
    expect(pickLocale(undefined, "zh-TW")).toBe("zh-CN");
    expect(pickLocale(undefined, "en-US")).toBe("en");
  });

  /** 验证未知持久化值不会破坏语言回退。 */
  it("忽略未知语言", () => {
    expect(pickLocale("fr", "zh-CN")).toBe("zh-CN");
    expect(pickLocale(undefined, undefined)).toBe("zh-CN");
  });
});
