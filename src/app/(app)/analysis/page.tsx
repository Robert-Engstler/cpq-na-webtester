"use client";

import { useEffect, useState, useCallback } from "react";
import { C, mono } from "@/lib/design";
import type { AnalysisResult, StepStat } from "@/app/api/analysis/route";

type FailingStepSnap = {
  stepName: string;
  failureRate: number;
  failures: number;
  totalRuns: number;
};

type Snapshot = {
  id: string;
  created_at: string;
  run_count: number;
  overall_failure_rate: number;
  failing_steps: FailingStepSnap[];
  suggestion_text: string;
  status: "pending" | "implementing" | "verified" | "dismissed";
  notes: string | null;
};

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

function failureColor(rate: number): string {
  if (rate >= 0.5) return C.danger;
  if (rate >= 0.2) return C.warning;
  if (rate > 0)   return "#f59e0b88";
  return C.success;
}

const SNAP_STATUS = {
  pending:      { label: "Pending",      color: C.muted },
  implementing: { label: "Implementing", color: C.warning },
  verified:     { label: "Verified",     color: C.success },
  dismissed:    { label: "Dismissed",    color: C.muted },
} as const;

export default function AnalysisPage() {
  const [analysis, setAnalysis]     = useState<AnalysisResult | null>(null);
  const [snapshots, setSnapshots]   = useState<Snapshot[]>([]);
  const [loading,   setLoading]     = useState(true);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [tab, setTab]               = useState<"steps" | "findings">("steps");

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ar, sr] = await Promise.all([
        fetch("/api/analysis").then(r => r.json()),
        fetch("/api/analysis/snapshots").then(r => r.json()),
      ]);
      setAnalysis(ar);
      setSnapshots(Array.isArray(sr) ? sr : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function handleSuggest() {
    if (!analysis) return;
    setSuggesting(true);
    setSuggestion(null);
    setSaved(false);
    try {
      const res = await fetch("/api/analysis/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(analysis),
      });
      const data = await res.json();
      setSuggestion(data.suggestion ?? data.error ?? "No response");
    } finally {
      setSuggesting(false);
    }
  }

  async function handleSaveSnapshot() {
    if (!analysis || !suggestion) return;
    setSaving(true);
    try {
      const failingSteps = analysis.steps
        .filter(s => s.failures > 0)
        .map(s => ({ stepName: s.stepName, failureRate: s.failureRate, failures: s.failures, totalRuns: s.totalRuns }));
      await fetch("/api/analysis/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          run_count: analysis.totalRuns,
          overall_failure_rate: analysis.overallFailureRate,
          failing_steps: failingSteps,
          suggestion_text: suggestion,
        }),
      });
      setSaved(true);
      fetch("/api/analysis/snapshots").then(r => r.json()).then(sr => {
        if (Array.isArray(sr)) setSnapshots(sr);
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateSnapshot(id: string, patch: { status?: string; notes?: string }) {
    const res = await fetch(`/api/analysis/snapshots/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated = await res.json();
      setSnapshots(ss => ss.map(s => s.id === id ? updated : s));
    }
  }

  async function handleDeleteSnapshot(id: string) {
    if (!confirm("Delete this analysis snapshot?")) return;
    await fetch(`/api/analysis/snapshots/${id}`, { method: "DELETE" });
    setSnapshots(ss => ss.filter(s => s.id !== id));
  }

  const activeFindings = snapshots.filter(s => s.status !== "dismissed").length;

  return (
    <div style={{ fontFamily: mono, background: C.bg, minHeight: "100vh", color: C.primary }}>
      {/* Header */}
      <div style={{ padding: "20px 28px 0", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.5 }}>Analysis</div>
          {analysis && !loading && (
            <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
              {analysis.totalRuns} runs · {analysis.totalSteps} steps ·{" "}
              {pct(analysis.overallFailureRate)} overall failure rate ·{" "}
              generated {new Date(analysis.generatedAt).toLocaleString()}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={loadAll}
            style={{ fontFamily: mono, fontSize: 12, padding: "6px 14px", background: C.surfaceHi, border: `1px solid ${C.border}`, color: C.secondary, borderRadius: 4, cursor: "pointer" }}
          >
            Refresh
          </button>
          <button
            onClick={handleSuggest}
            disabled={suggesting || !analysis || analysis.totalRuns === 0}
            style={{ fontFamily: mono, fontSize: 12, padding: "6px 14px", background: suggesting ? C.surfaceHi : C.accent, border: "none", color: "#fff", borderRadius: 4, cursor: suggesting ? "default" : "pointer", opacity: !analysis || analysis.totalRuns === 0 ? 0.4 : 1 }}
          >
            {suggesting ? "Analyzing…" : "✦ Analyze & Suggest"}
          </button>
        </div>
      </div>

      {/* Suggestion box */}
      {suggestion && (
        <div style={{ margin: "16px 28px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, display: "flex", flexDirection: "column", maxHeight: "45vh" }}>
          <div style={{ padding: "12px 16px 8px", fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1, flexShrink: 0 }}>
            AI Analysis & Recommendations
          </div>
          <div style={{ padding: "0 16px", overflowY: "auto", flex: 1, fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {suggestion}
          </div>
          <div style={{ padding: "10px 16px", flexShrink: 0, borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={handleSaveSnapshot}
              disabled={saving || saved}
              style={{
                fontFamily: mono, fontSize: 11, padding: "4px 10px", borderRadius: 4, cursor: saving || saved ? "default" : "pointer",
                background: saved ? "rgba(34,197,94,0.1)" : C.accent,
                border: saved ? `1px solid ${C.success}` : "none",
                color: saved ? C.success : "#fff",
              }}
            >
              {saved ? "✓ Saved to Findings" : saving ? "Saving…" : "Save to Findings"}
            </button>
            <button
              onClick={() => { setSuggestion(null); setSaved(false); }}
              style={{ fontFamily: mono, fontSize: 11, padding: "4px 10px", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 4, cursor: "pointer" }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ padding: "16px 28px 0", display: "flex", gap: 4, borderBottom: `1px solid ${C.border}`, marginTop: suggestion ? 0 : 16 }}>
        {(["steps", "findings"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            fontFamily: mono, fontSize: 12, padding: "6px 14px", border: "none",
            background: tab === t ? C.surfaceHi : "transparent",
            color: tab === t ? C.primary : C.muted,
            borderBottom: tab === t ? `2px solid ${C.accent}` : "2px solid transparent",
            cursor: "pointer",
          }}>
            {t === "steps"
              ? `Step Failures${analysis ? ` (${analysis.steps.filter(s => s.failures > 0).length})` : ""}`
              : `Findings (${activeFindings})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 40, color: C.muted, fontSize: 13 }}>Loading…</div>
      ) : tab === "steps" ? (
        <StepsTab analysis={analysis} snapshots={snapshots} />
      ) : (
        <FindingsTab
          snapshots={snapshots}
          currentAnalysis={analysis}
          onUpdate={handleUpdateSnapshot}
          onDelete={handleDeleteSnapshot}
        />
      )}
    </div>
  );
}

