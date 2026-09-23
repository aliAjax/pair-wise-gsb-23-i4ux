// 巡检台账：全部生效条目（被替代版本不在此表），支持按房间、状态筛选与巡检员搜索。
// 展开行可看到互检上一条、漂移标记、复测结论、修订版本关系。

import { useMemo, useState } from "react";
import { METRICS, ROOMS } from "../domain/config";
import { formatDelta, shiftLabel } from "../domain/policy";
import type { EntryStatus, InspectionEntry } from "../domain/types";
import { ReadingCell, StatusBadge, formatClock, instrumentLabel } from "./ui";

const FILTER_STATUSES: { key: EntryStatus | "all"; label: string }[] = [
  { key: "all", label: "全部生效" },
  { key: "confirmed", label: "互检通过" },
  { key: "pending", label: "待复核" },
  { key: "frozen", label: "已冻结" },
  { key: "escalated", label: "升级" },
];

interface Props {
  entries: InspectionEntry[];
  onCorrect: (entry: InspectionEntry) => void;
}

export function BoardTable({ entries, onCorrect }: Props) {
  const [roomFilter, setRoomFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<EntryStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(() => {
    const idToEntry = new Map(entries.map((e) => [e.id, e]));
    return entries
      .filter((e) => e.status !== "superseded")
      .filter((e) => (roomFilter === "all" ? true : e.roomId === roomFilter))
      .filter((e) => (statusFilter === "all" ? true : e.status === statusFilter))
      .filter((e) =>
        query.trim()
          ? e.inspector.includes(query.trim()) ||
            Object.values(e.instruments).some((id) => id.includes(query.trim()))
          : true,
      )
      .sort((a, b) => b.ordinal - a.ordinal || b.createdAt.localeCompare(a.createdAt))
      .map((e) => ({ entry: e, prev: e.previousEntryId ? idToEntry.get(e.previousEntryId) : undefined }));
  }, [entries, roomFilter, statusFilter, query]);

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>巡检台账</p>
          <h2>生效记录</h2>
        </div>
        <input
          className="search-input"
          placeholder="搜索巡检员 / 仪器编号"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="filter-row">
        <div className="filter-group">
          <button
            className={roomFilter === "all" ? "chip active" : "chip"}
            onClick={() => setRoomFilter("all")}
          >
            全部房间
          </button>
          {ROOMS.map((r) => (
            <button
              key={r.id}
              className={roomFilter === r.id ? "chip active" : "chip"}
              onClick={() => setRoomFilter(r.id)}
            >
              {r.id}
            </button>
          ))}
        </div>
        <div className="filter-group">
          {FILTER_STATUSES.map((s) => (
            <button
              key={s.key}
              className={statusFilter === s.key ? "chip active" : "chip"}
              onClick={() => setStatusFilter(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="table-wrap">
        <table className="board-table">
          <thead>
            <tr>
              <th>房间 / 班次</th>
              {METRICS.map((m) => (
                <th key={m.key}>
                  {m.label}
                  <small>{m.unit}</small>
                </th>
              ))}
              <th>仪器</th>
              <th>巡检员</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.flatMap(({ entry, prev }) => {
              const mainRow = (
                <tr
                  key={entry.id}
                  className={`table-row ${expanded === entry.id ? "open" : ""}`}
                  onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                >
                  <td>
                    <strong>{entry.roomId}</strong>
                    <small>
                      {shiftLabel(entry.date, entry.shift)} · v{entry.version}
                    </small>
                  </td>
                  {METRICS.map((m) => (
                    <td key={m.key}>
                      <ReadingCell entry={entry} metric={m.key} />
                    </td>
                  ))}
                  <td className="inst-cell">
                    <span title="粒子">{instrumentLabel(entry.instruments.particle)}</span>
                    <span title="压差">{instrumentLabel(entry.instruments.pressure)}</span>
                    <span title="温湿度">{instrumentLabel(entry.instruments.thermo)}</span>
                  </td>
                  <td>{entry.inspector}</td>
                  <td>
                    <StatusBadge status={entry.status} />
                  </td>
                </tr>
              );
              const detailRow = expanded === entry.id ? (
                  <tr className="detail-row">
                    <td colSpan={7}>
                      <div className="detail-grid">
                        <div>
                          <h4>跨班互检</h4>
                          {prev ? (
                            <p>
                              相邻上一班：<b>{prev.roomId} {shiftLabel(prev.date, prev.shift)}</b>
                              （{prev.inspector}）
                              {entry.driftFlags.length === 0 && <span className="link-ok"> 互检通过</span>}
                            </p>
                          ) : (
                            <p>本房间首班登记，无上一班可比。</p>
                          )}
                          {entry.driftFlags.map((f) => (
                            <p key={f.metric} className="flag-line">
                              <span className="flag-mark">漂移</span>
                              {formatDelta(f)} <em>{f.trigger}</em>
                            </p>
                          ))}
                        </div>
                        <div>
                          <h4>漂移复核</h4>
                          {entry.retest ? (
                            <>
                              <p>
                                复测班次 {shiftLabel(entry.retest.date, entry.retest.shift)} ·{" "}
                                {entry.retest.inspector} ·{" "}
                                <b className={entry.retest.passed ? "link-ok" : "link-err"}>
                                  {entry.retest.passed ? "复测通过·已冻结" : "复测未过·已升级"}
                                </b>
                              </p>
                              <p>
                                复测仪器：粒子 {instrumentLabel(entry.retest.instruments.particle)} /
                                压差 {instrumentLabel(entry.retest.instruments.pressure)} / 温湿度{" "}
                                {instrumentLabel(entry.retest.instruments.thermo)}
                              </p>
                              {entry.retest.note && <p className="retest-note">{entry.retest.note}</p>}
                            </>
                          ) : entry.status === "pending" ? (
                            <p className="link-err">等待下一班更换另一台合格仪器复测（原值保留中）。</p>
                          ) : (
                            <p>未发生漂移，无需复核。</p>
                          )}
                        </div>
                        <div>
                          <h4>修订关系</h4>
                          {entry.correctsEntryId ? (
                            <p>
                              本版本更正自 <b>{entry.correctsEntryId.slice(0, 12)}…</b>
                              <br />
                              原因：{entry.correctionReason}
                            </p>
                          ) : entry.version > 1 ? (
                            <p>第 {entry.version} 版</p>
                          ) : (
                            <p>原始登记版本。</p>
                          )}
                          {(entry.status === "frozen" ||
                            (entry.status === "escalated" && !entry.supersededBy)) && (
                            <button className="link-button" onClick={() => onCorrect(entry)}>
                              另建带原因更正版本
                            </button>
                          )}
                          {entry.status === "escalated" && entry.supersededBy && (
                            <p className="link-ok">
                              已另建更正版本（{entry.supersededBy.slice(0, 8)}…），升级单留档
                            </p>
                          )}
                        </div>
                        <div>
                          <h4>时间戳</h4>
                          <p>登记：{formatClock(entry.createdAt)}</p>
                          <p>最近更新：{formatClock(entry.updatedAt)}</p>
                          {JSON.stringify(entry.initialReadings) !== JSON.stringify(entry.readings) && (
                            <p className="retest-note">
                              冻结值采用复测值；首次原值为 粒子
                              {entry.initialReadings.particle}/压差{entry.initialReadings.pressure}/
                              {entry.initialReadings.temperature}℃/{entry.initialReadings.humidity}%RH
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )
                : null;
              return detailRow ? [mainRow, detailRow] : [mainRow];
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="empty-line">没有符合筛选条件的记录。</p>}
      </div>
    </section>
  );
}
