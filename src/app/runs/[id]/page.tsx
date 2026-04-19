"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { use } from "react";
import { C, bodySize, STATUS_CONFIG, thStyle, thClass, tdTop } from "@/lib/design";

type StepResult = {
  step: string;
  passed: boolean;
  hadManualSpec?: boolean;
  manualSpecs?: string[];
  configId?: string;
  configUrl?: string;
  orderId?: string;
  orderQueued?: boolean;
  error?: string;
  url?: string;
  durationMs?: number;
  screenshotUrl?: string;
};

type Run = {
  id: string;
  scenario_id: string;
  scenario_name: string;
  vins: string[];
  status: "pending" | "complete" | "failed" | "stopped";
  result_json: StepResult[] | null;
  pdf_url: string | null;
  created_at: string;
  finished_at: string | null;
};

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
  if (!live) return <>{"\u2014"}</>;
  return <>{formatMs(now - new Date(start).getTime())}</>;
}

function fmtR(id: string) {
  return `R-${id.slice(0, 6)}`;
}

function fmtS(id: string) {
  return `S-${id.slice(0, 6)}`;
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: Run["status"] }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className="inline-flex items-center justify-center py-1 text-[10px] font-semibold uppercase tracking-wider"
      style={{
        borderLeft: `3px solid ${cfg.border}`,
        background: cfg.bg,
        color: cfg.color,
        width: 88,
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {status === "pending" && (
        <span
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(90deg, transparent 0%, ${cfg.border} 50%, transparent 100%)`,
            opacity: 0.3,
            animation: "fill-lr 2s ease-in-out infinite",
          }}
        />
      )}
      <span style={{ position: "relative" }}>{({ pending: "running", complete: "completed", stopped: "stopped", failed: "failed" } as Record<string, string>)[status] ?? status}</span>
    </span>
  );
}

function PdfIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "inline-block", verticalAlign: "middle", marginRight: 4 }}
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function VinLegend() {
  const items: { color: string; line1: string; line2?: string }[] = [
    { color: C.success, line1: "completed", line2: "(all specs pre-populated based on sales codes)" },
    { color: C.warning, line1: "completed", line2: "(one or more specs selected manually, see logs)" },
    { color: C.danger, line1: "not completed", line2: "(see logs)" },
  ];
  return (
    <div
      className="flex items-start gap-6 px-4 py-3 mb-3"
      style={{ background: C.surface, border: `1px solid ${C.border}`, fontSize: 11 }}
    >
      <span
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: C.secondary, flexShrink: 0, paddingTop: 1 }}
      >
        VIN colors
      </span>
      {items.map((item) => (
        <span key={item.color} className="flex flex-col" style={{ color: item.color }}>
          <span>{item.line1}</span>
          {item.line2 && <span>{item.line2}</span>}
        </span>
      ))}
    </div>
  );
}

/**
 * Match a VIN from a step string like "[VKKMB8…5030] VIN search".
 * The Playwright script uses vinLabel() which shortens VINs > 12 chars
 * to first6…last4.
 */
function matchVinFromStep(stepText: string, vins: string[]): string | null {
  const m = stepText.match(/^\[([^\]]+)\]/);
  if (!m) return null;
  const label = m[1];

  for (const vin of vins) {
    if (label === vin) return vin;
    if (vin.length > 12) {
      const short = `${vin.slice(0, 6)}\u2026${vin.slice(-4)}`;
      if (label === short) return vin;
      const shortDots = `${vin.slice(0, 6)}…${vin.slice(-4)}`;
      if (label === shortDots) return vin;
    }
    if (label.startsWith(vin.slice(0, 6)) && label.endsWith(vin.slice(-4))) return vin;
  }
  return null;
}

/** Determine VIN color based on steps in result_json */
function vinColor(vin: string, status: Run["status"], steps: StepResult[] | null, vins: string[]): string {
  if (status === "pending" || status === "stopped") return C.muted;
  if (!steps || steps.length === 0) return status === "failed" ? C.danger : C.muted;
  const vinSteps = steps.filter((s) => matchVinFromStep(s.step, [vin]) === vin);
  if (vinSteps.length === 0) return C.muted;
  if (vinSteps.some((s) => !s.passed)) return C.danger;
  if (vinSteps.some((s) => s.hadManualSpec)) return C.warning;
  return C.success;
}

/** Get config ID and URL for a VIN from its steps — prefer CONFIG\d+ format over UUID */
function getConfig(vin: string, steps: StepResult[] | null, vins: string[]): { id: string; url?: string } | null {
  if (!steps) return null;
  const vinSteps = steps.filter((s) => matchVinFromStep(s.step, [vin]) === vin);
  const last = [...vinSteps].reverse().find((s) => s.configId && /^CONFIG\d+$/i.test(s.configId));
  if (last) return { id: last.configId!, url: last.configUrl };
  const first = vinSteps.find((s) => s.configId);
  if (first) return { id: first.configId!, url: first.configUrl };
  return null;
}

/** Color for a single step */
function stepColor(step: StepResult): string {
  if (!step.passed) return C.danger;
  if (step.hadManualSpec) return C.warning;
  return C.success;
}

export default function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [jsonOpen, setJsonOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function handleCopyClaudeCommand(runId: string) {
    const url = `${window.location.origin}/api/share/${runId}`;
    const command = `Analyze this CPQ NA Webtester run and tell me what went wrong, which steps failed, and where the delays are: ${url}`;
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const fetchRun = useCallback(() => {
    return fetch(`/api/runs/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Run not found");
        return r.json();
      })
      .then(setRun)
      .catch(() => setError("Could not load run details."));
  }, [id]);

  useEffect(() => {
    fetchRun().finally(() => setLoading(false));
  }, [fetchRun]);

  // Poll every 5s while run is pending/running
  useEffect(() => {
    const isActive = run && run.status === "pending";
    if (isActive && !pollRef.current) {
      pollRef.current = setInterval(fetchRun, 5000);
    } else if (!isActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [run, fetchRun]);

  return (
    <main
      className="flex flex-col px-6 py-4 overflow-hidden"
      style={{ height: "100vh", maxWidth: 1200, background: C.bg, color: C.secondary, fontSize: bodySize }}
    >
      {loading ? (
        <p style={{ color: C.muted }}>Loading&hellip;</p>
      ) : error ? (
        <p style={{ color: C.danger }}>{error}</p>
      ) : run ? (
        <>
          <h1
            className="mb-3 text-2xl font-bold tracking-tight flex-shrink-0"
            style={{ color: C.primary }}
          >
            Run Details
          </h1>

          <div className="flex-shrink-0"><VinLegend /></div>

          {/* Compact header */}
          <div
            className="mb-3 p-4 flex-shrink-0"
            style={{ background: C.surface, border: `1px solid ${C.border}` }}
          >
            <div className="flex items-start gap-x-8">
              <div>
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: C.secondary }}
                >
                  Run ID
                </span>
                <div className="flex items-center gap-2">
                  <p style={{ color: C.muted }}>{fmtR(run.id)}</p>
                  <button
                    onClick={() => handleCopyClaudeCommand(run.id)}
                    title="Copy prompt for Claude Code analysis"
                    style={{
                      background: copied ? "rgba(59,130,246,0.15)" : C.inputBg,
                      border: `1px solid ${copied ? C.accent : C.inputBdr}`,
                      color: copied ? C.accent : C.muted,
                      borderRadius: 3, padding: "2px 7px",
                      fontSize: 10, fontFamily: "inherit", cursor: "pointer",
                      whiteSpace: "nowrap", transition: "all 0.15s",
                    }}
                  >
                    {copied ? "Copied!" : "Copy for Claude"}
                  </button>
                </div>
              </div>
              <div>
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: C.secondary }}
                >
                  Scenario
                </span>
                <div className="flex flex-col">
                  <span style={{ color: C.muted }}>
                    {fmtS(run.scenario_id)}
                  </span>
                  <span style={{ color: C.secondary }}>
                    {run.scenario_name}
                  </span>
                </div>
              </div>
              <div>
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: C.secondary }}
                >
                  VINs
                </span>
                <div className="flex flex-col gap-0.5">
                  {run.vins.map((v) => (
                    <span
                      key={v}
                      style={{ color: vinColor(v, run.status, run.result_json, run.vins) }}
                    >
                      {v}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: C.secondary }}
                >
                  Config ID
                </span>
                <div className="flex flex-col gap-0.5">
                  {run.vins.map((v) => {
                    const cfg = getConfig(v, run.result_json, run.vins);
                    if (!cfg) return <span key={v} style={{ color: C.muted }}>{"\u2014"}</span>;
                    const isConfigId = /^CONFIG\d+$/i.test(cfg.id);
                    const configHref = isConfigId && cfg.url
                      ? (cfg.url.includes("?") ? cfg.url : `${cfg.url}?isRetrieved=true`)
                      : null;
                    return configHref ? (
                      <a
                        key={v}
                        href={configHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: C.accent, textDecoration: "underline" }}
                      >
                        {cfg.id}
                      </a>
                    ) : (
                      <span key={v} style={{ color: C.secondary }}>{cfg.id}</span>
                    );
                  })}
                </div>
              </div>
              <div>
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: C.secondary }}
                >
                  Status
                </span>
                <p className="mt-0.5">
                  <StatusBadge status={run.status} />
                </p>
              </div>
              <div>
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: C.secondary }}
                >
                  Started
                </span>
                <p style={{ color: C.secondary }}>
                  {fmtDateTime(run.created_at)}
                </p>
              </div>
              <div>
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: C.secondary }}
                >
                  Duration
                </span>
                <p style={{ color: C.secondary }}>
                  <Duration
                    start={run.created_at}
                    end={run.finished_at}
                    live={run.status === "pending"}
                  />
                </p>
              </div>
              {run.pdf_url && (
                <div style={{ marginLeft: "auto" }}>
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: "transparent" }}
                  >
                    &nbsp;
                  </span>
                  <p className="mt-0.5">
                    <a
                      href={run.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-3 py-1.5 text-xs font-medium"
                      style={{
                        background: "transparent",
                        color: C.secondary,
                        border: `1px solid ${C.border}`,
                        borderLeft: `3px solid ${C.accent}`,
                        borderRadius: 2,
                        whiteSpace: "nowrap",
                        textDecoration: "none",
                      }}
                    >
                      <PdfIcon />
                      Download PDFs
                    </a>
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Steps list */}
          {run.result_json && run.result_json.length > 0 ? (
            <div className="flex-1 min-h-0 overflow-auto" style={{ border: `1px solid ${C.border}` }}>
              <table className="w-full" style={{ fontSize: bodySize }}>
                <thead className="sticky top-0 z-10">
                  <tr style={{ background: C.surfaceHi, borderBottom: `1px solid ${C.border}` }}>
                    <th className={thClass} style={{ ...thStyle, width: 100 }}>Step</th>
                    <th className={`${thClass} w-10`} style={thStyle}>Result</th>
                    <th className={thClass} style={{ ...thStyle, width: 70 }}>Duration</th>
                    <th className={thClass} style={thStyle}>Description</th>
                    <th className={thClass} style={{ ...thStyle, width: 220 }}>URL</th>
                  </tr>
                </thead>
                <tbody>
                  {run.result_json.map((step, i) => {
                    const color = stepColor(step);
                    return (
                      <tr
                        key={i}
                        style={{
                          background: i % 2 === 0 ? C.surface : C.surfaceAlt,
                          borderBottom: `1px solid ${C.surfaceHi}`,
                        }}
                      >
                        <td
                          className="px-4 py-2.5"
                          style={{ ...tdTop, color: C.muted }}
                        >
                          {fmtR(run.id)}-{String(i + 1).padStart(4, "0")}
                        </td>
                        <td className="px-4 py-2.5 text-center" style={tdTop}>
                          {step.passed ? (
                            <span className="text-base" style={{ color }} title="Passed">
                              &#10003;
                            </span>
                          ) : (
                            <span className="text-base" style={{ color }} title="Failed">
                              &#10007;
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5" style={{ ...tdTop, color: C.muted, fontVariantNumeric: "tabular-nums" }}>
                          {step.durationMs != null
                            ? step.durationMs >= 60000
                              ? `${Math.floor(step.durationMs / 60000)}m ${Math.round((step.durationMs % 60000) / 1000)}s`
                              : `${(step.durationMs / 1000).toFixed(1)}s`
                            : "—"}
                        </td>
                        <td className="px-4 py-2.5" style={{ ...tdTop, color }}>
                          {step.step}
                          {step.error && (
                            <p className="mt-0.5 text-xs break-words" style={{ color: C.danger }}>
                              {step.error}
                            </p>
                          )}
                          {step.orderQueued && step.url && (
                            <div className="mt-1.5 flex items-center gap-2">
                              <span className="text-xs" style={{ color: C.warning }}>
                                Order queued — not confirmed after 3 attempts
                              </span>
                              <a
                                href={step.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center px-2 py-0.5 text-xs font-medium"
                                style={{
                                  background: "transparent",
                                  color: C.warning,
                                  border: `1px solid ${C.warning}`,
                                  borderRadius: 2,
                                  textDecoration: "none",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                Open in CPQ &rarr;
                              </a>
                            </div>
                          )}
                          {step.screenshotUrl && (
                            <a
                              href={step.screenshotUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 inline-block text-xs"
                              style={{ color: C.accent, textDecoration: "underline" }}
                            >
                              View screenshot
                            </a>
                          )}
                        </td>
                        <td className="px-4 py-2.5" style={{ ...tdTop, color: C.muted, fontSize: 10, wordBreak: "break-all" }}>
                          {step.url
                            ? (() => { try { return new URL(step.url).pathname; } catch { return step.url; } })()
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div
              className="p-4"
              style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.muted }}
            >
              {run.status === "pending"
                ? "Test is still running \u2014 results will appear here when complete."
                : "No step results recorded."}
            </div>
          )}

          {/* Raw JSON toggle */}
          {run.result_json && (
            <div className="mt-3 flex-shrink-0" style={{ border: `1px solid ${C.border}`, overflow: "hidden" }}>
              <button
                onClick={() => setJsonOpen((o) => !o)}
                className="flex w-full items-center justify-between px-4 py-3 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: C.secondary, background: C.surfaceHi }}
              >
                Raw JSON
                <span style={{ color: C.muted }}>{jsonOpen ? "\u25B2" : "\u25BC"}</span>
              </button>
              {jsonOpen && (
                <pre
                  className="overflow-x-auto px-4 py-3 text-xs"
                  style={{ background: C.surface, color: C.secondary, borderTop: `1px solid ${C.border}` }}
                >
                  {JSON.stringify(run.result_json, null, 2)}
                </pre>
              )}
            </div>
          )}
        </>
      ) : null}
    </main>
  );
}
