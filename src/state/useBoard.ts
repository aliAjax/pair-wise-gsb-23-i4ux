// 应用状态与动作：登记（同房间同班唯一）、换机复测、带原因更正版本。
// 判定全部委托 domain/policy，持久化委托 storage，本文件只管流程与不变量。
// 动作一律“先基于当前 state 计算下一状态，再一次性 setState”，
// 不在 setState updater 中写外部变量（避免 React 开发模式双调用覆盖结果）。

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  evaluateDrift,
  evaluateRetest,
  retestInstrumentIssues,
  shiftOrdinal,
  validateInstruments,
} from "../domain/policy";
import type {
  ActionResult,
  BoardState,
  InspectionEntry,
  InstrumentSelection,
  Reading,
  ShiftCode,
} from "../domain/types";
import { loadState, persist, resetState } from "../storage/repository";
import { failResult, okResult } from "../storage/seed";

export interface RegisterInput {
  roomId: string;
  date: string;
  shift: ShiftCode;
  inspector: string;
  instruments: InstrumentSelection;
  readings: Reading;
}

export interface RetestInput {
  date: string;
  shift: ShiftCode;
  inspector: string;
  instruments: InstrumentSelection;
  readings: Reading;
  note?: string;
}

export interface CorrectionInput {
  date: string;
  shift: ShiftCode;
  inspector: string;
  instruments: InstrumentSelection;
  readings: Reading;
  reason: string;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowStamp(date: string): string {
  return `${date}T${new Date().toTimeString().slice(0, 8)}`;
}

function validateCommon(input: {
  date: string;
  inspector: string;
  instruments: InstrumentSelection;
  readings: Reading;
}): string | null {
  if (!input.date) return "请选择日期";
  if (!input.inspector.trim()) return "请填写巡检员姓名";
  const instIssue = validateInstruments(input.instruments);
  if (instIssue) return instIssue;
  const r = input.readings;
  const nums: [string, number][] = [
    ["粒子计数", r.particle],
    ["压差", r.pressure],
    ["温度", r.temperature],
    ["湿度", r.humidity],
  ];
  for (const [label, value] of nums) {
    if (!Number.isFinite(value)) return `${label} 必须是数字`;
  }
  if (r.particle < 0) return "粒子计数不能为负";
  if (r.humidity < 0 || r.humidity > 100) return "湿度应在 0–100 %RH 之间";
  return null;
}

/**
 * 同房间 + 同日期 + 同班次当前占用槽位的条目（未被更正替代）。
 * - pending/frozen 仍占槽位：禁止同班直接重填或冻结覆盖；
 * - 已挂更正版本的 escalated 升级单属处置留档，不再占槽位。
 */
export function findActiveSlot(
  entries: InspectionEntry[],
  roomId: string,
  date: string,
  shift: ShiftCode,
): InspectionEntry | undefined {
  return entries.find(
    (e) =>
      e.roomId === roomId &&
      e.date === date &&
      e.shift === shift &&
      e.status !== "superseded" &&
      !(e.status === "escalated" && !!e.supersededBy),
  );
}

/**
 * 互检基线：同房间“相邻上一班”（班次序号恰好小 1）的生效条目。
 * 中间缺席班次时不回溯更早历史值；冻结值/复测值参与比对；
 * 上一班条目已被同班更正替代时，基线解析到其最新更正版本。
 * escalated 升级单已转更正流程，作为处置留档，不参与互检。
 */
function findPriorBaseline(
  entries: InspectionEntry[],
  roomId: string,
  ordinal: number,
  excludeId?: string,
): InspectionEntry | undefined {
  const direct = entries.find(
    (e) =>
      e.roomId === roomId &&
      e.status !== "superseded" &&
      e.status !== "escalated" &&
      e.id !== excludeId &&
      e.ordinal === ordinal - 1,
  );
  if (direct) return direct;

  const superseded = entries.find(
    (e) =>
      e.roomId === roomId &&
      e.status === "superseded" &&
      e.id !== excludeId &&
      e.ordinal === ordinal - 1,
  );
  if (!superseded?.supersededBy) return undefined;
  let current: InspectionEntry | undefined = superseded;
  const guard = new Set<string>();
  while (current?.supersededBy && !guard.has(current.supersededBy)) {
    guard.add(current.supersededBy);
    current = entries.find((e) => e.id === current!.supersededBy);
    if (current && current.status !== "superseded" && current.status !== "escalated") {
      return current;
    }
  }
  return undefined;
}

function commit(prev: BoardState, entries: InspectionEntry[]): BoardState {
  return { ...prev, entries };
}

export function useBoard() {
  const [state, setState] = useState<BoardState>(() => loadState());

  useEffect(() => {
    persist(state);
  }, [state]);

  const registerEntry = useCallback(
    (input: RegisterInput): ActionResult => {
      const problem = validateCommon(input);
      if (problem) return failResult(problem);

      const entries = state.entries;
      const existing = findActiveSlot(entries, input.roomId, input.date, input.shift);
      const ordinal = shiftOrdinal(input.date, input.shift);

      // 同房间同班只留一条：只有“互检通过”的条目允许本班重新登记覆盖
      if (existing) {
        if (existing.status === "frozen") {
          return failResult("该班记录复测后已冻结，不能覆盖；请使用“另建更正版本”");
        }
        if (existing.status === "pending") {
          return failResult("该班记录正停在待复核，请由下一班换合格仪器复测，不能直接重填");
        }
        if (existing.status === "escalated") {
          return failResult("该班记录已升级处理，请另建带原因的更正版本");
        }

        // confirmed：本班重新登记，重新与相邻上一班做漂移判定
        const prior = findPriorBaseline(entries, input.roomId, ordinal, existing.id);
        const flags = prior ? evaluateDrift(prior.readings, input.readings) : [];
        const stamp = nowStamp(input.date);
        const updated: InspectionEntry = {
          ...existing,
          inspector: input.inspector.trim(),
          instruments: { ...input.instruments },
          readings: { ...input.readings },
          initialInstruments: { ...input.instruments },
          initialReadings: { ...input.readings },
          driftFlags: flags,
          previousEntryId: prior?.id ?? existing.previousEntryId,
          status: flags.length > 0 ? "pending" : "confirmed",
          retest: flags.length > 0 ? undefined : existing.retest,
          updatedAt: stamp,
        };
        setState(
          commit(
            state,
            entries.map((e) => (e.id === existing.id ? updated : e)),
          ),
        );
        return flags.length > 0
          ? okResult("重新登记完成：相邻班读数越过漂移阈值，条目停在待复核")
          : okResult("同班记录已更新，互检通过");
      }

      const prior = findPriorBaseline(entries, input.roomId, ordinal);
      const flags = prior ? evaluateDrift(prior.readings, input.readings) : [];
      const stamp = nowStamp(input.date);
      const entry: InspectionEntry = {
        id: newId(),
        roomId: input.roomId,
        date: input.date,
        shift: input.shift,
        ordinal,
        inspector: input.inspector.trim(),
        instruments: { ...input.instruments },
        readings: { ...input.readings },
        initialInstruments: { ...input.instruments },
        initialReadings: { ...input.readings },
        status: flags.length > 0 ? "pending" : "confirmed",
        driftFlags: flags,
        previousEntryId: prior?.id,
        version: 1,
        createdAt: stamp,
        updatedAt: stamp,
      };
      setState(commit(state, [...entries, entry]));
      return flags.length > 0
        ? okResult("登记成功：与相邻上一班相比越过漂移阈值，已停在待复核，等待下一班换机复测")
        : okResult("登记成功，跨班互检通过");
    },
    [state],
  );

  const submitRetest = useCallback(
    (entryId: string, input: RetestInput): ActionResult => {
      if (!input.date) return failResult("请选择复测日期");
      if (!input.inspector.trim()) return failResult("请填写复测巡检员");
      const instIssue = validateInstruments(input.instruments);
      if (instIssue) return failResult(instIssue);

      const entry = state.entries.find((e) => e.id === entryId);
      if (!entry) return failResult("原记录不存在");
      if (entry.status !== "pending") return failResult("只有停在待复核的记录可以提交复测");

      const swapIssues = retestInstrumentIssues(entry.initialInstruments, input.instruments);
      if (swapIssues.length > 0) {
        return failResult(swapIssues.map((i) => i.message).join("；"));
      }

      const retestOrdinal = shiftOrdinal(input.date, input.shift);
      if (retestOrdinal <= entry.ordinal) {
        return failResult("复测应由下一班执行，请选择更晚的班次");
      }

      const { passed, flags } = evaluateRetest(entry.initialReadings, input.readings);
      const stamp = nowStamp(input.date);
      const retested: InspectionEntry = {
        ...entry,
        status: passed ? "frozen" : "escalated",
        // 通过：复测仪器与复测值生效；未通过：保留原值原仪器
        instruments: passed ? { ...input.instruments } : entry.instruments,
        readings: passed ? { ...input.readings } : entry.readings,
        retest: {
          date: input.date,
          shift: input.shift,
          at: stamp,
          inspector: input.inspector.trim(),
          instruments: { ...input.instruments },
          readings: { ...input.readings },
          passed,
          flags,
          note: input.note?.trim() || undefined,
        },
        updatedAt: stamp,
      };
      setState(
        commit(
          state,
          state.entries.map((e) => (e.id === entry.id ? retested : e)),
        ),
      );
      return passed
        ? okResult("复测通过：复测值与原值在漂移阈值内，仪器与读数已冻结")
        : failResult("复测未通过：复测值与原值仍越漂移阈值，保留原值并升级厂务处理");
    },
    [state],
  );

  const createCorrection = useCallback(
    (sourceId: string, input: CorrectionInput): ActionResult => {
      if (!input.date) return failResult("请选择更正日期");
      if (!input.inspector.trim()) return failResult("请填写更正人");
      if (!input.reason.trim()) return failResult("更正必须填写原因");
      const problem = validateCommon(input);
      if (problem) return failResult(problem);

      const source = state.entries.find((e) => e.id === sourceId);
      if (!source) return failResult("原记录不存在");
      if (source.status === "superseded") {
        return failResult("原记录已被更正版本替代，请在最新版本上更正");
      }
      if (source.status === "pending") {
        return failResult("待复核记录须先完成换机复测，不能直接更正");
      }
      // 同房间同班只留一条：该槽位已存在其他生效条目（含更正版本）时不再新建
      const slot = findActiveSlot(state.entries, source.roomId, input.date, input.shift);
      if (slot && slot.id !== source.id) {
        return failResult("该房间该班次已有生效记录（可能已更正），同房间同班只留一条");
      }

      const stamp = nowStamp(input.date);
      // 升级单作为处置留档：保留 escalated 状态并挂更正指针；
      // 冻结/通过条目的更正按版本替代，原记录标记 superseded。
      const keepEscalated = source.status === "escalated";
      const updatedSource: InspectionEntry = {
        ...source,
        status: keepEscalated ? "escalated" : "superseded",
        updatedAt: stamp,
      };
      const corrected: InspectionEntry = {
        id: newId(),
        roomId: source.roomId,
        date: input.date,
        shift: input.shift,
        ordinal: shiftOrdinal(input.date, input.shift),
        inspector: input.inspector.trim(),
        instruments: { ...input.instruments },
        readings: { ...input.readings },
        initialInstruments: { ...input.instruments },
        initialReadings: { ...input.readings },
        status: "confirmed",
        driftFlags: [],
        version: source.version + 1,
        correctsEntryId: source.id,
        correctionReason: input.reason.trim(),
        createdAt: stamp,
        updatedAt: stamp,
      };
      updatedSource.supersededBy = corrected.id;
      setState(
        commit(
          state,
          [...state.entries, corrected].map((e) => (e.id === source.id ? updatedSource : e)),
        ),
      );
      return keepEscalated
        ? okResult(`已建立 v${corrected.version} 更正版本，原升级单保留留档`)
        : okResult(`已建立 v${corrected.version} 更正版本，原 v${source.version} 记录保留为历史`);
    },
    [state],
  );

  const resetDemo = useCallback(() => {
    setState(resetState());
  }, []);

  return useMemo(
    () => ({ state, registerEntry, submitRetest, createCorrection, resetDemo }),
    [state, registerEntry, submitRetest, createCorrection, resetDemo],
  );
}
