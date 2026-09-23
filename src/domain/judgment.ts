// 判定层：漂移阈值、登记、复测、修订的全部业务规则（纯函数，不碰存储与页面）

import {
  AppState,
  DriftMetric,
  InspectionRecord,
  METRIC_LABELS,
  METRIC_UNITS,
  MetricKey,
  Reading,
  ReviewAttempt,
} from "./types";
import { nextShift, prevShift, shiftLabel } from "./shifts";

/** 漂移阈值：粒子计数按相对偏差，其余按绝对偏差 */
export const DRIFT_LIMITS = {
  particlesRatio: 0.3, // ±30%
  pressure: 5, // ±5 Pa
  temperature: 2, // ±2 ℃
  humidity: 5, // ±5 %RH
} as const;

const LIMIT_TEXT: Record<MetricKey, string> = {
  particles: "±30%",
  pressure: `±${DRIFT_LIMITS.pressure} Pa`,
  temperature: `±${DRIFT_LIMITS.temperature} ℃`,
  humidity: `±${DRIFT_LIMITS.humidity} %RH`,
};

function fmt(value: number, metric: MetricKey): string {
  return `${value} ${METRIC_UNITS[metric]}`;
}

/** 比较两条读数，返回越阈指标明细（空数组 = 未越阈） */
export function checkDrift(from: Reading, to: Reading): DriftMetric[] {
  const out: DriftMetric[] = [];

  const particleBase = from.particles;
  const particleDelta = to.particles - from.particles;
  const particleRatio = particleBase === 0
    ? (to.particles === 0 ? 0 : Infinity)
    : Math.abs(particleDelta) / Math.abs(particleBase);
  if (particleRatio > DRIFT_LIMITS.particlesRatio) {
    out.push({
      metric: "particles",
      from: from.particles,
      to: to.particles,
      deltaText: `${particleDelta >= 0 ? "+" : ""}${(particleRatio * 100).toFixed(1)}%`,
      limitText: LIMIT_TEXT.particles,
    });
  }

  const absChecks: Array<{ metric: MetricKey; limit: number }> = [
    { metric: "pressure", limit: DRIFT_LIMITS.pressure },
    { metric: "temperature", limit: DRIFT_LIMITS.temperature },
    { metric: "humidity", limit: DRIFT_LIMITS.humidity },
  ];
  for (const { metric, limit } of absChecks) {
    const delta = to[metric] - from[metric];
    if (Math.abs(delta) > limit) {
      out.push({
        metric,
        from: from[metric],
        to: to[metric],
        deltaText: `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} ${METRIC_UNITS[metric]}`,
        limitText: LIMIT_TEXT[metric],
      });
    }
  }
  return out;
}

/** 同房间同班的“当前”记录（不含已被修订取代的历史版本） */
export function findCurrent(
  records: InspectionRecord[],
  roomId: string,
  shiftId: string,
): InspectionRecord | undefined {
  return records.find(
    (r) => r.roomId === roomId && r.shiftId === shiftId && r.status !== "superseded",
  );
}

/** 某记录的修订链（含自身，按版本升序） */
export function versionChain(records: InspectionRecord[], record: InspectionRecord): InspectionRecord[] {
  const chain: InspectionRecord[] = [record];
  let cur = record;
  while (cur.supersedesId) {
    const prev = records.find((r) => r.id === cur.supersedesId);
    if (!prev) break;
    chain.unshift(prev);
    cur = prev;
  }
  return chain;
}

export type OpResult =
  | { ok: true; state: AppState; record: InspectionRecord; message: string }
  | { ok: false; error: string };

export interface RegisterInput {
  roomId: string;
  shiftId: string;
  inspector: string;
  instrumentId: string;
  readings: Reading;
}

let idCounter = 0;
function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

function instrumentError(state: AppState, instrumentId: string): string | null {
  const inst = state.instruments.find((i) => i.id === instrumentId);
  if (!inst) return `仪器 ${instrumentId} 不在台账中`;
  if (!inst.qualified) return `仪器 ${instrumentId} 校准超期（${inst.calibrationDue}），不得用于巡检`;
  return null;
}

/**
 * 登记：同房间同班只留一条。
 * - 已冻结的记录不允许覆盖，必须走修订；
 * - 已进入复核/修订流程的记录（有复测记录或版本>1）同样只能修订，避免抹掉追溯链；
 * - 其余情况新登记直接替换旧记录。
 * 登记后与上一班互检：越过漂移阈值则停在“待复核”并保留原值。
 */
