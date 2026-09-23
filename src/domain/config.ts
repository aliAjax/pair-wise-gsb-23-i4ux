// 领域配置：班次、房间等级、仪器台账与漂移阈值。
// 页面与判定都从这里取参数，阈值变更不需要改判定代码。

import type {
  InstrumentGroup,
  InstrumentSelection,
  MetricKey,
  ShiftCode,
} from "./types";

export interface ShiftDef {
  code: ShiftCode;
  label: string;
  window: string;
  /** 同日内的班次次序，用于跨天排序 */
  order: 0 | 1 | 2;
}

export const SHIFTS: ShiftDef[] = [
  { code: "A", label: "早班 A", window: "08:00–16:00", order: 0 },
  { code: "B", label: "中班 B", window: "16:00–00:00", order: 1 },
  { code: "C", label: "夜班 C", window: "00:00–08:00", order: 2 },
];

export interface MetricDef {
  key: MetricKey;
  label: string;
  unit: string;
  /** 所属仪器分组（温度与湿度同属温湿度仪） */
  group: InstrumentGroup;
  /** 漂移阈值：两次读数绝对变化达到该值视为越限候选 */
  absThreshold: number;
  step: number;
}

export const METRICS: MetricDef[] = [
  { key: "particle", label: "粒子计数 ≥0.5µm", unit: "粒/m³", group: "particle", absThreshold: 500, step: 1 },
  { key: "pressure", label: "相对压差", unit: "Pa", group: "pressure", absThreshold: 3, step: 0.5 },
  { key: "temperature", label: "温度", unit: "℃", group: "thermo", absThreshold: 1, step: 0.1 },
  { key: "humidity", label: "相对湿度", unit: "%RH", group: "thermo", absThreshold: 5, step: 0.1 },
];

export const METRIC_MAP: Record<MetricKey, MetricDef> = Object.fromEntries(
  METRICS.map((m) => [m.key, m]),
) as Record<MetricKey, MetricDef>;

export const GROUPS: { key: InstrumentGroup; label: string }[] = [
  { key: "particle", label: "粒子计数器" },
  { key: "pressure", label: "差压计" },
  { key: "thermo", label: "温湿度仪" },
];

/**
 * 粒子计数是相对量：仅在「绝对变化量 ≥ 500」且「相对变化 ≥ 25%」同时成立时判漂移，
 * 避免低基线时的小波动、高基线时的舍入差被误报。
 */
export const PARTICLE_REL_THRESHOLD_PCT = 25;

export interface RoomDef {
  id: string;
  name: string;
  grade: string;
  /** ≥0.5µm 粒子浓度限值（粒/m³，ISO 14644-1 近似） */
  particleLimit: number;
}

export const ROOMS: RoomDef[] = [
  { id: "CR-1201", name: "光刻准备间", grade: "ISO 5", particleLimit: 3520 },
  { id: "CR-2107", name: "刻蚀工艺间", grade: "ISO 6", particleLimit: 35200 },
  { id: "CR-3305", name: "薄膜沉积间", grade: "ISO 7", particleLimit: 352000 },
  { id: "Y-0302", name: "黄光涂胶间", grade: "黄光区", particleLimit: 35200 },
];

export const ROOM_MAP: Record<string, RoomDef> = Object.fromEntries(
  ROOMS.map((r) => [r.id, r]),
);

export interface InstrumentDef {
  id: string;
  group: InstrumentGroup;
  model: string;
  qualified: boolean;
  note?: string;
}

export const INSTRUMENTS: InstrumentDef[] = [
  { id: "LPC-11", group: "particle", model: "手持式粒子计数器 PMS-LPC", qualified: true },
  { id: "LPC-12", group: "particle", model: "手持式粒子计数器 PMS-LPC", qualified: true },
  { id: "LPC-13", group: "particle", model: "手持式粒子计数器 PMS-LPC", qualified: true },
  { id: "LPC-05", group: "particle", model: "手持式粒子计数器 PMS-LPC", qualified: false, note: "校准超期，禁止使用" },
  { id: "DPM-01", group: "pressure", model: "数字微压计 DPM-A", qualified: true },
  { id: "DPM-02", group: "pressure", model: "数字微压计 DPM-A", qualified: true },
  { id: "DPM-03", group: "pressure", model: "数字微压计 DPM-A", qualified: true },
  { id: "THM-21", group: "thermo", model: "温湿度记录仪 THM-Pro", qualified: true },
  { id: "THM-22", group: "thermo", model: "温湿度记录仪 THM-Pro", qualified: true },
  { id: "THM-23", group: "thermo", model: "温湿度记录仪 THM-Pro", qualified: true },
];

export const INSTRUMENT_MAP: Record<string, InstrumentDef> = Object.fromEntries(
  INSTRUMENTS.map((i) => [i.id, i]),
);

export function instrumentsOfGroup(group: InstrumentGroup): InstrumentDef[] {
  return INSTRUMENTS.filter((i) => i.group === group);
}

export function emptyInstruments(): InstrumentSelection {
  return { particle: "", pressure: "", thermo: "" };
}
