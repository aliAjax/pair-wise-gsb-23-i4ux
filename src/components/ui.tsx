// 页面共享的小组件：状态徽标、仪器标签、读数单元格。

import { GROUPS, INSTRUMENT_MAP, METRICS, ROOM_MAP } from "../domain/config";
import { STATUS_META } from "../domain/policy";
import type {
  InspectionEntry,
  InstrumentSelection,
  MetricKey,
  Reading,
} from "../domain/types";

const TONE_CLASS: Record<string, string> = {
  ok: "badge-ok",
  warn: "badge-warn",
  frozen: "badge-frozen",
  danger: "badge-danger",
  muted: "badge-muted",
};

export function StatusBadge({ status }: { status: InspectionEntry["status"] }) {
  const meta = STATUS_META[status];
  return <span className={`badge ${TONE_CLASS[meta.tone]}`}>{meta.label}</span>;
}

export function instrumentLabel(id: string): string {
  const inst = INSTRUMENT_MAP[id];
  if (!inst) return id || "—";
  return inst.qualified ? inst.id : `${inst.id}（停用）`;
}

export function InstrumentList({ instruments }: { instruments: InstrumentSelection }) {
  return (
    <div className="inst-list">
      {GROUPS.map((g) => (
        <span key={g.key} className="inst-chip" title={INSTRUMENT_MAP[instruments[g.key]]?.model}>
          {g.label.replace("计数器", "").replace("记录仪", "")}
          <b>{instrumentLabel(instruments[g.key])}</b>
        </span>
      ))}
    </div>
  );
}

export function readingValue(entry: InspectionEntry, metric: MetricKey): number {
  return entry.readings[metric];
}

export function ReadingCell({ entry, metric }: { entry: InspectionEntry; metric: MetricKey }) {
  const def = METRICS.find((m) => m.key === metric)!;
  const value = entry.readings[metric];
  let overLimit = false;
  if (metric === "particle") {
    const limit = ROOM_MAP[entry.roomId]?.particleLimit;
    overLimit = !!limit && value > limit;
  }
  const drifted = entry.driftFlags.some((f) => f.metric === metric);
  return (
    <span
      className={[
        "reading",
        overLimit ? "reading-over" : "",
        drifted ? "reading-drift" : "",
      ].join(" ")}
      title={overLimit ? `超出本房间限值 ${ROOM_MAP[entry.roomId]?.particleLimit}` : undefined}
    >
      {value}
      <small>{def.unit}</small>
      {overLimit && <em className="limit-tag">超限</em>}
    </span>
  );
}

export function readingDiffers(a: Reading, b: Reading): MetricKey[] {
  return METRICS.map((m) => m.key).filter((k) => a[k] !== b[k]);
}

export function formatClock(iso: string): string {
  return iso.replace("T", " ").slice(0, 16);
}
