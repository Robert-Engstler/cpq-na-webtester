"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { C, bodySize, STATUS_CONFIG, thStyle, thClass, tdTop } from "@/lib/design";

type StepResult = {
  step: string;
  passed: boolean;
  hadManualSpec?: boolean;
  manualSpecs?: string[];
  configId?: string;
  configUrl?: string;
  error?: string;
};

type Run = {
  id: string;
  scenario_id: string;
  scenario_name: string;
  vins: string[];
  language: string;
  status: "pending" | "complete" | "failed";
  pdf_url: string | null;
  result_json: StepResult[] | null;
  created_at: string;
  finished_at: string | null;
};

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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
  if (!live) return <>{"\u2014"}</>;
  return <>{formatMs(now - new Date(start).getTime())}</>;
}

function fmtR(id: string) {
  return `R-${id.slice(0, 6)}`;
}

function fmtS(id: string) {
  return `S-${id.slice(0, 6)}`;
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
      <span style={{ position: "relative" }}>{({ pending: "running", complete: "completed" } as Record<string, string>)[status] ?? status}</span>
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
      className="flex items-start gap-6 px-4 py-3 mb-4"
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
 * Extract VIN from a step string like "[VKKM…5030] VIN search"
 * The script uses vinLabel() which shortens to first6…last4, but we need
 * to match against the full VIN list. Match by checking if the step prefix
 * contains the first few or last few chars of any VIN.
 */
function matchVinFromStep(stepText: string, vins: string[]): string | null {
  // Step format: "[VKKMB8…5030] ..." or "[VKKMB820VLB345030] ..."
  const m = stepText.match(/^\[([^\]]+)\]/);
  if (!m) return null;
  const label = m[1]; // e.g. "VKKMB8…5030" or full VIN

  for (const vin of vins) {
    // Exact match
    if (label === vin) return vin;
    // Label is shortened: first6…last4
    if (vin.length > 12) {
      const short = `${vin.slice(0, 6)}\u2026${vin.slice(-4)}`;
      if (label === short) return vin;
      // Also try ellipsis variants
      const shortDots = `${vin.slice(0, 6)}…${vin.slice(-4)}`;
      if (label === shortDots) return vin;
    }
    // Prefix/suffix match as fallback
    if (label.startsWith(vin.slice(0, 6)) && label.endsWith(vin.slice(-4))) return vin;
  }
  return null;
}

/** Determine VIN color based on steps in result_json */
function vinColor(
  vin: string,
  status: Run["status"],
  steps: StepResult[] | null,
  vins: string[]
): string {
  if (status === "pending") return C.muted;
  if (!steps || steps.length === 0) return status === "failed" ? C.danger : C.muted;

  const vinSteps = steps.filter((s) => matchVinFromStep(s.step, [vin]) === vin);
  if (vinSteps.length === 0) return C.muted;
  if (vinSteps.some((s) => !s.passed)) return C.danger;
  if (vinSteps.some((s) => s.hadManualSpec)) return C.warning;
  return C.success;
}

/** Get config ID and URL for a VIN from its steps */
function getConfig(vin: string, steps: StepResult[] | null, vins: string[]): { id: string; url?: string } | null {
  if (!steps) return null;
  const vinSteps = steps.filter((s) => matchVinFromStep(s.step, [vin]) === vin);
  for (const s of vinSteps) {
    if (s.configId) return { id: s.configId, url: s.configUrl };
  }
  return null;
}

