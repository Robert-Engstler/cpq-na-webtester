"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { C, bodySize, STATUS_CONFIG, thStyle, thClass, tdTop, mono } from "@/lib/design";

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
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function formatMs(ms: number): string {
  if (ms < 0) return "00:00";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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
  return <>{formatMs(now - new Date(start).getTime())}</>;
}

function fmtR(id: string) { return `R-${id.slice(0, 6)}`; }
function fmtS(id: string) { return `S-${id.slice(0, 6)}`; }

function StatusBadge({ status }: { status: Run["status"] }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className="inline-flex items-center justify-center py-1 text-[10px] font-semibold uppercase tracking-wider"
      style={{
        borderLeft: `3px solid ${cfg.border}`, background: cfg.bg, color: cfg.color,
        width: 88, textAlign: "center", position: "relative", overflow: "hidden",
      }}
    >
      {status === "pending" && (
        <span style={{
          position: "absolute", inset: 0,
          background: `linear-gradient(90deg, transparent 0%, ${cfg.border} 50%, transparent 100%)`,
          opacity: 0.3, animation: "fill-lr 2s ease-in-out infinite",
        }} />
      )}
      <span style={{ position: "relative" }}>
        {({ pending: "running", complete: "completed", failed: "failed", stopped: "stopped" } as Record<string, string>)[status] ?? status}
      </span>
    </span>
  );
}

function PdfIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ display: "inline-block", verticalAlign: "middle", marginRight: 4 }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function VinLegend() {
  const items = [
    { color: C.success, text: "Completed successfully" },
    { color: C.warning, text: "Completed with manual spec selections (see logs)" },
    { color: C.danger,  text: "Not completed (see logs)" },
  ];
  return (
    <div className="flex items-start gap-6 px-4 py-3 mb-4"
      style={{ background: C.surface, border: `1px solid ${C.border}`, fontSize: 11 }}>
      <span className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: C.secondary, flexShrink: 0, paddingTop: 1 }}>VIN colors</span>
      {items.map((item) => (
        <span key={item.color} style={{ color: item.color }}>{item.text}</span>
      ))}
    </div>
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

