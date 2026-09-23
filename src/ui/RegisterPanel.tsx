import { useMemo, useState } from "react";
import { INSPECTORS, Instrument, ROOMS } from "../domain/types";
import { RegisterInput } from "../domain/judgment";
import { recentShifts, shiftLabel } from "../domain/shifts";
import { emptyStrings, parseReadings, ReadingInputs, ReadingStrings } from "./ReadingInputs";
import { MetricKey } from "../domain/types";

interface Props {
  instruments: Instrument[];
  /** 已存在的 房间|班次 键，用于提示“将替换原记录” */
  existingKeys: Set<string>;
  onSubmit: (input: RegisterInput) => void;
}

export function RegisterPanel({ instruments, existingKeys, onSubmit }: Props) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const shifts = useMemo(() => recentShifts(today), [today]);

  const [roomId, setRoomId] = useState(ROOMS[0].id);
  const [shift, setShift] = useState(shifts[shifts.length - 1]);
  const [inspector, setInspector] = useState(INSPECTORS[0]);
  const [instrumentId, setInstrumentId] = useState(
    instruments.find((i) => i.qualified)?.id ?? instruments[0]?.id ?? "",
  );
  const [readings, setReadings] = useState<ReadingStrings>(emptyStrings());
  const [formError, setFormError] = useState<string | null>(null);

  const willReplace = existingKeys.has(`${roomId}|${shift}`);

  const setReading = (k: MetricKey, v: string) =>
    setReadings((prev) => ({ ...prev, [k]: v }));

  const submit = () => {
    const parsed = parseReadings(readings);
    if (!parsed) {
      setFormError("四项读数都必须是有效数字");
      return;
    }
    setFormError(null);
    onSubmit({ roomId, shiftId: shift, inspector, instrumentId, readings: parsed });
    setReadings(emptyStrings());
  };

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>巡检登记</p>
          <h2>按房间 + 班次登记</h2>
        </div>
      </div>
      <div className="form-grid">
        <label>
          <span>房间</span>
          <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            {ROOMS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id}（{r.grade}）
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>班次</span>
          <select value={shift} onChange={(e) => setShift(e.target.value)}>
            {shifts.map((s) => (
              <option key={s} value={s}>
                {shiftLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>巡检员</span>
          <select value={inspector} onChange={(e) => setInspector(e.target.value)}>
            {INSPECTORS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          <span>仪器编号</span>
          <select value={instrumentId} onChange={(e) => setInstrumentId(e.target.value)}>
            {instruments.map((i) => (
              <option key={i.id} value={i.id} disabled={!i.qualified}>
                {i.name}
                {i.qualified ? `（校准至 ${i.calibrationDue}）` : "（校准超期，禁用）"}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ReadingInputs values={readings} onChange={setReading} />
      {willReplace && (
        <p className="hint warn">该房间此班次已有记录，提交后将替换原记录（已冻结/已进入流程的记录会被拒绝）。</p>
      )}
      {formError && <p className="hint error">{formError}</p>}
      <button className="primary-action" onClick={submit}>
        登记并互检
      </button>
    </section>
  );
}
