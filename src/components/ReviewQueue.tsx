// 漂移复核队列：
// - 待复核：展开后由下一班换另一台合格仪器复测
// - 复测未过·升级：可另建带原因的更正版本
// 复测通过/未过的判定与仪器互换校验都在状态层/领域层完成。

import { useState } from "react";
import { GROUPS, METRICS, SHIFTS, instrumentsOfGroup } from "../domain/config";
import { formatDelta, shiftLabel } from "../domain/policy";
import type {
  ActionResult,
  InspectionEntry,
  InstrumentSelection,
  Reading,
  ShiftCode,
} from "../domain/types";
import type { RetestInput } from "../state/useBoard";
import { InstrumentList, StatusBadge } from "./ui";

function nextShift(date: string, shift: ShiftCode): { date: string; shift: ShiftCode } {
  const order: ShiftCode[] = ["A", "B", "C"];
  const idx = order.indexOf(shift);
  if (idx < 2) return { date, shift: order[idx + 1] };
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return {
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`,
    shift: "A",
  };
}

function RetestForm({
  entry,
  onSubmit,
}: {
  entry: InspectionEntry;
  onSubmit: (input: RetestInput) => ActionResult;
}) {
  const prefill = nextShift(entry.date, entry.shift);
  const [date, setDate] = useState(prefill.date);
  const [shift, setShift] = useState<ShiftCode>(prefill.shift);
  const [inspector, setInspector] = useState("");
  const [instruments, setInstruments] = useState<InstrumentSelection>({
    particle: "",
    pressure: "",
    thermo: "",
  });
  const [readings, setReadings] = useState<Reading>({ ...entry.initialReadings });
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = () => {
    const result = onSubmit({ date, shift, inspector, instruments, readings, note });
    setFeedback({ ok: result.ok, text: result.message });
    if (result.ok) setInspector("");
  };

  return (
    <div className="retest-form">
      <div className="retest-title">下一班换机复测</div>
      <div className="form-grid form-grid-3">
        <label>
          <span>复测日期</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          <span>复测班次</span>
          <select value={shift} onChange={(e) => setShift(e.target.value as ShiftCode)}>
            {SHIFTS.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>复测巡检员</span>
          <input
            value={inspector}
            placeholder="姓名 / 工号"
            onChange={(e) => setInspector(e.target.value)}
          />
        </label>
      </div>
      <div className="form-grid form-grid-3">
        {GROUPS.map((g) => (
          <label key={g.key}>
            <span>
              复测{g.label} <small>原 {entry.initialInstruments[g.key]}</small>
            </span>
            <select
              value={instruments[g.key]}
              onChange={(e) => setInstruments((s) => ({ ...s, [g.key]: e.target.value }))}
            >
              <option value="">必须换另一台合格仪器</option>
              {instrumentsOfGroup(g.key)
                .filter((i) => i.id !== entry.initialInstruments[g.key])
                .map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.id}
                    {inst.qualified ? "" : `（${inst.note ?? "不合格"}）`}
                  </option>
                ))}
            </select>
          </label>
        ))}
      </div>
      <div className="form-grid form-grid-4">
        {METRICS.map((m) => (
          <label key={m.key}>
            <span>
              {m.label} <small>原值 {entry.initialReadings[m.key]}</small>
            </span>
            <input
              type="number"
              step={m.step}
              value={readings[m.key]}
              onChange={(e) =>
                setReadings((r) => ({ ...r, [m.key]: Number(e.target.value) }))
              }
            />
          </label>
        ))}
      </div>
      <label className="note-label">
        <span>复测说明</span>
        <input
          value={note}
          placeholder="现场情况 / 初步判断（可选）"
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <div className="form-footer">
        {feedback && (
          <span className={feedback.ok ? "feedback-ok" : "feedback-err"}>{feedback.text}</span>
        )}
        <button className="primary-action" onClick={submit}>
          提交复测
        </button>
      </div>
      <p className="form-note">
        判定口径：复测值与原值在漂移阈值内 → <b>通过，冻结仪器与读数</b>；仍越限 →
        <b> 保留原值并升级厂务</b>。
      </p>
    </div>
  );
}

interface Props {
  pending: InspectionEntry[];
  escalated: InspectionEntry[];
  onRetest: (entryId: string, input: RetestInput) => ActionResult;
  onCorrect: (entry: InspectionEntry) => void;
}

function QueueCard({
  entry,
  children,
  onCorrect,
}: {
  entry: InspectionEntry;
  children?: React.ReactNode;
  onCorrect?: (entry: InspectionEntry) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <article className="queue-card">
      <header className="queue-head" onClick={() => setOpen((v) => !v)}>
        <div className="queue-id">
          <h3>
            {entry.roomId} · {shiftLabel(entry.date, entry.shift)}
            <small> v{entry.version}</small>
          </h3>
          <p>
            巡检员 {entry.inspector} · 登记 {entry.createdAt.replace("T", " ").slice(0, 16)}
          </p>
        </div>
        <div className="queue-meta">
          <StatusBadge status={entry.status} />
          <span className="drift-count">{entry.driftFlags.length} 项越漂移阈值</span>
          {onCorrect && (
            <button
              className="link-button"
              onClick={(e) => {
                e.stopPropagation();
                onCorrect(entry);
              }}
            >
              另建更正版本
            </button>
          )}
          <span className="chev">{open ? "收起 ▲" : "处理 ▼"}</span>
        </div>
      </header>
      <div className="queue-flags">
        {entry.driftFlags.map((f) => (
          <div key={f.metric} className="flag-line">
            <span className="flag-mark">漂移</span>
            {formatDelta(f)}
            <em>{f.trigger}</em>
          </div>
        ))}
      </div>
      <div className="queue-instruments">
        <span>原机：</span>
        <InstrumentList instruments={entry.initialInstruments} />
      </div>
      {open && children}
    </article>
  );
}

export function ReviewQueue({ pending, escalated, onRetest, onCorrect }: Props) {
  const empty = pending.length === 0 && escalated.length === 0;
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>漂移复核台</p>
          <h2>待复核与升级处理</h2>
        </div>
        <span className="hint-pill warn">
          {pending.length} 待复测 · {escalated.length} 已升级
        </span>
      </div>
      {empty ? (
        <p className="empty-line">当前没有待复核条目，跨班互检全部通过。</p>
      ) : (
        <div className="queue-list">
          {pending.map((entry) => (
            <QueueCard key={entry.id} entry={entry}>
              <RetestForm entry={entry} onSubmit={(input) => onRetest(entry.id, input)} />
            </QueueCard>
          ))}
          {escalated.map((entry) => (
            <QueueCard key={entry.id} entry={entry} onCorrect={onCorrect}>
              <div className="escalated-box">
                <strong>复测未通过 · 已升级厂务</strong>
                {entry.retest && (
                  <>
                    <p>
                      复测：{shiftLabel(entry.retest.date, entry.retest.shift)} 班 ·{" "}
                      {entry.retest.inspector} ·{" "}
                      {entry.retest.at.replace("T", " ").slice(11, 16)}
                    </p>
                    <InstrumentList instruments={entry.retest.instruments} />
                    <p className="retest-note">{entry.retest.note}</p>
                    {entry.retest.flags.map((f) => (
                      <div key={f.metric} className="flag-line">
                        <span className="flag-mark danger">仍越限</span>
                        {formatDelta(f)}
                      </div>
                    ))}
                  </>
                )}
                <p className="form-note">原值已保留；处理完成后须另建带原因的更正版本。</p>
                <button className="primary-action" onClick={() => onCorrect(entry)}>
                  另建更正版本
                </button>
              </div>
            </QueueCard>
          ))}
        </div>
      )}
    </section>
  );
}
