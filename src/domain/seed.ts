// 示例数据：不重写手算状态，而是按时间顺序重放领域操作，
// 保证种子数据与判定规则完全一致（互检通过 / 待复核 / 冻结 / 修订链都有样本）。

import { AppState, Instrument } from "./types";
import { OpResult, registerRecord, reviseRecord, submitReview } from "./judgment";

const INSTRUMENTS: Instrument[] = [
  { id: "PC-101", name: "综合巡检仪 PC-101", qualified: true, calibrationDue: "2026-12-01" },
  { id: "PC-102", name: "综合巡检仪 PC-102", qualified: true, calibrationDue: "2026-11-15" },
  { id: "PC-103", name: "综合巡检仪 PC-103", qualified: true, calibrationDue: "2027-01-20" },
  { id: "TH-301", name: "温湿度记录仪 TH-301", qualified: false, calibrationDue: "2026-08-15" },
];

function must(r: OpResult, step: string): Extract<OpResult, { ok: true }> {
  if (!r.ok) throw new Error(`种子数据重放失败 @${step}: ${r.error}`);
  return r;
}

export function seedState(): AppState {
  let state: AppState = { records: [], instruments: INSTRUMENTS };

  // CR-1201：两班互检通过 → 第三班粒子漂移 → 下一班换仪器复测通过并冻结
  state = must(registerRecord(state, {
    roomId: "CR-1201", shiftId: "2026-09-22-D", inspector: "王敏", instrumentId: "PC-101",
    readings: { particles: 3200, pressure: 15.2, temperature: 22.1, humidity: 45.0 },
  }), "1").state;
  state = must(registerRecord(state, {
    roomId: "CR-1201", shiftId: "2026-09-22-N", inspector: "李强", instrumentId: "PC-102",
    readings: { particles: 3100, pressure: 14.8, temperature: 22.3, humidity: 45.6 },
  }), "2").state;
  const drifted = must(registerRecord(state, {
    roomId: "CR-1201", shiftId: "2026-09-23-D", inspector: "王敏", instrumentId: "PC-101",
    readings: { particles: 5240, pressure: 15.0, temperature: 22.2, humidity: 45.2 },
  }), "3");
  state = drifted.state;
  state = must(submitReview(state, drifted.record.id, {
    shiftId: "2026-09-23-N", inspector: "李强", instrumentId: "PC-103",
    readings: { particles: 5080, pressure: 15.1, temperature: 22.2, humidity: 45.1 },
  }), "4").state;

  // CR-2107：漂移 → 复测通过冻结 → 冻结后更正另建 v2（带原因）
  state = must(registerRecord(state, {
    roomId: "CR-2107", shiftId: "2026-09-22-N", inspector: "陈杰", instrumentId: "PC-102",
    readings: { particles: 1100, pressure: 12.4, temperature: 21.8, humidity: 44.2 },
  }), "5").state;
  const drifted2 = must(registerRecord(state, {
    roomId: "CR-2107", shiftId: "2026-09-23-D", inspector: "陈杰", instrumentId: "PC-101",
    readings: { particles: 1480, pressure: 12.1, temperature: 21.9, humidity: 44.0 },
  }), "6");
  state = drifted2.state;
  const frozen2 = must(submitReview(state, drifted2.record.id, {
    shiftId: "2026-09-23-N", inspector: "赵岚", instrumentId: "PC-102",
    readings: { particles: 1450, pressure: 12.2, temperature: 21.8, humidity: 44.1 },
  }), "7");
  state = frozen2.state;
  state = must(reviseRecord(state, frozen2.record.id, {
    inspector: "赵岚", instrumentId: "PC-102",
    readings: { particles: 1420, pressure: 12.2, temperature: 21.8, humidity: 44.1 },
    reason: "粒子计数器采样流量偏差，按复测均值更正",
  }), "8").state;

  // Y-0302：相邻班漂移待复核，且已有一次复测未通过 —— 留给页面操作的样本
  state = must(registerRecord(state, {
    roomId: "Y-0302", shiftId: "2026-09-23-D", inspector: "赵岚", instrumentId: "PC-103",
    readings: { particles: 220, pressure: 8.5, temperature: 23.0, humidity: 55.0 },
  }), "9").state;
  const pending = must(registerRecord(state, {
    roomId: "Y-0302", shiftId: "2026-09-23-N", inspector: "王敏", instrumentId: "PC-101",
    readings: { particles: 340, pressure: 8.2, temperature: 22.8, humidity: 54.6 },
  }), "10");
  state = pending.state;
  const rejected = submitReview(state, pending.record.id, {
    shiftId: "2026-09-24-D", inspector: "李强", instrumentId: "PC-102",
    readings: { particles: 235, pressure: 8.4, temperature: 22.9, humidity: 54.8 },
  });
  if (rejected.ok) state = rejected.state; // 预期未通过、保持待复核

  return state;
}