function getConfig(vin: string, steps: StepResult[] | null): { id: string; url?: string } | null {
  if (!steps) return null;
  const vinSteps = steps.filter((s) => matchVinFromStep(s.step, [vin]) === vin);
  // Prefer last step with a CONFIG... id (extracted from PDF filename); fall back to first with any configId
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

function Pagination({ page, totalPages, onPrev, onNext }: {
  page: number; totalPages: number; onPrev: () => void; onNext: () => void;
}) {
  if (totalPages <= 1) return null;
  const btnStyle: React.CSSProperties = {
    border: `1px solid ${C.border}`, color: C.secondary, background: "transparent", borderRadius: 2,
  };
  return (
    <div className="flex items-center justify-between px-4 py-3"
      style={{ borderTop: `1px solid ${C.border}`, color: C.secondary, fontSize: bodySize }}>
      <button onClick={onPrev} disabled={page <= 1}
        className="px-3 py-1.5 text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed"
        style={btnStyle}>&larr; Previous</button>
      <span>Page {page} of {totalPages}</span>
      <button onClick={onNext} disabled={page >= totalPages}
        className="px-3 py-1.5 text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed"
        style={btnStyle}>Next &rarr;</button>
    </div>
  );
}

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [pdfRetry, setPdfRetry] = useState<Record<string, "idle" | "loading" | "dispatched" | "error">>({});
  const perPage = 5;
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

  const totalPages = Math.ceil(runs.length / perPage);
  const pagedRuns = runs.slice((page - 1) * perPage, page * perPage);

  const tagStyle: React.CSSProperties = {
    fontSize: 10, border: `1px solid ${C.border}`, borderRadius: 2,
    padding: "1px 5px", fontFamily: mono,
  };

  return (
    <main
      className="flex flex-col px-6 py-4 overflow-hidden"
      style={{ height: "calc(100vh - 49px)", maxWidth: 1500, background: C.bg, color: C.secondary, fontSize: bodySize }}
    >
      <h1 className="mb-3 text-2xl font-bold tracking-tight flex-shrink-0" style={{ color: C.primary }}>
        Runs
      </h1>

      <div className="flex-shrink-0"><VinLegend /></div>

      {loading ? (
        <p style={{ color: C.muted }}>Loading…</p>
      ) : error ? (
        <p style={{ color: C.danger }}>{error}</p>
      ) : runs.length === 0 ? (
        <p style={{ color: C.muted }}>
          No runs yet. Trigger one from the{" "}
          <Link href="/scenarios" style={{ color: C.accent, textDecoration: "underline" }}>Scenarios</Link> page.
        </p>
      ) : (
        <div className="flex-1 min-h-0" style={{ border: `1px solid ${C.border}`, overflow: "hidden" }}>
          <table className="w-full" style={{ tableLayout: "fixed", fontSize: bodySize }}>
            <colgroup>
              <col style={{ width: 80 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 220 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 70 }} />
              <col />
            </colgroup>
            <thead>
              <tr style={{ background: C.surfaceHi, borderBottom: `1px solid ${C.border}` }}>
                <th className={thClass} style={thStyle}>Run ID</th>
                <th className={thClass} style={thStyle}>Scenario</th>
                <th className={thClass} style={thStyle}>Env</th>
                <th className={thClass} style={thStyle}>VINs / Genuine Care</th>
                <th className={thClass} style={thStyle}>Config ID</th>
                <th className={thClass} style={thStyle}>Order ID</th>
                <th className={thClass} style={thStyle}>PDFs</th>
                <th className={thClass} style={thStyle}>Status</th>
                <th className={thClass} style={thStyle}>Started</th>
                <th className={thClass} style={thStyle}>Duration</th>
                <th className={thClass} style={thStyle}>Details</th>
              </tr>
            </thead>
            <tbody>
              {pagedRuns.map((run, i) => (
                <tr key={run.id} style={{
                  background: i % 2 === 0 ? C.surface : C.surfaceAlt,
                  borderBottom: `1px solid ${C.surfaceHi}`,
                }}>
                  {/* Run ID */}
                  <td className="px-4 py-3 whitespace-nowrap" style={{ ...tdTop, color: C.muted }}>
                    {fmtR(run.id)}
                  </td>

                  {/* Scenario */}
                  <td className="px-4 py-3" style={tdTop}>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ color: C.muted }}>{fmtS(run.scenario_id)}</span>
                      <span className="font-medium" style={{ color: C.secondary }}>{run.scenario_name}</span>
                    </div>
                  </td>

                  {/* Environment badge */}
                  <td className="px-4 py-3" style={tdTop}>
                    <span style={{ ...tagStyle, color: run.environment === "Stage" ? C.warning : C.accent }}>
                      {run.environment}
                    </span>
                    <br />
                    <span style={{ ...tagStyle, color: C.muted, marginTop: 4, display: "inline-block" }}>
                      {run.brand} · {run.country}
                    </span>
                  </td>

                  {/* VINs + GC type */}
                  <td className="px-4 py-3" style={tdTop}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {run.vins.map((v, idx) => (
                        <div key={v} style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                          <span style={{ color: vinColor(v, run.status, run.result_json), fontFamily: mono }}>
                            {v}
                          </span>
                          <span style={{ ...tagStyle, color: C.muted }}>
                            {run.gc_options?.[idx] ?? "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </td>

                  {/* Config ID */}
                  <td className="px-4 py-3" style={tdTop}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {run.vins.map((v) => {
                        const cfg = getConfig(v, run.result_json);
                        if (!cfg) return <span key={v} style={{ color: C.muted }}>—</span>;
                        const isConfigId = /^CONFIG\d+$/i.test(cfg.id);
                        const configHref = isConfigId && cfg.url
                          ? (cfg.url.includes("?") ? cfg.url : `${cfg.url}?isRetrieved=true`)
                          : null;
                        const queuedUrl = orderQueuedUrl(v, run.result_json);
                        return (
                          <span key={v} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            {configHref ? (
                              <a href={configHref} target="_blank" rel="noopener noreferrer"
                                title={queuedUrl ? "Order still queued — not confirmed" : undefined}
                                style={{ color: queuedUrl ? C.warning : C.accent, textDecoration: "underline", fontFamily: mono, fontSize: 11 }}>
                                {cfg.id}
                              </a>
                            ) : (
                              <span title={queuedUrl ? "Order still queued — not confirmed" : undefined}
                                style={{ color: queuedUrl ? C.warning : C.secondary, fontFamily: mono, fontSize: 11 }}>
                                {cfg.id}
                              </span>
                            )}
                            {queuedUrl && (
                              <a href={queuedUrl} target="_blank" rel="noopener noreferrer"
                                title="Open order in CPQ to place manually"
                                style={{
                                  background: "none", border: `1px solid ${C.warning}`, color: C.warning,
                                  borderRadius: 2, padding: "0px 5px", fontSize: 10,
                                  fontFamily: mono, lineHeight: "16px", textDecoration: "none",
                                }}>
                                ↗
                              </a>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </td>

                  {/* Order ID */}
                  <td className="px-4 py-3" style={tdTop}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {run.vins.map((v) => {
                        const orderId = run.order_ids?.[v];
                        if (!orderId) return <span key={v} style={{ color: C.muted }}>—</span>;
                        if (orderId === "config test only") {
                          return <span key={v} style={{ color: C.muted, fontSize: 10, fontFamily: mono }}>config test only</span>;
                        }
                        const pdfMissing = orderPdfMissing(v, run.result_json);
                        if (!pdfMissing) {
                          return <span key={v} style={{ color: C.success, fontFamily: mono, fontSize: 11 }}>{orderId}</span>;
                        }
                        const key = `${run.id}:${v}`;
                        const rs = pdfRetry[key] ?? "idle";
                        return (
                          <span key={v} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <span style={{ color: C.warning, fontFamily: mono, fontSize: 11 }}
                              title="Order placed — PDFs not downloaded">{orderId}</span>
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
                                  borderRadius: 2, padding: "0px 5px", fontSize: 10, cursor: "pointer",
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
                  <td className="px-4 py-3" style={tdTop}>
                    {run.pdf_url ? (
                      <a href={run.pdf_url} target="_blank" rel="noopener noreferrer"
                        style={{ color: C.accent, textDecoration: "underline", fontFamily: mono, fontSize: 11 }}>
                        ZIP
                      </a>
                    ) : (
                      <span style={{ color: C.muted }}>—</span>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3" style={tdTop}>
                    <StatusBadge status={run.status} />
                  </td>

                  {/* Started */}
                  <td className="px-4 py-3" style={{ ...tdTop, color: C.secondary }}>
                    {fmtDateTime(run.created_at)}
                  </td>

                  {/* Duration */}
                  <td className="px-4 py-3" style={{ ...tdTop, color: C.secondary }}>
                    <Duration start={run.created_at} end={run.finished_at} live={run.status === "pending" && stoppingId !== run.id} />
                  </td>

                  {/* Details / Stop */}
                  <td className="px-4 py-3" style={tdTop}>
                    {run.status === "pending" ? (
                      <button
                        onClick={() => handleStop(run.id)}
                        disabled={stoppingId === run.id}
                        style={{
                          background: "none", color: C.warning, border: `1px solid ${C.warning}`,
                          borderRadius: 2, padding: "3px 8px", fontSize: 11,
                          fontFamily: mono, cursor: stoppingId === run.id ? "not-allowed" : "pointer",
                          opacity: stoppingId === run.id ? 0.5 : 1, whiteSpace: "nowrap",
                        }}>
                        {stoppingId === run.id ? "Stopping…" : "Stop"}
                      </button>
                    ) : (
                      <a href={`/runs/${run.id}`} target="_blank" rel="noopener noreferrer"
                        className="font-medium"
                        style={{ color: C.accent, textDecoration: "underline", fontSize: 11 }}>
                        Details
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={page} totalPages={totalPages}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
          />
        </div>
      )}
    </main>
  );
}
