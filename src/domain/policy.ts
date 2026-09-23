// 领域判定：全部为纯函数。
// - 班次排序与“相邻上一班”
// - 相邻班读数漂移判定
// - 仪器合格性 / 是否“换了另一台合格仪器”
// - 下一班换机复测的通过判定
// 页面、状态层、种子数据都调用这里，保证判定口径一致。

import {
  INSTRUMENT_MAP,
  METRICS,
  METRIC_MAP,
  PARTICLE_REL_THRESHOLD_PCT,
} from "./config";
import type {
  DriftFlag,
  EntryStatus,
  InstrumentGroup,
  InstrumentSelection,
  MetricKey,
  Reading,
  ShiftCode,
} from "./types";

const SHIFT_ORDER: Record<ShiftCode, number> = { A: 0, B: 1, C: 2 };

/** 把 (日期, 班次) 换算成连续序号：每天 3 班，跨天可直接相减 */
export function shiftOrdinal(date: string, shift: ShiftCode): number {
  const days = Math.floor(Date.parse(date + "T00:00:00") / 86_400_000);
  return days * 3 + SHIFT_ORDER[shift];
}

/** 描述相邻关系，例如 “9/22 A → B” */
export function shiftLabel(date: string, shift: ShiftCode): string {
  const d = new Date(date + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()} ${shift}`;
}

export function formatDelta(flag: DriftFlag): string {
  const def = METRIC_MAP[flag.metric];
  const sign = flag.delta > 0 ? "+" : "";
  const pct = flag.pct === null ? "" : `（${flag.pct >= 0 ? "+" : ""}${flag.pct.toFixed(1)}%）`;
  return `${def.label} ${flag.previous} → ${flag.current} ${def.unit} ${sign}${flag.delta}${pct}`;
}

function compareMetric(
  metric: MetricKey,
  previous: number,
  current: number,
): DriftFlag | null {
  const def = METRIC_MAP[metric];
  const delta = Number((current - previous).toFixed(2));
  const abs = Math.abs(delta);
  const pct =
    metric === "particle" && previous !== 0
      ? Number(((delta / previous) * 100).toFixed(1))
      : null;

  let over = abs >= def.absThreshold;
  if (metric === "particle") {
    // 绝对量与相对量同时越限才算漂移
    over =
      abs >= def.absThreshold &&
      pct !== null &&
      Math.abs(pct) >= PARTICLE_REL_THRESHOLD_PCT;
  }
  if (!over) return null;

  let trigger: string;
  if (metric === "particle") {
    trigger = `变化量 ${abs}≥${def.absThreshold} 且相对变化 ${Math.abs(pct ?? 0)}%≥${PARTICLE_REL_THRESHOLD_PCT}%`;
  } else {
    trigger = `绝对变化 ${abs}≥阈值 ${def.absThreshold} ${def.unit}`;
  }
  return { metric, previous, current, delta, pct, trigger };
}

/**
 * 相邻两班读数比对。任一项越漂移阈值，登记条目即应停在“待复核”。
 * 粒子计数同时检查绝对与相对阈值；其余指标检查绝对阈值。
 */
export function evaluateDrift(previous: Reading, current: Reading): DriftFlag[] {
  return METRICS.map((m) => compareMetric(m.key, previous[m.key], current[m.key])).filter(
    (f): f is DriftFlag => f !== null,
  );
}

/** 仪器是否合格（在台账中且未超期/停用） */
export function isInstrumentQualified(id: string): boolean {
  const inst = INSTRUMENT_MAP[id];
  return !!inst && inst.qualified;
}

export function instrumentIssue(id: string): string | null {
  const inst = INSTRUMENT_MAP[id];
  if (!inst) return "仪器编号不在台账中";
  if (!inst.qualified) return inst.note ? `${inst.id} ${inst.note}` : `${inst.id} 不合格`;
  return null;
}

/**
 * 校验一次登记所填的仪器：每个指标分组都必须填合格仪器。
 * 返回第一条问题；null 表示全部合格。
 */
export function validateInstruments(sel: InstrumentSelection): string | null {
  const groups: InstrumentGroup[] = ["particle", "pressure", "thermo"];
  for (const group of groups) {
    const issue = instrumentIssue(sel[group]);
    if (issue) return issue;
  }
  return null;
}

/**
 * 漂移复核要求“下一班换另一台合格仪器复测”。
 * 逐分组检查：复测仪器必须合格且与原机不同。
 */
export function retestInstrumentIssues(
  original: InstrumentSelection,
  retest: InstrumentSelection,
): { group: InstrumentGroup; message: string }[] {
  const groups: InstrumentGroup[] = ["particle", "pressure", "thermo"];
  const issues: { group: InstrumentGroup; message: string }[] = [];
  for (const group of groups) {
    const before = original[group];
    const after = retest[group];
    const issue = instrumentIssue(after);
    if (issue) {
      issues.push({ group, message: `复测仪器 ${after || "(未填)"}：${issue}` });
    } else if (after === before) {
      issues.push({ group, message: `复测必须换另一台仪器，仍在使用 ${after}` });
    }
  }
  return issues;
}

/**
 * 复测判定：复测值与“触发待复核的原值”在同一套漂移阈值内，即判定环境真实、
 * 原读数有效（复测值成为冻结值）；仍越限则复测不通过，升级处理。
 */
export function evaluateRetest(
  original: Reading,
  retest: Reading,
): { passed: boolean; flags: DriftFlag[] } {
  const flags = evaluateDrift(original, retest);
  return { passed: flags.length === 0, flags };
}

export const STATUS_META: Record<
  EntryStatus,
  { label: string; tone: "ok" | "warn" | "frozen" | "danger" | "muted" }
> = {
  confirmed: { label: "互检通过", tone: "ok" },
  pending: { label: "待复核", tone: "warn" },
  frozen: { label: "已冻结", tone: "frozen" },
  escalated: { label: "复测未过·升级", tone: "danger" },
  superseded: { label: "已被更正替代", tone: "muted" },
};

/** 升级单已转更正流程后，复核队列不再提示“待处理” */
export function isResolved(entry: {
  status: EntryStatus;
  supersededBy?: string;
}): boolean {
  return entry.status === "escalated" && !!entry.supersededBy;
}
