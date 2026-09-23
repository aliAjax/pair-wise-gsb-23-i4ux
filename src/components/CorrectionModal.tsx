// 更正版本弹窗：更正不覆盖冻结/升级值，而是另建一条带原因的新版本。

import { useState } from "react";
import { GROUPS, METRICS, SHIFTS, instrumentsOfGroup } from "../domain/config";
import { shiftLabel } from "../domain/policy";
import type {
  ActionResult,
  InspectionEntry,
  InstrumentSelection,
  Reading,
  ShiftCode,
} from "../domain/types";
import type { CorrectionInput } from "../state/useBoard";

interface Props {
  source: InspectionEntry;
  onClose: () => void;
  onSubmit: (sourceId: string, input: CorrectionInput) => ActionResult;
}

export function CorrectionModal({ source, onClose, onSubmit }: Props) {
  const [date, setDate] = useState(source.date);
  const [shift, setShift] = useState<ShiftCode>(source.shift);
  const [inspector, setInspector] = useState("");
  const [instruments, setInstruments] = useState<InstrumentSelection>({
    ...source.instruments,
  });
  const [readings, setReadings] = useState<Reading>({ ...source.readings });
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const result = onSubmit(source.id, {
      date,
      shift,
      inspector,
      instruments,
      readings,
      reason,
    });
    if (result.ok) {
      onClose();
    } else {
      setError(result.message);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="section-heading">
          <div>
            <p>更正版本 · 原记录 v{source.version}</p>
            <h2>
              {source.roomId} {shiftLabel(source.date, source.shift)}
            </h2>
          </div>
          <button onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        <p className="modal-note">
          原读数与仪器将完整保留并标记为“已被更正替代”；新版本号 v{source.version + 1}
          ，与原记录建立修订关系。
        </p>

        <div className="form-grid form-grid-3">
          <label>
            <span>更正日期</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            <span>归属班次</span>
            <select value={shift} onChange={(e) => setShift(e.target.value as ShiftCode)}>
              {SHIFTS.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>更正人</span>
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
              <span>{g.label}</span>
              <select
                value={instruments[g.key]}
                onChange={(e) => setInstruments((s) => ({ ...s, [g.key]: e.target.value }))}
              >
                {instrumentsOfGroup(g.key).map((inst) => (
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
                {m.label} <small>原值 {source.readings[m.key]}</small>
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
          <span>更正原因（必填，随版本永久保留）</span>
          <textarea
            rows={3}
            value={reason}
            placeholder="例如：原仪器经计量确认零点漂移并停用 / 采样位置不符合 SOP……"
            onChange={(e) => setReason(e.target.value)}
          />
        </label>

        <div className="form-footer">
          {error && <span className="feedback-err">{error}</span>}
          <button onClick={onClose}>取消</button>
          <button className="primary-action" onClick={submit}>
            建立更正版本
          </button>
        </div>
      </div>
    </div>
  );
}
