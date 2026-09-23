// 首屏演示数据：覆盖三种关系
// - 跨班互检：CR-3305 同班更正后继续接下一班互检
// - 漂移复核：CR-1201 待复核 / Y-0302 复测通过冻结 / CR-2107 复测未过升级
// - 修订谱系：CR-3305 v1→v2、CR-2107 升级后更正版本
// 漂移标记与复测结论都由 domain/policy 计算，种子数据不手写判定结果。

import { evaluateDrift, evaluateRetest, shiftOrdinal } from "../domain/policy";
import type {
  ActionResult,
  BoardState,
  InspectionEntry,
  InstrumentSelection,
  Reading,
  ShiftCode,
} from "../domain/types";

interface SeedInput {
  id: string;
  roomId: string;
  date: string;
  shift: ShiftCode;
  at: string;
  inspector: string;
  instruments: InstrumentSelection;
  readings: Reading;
  /** 与同房间前一条种子条目比对（按数组顺序） */
  linkPrevious?: boolean;
  /** 显式指定互检基线条目 id（用于基线为同班更正版本的场景） */
  linkFrom?: string;
  retest?: {
    date: string;
    shift: ShiftCode;
    at: string;
    inspector: string;
    instruments: InstrumentSelection;
    readings: Reading;
    note?: string;
  };
  corrects?: {
    id: string;
    reason: string;
    at: string;
    /** 源条目状态（默认 superseded；升级单留档时保持 escalated） */
    sourceStatus?: "superseded" | "escalated";
  };
  version?: number;
}

function buildEntry(
  input: SeedInput,
  prev: InspectionEntry | undefined,
  idMap: Map<string, InspectionEntry>,
): InspectionEntry {
  const now = `${input.date}T${input.at}`;
  const base: InspectionEntry = {
    id: input.id,
    roomId: input.roomId,
    date: input.date,
    shift: input.shift,
    ordinal: shiftOrdinal(input.date, input.shift),
    inspector: input.inspector,
    instruments: { ...input.instruments },
    readings: { ...input.readings },
    initialInstruments: { ...input.instruments },
    initialReadings: { ...input.readings },
    status: "confirmed",
    driftFlags: [],
    version: input.version ?? 1,
    createdAt: now,
    updatedAt: now,
  };

  if (input.linkFrom) {
    const baseline = idMap.get(input.linkFrom);
    if (baseline) {
      base.previousEntryId = baseline.id;
      base.driftFlags = evaluateDrift(baseline.readings, input.readings);
      if (base.driftFlags.length > 0) base.status = "pending";
    }
  } else if (input.linkPrevious && prev) {
    base.previousEntryId = prev.id;
    base.driftFlags = evaluateDrift(prev.readings, input.readings);
    if (base.driftFlags.length > 0) base.status = "pending";
  }

  if (input.retest) {
    const r = input.retest;
    const verdict = evaluateRetest(input.readings, r.readings);
    base.retest = {
      date: r.date,
      shift: r.shift,
      at: `${r.date}T${r.at}`,
      inspector: r.inspector,
      instruments: { ...r.instruments },
      readings: { ...r.readings },
      passed: verdict.passed,
      flags: verdict.flags,
      note: r.note,
    };
    if (verdict.passed) {
      // 复测通过：冻结仪器与读数（复测值生效，原值保留在 initial*）
      base.status = "frozen";
      base.instruments = { ...r.instruments };
      base.readings = { ...r.readings };
    } else {
      // 复测未过：保留原值，升级厂务
      base.status = "escalated";
    }
    base.updatedAt = `${r.date}T${r.at}`;
  }

  if (input.corrects) {
    const source = idMap.get(input.corrects.id);
    if (source) {
      base.correctsEntryId = source.id;
      base.correctionReason = input.corrects.reason;
      base.createdAt = `${input.date}T${input.corrects.at}`;
      base.updatedAt = base.createdAt;
      if (input.corrects.sourceStatus === "escalated") {
        // 升级单作为处置留档保留在复核队列，仅挂上更正版本指针
        source.supersededBy = base.id;
        source.updatedAt = base.createdAt;
      } else {
        source.status = "superseded";
        source.supersededBy = base.id;
        source.updatedAt = base.createdAt;
      }
    }
  }

  return base;
}

