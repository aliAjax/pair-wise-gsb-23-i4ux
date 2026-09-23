// 登记面板：巡检员按房间 + 班次登记四项读数与三类仪器编号。
// 提交后由状态层处理“同房间同班只留一条”与相邻班漂移判定。

import { useState } from "react";
import {
  GROUPS,
  INSTRUMENTS,
  METRICS,
  ROOMS,
  SHIFTS,
  instrumentsOfGroup,
} from "../domain/config";
import type {
  ActionResult,
  InstrumentSelection,
  MetricKey,
  Reading,
  ShiftCode,
} from "../domain/types";
import type { RegisterInput } from "../state/useBoard";

interface Props {
  onSubmit: (input: RegisterInput) => ActionResult;
}

const DEFAULT_DATE = "2026-09-23";

export function EntryForm({ onSubmit }: Props) {
  const [roomId, setRoomId] = useState(ROOMS[0].id);
  const [date, setDate] = useState(DEFAULT_DATE);
  const [shift, setShift] = useState<ShiftCode>("A");
  const [inspector, setInspector] = useState("");
  const [instruments, setInstruments] = useState<InstrumentSelection>({
    particle: "LPC-11",
    pressure: "DPM-01",
    thermo: "THM-21",
  });
  const [readings, setReadings] = useState<Reading>({
    particle: 0,
    pressure: 0,
    temperature: 22,
    humidity: 45,
  });
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const setNumber = (key: MetricKey, raw: string) => {
    const value = raw === "" || raw === "-" ? Number.NaN : Number(raw);
    setReadings((r) => ({ ...r, [key]: value }));
  };

  const submit = () => {
    const result = onSubmit({ roomId, date, shift, inspector, instruments, readings });
    setFeedback({ ok: result.ok, text: result.message });
    if (result.ok) setInspector("");
  };

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>巡检登记</p>
          <h2>按房间与班次登记读数</h2>
        </div>
        <span className="hint-pill">同房间同班只留一条</span>
      </div>

      <div className="form-grid">
        <label>
          <span>房间</span>
          <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            {ROOMS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id} {r.name}（{r.grade}）
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>日期</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          <span>班次</span>
          <select value={shift} onChange={(e) => setShift(e.target.value as ShiftCode)}>
            {SHIFTS.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label} {s.window}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>巡检员</span>
          <input
            value={inspector}
            placeholder="姓名 / 工号"
            onChange={(e) => setInspector(e.target.value)}
          />
        </label>
      </div>

      <div className="subhead">仪器编号（须为在册合格仪器）</div>
      <div className="form-grid form-grid-3">
        {GROUPS.map((g) => (
          <label key={g.key}>
            <span>{g.label}</span>
            <select
              value={instruments[g.key]}
              onChange={(e) => setInstruments((s) => ({ ...s, [g.key]: e.target.value }))}
            >
              <option value="">请选择</option>
              {instrumentsOfGroup(g.key).map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.id} · {inst.model}
                  {inst.qualified ? "" : `（${inst.note ?? "不合格"}）`}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <div className="subhead">
        巡检读数
        <span className="threshold-hint">
          漂移阈值：粒子 Δ≥500 且 ≥25%｜压差 ≥{METRICS[1].absThreshold}Pa｜温度 ≥
          {METRICS[2].absThreshold}℃｜湿度 ≥{METRICS[3].absThreshold}%RH
        </span>
      </div>
      <div className="form-grid form-grid-4">
        {METRICS.map((m) => (
          <label key={m.key}>
            <span>
              {m.label} <small>({m.unit})</small>
            </span>
            <input
              type="number"
              step={m.step}
              value={Number.isNaN(readings[m.key]) ? "" : readings[m.key]}
              onChange={(e) => setNumber(m.key, e.target.value)}
            />
          </label>
        ))}
      </div>

      <div className="form-footer">
        {feedback && (
          <span className={feedback.ok ? "feedback-ok" : "feedback-err"}>{feedback.text}</span>
        )}
        <button className="primary-action" onClick={submit}>
          提交登记
        </button>
      </div>

      <p className="form-note">
        提交时自动与同房间相邻上一班的生效读数比对：越过漂移阈值的条目停在
        <b> 待复核</b>，原值保留，由下一班更换另一台合格仪器复测。
      </p>
    </section>
  );
}
