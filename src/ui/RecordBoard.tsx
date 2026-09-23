import { useState } from "react";
import {
  AppState,
  InspectionRecord,
  METRIC_LABELS,
  METRIC_UNITS,
  ROOMS,
  STATUS_LABELS,
  INSPECTORS,
} from "../domain/types";
import { ReviewInput, ReviseInput, versionChain } from "../domain/judgment";
import { nextShift, shiftLabel } from "../domain/shifts";
import { METRIC_KEYS, parseReadings, ReadingInputs, ReadingStrings, toStrings } from "./ReadingInputs";
import { MetricKey } from "../domain/types";

interface BoardProps {
  state: AppState;
  onReview: (recordId: string, input: ReviewInput) => void;
  onRevise: (recordId: string, input: ReviseInput) => void;
}

function StatusBadge({ status }: { status: InspectionRecord["status"] }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABELS[status]}</span>;
}

function ReadingTable({ record }: { record: InspectionRecord }) {
  const drifted = new Set(record.driftMetrics.map((d) => d.metric));
  return (
    <div className="reading-table">
      {METRIC_KEYS.map((k: MetricKey) => (
        <div key={k} className={drifted.has(k) ? "reading-cell drifted" : "reading-cell"}>
          <span>
            {METRIC_LABELS[k]}
            {drifted.has(k) && <em>越阈</em>}
          </span>
          <strong>
            {record.readings[k]}
            <small>{METRIC_UNITS[k]}</small>
          </strong>
        </div>
      ))}
    </div>
  );
}

function ReviewForm({
  record,
  instruments,
  onSubmit,
  onClose,
}: {
  record: InspectionRecord;
  instruments: AppState["instruments"];
  onSubmit: (input: ReviewInput) => void;
  onClose: () => void;
}) {
  const reviewShift = nextShift(record.shiftId);
  const [inspector, setInspector] = useState(INSPECTORS.find((p) => p !== record.inspector) ?? INSPECTORS[0]);
  const candidates = instruments.filter((i) => i.qualified && i.id !== record.instrumentId);
  const [instrumentId, setInstrumentId] = useState(candidates[0]?.id ?? "");
  const [readings, setReadings] = useState<ReadingStrings>(toStrings(record.readings));
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const parsed = parseReadings(readings);
    if (!parsed) {
      setError("四项复测读数都必须是有效数字");
      return;
    }
    if (!instrumentId) {
      setError("没有可用的其他合格仪器");
      return;
    }
    onSubmit({ shiftId: reviewShift, inspector, instrumentId, readings: parsed });
    onClose();
  };

  return (
    <div className="sub-form">
      <h4>漂移复测（须为下一班 · 另一台合格仪器）</h4>
      <div className="form-grid">
        <label>
          <span>复测班次</span>
          <input value={shiftLabel(reviewShift)} disabled />
        </label>
        <label>
          <span>复测人</span>
          <select value={inspector} onChange={(e) => setInspector(e.target.value)}>
            {INSPECTORS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          <span>复测仪器（已排除原仪器 {record.instrumentId}）</span>
          <select value={instrumentId} onChange={(e) => setInstrumentId(e.target.value)}>
            {candidates.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}（校准至 {i.calibrationDue}）
              </option>
            ))}
          </select>
        </label>
      </div>
      <ReadingInputs values={readings} onChange={(k, v) => setReadings((p) => ({ ...p, [k]: v }))} />
      {error && <p className="hint error">{error}</p>}
      <div className="row-actions">
        <button className="primary-action" onClick={submit}>
          提交复测
        </button>
        <button onClick={onClose}>取消</button>
      </div>
    </div>
  );
}