function Pagination({
  page,
  totalPages,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div
      className="flex items-center justify-between px-4 py-3"
      style={{ borderTop: `1px solid ${C.border}`, color: C.secondary, fontSize: bodySize }}
    >
      <button
        onClick={onPrev}
        disabled={page <= 1}
        className="px-3 py-1.5 text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed"
        style={{
          border: `1px solid ${C.border}`,
          color: C.secondary,
          background: "transparent",
          borderRadius: 2,
        }}
      >
        &larr; Previous
      </button>
      <span>
        Page {page} of {totalPages}
      </span>
      <button
        onClick={onNext}
        disabled={page >= totalPages}
        className="px-3 py-1.5 text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed"
        style={{
          border: `1px solid ${C.border}`,
          color: C.secondary,
          background: "transparent",
          borderRadius: 2,
        }}
      >
        Next &rarr;
      </button>
    </div>
  );
}

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 5;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRuns = useCallback(() => {
    return fetch("/api/runs")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load runs");
        return r.json();
      })
      .then(setRuns)
      .catch(() => setError("Could not load runs. Please refresh."));
  }, []);

  useEffect(() => {
    fetchRuns().finally(() => setLoading(false));
  }, [fetchRuns]);

  // Poll every 5s while any run is pending/running
  useEffect(() => {
    const hasActive = runs.some((r) => r.status === "pending");
    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(fetchRuns, 5000);
    } else if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [runs, fetchRuns]);

  const totalPages = Math.ceil(runs.length / perPage);
  const pagedRuns = runs.slice((page - 1) * perPage, page * perPage);

  return (
    <main
      className="flex flex-col px-6 py-4 overflow-hidden"
      style={{ height: "calc(100vh - 49px)", maxWidth: 1400, background: C.bg, color: C.secondary, fontSize: bodySize }}
    >
      <h1
        className="mb-3 text-2xl font-bold tracking-tight flex-shrink-0"
        style={{ color: C.primary }}
      >
        Runs
      </h1>

      <div className="flex-shrink-0"><VinLegend /></div>

      {loading ? (
        <p style={{ color: C.muted }}>Loading&hellip;</p>
      ) : error ? (
        <p style={{ color: C.danger }}>{error}</p>
      ) : runs.length === 0 ? (
        <p style={{ color: C.muted }}>
          No runs yet. Trigger one from the{" "}
          <Link href="/scenarios" style={{ color: C.accent, textDecoration: "underline" }}>
            Scenarios
          </Link>{" "}
          page.
        </p>
      ) : (
        <div className="flex-1 min-h-0" style={{ border: `1px solid ${C.border}`, overflow: "hidden" }}>
          <table className="w-full" style={{ tableLayout: "fixed", fontSize: bodySize }}>
            <colgroup>
              <col style={{ width: 90 }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 210 }} />
              <col style={{ width: 170 }} />
              <col style={{ width: 105 }} />
              <col style={{ width: 155 }} />
              <col style={{ width: 80 }} />
              <col />
            </colgroup>
            <thead>
              <tr style={{ background: C.surfaceHi, borderBottom: `1px solid ${C.border}` }}>
                <th className={thClass} style={thStyle}>Run ID</th>
                <th className={thClass} style={thStyle}>Scenario</th>
                <th className={thClass} style={thStyle}>VINs</th>
                <th className={thClass} style={thStyle}>Config ID</th>
                <th className={thClass} style={thStyle}>Status</th>
                <th className={thClass} style={thStyle}>Started</th>
                <th className={thClass} style={thStyle}>Duration</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {pagedRuns.map((run, i) => (
                <tr
                  key={run.id}
                  style={{
                    background: i % 2 === 0 ? C.surface : C.surfaceAlt,
                    borderBottom: `1px solid ${C.surfaceHi}`,
                  }}
                >
                  <td
                    className="px-4 py-3 whitespace-nowrap"
                    style={{ ...tdTop, color: C.muted }}
                  >
                    {fmtR(run.id)}
                  </td>
                  <td className="px-4 py-3" style={tdTop}>
                    <div className="flex flex-col">
                      <span style={{ color: C.muted }}>
                        {fmtS(run.scenario_id)}
                      </span>
                      <span className="font-medium" style={{ color: C.secondary }}>
                        {run.scenario_name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3" style={tdTop}>
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
                  </td>
                  <td className="px-4 py-3" style={tdTop}>
                    <div className="flex flex-col gap-0.5">
                      {run.vins.map((v) => {
                        const cfg = getConfig(v, run.result_json, run.vins);
                        return cfg ? (
                          <a
                            key={v}
                            href={cfg.url ?? "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: C.accent, textDecoration: "underline" }}
                          >
                            {cfg.id}
                          </a>
                        ) : (
                          <span key={v} style={{ color: C.muted }}>{"\u2014"}</span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3" style={tdTop}>
                    <StatusBadge status={run.status} />
                  </td>
                  <td className="px-4 py-3" style={{ ...tdTop, color: C.secondary }}>
                    {fmtDateTime(run.created_at)}
                  </td>
                  <td className="px-4 py-3" style={{ ...tdTop, color: C.secondary }}>
                    <Duration
                      start={run.created_at}
                      end={run.finished_at}
                      live={run.status === "pending"}
                    />
                  </td>
                  <td className="px-4 py-3" style={tdTop}>
                    <div className="flex items-start" style={{ gap: 12 }}>
                      {run.status !== "pending" ? (
                        <a
                          href={`/runs/${run.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium"
                          style={{ color: C.accent, textDecoration: "underline", width: 56, flexShrink: 0 }}
                        >
                          Details
                        </a>
                      ) : (
                        <span style={{ width: 56, flexShrink: 0 }} />
                      )}
                      <span style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
                        {run.pdf_url && (
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
                        )}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={page}
            totalPages={totalPages}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
          />
        </div>
      )}
    </main>
  );
}
