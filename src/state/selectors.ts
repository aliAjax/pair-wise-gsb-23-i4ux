// 派生选择器：从条目集合还原三种关系，供页面分区展示。
// - 跨班互检链：同房间按班次序号串联的生效条目（含漂移点）
// - 漂移复核单：发生漂移 → 换机复测 → 冻结/升级 的完整闭环
// - 修订谱系：原版本 → 带原因更正版本的版本树
// 纯函数，不触碰存储。

import { ROOM_MAP } from "../domain/config";
import type { InspectionEntry } from "../domain/types";

export function sortByShift(entries: InspectionEntry[]): InspectionEntry[] {
  return [...entries].sort(
    (a, b) => a.ordinal - b.ordinal || a.createdAt.localeCompare(b.createdAt),
  );
}

export interface InspectionChain {
  roomId: string;
  entries: InspectionEntry[];
}

/**
 * 按房间分组的跨班互检链：剔除被替代版本；
 * 升级单（escalated）已转更正流程，作为处置留档，不继续占用互检链。
 */
export function selectInspectionChains(entries: InspectionEntry[]): InspectionChain[] {
  const active = entries.filter(
    (e) => e.status !== "superseded" && e.status !== "escalated",
  );
  const byRoom = new Map<string, InspectionEntry[]>();
  for (const e of sortByShift(active)) {
    const list = byRoom.get(e.roomId) ?? [];
    list.push(e);
    byRoom.set(e.roomId, list);
  }
  return [...byRoom.entries()]
    .map(([roomId, list]) => ({ roomId, entries: list }))
    .sort((a, b) => a.roomId.localeCompare(b.roomId));
}

export interface DriftReviewCase {
  /** 触发漂移的登记条目 */
  trigger: InspectionEntry;
}

/** 待复核 / 已冻结 / 升级 的条目本身就是一份漂移复核单 */
export function selectDriftReviews(entries: InspectionEntry[]): DriftReviewCase[] {
  return entries
    .filter((e) => e.status === "pending" || e.status === "frozen" || e.status === "escalated")
    .sort((a, b) => b.ordinal - a.ordinal || b.updatedAt.localeCompare(a.updatedAt))
    .map((trigger) => ({ trigger }));
}

export interface CorrectionFamily {
  /** 版本链，从旧到新 */
  versions: InspectionEntry[];
}

/** 沿着 correctsEntryId / supersededBy 聚合同一条目谱系的全部版本 */
export function selectCorrectionFamilies(entries: InspectionEntry[]): CorrectionFamily[] {
  const roots = entries.filter((e) => !e.correctsEntryId && e.supersededBy);
  const families: CorrectionFamily[] = [];
  for (const root of roots) {
    const versions: InspectionEntry[] = [root];
    let current = root;
    const guard = new Set<string>([root.id]);
    while (current.supersededBy) {
      const next = entries.find((e) => e.id === current.supersededBy);
      if (!next || guard.has(next.id)) break;
      versions.push(next);
      guard.add(next.id);
      current = next;
    }
    families.push({ versions });
  }
  return families.sort((a, b) =>
    b.versions[b.versions.length - 1].updatedAt.localeCompare(
      a.versions[a.versions.length - 1].updatedAt,
    ),
  );
}

export function roomLabel(roomId: string): string {
  const room = ROOM_MAP[roomId];
  return room ? `${room.id} ${room.name}` : roomId;
}

export interface BoardStats {
  activeCount: number;
  pendingCount: number;
  frozenCount: number;
  escalatedCount: number;
  correctionCount: number;
  driftCount: number;
}

export function selectStats(entries: InspectionEntry[]): BoardStats {
  return {
    activeCount: entries.filter((e) => e.status !== "superseded").length,
    pendingCount: entries.filter((e) => e.status === "pending").length,
    frozenCount: entries.filter((e) => e.status === "frozen").length,
    escalatedCount: entries.filter((e) => e.status === "escalated").length,
    correctionCount: entries.filter((e) => !!e.correctsEntryId).length,
    driftCount: entries.filter((e) => e.driftFlags.length > 0).length,
  };
}