function ReviseForm({
  record,
  instruments,
  onSubmit,
  onClose,
}: {
  record: InspectionRecord;
  instruments: AppState["instruments"];
  onSubmit: (input: ReviseInput) => void;
  onClose: () => void;
}) {
  const [inspector, setInspector] = useState(INSPECTORS[0]);
  const qualified = instruments.filter((i) => i.qualified);
  const [instrumentId, setInstrumentId] = useState(
    qualified.find((i) => i.id === record.instrumentId)?.id ?? qualified[0]?.id ?? "",
  );
  const [readings, setReadings] = useState<ReadingStrings>(toStrings(record.readings));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const parsed = parseReadings(readings);
    if (!parsed) {
      setError("四项读数都必须是有效数字");
      return;
    }
    if (!reason.trim()) {
      setError("修订必须填写更正原因");
      return;
    }
    onSubmit({ inspector, instrumentId, readings: parsed, reason });
    onClose();
  };

  return (
    <div className="sub-form">
      <h4>修订更正（另建 v{record.version + 1}，原版本保留）</h4>
      <div className="form-grid">
        <label>
          <span>更正人</span>
          <select value={inspector} onChange={(e) => setInspector(e.target.value)}>
            {INSPECTORS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          <span>仪器编号</span>
          <select value={instrumentId} onChange={(e) => setInstrumentId(e.target.value)}>
            {qualified.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ReadingInputs values={readings} onChange={(k, v) => setReadings((p) => ({ ...p, [k]: v }))} />
      <label className="reason-field">
        <span>更正原因（必填，随版本保存）</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例如：压差计零点偏移，按复测值更正" />
      </label>
      {error && <p className="hint error">{error}</p>}
      <div className="row-actions">
        <button className="primary-action" onClick={submit}>
          建立修订版本
        </button>
        <button onClick={onClose}>取消</button>
      </div>
    </div>
  );
}

function RecordCard({ record, state, onReview, onRevise }: BoardProps & { record: InspectionRecord }) {
  const [mode, setMode] = useState<"none" | "review" | "revise" | "history">("none");
  const driftFrom = record.driftFromId ? state.records.find((r) => r.id === record.driftFromId) : null;
  const chain = versionChain(state.records, record);
  const toggle = (m: typeof mode) => setMode((cur) => (cur === m ? "none" : m));

  return (
    <article className={`record-card status-border-${record.status}`}>
      <header className="record-head">
        <div>
          <strong>{record.roomId}</strong>
          <span className="shift-text">{shiftLabel(record.shiftId)}</span>
        </div>
        <div className="record-tags">
          {record.version > 1 && <span className="badge badge-version">v{record.version} 修订版</span>}
          <StatusBadge status={record.status} />
        </div>
      </header>

      <ReadingTable record={record} />

      <p className="meta">
        巡检员 {record.inspector} · 仪器 {record.instrumentId}
        {record.status === "frozen" && "（已锁定）"}
      </p>

      {record.driftMetrics.length > 0 && (
        <div className="drift-box">
          <p>
            漂移复核：与上一班{driftFrom ? `（${shiftLabel(driftFrom.shiftId)}）` : ""}互检越阈，原值保留待复测
          </p>
          <ul>
            {record.driftMetrics.map((d) => (
              <li key={d.metric}>
                {METRIC_LABELS[d.metric]}：{d.from} → {d.to}（{d.deltaText}，阈值 {d.limitText}）
              </li>
            ))}
          </ul>
        </div>
      )}

      {record.reviews.length > 0 && (
        <ul className="review-list">
          {record.reviews.map((rv, i) => (
            <li key={i} className={rv.result === "passed" ? "review-passed" : "review-rejected"}>
              复测 {shiftLabel(rv.shiftId)} · {rv.inspector} · {rv.instrumentId} ·{" "}
              {rv.result === "passed" ? "通过，已冻结" : "未通过，保持待复核"}
            </li>
          ))}
        </ul>
      )}

      {record.revisionReason && <p className="revision-reason">修订原因：{record.revisionReason}</p>}

      <div className="row-actions">
        {record.status === "pending-review" && (
          <button className="primary-action" onClick={() => toggle("review")}>
            下一班复测
          </button>
        )}
        <button onClick={() => toggle("revise")}>修订更正</button>
        {chain.length > 1 && <button onClick={() => toggle("history")}>版本链（{chain.length}）</button>}
      </div>

      {mode === "review" && (
        <ReviewForm
          record={record}
          instruments={state.instruments}
          onSubmit={(input) => onReview(record.id, input)}
          onClose={() => setMode("none")}
        />
      )}
      {mode === "revise" && (
        <ReviseForm
          record={record}
          instruments={state.instruments}
          onSubmit={(input) => onRevise(record.id, input)}
          onClose={() => setMode("none")}
        />
      )}
      {mode === "history" && (
        <ol className="chain-list">
          {chain.map((v) => (
            <li key={v.id}>
              <StatusBadge status={v.status} /> v{v.version} · {v.inspector} · {v.instrumentId} · 粒子{" "}
              {v.readings.particles} / 压差 {v.readings.pressure}Pa
              {v.revisionReason && <span className="revision-reason">　更正原因：{v.revisionReason}</span>}
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

export function RecordBoard({ state, onReview, onRevise }: BoardProps) {
  const current = state.records.filter((r) => r.status !== "superseded");
  return (
    <section className="panel records">
      <div className="section-heading">
        <div>
          <p>互检看板</p>
          <h2>按房间展开的班次链</h2>
        </div>
      </div>
      {ROOMS.map((room) => {
        const roomRecords = current
          .filter((r) => r.roomId === room.id)
          .sort((a, b) => a.shiftId.localeCompare(b.shiftId));
        if (roomRecords.length === 0) return null;
        return (
          <div key={room.id} className="room-group">
            <h3>
              {room.id} <span>{room.grade}</span>
            </h3>
            <div className="record-list">
              {roomRecords.map((r) => (
                <RecordCard key={r.id} record={r} state={state} onReview={onReview} onRevise={onRevise} />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
