// 领域类型：洁净室跨班互检与仪器漂移复核
// 本文件只描述业务概念，不包含任何判定、存储与页面逻辑。

export type MetricKey = "particle" | "pressure" | "temperature" | "humidity";

/** 仪器分组：粒子计数器 / 差压计 / 温湿度仪（温湿度同机） */
export type InstrumentGroup = "particle" | "pressure" | "thermo";

/** 班次：A 早班、B 中班、C 夜班（同日内 A→B→C） */
export type ShiftCode = "A" | "B" | "C";

/** 一次巡检的四项读数 */
export interface Reading {
  /** 粒子计数 ≥0.5µm，单位：粒/m³ */
  particle: number;
  /** 相对邻室压差，单位：Pa */
  pressure: number;
  /** 温度，单位：℃ */
  temperature: number;
  /** 相对湿度，单位：%RH */
  humidity: number;
}

/** 一次登记使用的三类仪器编号 */
export type InstrumentSelection = Record<InstrumentGroup, string>;

/** 单项指标相对上一班的漂移标记 */
export interface DriftFlag {
  metric: MetricKey;
  previous: number;
  current: number;
  /** 绝对变化量（带符号） */
  delta: number;
  /** 相对变化（粒子计数用），无法计算时为 null */
  pct: number | null;
  /** 触发依据（人类可读） */
  trigger: string;
}

/**
 * 条目生命周期：
 * - confirmed  互检通过（首班登记或相邻班未越漂移阈值）
 * - pending    漂移越限，停在待复核，保留原值，等待下一班换机复测
 * - frozen     复测通过，仪器与读数冻结，只能走“更正版本”
 * - escalated  复测未通过，保留原值并升级厂务处理，随后走更正版本
 * - superseded 已被带原因的更正版本替代（历史保留）
 */
export type EntryStatus =
  | "confirmed"
  | "pending"
  | "frozen"
  | "escalated"
  | "superseded";

/** 下一班持另一台合格仪器得到的复测记录 */
export interface RetestRecord {
  /** 复测执行日期 yyyy-mm-dd */
  date: string;
  /** 复测执行班次 */
  shift: ShiftCode;
  at: string;
  inspector: string;
  instruments: InstrumentSelection;
  readings: Reading;
  /** 复测是否通过：复测值与原值在漂移阈值内即为通过 */
  passed: boolean;
  /** 复测值相对原值仍然越限的指标 */
  flags: DriftFlag[];
  note?: string;
}

/**
 * 巡检条目。同房间 + 同日期 + 同班次只允许有一条“生效中”条目；
 * 更正不是覆盖，而是另建一条新版本，旧条目标记 superseded。
 */
export interface InspectionEntry {
  id: string;
  roomId: string;
  date: string;
  shift: ShiftCode;
  /** 跨天连续的班次序号，用于查找“相邻上一班” */
  ordinal: number;

  inspector: string;
  /** 当前生效仪器（复测通过后更新为复测仪器） */
  instruments: InstrumentSelection;
  /** 当前生效读数（复测通过后更新为复测值） */
  readings: Reading;
  /** 首次登记仪器，全程保留 */
  initialInstruments: InstrumentSelection;
  /** 首次登记原值，全程保留 */
  initialReadings: Reading;

  status: EntryStatus;
  /** 与相邻上一班比对产生的漂移标记 */
  driftFlags: DriftFlag[];
  /** 相邻上一班条目的 id */
  previousEntryId?: string;

  retest?: RetestRecord;

  /** 版本号，原始登记为 1，每次更正 +1 */
  version: number;
  /** 本版本更正自哪一条 */
  correctsEntryId?: string;
  /** 更正原因 */
  correctionReason?: string;
  /** 已被哪条新版本替代 */
  supersededBy?: string;

  createdAt: string;
  updatedAt: string;
}

export interface BoardState {
  schemaVersion: 1;
  entries: InspectionEntry[];
}

/** 动作统一返回结果，便于页面提示 */
export interface ActionResult {
  ok: boolean;
  message: string;
}
