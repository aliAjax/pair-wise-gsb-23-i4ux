// 存储层：localStorage 持久化，页面重开后恢复全部领域状态
// （互检关系、漂移复核链、修订链都落在同一份版本化快照里）

import { AppState } from "../domain/types";
import { seedState } from "../domain/seed";

const STORAGE_KEY = "hxwl09-drift-review-v1";

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw) as AppState;
    if (!Array.isArray(parsed.records) || !Array.isArray(parsed.instruments)) {
      return seedState();
    }
    return parsed;
  } catch {
    return seedState();
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用时静默降级为内存态，页面功能不受影响
  }
}

export function resetState(): AppState {
  const fresh = seedState();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  } catch {
    // 同上
  }
  return fresh;
}