function StepsTab({ analysis, snapshots }: { analysis: AnalysisResult | null; snapshots: Snapshot[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!analysis || analysis.totalRuns === 0) {
    return <div style={{ padding: 40, color: C.muted, fontSize: 13 }}>No run data yet. Trigger some runs first.</div>;
  }

  // Cross-check: for each step name find the highest-priority non-dismissed snapshot that covers it
  const stepCrossCheck = new Map<string, { status: string; date: string }>();
  const priority: Record<string, number> = { verified: 3, implementing: 2, pending: 1 };
  for (const snap of snapshots) {
    if (snap.status === "dismissed") continue;
    for (const fs of snap.failing_steps) {
      const existing = stepCrossCheck.get(fs.stepName);
      if (!existing || (priority[snap.status] ?? 0) > (priority[existing.status] ?? 0)) {
        stepCrossCheck.set(fs.stepName, { status: snap.status, date: snap.created_at });
      }
    }
  }

  const failing = analysis.steps.filter(s => s.failures > 0);
  const passing = analysis.steps.filter(s => s.failures === 0);

  return (
    <div style={{ padding: "0 28px 40px" }}>
      <div style={{ marginTop: 20, fontSize: 11, color: C.muted, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>
        Failing steps — sorted by failure rate
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {["Step", "Failure rate", "Failures / Runs", "Avg duration", "Top error", "Finding"].map(h => (
              <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 10, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {failing.map(s => {
            const cross = stepCrossCheck.get(s.stepName);
            return (
              <>
                <tr
                  key={s.stepName}
                  onClick={() => setExpanded(expanded === s.stepName ? null : s.stepName)}
                  style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.surfaceAlt)}
                  onMouseLeave={e => (e.currentTarget.style.background = "")}
                >
                  <td style={{ padding: "10px 12px", color: C.primary }}>{s.stepName}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 60, height: 6, background: C.surfaceHi, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: pct(s.failureRate), height: "100%", background: failureColor(s.failureRate), borderRadius: 3 }} />
                      </div>
                      <span style={{ color: failureColor(s.failureRate), fontWeight: 600 }}>{pct(s.failureRate)}</span>
                    </div>
                  </td>
                  <td style={{ padding: "10px 12px", color: C.secondary }}>{s.failures} / {s.totalRuns}</td>
                  <td style={{ padding: "10px 12px", color: C.muted }}>{s.avgDurationMs != null ? `${(s.avgDurationMs / 1000).toFixed(1)}s` : "—"}</td>
                  <td style={{ padding: "10px 12px", color: C.muted, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.topErrors[0]
                      ? <span><span style={{ color: C.warning, marginRight: 6 }}>{s.topErrors[0].errorCategory}</span>{s.topErrors[0].error.slice(0, 70)}</span>
                      : "—"}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    {cross ? <CrossCheckBadge status={cross.status} date={cross.date} /> : <span style={{ color: C.muted, fontSize: 11 }}>—</span>}
                  </td>
                </tr>
                {expanded === s.stepName && (
                  <tr key={`${s.stepName}-detail`}>
                    <td colSpan={6} style={{ padding: "0 12px 12px 24px", background: C.surfaceAlt }}>
                      <StepDetail step={s} />
                    </td>
                  </tr>
                )}
              </>
            );
          })}
          {failing.length === 0 && (
            <tr><td colSpan={6} style={{ padding: 20, color: C.muted }}>No failures recorded yet.</td></tr>
          )}
        </tbody>
      </table>

      {passing.length > 0 && (
        <div style={{ marginTop: 24, fontSize: 11, color: C.muted }}>
          ✓ Always passing: {passing.map(s => s.stepName).join(" · ")}
        </div>
      )}
    </div>
  );
}

function CrossCheckBadge({ status, date }: { status: string; date: string }) {
  const cfg: Record<string, { label: string; color: string; bg: string }> = {
    pending:      { label: "Tracked",              color: C.muted,    bg: C.surfaceHi },
    implementing: { label: "Fix in progress",       color: C.warning,  bg: "rgba(245,158,11,0.12)" },
    verified:     { label: "⚠ Verified — still failing", color: C.danger, bg: "rgba(239,68,68,0.1)" },
  };
  const c = cfg[status] ?? { label: status, color: C.muted, bg: C.surfaceHi };
  return (
    <span
      title={`From analysis on ${new Date(date).toLocaleDateString()}`}
      style={{ fontSize: 10, padding: "2px 7px", borderRadius: 3, background: c.bg, color: c.color, whiteSpace: "nowrap" }}
    >
      {c.label}
    </span>
  );
}

function StepDetail({ step }: { step: StepStat }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, paddingTop: 12, fontSize: 11 }}>
      <div>
        <div style={{ color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>Error patterns</div>
        {step.topErrors.length === 0
          ? <div style={{ color: C.muted }}>—</div>
          : step.topErrors.map((e, i) => (
            <div key={i} style={{ marginBottom: 6, color: C.secondary }}>
              <span style={{ color: C.warning, marginRight: 6 }}>×{e.count}</span>
              <span style={{ color: C.muted, marginRight: 6 }}>[{e.errorCategory}]</span>
              {e.error}
            </div>
          ))}
      </div>
      <div>
        <div style={{ color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>Failure by combo</div>
        {step.byCombo.filter(c => c.failures > 0).map((c, i) => (
          <div key={i} style={{ marginBottom: 4, color: C.secondary }}>
            {c.brand}/{c.country}/{c.gcOption}:{" "}
            <span style={{ color: failureColor(c.runs > 0 ? c.failures / c.runs : 0) }}>
              {c.failures}/{c.runs}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FindingsTab({
  snapshots,
  currentAnalysis,
  onUpdate,
  onDelete,
}: {
  snapshots: Snapshot[];
  currentAnalysis: AnalysisResult | null;
  onUpdate: (id: string, patch: { status?: string; notes?: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  const [savingNotes, setSavingNotes] = useState<Record<string, boolean>>({});

  const currentlyFailing = new Set(
    currentAnalysis?.steps.filter(s => s.failures > 0).map(s => s.stepName) ?? []
  );

  const active    = snapshots.filter(s => s.status !== "dismissed");
  const dismissed = snapshots.filter(s => s.status === "dismissed");

  if (snapshots.length === 0) {
    return (
      <div style={{ padding: 40, color: C.muted, fontSize: 13 }}>
        No analyses saved yet. Run "Analyze & Suggest" and click "Save to Findings".
      </div>
    );
  }

  async function saveNotes(id: string) {
    setSavingNotes(s => ({ ...s, [id]: true }));
    await onUpdate(id, { notes: editingNotes[id] ?? "" });
    setSavingNotes(s => ({ ...s, [id]: false }));
  }

  function renderSnapshot(snap: Snapshot) {
    const isExpanded = expanded === snap.id;
    const cfg = SNAP_STATUS[snap.status];
    const noteVal = editingNotes[snap.id] !== undefined ? editingNotes[snap.id] : (snap.notes ?? "");

    const stillFailing = snap.failing_steps.filter(fs => currentlyFailing.has(fs.stepName));
    const nowPassing   = snap.failing_steps.filter(fs => !currentlyFailing.has(fs.stepName));

    const borderColor =
      snap.status === "verified" && stillFailing.length > 0 ? C.danger :
      snap.status === "implementing" ? C.warning :
      C.border;

    return (
      <div key={snap.id} style={{ background: C.surface, border: `1px solid ${borderColor}`, borderRadius: 6, overflow: "hidden" }}>
        {/* Collapsed header */}
        <div
          style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
          onClick={() => setExpanded(isExpanded ? null : snap.id)}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: C.primary, fontWeight: 600 }}>
                {new Date(snap.created_at).toLocaleString()}
              </span>
              <span style={{ fontSize: 10, color: C.muted }}>
                {snap.run_count} runs · {pct(snap.overall_failure_rate)} failure rate
              </span>
              <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: "rgba(255,255,255,0.05)", color: cfg.color }}>
                {cfg.label}
              </span>
              {snap.status === "verified" && stillFailing.length > 0 && (
                <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: "rgba(239,68,68,0.1)", color: C.danger }}>
                  ⚠ {stillFailing.length} step{stillFailing.length !== 1 ? "s" : ""} still failing
                </span>
              )}
              {snap.status === "implementing" && nowPassing.length > 0 && (
                <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: "rgba(34,197,94,0.1)", color: C.success }}>
                  ✓ {nowPassing.length} step{nowPassing.length !== 1 ? "s" : ""} resolved
                </span>
              )}
            </div>
            <div style={{ marginTop: 4, fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {snap.failing_steps.map(fs => fs.stepName).join(" · ") || "No failing steps"}
            </div>
          </div>
          <span style={{ color: C.muted, fontSize: 11, flexShrink: 0 }}>{isExpanded ? "▲" : "▼"}</span>
        </div>

        {/* Expanded body */}
        {isExpanded && (
          <div style={{ borderTop: `1px solid ${C.border}` }}>
            {/* Step-by-step cross-check */}
            <div style={{ padding: "10px 16px", display: "flex", flexWrap: "wrap", gap: 6 }}>
              {snap.failing_steps.map(fs => {
                const stillFails = currentlyFailing.has(fs.stepName);
                return (
                  <span key={fs.stepName} style={{
                    fontSize: 10, padding: "3px 8px", borderRadius: 3,
                    background: stillFails ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
                    color: stillFails ? C.danger : C.success,
                  }}>
                    {stillFails ? "✗" : "✓"} {fs.stepName} ({pct(fs.failureRate)} then)
                  </span>
                );
              })}
            </div>

            {/* Suggestion text */}
            <div style={{
              margin: "0 16px 12px", background: C.surfaceAlt, borderRadius: 4,
              padding: "10px 12px", maxHeight: "28vh", overflowY: "auto",
              fontSize: 11, lineHeight: 1.7, whiteSpace: "pre-wrap", color: C.secondary,
            }}>
              {snap.suggestion_text}
            </div>

            {/* Controls */}
            <div style={{ padding: "12px 16px", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", borderTop: `1px solid ${C.border}` }}>
              <div>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>Status</div>
                <select
                  value={snap.status}
                  onChange={e => onUpdate(snap.id, { status: e.target.value })}
                  style={{ fontFamily: mono, fontSize: 11, background: C.inputBg, border: `1px solid ${C.inputBdr}`, color: C.primary, borderRadius: 4, padding: "4px 8px" }}
                >
                  <option value="pending">Pending</option>
                  <option value="implementing">Implementing</option>
                  <option value="verified">Verified</option>
                  <option value="dismissed">Dismissed</option>
                </select>
              </div>

              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>Notes</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    value={noteVal}
                    onChange={e => setEditingNotes(n => ({ ...n, [snap.id]: e.target.value }))}
                    placeholder="Add notes about implementation progress…"
                    style={{ fontFamily: mono, fontSize: 11, background: C.inputBg, border: `1px solid ${C.inputBdr}`, color: C.primary, borderRadius: 4, padding: "4px 8px", flex: 1 }}
                  />
                  <button
                    onClick={() => saveNotes(snap.id)}
                    disabled={savingNotes[snap.id]}
                    style={{ fontFamily: mono, fontSize: 11, padding: "4px 10px", background: C.accent, border: "none", color: "#fff", borderRadius: 4, cursor: "pointer" }}
                  >
                    {savingNotes[snap.id] ? "…" : "Save"}
                  </button>
                </div>
              </div>

              <button
                onClick={() => onDelete(snap.id)}
                style={{ fontFamily: mono, fontSize: 11, padding: "4px 10px", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 4, cursor: "pointer" }}
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 28px 40px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {active.map(snap => renderSnapshot(snap))}
      </div>
      {dismissed.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Dismissed</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {dismissed.map(snap => renderSnapshot(snap))}
          </div>
        </div>
      )}
    </div>
  );
}