export function registerRecord(state: AppState, input: RegisterInput): OpResult {
  const instErr = instrumentError(state, input.instrumentId);
  if (instErr) return { ok: false, error: instErr };

  const existing = findCurrent(state.records, input.roomId, input.shiftId);
  if (existing) {
    if (existing.status === "frozen") {
      return { ok: false, error: `${input.roomId} ${shiftLabel(input.shiftId)} 已冻结，更正请走“修订”并填写原因` };
    }
    if (existing.reviews.length > 0 || existing.version > 1) {
      return { ok: false, error: "该记录已进入复核/修订流程，更正请走“修订”以保留追溯链" };
    }
  }

  const prev = findCurrent(state.records, input.roomId, prevShift(input.shiftId));
  const driftMetrics = prev ? checkDrift(prev.readings, input.readings) : [];
  const exceeded = driftMetrics.length > 0;

  const record: InspectionRecord = {
    id: newId("rec"),
    roomId: input.roomId,
    shiftId: input.shiftId,
    inspector: input.inspector,
    instrumentId: input.instrumentId,
    readings: { ...input.readings },
    status: exceeded ? "pending-review" : "confirmed",
    version: 1,
    driftFromId: exceeded && prev ? prev.id : null,
    driftMetrics,
    reviews: [],
    supersedesId: null,
    revisionReason: null,
    createdAt: new Date().toISOString(),
  };

  const records = state.records.filter((r) => r.id !== existing?.id).concat(record);
  const message = exceeded
    ? `与上一班（${shiftLabel(prevShift(input.shiftId))}）互检越阈：${driftMetrics
        .map((d) => METRIC_LABELS[d.metric])
        .join("、")}，已停在待复核，等待下一班复测`
    : existing
      ? "已替换同房间同班原记录，互检通过"
      : "互检通过";

  return { ok: true, state: { ...state, records }, record, message };
}

export interface ReviewInput {
  shiftId: string;
  inspector: string;
  instrumentId: string;
  readings: Reading;
}

/**
 * 复测：仅针对“待复核”记录，必须由下一班、换另一台合格仪器执行。
 * 复测值与原值在阈值内 → 通过并冻结仪器与读数；否则记为未通过，记录保持待复核。
 */
export function submitReview(state: AppState, recordId: string, input: ReviewInput): OpResult {
  const record = state.records.find((r) => r.id === recordId);
  if (!record) return { ok: false, error: "记录不存在" };
  if (record.status !== "pending-review") return { ok: false, error: "仅待复核记录可以复测" };

  const expectedShift = nextShift(record.shiftId);
  if (input.shiftId !== expectedShift) {
    return { ok: false, error: `复测须由下一班执行（应为 ${shiftLabel(expectedShift)}）` };
  }
  const instErr = instrumentError(state, input.instrumentId);
  if (instErr) return { ok: false, error: instErr };
  if (input.instrumentId === record.instrumentId) {
    return { ok: false, error: "复测必须更换另一台合格仪器，不能沿用原仪器" };
  }

  const passed = checkDrift(record.readings, input.readings).length === 0;
  const attempt: ReviewAttempt = {
    shiftId: input.shiftId,
    inspector: input.inspector,
    instrumentId: input.instrumentId,
    readings: { ...input.readings },
    result: passed ? "passed" : "rejected",
    at: new Date().toISOString(),
  };

  const updated: InspectionRecord = {
    ...record,
    status: passed ? "frozen" : "pending-review",
    reviews: [...record.reviews, attempt],
  };
  const records = state.records.map((r) => (r.id === recordId ? updated : r));
  const message = passed
    ? `复测通过（${input.instrumentId}），仪器与读数已冻结`
    : "复测值与原值偏差仍越阈，记录保持待复核；可再次复测或走修订更正";

  return { ok: true, state: { ...state, records }, record: updated, message };
}

export interface ReviseInput {
  inspector: string;
  instrumentId: string;
  readings: Reading;
  reason: string;
}

/**
 * 修订：更正不改动原记录，另建一个带原因的新版本（version+1），
 * 原版本标记为“已被修订”保留在追溯链中；新版本重新参与互检判定。
 */
export function reviseRecord(state: AppState, recordId: string, input: ReviseInput): OpResult {
  const record = state.records.find((r) => r.id === recordId);
  if (!record) return { ok: false, error: "记录不存在" };
  if (record.status === "superseded") return { ok: false, error: "历史版本不能再修订，请对当前版本操作" };
  if (!input.reason.trim()) return { ok: false, error: "修订必须填写更正原因" };

  const instErr = instrumentError(state, input.instrumentId);
  if (instErr) return { ok: false, error: instErr };

  const prev = findCurrent(
    state.records.filter((r) => r.id !== recordId),
    record.roomId,
    prevShift(record.shiftId),
  );
  const driftMetrics = prev ? checkDrift(prev.readings, input.readings) : [];
  const exceeded = driftMetrics.length > 0;

  const next: InspectionRecord = {
    id: newId("rec"),
    roomId: record.roomId,
    shiftId: record.shiftId,
    inspector: input.inspector,
    instrumentId: input.instrumentId,
    readings: { ...input.readings },
    status: exceeded ? "pending-review" : "confirmed",
    version: record.version + 1,
    driftFromId: exceeded && prev ? prev.id : null,
    driftMetrics,
    reviews: [],
    supersedesId: record.id,
    revisionReason: input.reason.trim(),
    createdAt: new Date().toISOString(),
  };

  const records = state.records
    .map((r) => (r.id === recordId ? { ...r, status: "superseded" as const } : r))
    .concat(next);
  const message = `已建立 v${next.version} 修订版本（原因：${next.revisionReason}），原版本保留备查${
    exceeded ? "；新版本与上一班互检越阈，停在待复核" : ""
  }`;

  return { ok: true, state: { ...state, records }, record: next, message };
}
