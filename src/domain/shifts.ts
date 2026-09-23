// 班次工具：班次 = 日期 + 班别（D 白班 / N 夜班），相邻班次可前后推算

export type ShiftSlot = "D" | "N";

export const SLOT_LABELS: Record<ShiftSlot, string> = { D: "白班", N: "夜班" };

export function shiftId(date: string, slot: ShiftSlot): string {
  return `${date}-${slot}`;
}

export function parseShift(id: string): { date: string; slot: ShiftSlot } {
  // 格式：YYYY-MM-DD-D|N
  return { date: id.slice(0, 10), slot: id.slice(11) as ShiftSlot };
}

function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 下一班：白班→当晚夜班，夜班→次日白班 */
export function nextShift(id: string): string {
  const { date, slot } = parseShift(id);
  return slot === "D" ? shiftId(date, "N") : shiftId(addDays(date, 1), "D");
}

/** 上一班 */
export function prevShift(id: string): string {
  const { date, slot } = parseShift(id);
  return slot === "N" ? shiftId(date, "D") : shiftId(addDays(date, -1), "N");
}

export function shiftLabel(id: string): string {
  const { date, slot } = parseShift(id);
  return `${date} ${SLOT_LABELS[slot] ?? slot}`;
}

/** 供表单选择的近期班次（以今天为锚，向前推 6 个班） */
export function recentShifts(today: string, count = 6): string[] {
  const out: string[] = [];
  let cur = shiftId(today, "N");
  for (let i = 0; i < count; i++) {
    out.unshift(cur);
    cur = prevShift(cur);
  }
  return out;
}
