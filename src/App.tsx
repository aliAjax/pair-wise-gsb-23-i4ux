import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import { AppState } from "./domain/types";
import {
  DRIFT_LIMITS,
  OpResult,
  registerRecord,
  RegisterInput,
  reviseRecord,
  ReviseInput,
  ReviewInput,
  submitReview,
} from "./domain/judgment";
import { loadState, resetState, saveState } from "./storage/store";
import { RegisterPanel } from "./ui/RegisterPanel";
import { RecordBoard } from "./ui/RecordBoard";

function App() {
  const [state, setState] = useState<AppState>(loadState);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const apply = (r: OpResult) => {
    if (r.ok) {
      setState(r.state);
      setToast({ kind: "ok", text: r.message });
    } else {
      setToast({ kind: "err", text: r.error });
    }
  };

  const onRegister = (input: RegisterInput) => apply(registerRecord(state, input));
  const onReview = (id: string, input: ReviewInput) => apply(submitReview(state, id, input));
  const onRevise = (id: string, input: ReviseInput) => apply(reviseRecord(state, id, input));

  const current = state.records.filter((r) => r.status !== "superseded");
  const metrics = [
    { label: "互检通过", value: current.filter((r) => r.status === "confirmed").length, cls: "status-ok" },
    { label: "待复核", value: current.filter((r) => r.status === "pending-review").length, cls: "status-watch" },
    { label: "已冻结", value: current.filter((r) => r.status === "frozen").length, cls: "status-frozen" },
    { label: "修订版本", value: state.records.filter((r) => r.status === "superseded").length, cls: "status-revised" },
  ];

  const existingKeys = useMemo(
    () => new Set(current.map((r) => `${r.roomId}|${r.shiftId}`)),
    [state.records],
  );

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-09 · port 5109</p>
          <h1>洁净室跨班互检与仪器漂移复核台</h1>
          <p className="subtitle">
            巡检员按房间和班次登记粒子计数、压差、温湿度与仪器编号；相邻两班读数越过漂移阈值即停在待复核并保留原值，
            由下一班换另一台合格仪器复测，通过后冻结仪器与读数，更正另建带原因的修订版本。
          </p>
        </div>
        <div className="stack-card">
          <span>漂移阈值</span>
          <strong>
            粒子 ±{DRIFT_LIMITS.particlesRatio * 100}% · 压差 ±{DRIFT_LIMITS.pressure} Pa · 温度 ±
            {DRIFT_LIMITS.temperature} ℃ · 湿度 ±{DRIFT_LIMITS.humidity} %RH
          </strong>
          <span>数据存于浏览器 localStorage，重开页面互检 / 复核 / 修订关系不丢失</span>
        </div>
      </section>

      <section className="metrics-grid">
        {metrics.map((m) => (
          <article key={m.label} className="metric-card">
            <span>{m.label}</span>
            <strong>{m.value}</strong>
            <i className={m.cls} />
          </article>
        ))}
      </section>

      {toast && (
        <p className={toast.kind === "ok" ? "toast toast-ok" : "toast toast-err"}>{toast.text}</p>
      )}

      <section className="workspace">
        <RegisterPanel instruments={state.instruments} existingKeys={existingKeys} onSubmit={onRegister} />
        <aside className="panel narrow">
          <h2>关系图例</h2>
          <ul className="legend">
            <li>
              <span className="badge badge-confirmed">互检通过</span>
              与上一班读数在阈值内
            </li>
            <li>
              <span className="badge badge-pending-review">待复核</span>
              相邻班越阈，原值保留，等下一班复测
            </li>
            <li>
              <span className="badge badge-frozen">已冻结</span>
              复测通过，仪器与读数锁定
            </li>
            <li>
              <span className="badge badge-version">v2+</span>
              修订链：更正另建版本并记录原因，原版本可溯
            </li>
          </ul>
          <h2>仪器台账</h2>
          <ul className="instrument-list">
            {state.instruments.map((i) => (
              <li key={i.id} className={i.qualified ? "" : "instrument-bad"}>
                {i.name}
                <span>{i.qualified ? `校准至 ${i.calibrationDue}` : `超期 ${i.calibrationDue}，禁用`}</span>
              </li>
            ))}
          </ul>
          <button onClick={() => { setState(resetState()); setToast({ kind: "ok", text: "已恢复示例数据" }); }}>
            恢复示例数据
          </button>
        </aside>
      </section>

      <RecordBoard state={state} onReview={onReview} onRevise={onRevise} />
    </main>
  );
}

export default App;
