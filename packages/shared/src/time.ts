/** 本文件负责提供记录流量时使用的时间工具。 */

/** 获取当前 ISO 时间。 */
export function nowIso(): string {
  return new Date().toISOString();
}

/** 将高精度时间差转换为微秒。 */
export function elapsedUs(start: bigint): number {
  return Number((process.hrtime.bigint() - start) / 1_000n);
}
