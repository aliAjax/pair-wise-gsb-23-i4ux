// 领域模型：洁净室跨班互检与仪器漂移复核

/** 四项巡检读数 */
export interface Reading {
  /** 粒子计数（≥0.5µm，个/m³） */
  particles: number;
  /** 压差（Pa） */
  pressure: number;
  /** 温度（℃） */
  temperature: number;
  /** 湿度（%RH） */
  humidity: number;
}

export type MetricKey = keyof Reading;

export const METRIC_LABELS: Record<MetricKey, string> = {
  particles: "粒子计数",
  pressure: "压差",
  temperature: "温度",
  humidity: "湿度",
};

export const METRIC_UNITS: Record<MetricKey, string> = {
  particles: "个/m³",
  pressure: "Pa",
  temperature: "℃",
  humidity: "%RH",
};

/**
 * 记录状态机：
 * confirmed      互检通过（与上一班读数未越漂移阈值）
 * pending-review 待复核（相邻班漂移越阈，保留原值等待下一班复测）
 * frozen         已冻结（复测通过，仪器与读数锁定，更正只能走修订）
 * superseded     已被修订取代（历史版本，仅用于追溯修订链）
 */
export type RecordStatus = "confirmed" | "pending-review" | "frozen" | "superseded";

export const STATUS_LABELS: Record<RecordStatus, string> = {
  confirmed: "互检通过",
  "pending-review": "待复核",
  frozen: "已冻结",
  superseded: "已被修订",
};

/** 漂移越阈明细（某一项指标） */
export interface DriftMetric {
  metric: MetricKey;
  from: number;
  to: number;
  /** 展示用偏差描述，如 "+68.4%" 或 "+6.0 Pa" */
  deltaText: string;
  /** 展示用阈值描述，如 "±30%" */
  limitText: string;
}

/** 一次复测记录（下一班、另一台合格仪器） */
export interface ReviewAttempt {
  shiftId: string;
  inspector: string;
  instrumentId: string;
  readings: Reading;
  result: "passed" | "rejected";
  at: string;
}

/** 一条巡检记录（同房间同班最多一条“当前”记录；修订产生版本链） */
export interface InspectionRecord {
  id: string;
  roomId: string;
  shiftId: string;
  inspector: string;
  instrumentId: string;
  readings: Reading;
  status: RecordStatus;
  version: number;
  /** 漂移复核关系：指向上一班触发漂移的记录 */
  driftFromId: string | null;
  driftMetrics: DriftMetric[];
  reviews: ReviewAttempt[];
  /** 修订关系：指向被本版本更正的记录 */
  supersedesId: string | null;
  revisionReason: string | null;
  createdAt: string;
}

/** 巡检仪器台账，qualified=false 的仪器禁止登记与复测 */
export interface Instrument {
  id: string;
  name: string;
  qualified: boolean;
  calibrationDue: string;
}

export interface Room {
  id: string;
  grade: string;
}

export interface AppState {
  records: InspectionRecord[];
  instruments: Instrument[];
}

export const ROOMS: Room[] = [
  { id: "CR-1201", grade: "ISO 5" },
  { id: "CR-2107", grade: "ISO 6" },
  { id: "CR-3305", grade: "ISO 7" },
  { id: "Y-0302", grade: "黄光区" },
];

export const INSPECTORS = ["王敏", "李强", "陈杰", "赵岚"];
