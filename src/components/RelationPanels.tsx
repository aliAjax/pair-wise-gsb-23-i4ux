// 关系视图：重开页面也能一眼分清三类关系。
// 1) 跨班互检链（按房间的时间序列，漂移点高亮）
// 2) 漂移复核闭环（漂移 → 换机复测 → 冻结/升级）
// 3) 修订谱系（v1 → v2…，附更正原因）

import { GROUPS, METRICS, ROOM_MAP } from "../domain/config";
import { STATUS_META, formatDelta, shiftLabel } from "../domain/policy";
import type { InspectionEntry } from "../domain/types";
import type {
  CorrectionFamily,
  DriftReviewCase,
  InspectionChain,
} from "../state/selectors";
import { StatusBadge, formatClock } from "./ui";

function ChainNode({ entry }: { entry: InspectionEntry }) {
  const drifted = entry.driftFlags.length > 0;
  const nodeClass = [
    "chain-node",
    drifted ? "is-drift" : "",
    entry.status === "frozen" ? "is-frozen" : "",
    entry.status === "escalated" ? "is-escalated" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <li className={nodeClass}>
      <div className="node-dot" title={STATUS_META[entry.status].label} />
      <div className="node-body">
        <div className="node-head">
          <b>{shiftLabel(entry.date, entry.shift)}</b>
          <StatusBadge status={entry.status} />
          <small>v{entry.version}</small>
        </div>
        <p className="node-readings">
          {METRICS.map((m) => (
            <span key={m.key} className={drifted && entry.driftFlags.some((f) => f.metric === m.key) ? "num drift-num" : "num"}>
              {m.key === "particle" ? "粒" : m.key === "pressure" ? "ΔP" : m.key === "temperature" ? "T" : "RH"}
              {entry.readings[m.key]}
            </span>
          ))}
        </p>
        <p className="node-meta">
          {entry.inspector} ·{" "}
          {GROUPS.map((g) => entry.instruments[g.key]).join("/")}
        </p>
        {entry.retest && (
          <p className={`node-retest ${entry.retest.passed ? "ok" : "err"}`}>
            {entry.retest.passed ? "↻ 换机复测通过 → 冻结" : "↻ 换机复测未过 → 升级"}
            <small>
              （{shiftLabel(entry.retest.date, entry.retest.shift)} ·{" "}
              {entry.retest.inspector}）
            </small>
          </p>
        )}
      </div>
    </li>
  );
}

