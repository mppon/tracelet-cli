/** 本文件负责生成 Tracelet 内部使用的唯一标识。 */

import { randomUUID } from "node:crypto";

/** 生成带业务前缀的唯一标识。 */
export function makeId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}