export function buildSeedState(): BoardState {
  const idMap = new Map<string, InspectionEntry>();
  const lastByRoom = new Map<string, InspectionEntry>();
  const entries: InspectionEntry[] = [];

  const seeds: SeedInput[] = [
    // ── CR-1201：互检正常 → 中班粒子读数越过漂移阈值，停在待复核 ──
    {
      id: "e-cr1201-0922-a",
      roomId: "CR-1201",
      date: "2026-09-22",
      shift: "A",
      at: "09:05:00",
      inspector: "王建国",
      instruments: { particle: "LPC-11", pressure: "DPM-01", thermo: "THM-21" },
      readings: { particle: 1850, pressure: 12, temperature: 22.0, humidity: 45.0 },
    },
    {
      id: "e-cr1201-0922-b",
      roomId: "CR-1201",
      date: "2026-09-22",
      shift: "B",
      at: "16:40:00",
      inspector: "李晓梅",
      instruments: { particle: "LPC-11", pressure: "DPM-01", thermo: "THM-21" },
      readings: { particle: 2420, pressure: 12.5, temperature: 22.2, humidity: 45.5 },
      linkPrevious: true,
    },

    // ── Y-0302：夜班湿度漂移，次日早班换机复测通过 → 冻结 ──
    {
      id: "e-y0302-0922-a",
      roomId: "Y-0302",
      date: "2026-09-22",
      shift: "A",
      at: "08:50:00",
      inspector: "孙莉",
      instruments: { particle: "LPC-11", pressure: "DPM-01", thermo: "THM-21" },
      readings: { particle: 12800, pressure: 10, temperature: 22.5, humidity: 48.0 },
    },
    {
      id: "e-y0302-0922-b",
      roomId: "Y-0302",
      date: "2026-09-22",
      shift: "B",
      at: "16:30:00",
      inspector: "刘洋",
      instruments: { particle: "LPC-11", pressure: "DPM-01", thermo: "THM-21" },
      readings: { particle: 13400, pressure: 11, temperature: 22.6, humidity: 48.5 },
      linkPrevious: true,
    },
    {
      id: "e-y0302-0922-c",
      roomId: "Y-0302",
      date: "2026-09-22",
      shift: "C",
      at: "01:15:00",
      inspector: "周敏",
      instruments: { particle: "LPC-11", pressure: "DPM-01", thermo: "THM-22" },
      readings: { particle: 12900, pressure: 10.5, temperature: 22.8, humidity: 55.0 },
      linkPrevious: true,
      retest: {
        date: "2026-09-23",
        shift: "A",
        at: "08:55:00",
        inspector: "孙莉",
        instruments: { particle: "LPC-12", pressure: "DPM-02", thermo: "THM-23" },
        readings: { particle: 13100, pressure: 10.5, temperature: 22.7, humidity: 54.5 },
        note: "下一班换合格仪器复测，湿度与原值一致，判定环境真实",
      },
    },

    // ── CR-2107：压差漂移，复测仍偏离原值 → 升级，随后另建更正版本 ──
    {
      id: "e-cr2107-0922-a",
      roomId: "CR-2107",
      date: "2026-09-22",
      shift: "A",
      at: "09:20:00",
      inspector: "王建国",
      instruments: { particle: "LPC-12", pressure: "DPM-02", thermo: "THM-22" },
      readings: { particle: 21000, pressure: 15, temperature: 23.0, humidity: 46.0 },
    },
    {
      id: "e-cr2107-0922-b",
      roomId: "CR-2107",
      date: "2026-09-22",
      shift: "B",
      at: "16:50:00",
      inspector: "李晓梅",
      instruments: { particle: "LPC-12", pressure: "DPM-02", thermo: "THM-22" },
      readings: { particle: 21500, pressure: 20, temperature: 23.1, humidity: 46.0 },
      linkPrevious: true,
      // 待复核条目由相邻下一班（夜班 C）换另一台合格仪器复测，复核结论挂在本条
      retest: {
        date: "2026-09-22",
        shift: "C",
        at: "02:10:00",
        inspector: "周敏",
        instruments: { particle: "LPC-13", pressure: "DPM-03", thermo: "THM-23" },
        readings: { particle: 21200, pressure: 15.5, temperature: 23.2, humidity: 46.5 },
        note: "DPM-03 复测压差回到 15.5Pa，与原值 20Pa 仍超漂移阈值，疑似 DPM-02 漂移",
      },
    },
    {
      id: "e-cr2107-0923-a-v2",
      roomId: "CR-2107",
      date: "2026-09-23",
      shift: "A",
      at: "09:30:00",
      inspector: "王建国",
      instruments: { particle: "LPC-13", pressure: "DPM-03", thermo: "THM-23" },
      readings: { particle: 21200, pressure: 15.5, temperature: 23.2, humidity: 46.5 },
      corrects: {
        id: "e-cr2107-0922-b",
        at: "09:30:00",
        sourceStatus: "escalated",
        reason:
          "DPM-02 经计量确认零点漂移并停用，以夜班 C 班 DPM-03 复测值 15.5Pa 为准更正；粒子与温湿度同步采用复测值",
      },
      version: 2,
    },

    // ── CR-3305：早班登记位置错误，同班另建 v2；中班与 v2 互检正常 ──
    {
      id: "e-cr3305-0923-a",
      roomId: "CR-3305",
      date: "2026-09-23",
      shift: "A",
      at: "08:35:00",
      inspector: "赵强",
      instruments: { particle: "LPC-13", pressure: "DPM-03", thermo: "THM-23" },
      readings: { particle: 205000, pressure: 18, temperature: 23.5, humidity: 42.0 },
    },
    {
      id: "e-cr3305-0923-a-v2",
      roomId: "CR-3305",
      date: "2026-09-23",
      shift: "A",
      at: "10:40:00",
      inspector: "赵强",
      instruments: { particle: "LPC-13", pressure: "DPM-03", thermo: "THM-23" },
      readings: { particle: 198000, pressure: 18, temperature: 23.5, humidity: 42.0 },
      corrects: {
        id: "e-cr3305-0923-a",
        at: "10:40:00",
        reason: "粒子采样位置误记为送风口正下方，按 SOP 改在工作面中央重新采样，更正为 198000 粒/m³",
      },
      version: 2,
    },
    {
      id: "e-cr3305-0923-b",
      roomId: "CR-3305",
      date: "2026-09-23",
      shift: "B",
      at: "17:10:00",
      inspector: "李晓梅",
      instruments: { particle: "LPC-13", pressure: "DPM-03", thermo: "THM-23" },
      readings: { particle: 210000, pressure: 17.5, temperature: 23.4, humidity: 42.5 },
      // 相邻上一班的生效版本是更正后的 v2
      linkFrom: "e-cr3305-0923-a-v2",
    },
  ];

  for (const seed of seeds) {
    const entry = buildEntry(seed, lastByRoom.get(seed.roomId), idMap);
    idMap.set(entry.id, entry);
    entries.push(entry);
    // 被更正替代的版本不再作为后续互检基线
    if (entry.status !== "superseded") lastByRoom.set(entry.roomId, entry);
  }

  return { schemaVersion: 1, entries };
}

export function emptyState(): BoardState {
  return { schemaVersion: 1, entries: [] };
}

export const okResult = (message: string): ActionResult => ({ ok: true, message });
export const failResult = (message: string): ActionResult => ({ ok: false, message });
