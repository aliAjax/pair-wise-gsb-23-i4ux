// 存储层：localStorage 读写，按 schema 版本隔离。
// 只负责序列化/反序列化与首屏演示数据装载，不做任何业务判定。

import { buildSeedState } from "./seed";
import type { BoardState } from "../domain/types";

const STORAGE_KEY = "hxwl-09.cleanroom-board.v1";

function isBoardState(value: unknown): value is BoardState {
  if (!value || typeof value !== "object") return false;
  const v = value as BoardState;
  return v.schemaVersion === 1 && Array.isArray(v.entries);
}

export function loadState(): BoardState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isBoardState(parsed)) return parsed;
    }
  } catch {
    // 存储损坏时退回演示数据，不阻断页面
  }
  const seeded = buildSeedState();
  persist(seeded);
  return seeded;
}

export function persist(state: BoardState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 隐私模式等场景下仅内存可用，页面功能不受影响
  }
}

export function resetState(): BoardState {
  const seeded = buildSeedState();
  persist(seeded);
  return seeded;
}

export function clearState(): BoardState {
  localStorage.removeItem(STORAGE_KEY);
  return { schemaVersion: 1, entries: [] };
}
