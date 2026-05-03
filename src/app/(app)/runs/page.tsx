"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { C, mono, thStyle, thClass, tdTop } from "@/lib/design";

type StepResult = {
  step: string;
  passed: boolean;
  vin?: string;
  hadManualSpec?: boolean;
  manualSpecs?: string[];
  configId?: string;
  configUrl?: string;
  pdfDownloaded?: boolean;
  orderQueued?: boolean;
  url?: string;
  error?: string;
};

type Run = {
  id: string;
  scenario_id: string;
  scenario_name: string;
  vins: string[];
  gc_options: string[];
  environment: string;
  brand: string;
  country: string;
  status: "pending" | "complete" | "failed" | "stopped";
  pdf_url: string | null;
  result_json: StepResult[] | null;
  order_ids: Record<string, string> | null;
  created_at: string;
  finished_at: string | null;
};

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function formatMs(ms: number): string {
  if (ms < 0) return "—";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function Duration({ start, end, live }: { start: string; end: string | null; live: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);
  if (end) return <>{formatMs(new Date(end).getTime() - new Date(start).getTime())}</>;
  if (!live) return <>—</>;
  return <>{formatMs(now - new Date(start).getTime())} ↑</>;
}

function fmtR(id: string) { return `R-${id.slice(0, 7)}`; }
function fmtS(id: string) { return `S-${id.slice(0, 7)}`; }

const STATUS_DOT: Record<string, { color: string; label: string }> = {
  pending:  { color: C.accent,  label: "Running" },
  complete: { color: C.success, label: "Complete" },
  failed:   { color: C.danger,  label: "Failed" },
  stopped:  { color: C.warning, label: "Stopped" },
};

function StatusDot({ status }: { status: Run["status"] }) {
  const cfg = STATUS_DOT[status] ?? { color: C.muted, label: status };
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
      <span style={{
        width: 7, height: 7, borderRadius: "50%", background: cfg.color, flexShrink: 0,
        animation: status === "pending" ? "blink 1.4s infinite" : undefined,
      }} />
      <span style={{ fontSize: 11, fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
    </span>
  );
}

function matchVinFromStep(stepText: string, vins: string[]): string | null {
  const m = stepText.match(/^\[([^\]]+)\]/);
  if (!m) return null;
  const label = m[1];
  for (const vin of vins) {
    if (label === vin) return vin;
    if (vin.length > 12) {
      const short = `${vin.slice(0, 6)}\u2026${vin.slice(-4)}`;
      if (label === short || label === `${vin.slice(0, 6)}…${vin.slice(-4)}`) return vin;
    }
    if (label.startsWith(vin.slice(0, 6)) && label.endsWith(vin.slice(-4))) return vin;
  }
  return null;
}

function vinColor(vin: string, status: Run["status"], steps: StepResult[] | null): string {
  if (status === "pending") return C.muted;
  if (!steps || steps.length === 0) return status === "failed" ? C.danger : C.muted;
  const vinSteps = steps.filter((s) => matchVinFromStep(s.step, [vin]) === vin);
  if (vinSteps.length === 0) return C.muted;
  if (vinSteps.some((s) => !s.passed)) return C.danger;
  if (vinSteps.some((s) => s.hadManualSpec)) return C.warning;
  return C.success;
}

function VinDots({ run }: { run: Run }) {
  const tooltip = run.vins.map((v, i) => `${v}  [${run.gc_options?.[i] ?? "—"}]`).join("\n");
  return (
    <span title={tooltip} style={{ display: "flex", gap: 3, alignItems: "center", cursor: "default" }}>
      {run.vins.map((v) => (
        <span key={v} style={{
          width: 10, height: 10, borderRadius: 2,
          background: vinColor(v, run.status, run.result_json),
          flexShrink: 0,
        }} />
      ))}
      <span style={{ fontSize: 10, color: C.muted, marginLeft: 2 }}>
        {run.vins.length} VIN{run.vins.length > 1 ? "s" : ""}
      </span>
    </span>
  );
}

function getConfig(vin: string, steps: StepResult[] | null): { id: string; url?: string } | null {
  if (!steps) return null;
  const vinSteps = steps.filter((s) => matchVinFromStep(s.step, [vin]) === vin);
  const last = [...vinSteps].reverse().find((s) => s.configId && /^CONFIG\d+$/i.test(s.configId));
  if (last) return { id: last.configId!, url: last.configUrl };
  const first = vinSteps.find((s) => s.configId);
  if (first) return { id: first.configId!, url: first.configUrl };
  return null;
}

function orderQueuedUrl(vin: string, steps: StepResult[] | null): string | null {
  if (!steps) return null;
  const step = steps.find((s) => s.vin === vin && s.orderQueued === true);
  return step?.url ?? null;
}

function orderPdfMissing(vin: string, steps: StepResult[] | null): boolean {
  if (!steps) return false;
  const pdfSteps = steps.filter(
    (s) => s.vin === vin && /Download (Genuine Care Order Details|Maintenance Agreement) PDF/.test(s.step)
  );
  return pdfSteps.length > 0 && pdfSteps.some((s) => s.pdfDownloaded === false);
}

function rowBg(run: Run, i: number): string {
  if (run.status === "pending") return "#fffbf0";
  if (run.status === "failed") return "#fff8f8";
  return i % 2 === 0 ? C.bg : C.surfaceAlt;
}

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [pdfRetry, setPdfRetry] = useState<Record<string, "idle" | "loading" | "dispatched" | "error">>({});
  const [filter, setFilter] = useState<"all" | "failed" | "running">("all");
  const [search, setSearch] = useState("");
  const perPage = 8;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRuns = useCallback(() => {
    return fetch("/api/runs")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setRuns)
      .catch(() => setError("Could not load runs. Please refresh."));
  }, []);

  useEffect(() => { fetchRuns().finally(() => setLoading(false)); }, [fetchRuns]);

  async function handleRetryPdf(runId: string, vin: string) {
    const key = `${runId}:${vin}`;
    setPdfRetry(s => ({ ...s, [key]: "loading" }));
    try {
      const res = await fetch(`/api/runs/${runId}/retry-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin }),
      });
      setPdfRetry(s => ({ ...s, [key]: res.ok ? "dispatched" : "error" }));
    } catch {
      setPdfRetry(s => ({ ...s, [key]: "error" }));
    }
  }

  async function handleStop(id: string) {
    setStoppingId(id);
    await fetch(`/api/runs/${id}/stop`, { method: "POST" }).catch(() => {});
    await fetchRuns();
    setStoppingId(null);
  }

  useEffect(() => {
    const hasActive = runs.some((r) => r.status === "pending");
    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(fetchRuns, 5000);
    } else if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [runs, fetchRuns]);

  const runningCount = runs.filter(r => r.status === "pending").length;
  const failedCount  = runs.filter(r => r.status === "failed").length;

  const filteredRuns = runs.filter(r => {
    if (filter === "failed"  && r.status !== "failed")  return false;
    if (filter === "running" && r.status !== "pending") return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        fmtR(r.id).toLowerCase().includes(q) ||
        r.scenario_name.toLowerCase().includes(q) ||
        r.vins.some(v => v.toLowerCase().includes(q)) ||
        `${r.environment} ${r.brand} ${r.country}`.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalPages = Math.ceil(filteredRuns.length / perPage);
  const pagedRuns  = filteredRuns.slice((page - 1) * perPage, page * perPage);

  const pillBase: React.CSSProperties = {
    padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 500,
    cursor: "pointer", border: `1px solid ${C.border}`, background: C.bg, color: C.secondary,
    lineHeight: 1.6,
  };
  const pillActive: React.CSSProperties = {
    ...pillBase, background: C.accent, color: "#fff", borderColor: C.accent,
  };
  const pillFailed: React.CSSProperties = {
    ...pillBase,
    ...(filter === "failed" ? { background: C.dangerBg, color: C.danger, borderColor: "#fca5a5" } : { color: C.danger, borderColor: "#fca5a5" }),
  };
  const pillRunning: React.CSSProperties = {
    ...pillBase,
    ...(filter === "running" ? { background: C.accentBg, color: C.accent, borderColor: "#93c5fd" } : { color: C.accent, borderColor: "#93c5fd" }),
  };

  return (
    <main
      className="flex flex-col overflow-hidden"
      style={{ height: "calc(100vh - 48px)", background: C.bg, color: C.primary }}
    >
      {/* Toolbar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 16px", borderBottom: `1px solid ${C.border}`, background: C.surface, flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.primary }}>Runs</span>
          {!loading && !error && (
            <span style={{ fontSize: 11, color: C.muted, fontFamily: mono }}>
              {runs.length} total
              {runningCount > 0 && <> · <span style={{ color: C.accent }}>{runningCount} running</span></>}
              {failedCount  > 0 && <> · <span style={{ color: C.danger }}>{failedCount} failed</span></>}
            </span>
          )}
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search run ID, scenario, VIN…"
            style={{
              background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5,
              padding: "4px 10px", fontSize: 12, color: C.primary, width: 220, outline: "none",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = C.accent; }}
            onBlur={(e)  => { e.currentTarget.style.borderColor = C.border; }}
          />
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          <button onClick={() => { setFilter("all");     setPage(1); }} style={filter === "all"     ? pillActive  : pillBase}>All</button>
          <button onClick={() => { setFilter("failed");  setPage(1); }} style={pillFailed}>Failed</button>
          <button onClick={() => { setFilter("running"); setPage(1); }} style={pillRunning}>Running</button>
        </div>
      </div>

      {loading ? (
        <p style={{ padding: 20, color: C.muted }}>Loading…</p>
      ) : error ? (
        <p style={{ padding: 20, color: C.danger }}>{error}</p>
      ) : runs.length === 0 ? (
        <p style={{ padding: 20, color: C.muted }}>
          No runs yet. Trigger one from the{" "}
          <Link href="/scenarios" style={{ color: C.accent, textDecoration: "underline" }}>Scenarios</Link> page.
        </p>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col" style={{ overflow: "hidden" }}>
          <div style={{ overflowX: "auto", flex: 1, minHeight: 0, overflowY: "auto" }}>
            <table style={{ width: "100%", tableLayout: "fixed", fontSize: 12, borderCollapse: "collapse" }}>
              <colgroup>
                <col style={{ width: 88 }} />
                <col style={{ width: 88 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 170 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 155 }} />
                <col style={{ width: 56 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 80 }} />
                <col />
              </colgroup>
              <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                <tr style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
                  <th className={thClass} style={thStyle}>Run ID</th>
                  <th className={thClass} style={thStyle}>Status</th>
                  <th className={thClass} style={thStyle}>Config</th>
                  <th className={thClass} style={thStyle}>Scenario</th>
                  <th className={thClass} style={thStyle}>VINs</th>
                  <th className={thClass} style={thStyle}>Config ID</th>
                  <th className={thClass} style={thStyle}>Order ID</th>
                  <th className={thClass} style={thStyle}>PDFs</th>
                  <th className={thClass} style={thStyle}>Started</th>
                  <th className={thClass} style={thStyle}>Duration</th>
                  <th className={thClass} style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedRuns.map((run, i) => (
                  <tr
                    key={run.id}
                    style={{ background: rowBg(run, i), borderBottom: `1px solid ${C.border}` }}
                    onMouseEnter={(e) => { if (run.status !== "pending" && run.status !== "failed") (e.currentTarget as HTMLElement).style.background = "#f0f6ff"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = rowBg(run, i); }}
                  >
                    {/* Run ID */}
                    <td className="px-3 py-2" style={{ ...tdTop, fontFamily: mono, fontSize: 11, fontWeight: 600, color: C.accent, whiteSpace: "nowrap" }}>
                      {fmtR(run.id)}
                    </td>

                    {/* Status */}
                    <td className="px-3 py-2" style={tdTop}>
                      <StatusDot status={run.status} />
                    </td>

                    {/* Config */}
                    <td className="px-3 py-2" style={{ ...tdTop, whiteSpace: "nowrap" }}>
                      <span style={{
                        fontSize: 10, fontFamily: mono, fontWeight: 500,
                        color: run.environment === "Stage" ? C.warning : C.secondary,
                        border: `1px solid ${run.environment === "Stage" ? "#fde68a" : C.border}`,
                        borderRadius: 3, padding: "1px 5px", display: "inline-block",
                      }}>
                        {run.environment}
                      </span>
                      <span style={{ fontSize: 10, color: C.muted, fontFamily: mono, marginLeft: 5 }}>
                        {run.brand} · {run.country}
                      </span>
                    </td>

                    {/* Scenario */}
                    <td className="px-3 py-2" style={tdTop}>
                      <div style={{ color: C.muted, fontSize: 10, fontFamily: mono }}>{fmtS(run.scenario_id)}</div>
                      <div style={{ color: C.primary, fontWeight: 500, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {run.scenario_name}
                      </div>
                    </td>

                    {/* VINs */}
                    <td className="px-3 py-2" style={tdTop}>
                      <VinDots run={run} />
                    </td>

                    {/* Config ID */}
                    <td className="px-3 py-2" style={tdTop}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {run.vins.map((v) => {
                          const cfg = getConfig(v, run.result_json);
                          if (!cfg) return <span key={v} style={{ color: C.muted, fontFamily: mono, fontSize: 11 }}>—</span>;
                          const isConfigId = /^CONFIG\d+$/i.test(cfg.id);
                          const configHref = isConfigId && cfg.url
                            ? (cfg.url.includes("?") ? cfg.url : `${cfg.url}?isRetrieved=true`)
                            : null;
                          const queuedUrl = orderQueuedUrl(v, run.result_json);
                          return (
                            <span key={v} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              {configHref ? (
                                <a href={configHref} target="_blank" rel="noopener noreferrer"
                                  title={queuedUrl ? "Order still queued — not confirmed" : undefined}
                                  style={{ color: queuedUrl ? C.warning : C.accent, textDecoration: "underline", fontFamily: mono, fontSize: 11 }}>
                                  {cfg.id}
                                </a>
                              ) : (
                                <span style={{ color: queuedUrl ? C.warning : C.secondary, fontFamily: mono, fontSize: 11 }}>{cfg.id}</span>
                              )}
                              {queuedUrl && (
                                <a href={queuedUrl} target="_blank" rel="noopener noreferrer"
                                  title="Open order in CPQ"
                                  style={{
                                    background: "none", border: `1px solid ${C.warning}`, color: C.warning,
                                    borderRadius: 2, padding: "0px 4px", fontSize: 10,
                                    fontFamily: mono, lineHeight: "16px", textDecoration: "none",
                                  }}>↗</a>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </td>

                    {/* Order ID */}
                    <td className="px-3 py-2" style={tdTop}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {run.vins.map((v) => {
                          const orderId = run.order_ids?.[v];
                          if (!orderId) return <span key={v} style={{ color: C.muted, fontFamily: mono, fontSize: 11 }}>—</span>;
                          if (orderId === "config test only") {
                            return <span key={v} style={{ color: C.muted, fontSize: 10, fontFamily: mono }}>config only</span>;
                          }
                          const pdfMissing = orderPdfMissing(v, run.result_json);
                          if (!pdfMissing) {
                            return <span key={v} style={{ color: C.success, fontFamily: mono, fontSize: 11 }}>{orderId}</span>;
                          }
                          const key = `${run.id}:${v}`;
                          const rs = pdfRetry[key] ?? "idle";
                          return (
                            <span key={v} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <span style={{ color: C.warning, fontFamily: mono, fontSize: 11 }} title="Order placed — PDFs not downloaded">{orderId}</span>
                              {rs === "dispatched" ? (
                                <span style={{ color: C.success, fontSize: 10 }}>↻ sent</span>
                              ) : rs === "error" ? (
                                <span style={{ color: C.danger, fontSize: 10 }}>failed</span>
                              ) : (
                                <button
                                  onClick={() => handleRetryPdf(run.id, v)}
                                  disabled={rs === "loading"}
                                  title="Retry PDF download"
                                  style={{
                                    background: "none", border: `1px solid ${C.warning}`, color: C.warning,
                                    borderRadius: 2, padding: "0px 4px", fontSize: 10, cursor: "pointer",
                                    fontFamily: mono, opacity: rs === "loading" ? 0.5 : 1, lineHeight: "16px",
                                  }}>
                                  {rs === "loading" ? "…" : "↻"}
                                </button>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </td>

                    {/* PDFs */}
                    <td className="px-3 py-2" style={tdTop}>
                      {run.pdf_url ? (
                        <a href={run.pdf_url} target="_blank" rel="noopener noreferrer"
                          style={{ color: C.accent, textDecoration: "underline", fontFamily: mono, fontSize: 11 }}>
                          ZIP
                        </a>
                      ) : (
                        <span style={{ color: C.muted, fontFamily: mono, fontSize: 11 }}>—</span>
                      )}
                    </td>

                    {/* Started */}
                    <td className="px-3 py-2" style={{ ...tdTop, color: C.secondary, fontSize: 11, whiteSpace: "nowrap" }}>
                      {fmtDateTime(run.created_at)}
                    </td>

                    {/* Duration */}
                    <td className="px-3 py-2" style={{ ...tdTop, color: C.secondary, fontFamily: mono, fontSize: 11, whiteSpace: "nowrap" }}>
                      <Duration start={run.created_at} end={run.finished_at} live={run.status === "pending" && stoppingId !== run.id} />
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2" style={tdTop}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {run.status !== "pending" && (
                          <a href={`/runs/${run.id}`} target="_blank" rel="noopener noreferrer"
                            style={{ color: C.accent, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
                            Details →
                          </a>
                        )}
                        {run.status === "pending" && (
                          <button
                            onClick={() => handleStop(run.id)}
                            disabled={stoppingId === run.id}
                            style={{
                              background: C.dangerBg, color: C.danger, border: `1px solid #fca5a5`,
                              borderRadius: 4, padding: "2px 8px", fontSize: 11, fontFamily: mono,
                              cursor: stoppingId === run.id ? "not-allowed" : "pointer",
                              opacity: stoppingId === run.id ? 0.5 : 1, whiteSpace: "nowrap",
                            }}>
                            {stoppingId === run.id ? "Stopping…" : "Stop"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 16px", borderTop: `1px solid ${C.border}`,
              background: C.surface, flexShrink: 0,
            }}>
              <span style={{ fontSize: 11, color: C.muted }}>
                Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, filteredRuns.length)} of {filteredRuns.length} runs
              </span>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.secondary, padding: "3px 10px", fontSize: 11, borderRadius: 4, cursor: "pointer" }}
                  className="disabled:opacity-30 disabled:cursor-not-allowed">
                  ← Prev
                </button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.secondary, padding: "3px 10px", fontSize: 11, borderRadius: 4, cursor: "pointer" }}
                  className="disabled:opacity-30 disabled:cursor-not-allowed">
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
