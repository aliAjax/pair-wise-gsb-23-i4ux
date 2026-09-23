import { useMemo, useState } from "react";
import "./styles.css";
import { EntryForm } from "./components/EntryForm";
import { ReviewQueue } from "./components/ReviewQueue";
import { BoardTable } from "./components/BoardTable";
import { CorrectionModal } from "./components/CorrectionModal";
import {
  CorrectionPedigreePanel,
  DriftReviewPanel,
  InspectionChainPanel,
} from "./components/RelationPanels";
import { INSTRUMENTS, ROOMS } from "./domain/config";
import type { InspectionEntry } from "./domain/types";
import {
  selectCorrectionFamilies,
  selectDriftReviews,
  selectInspectionChains,
  selectStats,
} from "./state/selectors";
import { useBoard } from "./state/useBoard";

const METRIC_CARDS = [
  { key: "active", label: "生效巡检条目", tone: "ok" },
  { key: "pending", label: "待漂移复核", tone: "warn" },
  { key: "frozen", label: "复测通过已冻结", tone: "frozen" },
  { key: "escalated", label: "复测未过升级", tone: "danger" },
  { key: "correction", label: "更正版本数", tone: "muted" },
] as const;

function App() {
  const { state, registerEntry, submitRetest, createCorrection, resetDemo } = useBoard();
  const [correcting, setCorrecting] = useState<InspectionEntry | null>(null);

  const stats = useMemo(() => selectStats(state.entries), [state.entries]);
  const chains = useMemo(() => selectInspectionChains(state.entries), [state.entries]);
  const driftCases = useMemo(() => selectDriftReviews(state.entries), [state.entries]);
  const families = useMemo(() => selectCorrectionFamilies(state.entries), [state.entries]);

  const pending = useMemo(
    () =>
      state.entries
        .filter((e) => e.status === "pending")
        .sort((a, b) => a.ordinal - b.ordinal),
    [state.entries],
  );
  const escalated = useMemo(
    () =>
      state.entries
        .filter((e) => e.status === "escalated" && !e.supersededBy)
        .sort((a, b) => b.ordinal - a.ordinal),
    [state.entries],
  );

  const valueFor = (key: (typeof METRIC_CARDS)[number]["key"]) => {
    if (key === "active") return stats.activeCount;
    if (key === "pending") return stats.pendingCount;
    if (key === "frozen") return stats.frozenCount;
    if (key === "escalated") return stats.escalatedCount;
    return stats.correctionCount;
  };

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-09 · port 5109 · 数据保存在本机浏览器</p>
          <h1>半导体洁净室跨班互检与仪器漂移复核台</h1>
          <p className="subtitle">
            巡检员按房间与班次登记粒子计数、压差、温湿度及仪器编号，同房间同班只留一条；
            相邻两班读数越过漂移阈值时停在待复核并保留原值，由下一班更换另一台合格仪器复测，
            通过后冻结仪器与读数，任何更正另建带原因版本。
          </p>
        </div>
        <div className="stack-card">
          <span>分层结构</span>
          <strong>
            领域数据 · 判定逻辑 · 本地存储 · 页面视图
          </strong>
          <button className="reset-button" onClick={resetDemo}>
            重置为演示数据
          </button>
        </div>
      </section>

      <section className="metrics-grid metrics-grid-5">
        {METRIC_CARDS.map((card) => (
          <article key={card.key} className={`metric-card tone-${card.tone}`}>
            <span>{card.label}</span>
            <strong>{valueFor(card.key)}</strong>
            <i className={`bar bar-${card.tone}`} />
          </article>
        ))}
      </section>

      <div className="workspace workspace-col">
        <EntryForm onSubmit={registerEntry} />
        <ReviewQueue
          pending={pending}
          escalated={escalated}
          onRetest={submitRetest}
          onCorrect={setCorrecting}
        />
        <BoardTable entries={state.entries} onCorrect={setCorrecting} />
      </div>

      <div className="workspace workspace-col">
        <InspectionChainPanel chains={chains} />
        <DriftReviewPanel cases={driftCases} />
        <CorrectionPedigreePanel families={families} />
      </div>

      <section className="panel ledger-panel">
        <div className="section-heading">
          <div>
            <p>基础台账（领域数据）</p>
            <h2>房间等级与仪器合格状态</h2>
          </div>
        </div>
        <div className="ledger-grid">
          <div>
            <h3>房间与粒子限值（≥0.5µm）</h3>
            <ul className="plain-list">
              {ROOMS.map((r) => (
                <li key={r.id}>
                  <b>{r.id}</b> {r.name} · {r.grade} · 限值 {r.particleLimit.toLocaleString()} 粒/m³
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>仪器台账</h3>
            <ul className="plain-list">
              {INSTRUMENTS.map((i) => (
                <li key={i.id} className={i.qualified ? "" : "inst-disabled"}>
                  <b>{i.id}</b> {i.model}
                  {i.qualified ? " · 合格" : ` · ${i.note ?? "停用"}`}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {correcting && (
        <CorrectionModal
          source={correcting}
          onClose={() => setCorrecting(null)}
          onSubmit={createCorrection}
        />
      )}
    </main>
  );
}

export default App;
