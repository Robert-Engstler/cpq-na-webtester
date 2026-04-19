"use client";

import { useEffect, useState, useCallback } from "react";
import { C, mono } from "@/lib/design";
import type { AnalysisResult, StepStat } from "@/app/api/analysis/route";

type Lesson = {
  id: string;
  title: string;
  step_name: string | null;
  brand: string | null;
  country: string | null;
  gc_option: string | null;
  root_cause: string;
  fix_applied: string | null;
  status: string;
  run_id: string | null;
  created_at: string;
};

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

function failureColor(rate: number): string {
  if (rate >= 0.5) return C.danger;
  if (rate >= 0.2) return C.warning;
  if (rate > 0)   return "#f59e0b88";
  return C.success;
}

export default function AnalysisPage() {
  const [analysis, setAnalysis]     = useState<AnalysisResult | null>(null);
  const [lessons,  setLessons]      = useState<Lesson[]>([]);
  const [loading,  setLoading]      = useState(true);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [tab, setTab]               = useState<"steps" | "lessons">("steps");
  const [showAddLesson, setShowAddLesson] = useState(false);
  const [lessonForm, setLessonForm] = useState({
    title: "", step_name: "", brand: "", country: "", gc_option: "",
    root_cause: "", fix_applied: "", status: "resolved", run_id: "",
  });

  const loadAnalysis = useCallback(async () => {
    setLoading(true);
    try {
      const [ar, lr] = await Promise.all([
        fetch("/api/analysis").then(r => r.json()),
        fetch("/api/lessons").then(r => r.json()),
      ]);
      setAnalysis(ar);
      setLessons(Array.isArray(lr) ? lr : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAnalysis(); }, [loadAnalysis]);

  async function handleSuggest() {
    if (!analysis) return;
    setSuggesting(true);
    setSuggestion(null);
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

  async function handleAddLesson(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/lessons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...lessonForm,
        step_name:   lessonForm.step_name   || undefined,
        brand:       lessonForm.brand       || undefined,
        country:     lessonForm.country     || undefined,
        gc_option:   lessonForm.gc_option   || undefined,
        fix_applied: lessonForm.fix_applied || undefined,
        run_id:      lessonForm.run_id      || undefined,
      }),
    });
    setShowAddLesson(false);
    setLessonForm({ title: "", step_name: "", brand: "", country: "", gc_option: "",
      root_cause: "", fix_applied: "", status: "resolved", run_id: "" });
    loadAnalysis();
  }

  async function deleteLesson(id: string) {
    if (!confirm("Delete this lesson?")) return;
    await fetch(`/api/lessons/${id}`, { method: "DELETE" });
    setLessons(l => l.filter(x => x.id !== id));
  }

  const inputStyle: React.CSSProperties = {
    fontFamily: mono, fontSize: 12, background: C.inputBg, border: `1px solid ${C.inputBdr}`,
    color: C.primary, borderRadius: 4, padding: "6px 8px", width: "100%",
  };
  const labelStyle: React.CSSProperties = { fontSize: 11, color: C.secondary, marginBottom: 3, display: "block" };

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
            onClick={loadAnalysis}
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
        <div style={{ margin: "16px 28px", padding: 16, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>AI Analysis & Recommendations</div>
          {suggestion}
          <button
            onClick={() => setSuggestion(null)}
            style={{ marginTop: 12, fontFamily: mono, fontSize: 11, padding: "4px 10px", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 4, cursor: "pointer" }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ padding: "16px 28px 0", display: "flex", gap: 4, borderBottom: `1px solid ${C.border}`, marginTop: suggestion ? 0 : 16 }}>
        {(["steps", "lessons"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            fontFamily: mono, fontSize: 12, padding: "6px 14px", border: "none",
            background: tab === t ? C.surfaceHi : "transparent",
            color: tab === t ? C.primary : C.muted,
            borderBottom: tab === t ? `2px solid ${C.accent}` : "2px solid transparent",
            cursor: "pointer", textTransform: "capitalize",
          }}>
            {t === "steps" ? `Step Failures${analysis ? ` (${analysis.steps.filter(s => s.failures > 0).length})` : ""}` : `Lessons Learned (${lessons.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 40, color: C.muted, fontSize: 13 }}>Loading…</div>
      ) : tab === "steps" ? (
        <StepsTab analysis={analysis} />
      ) : (
        <LessonsTab
          lessons={lessons}
          showAdd={showAddLesson}
          form={lessonForm}
          onFormChange={f => setLessonForm(f as typeof lessonForm)}
          onToggleAdd={() => setShowAddLesson(v => !v)}
          onSubmit={handleAddLesson}
          onDelete={deleteLesson}
          inputStyle={inputStyle}
          labelStyle={labelStyle}
        />
      )}
    </div>
  );
}

function StepsTab({ analysis }: { analysis: AnalysisResult | null }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!analysis || analysis.totalRuns === 0) {
    return <div style={{ padding: 40, color: C.muted, fontSize: 13 }}>No run data yet. Trigger some runs first.</div>;
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
            {["Step", "Failure rate", "Failures / Runs", "Avg duration", "Top error"].map(h => (
              <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 10, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {failing.map(s => (
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
                <td style={{ padding: "10px 12px", color: C.muted, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.topErrors[0]
                    ? <span><span style={{ color: C.warning, marginRight: 6 }}>{s.topErrors[0].errorCategory}</span>{s.topErrors[0].error.slice(0, 80)}</span>
                    : "—"}
                </td>
              </tr>
              {expanded === s.stepName && (
                <tr key={`${s.stepName}-detail`}>
                  <td colSpan={5} style={{ padding: "0 12px 12px 24px", background: C.surfaceAlt }}>
                    <StepDetail step={s} />
                  </td>
                </tr>
              )}
            </>
          ))}
          {failing.length === 0 && (
            <tr><td colSpan={5} style={{ padding: 20, color: C.muted }}>No failures recorded yet.</td></tr>
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

function LessonsTab({
  lessons, showAdd, form, onFormChange, onToggleAdd, onSubmit, onDelete, inputStyle, labelStyle,
}: {
  lessons: Lesson[];
  showAdd: boolean;
  form: Record<string, string>;
  onFormChange: (f: Record<string, string>) => void;
  onToggleAdd: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onDelete: (id: string) => void;
  inputStyle: React.CSSProperties;
  labelStyle: React.CSSProperties;
}) {
  const sel = (name: string, options: string[]) => (
    <select name={name} value={form[name]} onChange={e => onFormChange({ ...form, [name]: e.target.value })} style={inputStyle}>
      <option value="">Any</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  return (
    <div style={{ padding: "20px 28px 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>Known failure patterns &amp; fixes</div>
        <button onClick={onToggleAdd} style={{ fontFamily: mono, fontSize: 12, padding: "6px 14px", background: showAdd ? C.surfaceHi : C.accent, border: "none", color: "#fff", borderRadius: 4, cursor: "pointer" }}>
          {showAdd ? "Cancel" : "+ Add Lesson"}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={onSubmit} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 16, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={labelStyle}>Title *</label>
            <input required style={inputStyle} value={form.title} onChange={e => onFormChange({ ...form, title: e.target.value })} placeholder="Short description of the failure" />
          </div>
          <div>
            <label style={labelStyle}>Step name</label>
            <input style={inputStyle} value={form.step_name} onChange={e => onFormChange({ ...form, step_name: e.target.value })} placeholder="e.g. Apply changes → Add to configuration" />
          </div>
          <div>
            <label style={labelStyle}>Status</label>
            <select value={form.status} onChange={e => onFormChange({ ...form, status: e.target.value })} style={inputStyle}>
              <option value="resolved">Resolved</option>
              <option value="open">Open</option>
            </select>
          </div>
          <div><label style={labelStyle}>Brand</label>{sel("brand", ["FT", "MF"])}</div>
          <div><label style={labelStyle}>Country</label>{sel("country", ["US", "CA"])}</div>
          <div><label style={labelStyle}>GC Option</label>{sel("gc_option", ["Standard", "Annual", "Parts-Only"])}</div>
          <div>
            <label style={labelStyle}>Run ID (optional)</label>
            <input style={inputStyle} value={form.run_id} onChange={e => onFormChange({ ...form, run_id: e.target.value })} placeholder="UUID of the failing run" />
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={labelStyle}>Root cause *</label>
            <textarea required rows={3} style={{ ...inputStyle, resize: "vertical" }} value={form.root_cause} onChange={e => onFormChange({ ...form, root_cause: e.target.value })} placeholder="Why did this fail?" />
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={labelStyle}>Fix applied</label>
            <textarea rows={2} style={{ ...inputStyle, resize: "vertical" }} value={form.fix_applied} onChange={e => onFormChange({ ...form, fix_applied: e.target.value })} placeholder="What was changed to fix it?" />
          </div>
          <div style={{ gridColumn: "1/-1", display: "flex", justifyContent: "flex-end" }}>
            <button type="submit" style={{ fontFamily: mono, fontSize: 12, padding: "6px 16px", background: C.accent, border: "none", color: "#fff", borderRadius: 4, cursor: "pointer" }}>
              Save Lesson
            </button>
          </div>
        </form>
      )}

      {lessons.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 13 }}>No lessons recorded yet. Add one after your next failure.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {lessons.map(l => (
            <div key={l.id} style={{ background: C.surface, border: `1px solid ${l.status === "open" ? C.warning : C.border}`, borderRadius: 6, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.primary }}>{l.title}</span>
                    <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: l.status === "open" ? "rgba(245,158,11,0.15)" : "rgba(34,197,94,0.1)", color: l.status === "open" ? C.warning : C.success, textTransform: "uppercase", letterSpacing: 0.8 }}>{l.status}</span>
                    {l.step_name && <span style={{ fontSize: 10, color: C.muted }}>· {l.step_name}</span>}
                    {(l.brand || l.country || l.gc_option) && (
                      <span style={{ fontSize: 10, color: C.muted }}>· {[l.brand, l.country, l.gc_option].filter(Boolean).join("/")}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: C.secondary, marginBottom: l.fix_applied ? 6 : 0 }}>
                    <span style={{ color: C.muted, marginRight: 4 }}>Root cause:</span>{l.root_cause}
                  </div>
                  {l.fix_applied && (
                    <div style={{ fontSize: 11, color: C.secondary }}>
                      <span style={{ color: C.success, marginRight: 4 }}>Fix:</span>{l.fix_applied}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>
                    {new Date(l.created_at).toLocaleDateString()}
                    {l.run_id && <span> · run {l.run_id.slice(0, 8)}…</span>}
                  </div>
                </div>
                <button onClick={() => onDelete(l.id)} style={{ fontFamily: mono, fontSize: 11, padding: "3px 8px", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 4, cursor: "pointer", flexShrink: 0 }}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