export function InspectionChainPanel({ chains }: { chains: InspectionChain[] }) {
  return (
    <section className="panel relation-panel">
      <div className="section-heading">
        <div>
          <p>关系一 · 跨班互检</p>
          <h2>按房间串联的相邻班次链</h2>
        </div>
      </div>
      <div className="chains-grid">
        {chains.map((chain) => {
          const room = ROOM_MAP[chain.roomId];
          return (
            <div key={chain.roomId} className="chain-card">
              <h3>
                {room?.id} <small>{room?.name} · {room?.grade}</small>
              </h3>
              <ul className="chain-list">
                {chain.entries.map((e) => (
                  <ChainNode key={e.id} entry={e} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ReviewFlow({ trigger }: { trigger: InspectionEntry }) {
  const retest = trigger.retest;
  return (
    <article className={`flow-card flow-${trigger.status}`}>
      <div className="flow-step">
        <span className="step-index">1</span>
        <div>
          <b>相邻班漂移</b>
          <p>
            {trigger.roomId} · {shiftLabel(trigger.date, trigger.shift)} ·{" "}
            {trigger.inspector}
          </p>
          {trigger.driftFlags.map((f) => (
            <p key={f.metric} className="flag-line">
              <span className="flag-mark">漂移</span>
              {formatDelta(f)}
            </p>
          ))}
        </div>
      </div>
      <div className="flow-arrow" />
      <div className="flow-step">
        <span className={`step-index ${retest ? "" : "pending-step"}`}>2</span>
        <div>
          <b>下一班换另一台合格仪器复测</b>
          {retest ? (
            <>
              <p>
                {shiftLabel(retest.date, retest.shift)} · {retest.inspector} ·{" "}
                {formatClock(retest.at)}
              </p>
              <p className="node-meta">
                {GROUPS.map((g) => (
                  <span key={g.key}>
                    {g.label} {trigger.initialInstruments[g.key]}→
                    <b>{retest.instruments[g.key]}</b>
                  </span>
                ))}
              </p>
              {retest.note && <p className="retest-note">{retest.note}</p>}
            </>
          ) : (
            <p className="link-err">待执行：复测仪器必须与原机不同且合格，原值保留中。</p>
          )}
        </div>
      </div>
      <div className="flow-arrow" />
      <div className="flow-step">
        <span
          className={`step-index ${
            trigger.status === "frozen" ? "done" : trigger.status === "escalated" ? "fail" : "pending-step"
          }`}
        >
          3
        </span>
        <div>
          <b>结论</b>
          <p>
            <StatusBadge status={trigger.status} />
          </p>
          {trigger.status === "frozen" && (
            <p className="link-ok">复测仪器与读数已冻结，更正须另建带原因版本。</p>
          )}
          {trigger.status === "escalated" && (
            <>
              <p className="link-err">复测值与原值仍越漂移阈值，保留原值并升级厂务。</p>
              {trigger.supersededBy ? (
                <p className="link-ok">
                  ✓ 已另建带原因更正版本（{trigger.supersededBy.slice(0, 8)}…），本单留档
                </p>
              ) : (
                <p className="link-err">待厂务处置后另建带原因的更正版本。</p>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  );
}

export function DriftReviewPanel({ cases }: { cases: DriftReviewCase[] }) {
  return (
    <section className="panel relation-panel">
      <div className="section-heading">
        <div>
          <p>关系二 · 漂移复核</p>
          <h2>漂移 → 换机复测 → 冻结 / 升级</h2>
        </div>
        <span className="hint-pill warn">{cases.length} 份复核单</span>
      </div>
      {cases.length === 0 ? (
        <p className="empty-line">暂无漂移复核单。</p>
      ) : (
        <div className="flow-grid">
          {cases.map((c) => (
            <ReviewFlow key={c.trigger.id} trigger={c.trigger} />
          ))}
        </div>
      )}
    </section>
  );
}

export function CorrectionPedigreePanel({ families }: { families: CorrectionFamily[] }) {
  return (
    <section className="panel relation-panel">
      <div className="section-heading">
        <div>
          <p>关系三 · 修订谱系</p>
          <h2>原版本 → 带原因更正版本</h2>
        </div>
        <span className="hint-pill">{families.length} 组修订</span>
      </div>
      {families.length === 0 ? (
        <p className="empty-line">暂无更正版本。</p>
      ) : (
        <div className="pedigree-grid">
          {families.map((family, i) => (
            <article key={i} className="pedigree-card">
              <h3>
                {family.versions[0].roomId}
                <small>{shiftLabel(family.versions[0].date, family.versions[0].shift)}</small>
              </h3>
              <ol className="version-list">
                {family.versions.map((v, idx) => (
                  <li key={v.id} className="version-node">
                    <div className="version-tag">v{v.version}</div>
                    <div>
                      <div className="node-head">
                        <StatusBadge status={v.status} />
                        <small>
                          {v.inspector} · {formatClock(v.updatedAt)}
                        </small>
                      </div>
                      <p className="node-readings">
                        {METRICS.map((m) => (
                          <span key={m.key} className="num">
                            {m.key === "particle" ? "粒" : m.key === "pressure" ? "ΔP" : m.key === "temperature" ? "T" : "RH"}
                            {v.readings[m.key]}
                          </span>
                        ))}
                      </p>
                      {idx > 0 && (
                        <p className="correction-reason">
                          <span className="flag-mark">更正原因</span>
                          {v.correctionReason}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
