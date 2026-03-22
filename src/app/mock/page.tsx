"use client";

import { useState } from "react";

/* ─── Mock Data ────────────────────────────────────────────────── */

const SCENARIOS = [
  {
    seqId: 1,
    description: "UK Massey Ferguson single VIN",
    vins: ["VKKMB820VLB345030"],
    createdAt: "2025-12-01T10:30:00Z",
  },
  {
    seqId: 2,
    description: "DE Fendt 2-VIN comparison",
    vins: ["VKKMW61SPKB168032", "VKKMT41S2KB160119"],
    createdAt: "2025-12-05T14:15:00Z",
  },
  {
    seqId: 3,
    description: "UK Valtra 3-VIN batch",
    vins: ["VKKMB820VLB345030", "VKKMW61SPKB168032", "VKKMT41S2KB160119"],
    createdAt: "2026-01-10T09:00:00Z",
  },
  {
    seqId: 4,
    description: "Full 5-VIN regression suite",
    vins: [
      "VKKMB820VLB345030",
      "VKKMW61SPKB168032",
      "VKKMT41S2KB160119",
      "VKKNA82HPNB200045",
      "VKKNC93JQNB300078",
    ],
    createdAt: "2026-02-20T16:45:00Z",
  },
  {
    seqId: 5,
    description: "DE Massey Ferguson 2-VIN",
    vins: ["VKKMB820VLB345030", "VKKNA82HPNB200045"],
    createdAt: "2026-02-22T08:00:00Z",
  },
  {
    seqId: 6,
    description: "UK Fendt single VIN smoke test",
    vins: ["VKKMW61SPKB168032"],
    createdAt: "2026-02-25T11:30:00Z",
  },
];

type RunStatus = "pending" | "running" | "complete" | "failed";

type RunStep = {
  stepNum: number;
  vin: string;
  text: string;
  passed: boolean | null; // null = not yet executed
  hadManualSpec?: boolean; // true if a spec dropdown was not pre-populated
};

const RUNS: {
  seqId: number;
  scenarioSeqId: number;
  scenarioDescription: string;
  vins: string[];
  status: RunStatus;
  pdfUrl: string | null;
  createdAt: string;
  steps: RunStep[];
}[] = [
  {
    seqId: 1,
    scenarioSeqId: 1,
    scenarioDescription: "UK Massey Ferguson single VIN",
    vins: ["VKKMB820VLB345030"],
    status: "complete",
    pdfUrl: "https://blob.vercel-storage.com/pdfs/run-1.zip",
    createdAt: "2025-12-02T08:00:00Z",
    steps: [
      { stepNum: 1, vin: "VKKMB820VLB345030", text: "[VKKMB820VLB345030] VIN search", passed: true },
      { stepNum: 2, vin: "VKKMB820VLB345030", text: "[VKKMB820VLB345030] Select Maintenance service", passed: true },
      { stepNum: 3, vin: "VKKMB820VLB345030", text: "[VKKMB820VLB345030] Configure options", passed: true },
      { stepNum: 4, vin: "VKKMB820VLB345030", text: "[VKKMB820VLB345030] Generate quote PDF", passed: true },
    ],
  },
  {
    seqId: 2,
    scenarioSeqId: 2,
    scenarioDescription: "DE Fendt 2-VIN comparison",
    vins: ["VKKMW61SPKB168032", "VKKMT41S2KB160119"],
    status: "complete",
    pdfUrl: "https://blob.vercel-storage.com/pdfs/run-2.zip",
    createdAt: "2025-12-06T10:30:00Z",
    steps: [
      { stepNum: 1, vin: "VKKMW61SPKB168032", text: "[VKKMW61SPKB168032] VIN search", passed: true },
      { stepNum: 2, vin: "VKKMW61SPKB168032", text: "[VKKMW61SPKB168032] Select Maintenance service", passed: true },
      { stepNum: 3, vin: "VKKMW61SPKB168032", text: "[VKKMW61SPKB168032] Configure options", passed: true },
      { stepNum: 4, vin: "VKKMW61SPKB168032", text: "[VKKMW61SPKB168032] Generate quote PDF", passed: true },
      { stepNum: 5, vin: "VKKMT41S2KB160119", text: "[VKKMT41S2KB160119] VIN search", passed: true },
      { stepNum: 6, vin: "VKKMT41S2KB160119", text: "[VKKMT41S2KB160119] Select Maintenance service", passed: true },
      { stepNum: 7, vin: "VKKMT41S2KB160119", text: "[VKKMT41S2KB160119] Configure options — manual spec selection: Engine Type", passed: true, hadManualSpec: true },
      { stepNum: 8, vin: "VKKMT41S2KB160119", text: "[VKKMT41S2KB160119] Generate quote PDF", passed: true },
    ],
  },
  {
    seqId: 3,
    scenarioSeqId: 3,
    scenarioDescription: "UK Valtra 3-VIN batch",
    vins: ["VKKMB820VLB345030", "VKKMW61SPKB168032", "VKKMT41S2KB160119"],
    status: "complete",
    pdfUrl: "https://blob.vercel-storage.com/pdfs/run-3.zip",
    createdAt: "2026-01-11T11:00:00Z",
    steps: [
      { stepNum: 1, vin: "VKKMB820VLB345030", text: "[VKKMB820VLB345030] VIN search", passed: true },
      { stepNum: 2, vin: "VKKMB820VLB345030", text: "[VKKMB820VLB345030] Select Maintenance service", passed: true },
      { stepNum: 3, vin: "VKKMB820VLB345030", text: "[VKKMB820VLB345030] Configure options", passed: true },
      { stepNum: 4, vin: "VKKMB820VLB345030", text: "[VKKMB820VLB345030] Generate quote PDF", passed: true },
      { stepNum: 5, vin: "VKKMW61SPKB168032", text: "[VKKMW61SPKB168032] VIN search", passed: true },
      { stepNum: 6, vin: "VKKMW61SPKB168032", text: "[VKKMW61SPKB168032] Select Maintenance service", passed: false },
      { stepNum: 7, vin: "VKKMW61SPKB168032", text: "[VKKMW61SPKB168032] Configure options", passed: false },
      { stepNum: 8, vin: "VKKMW61SPKB168032", text: "[VKKMW61SPKB168032] Generate quote PDF", passed: false },
      { stepNum: 9, vin: "VKKMT41S2KB160119", text: "[VKKMT41S2KB160119] VIN search", passed: true },
      { stepNum: 10, vin: "VKKMT41S2KB160119", text: "[VKKMT41S2KB160119] Select Maintenance service", passed: true },
      { stepNum: 11, vin: "VKKMT41S2KB160119", text: "[VKKMT41S2KB160119] Configure options — manual spec selection: Transmission Variant, Axle Configuration", passed: true, hadManualSpec: true },
      { stepNum: 12, vin: "VKKMT41S2KB160119", text: "[VKKMT41S2KB160119] Generate quote PDF", passed: true },
    ],
  },
  {
    seqId: 4,
    scenarioSeqId: 4,
    scenarioDescription: "Full 5-VIN regression suite",
    vins: [
      "VKKMB820VLB345030",
      "VKKMW61SPKB168032",
      "VKKMT41S2KB160119",
      "VKKNA82HPNB200045",
      "VKKNC93JQNB300078",
    ],
    status: "failed",
    pdfUrl: null,
    createdAt: "2026-02-21T08:00:00Z",
    steps: [
      { stepNum: 1, vin: "VKKMB820VLB345030", text: "[VKKMB820VLB345030] VIN search", passed: true },
      { stepNum: 2, vin: "VKKMB820VLB345030", text: "[VKKMB820VLB345030] Select Maintenance service", passed: false },
    ],
  },
  {
    seqId: 5,
    scenarioSeqId: 1,
    scenarioDescription: "UK Massey Ferguson single VIN",
    vins: ["VKKMB820VLB345030"],
    status: "running",
    pdfUrl: null,
    createdAt: "2026-02-24T14:00:00Z",
    steps: [
      { stepNum: 1, vin: "VKKMB820VLB345030", text: "[VKKMB820VLB345030] VIN search", passed: true },
      { stepNum: 2, vin: "VKKMB820VLB345030", text: "[VKKMB820VLB345030] Select Maintenance service", passed: null },
    ],
  },
  {
    seqId: 6,
    scenarioSeqId: 2,
    scenarioDescription: "DE Fendt 2-VIN comparison",
    vins: ["VKKMW61SPKB168032", "VKKMT41S2KB160119"],
    status: "running",
    pdfUrl: null,
    createdAt: "2026-02-24T14:05:00Z",
    steps: [],
  },
  {
    seqId: 7,
    scenarioSeqId: 3,
    scenarioDescription: "UK Valtra 3-VIN batch",
    vins: ["VKKMB820VLB345030", "VKKMW61SPKB168032", "VKKMT41S2KB160119"],
    status: "pending",
    pdfUrl: null,
    createdAt: "2026-02-25T09:00:00Z",
    steps: [],
  },
  {
    seqId: 8,
    scenarioSeqId: 4,
    scenarioDescription: "Full 5-VIN regression suite",
    vins: [
      "VKKMB820VLB345030",
      "VKKMW61SPKB168032",
      "VKKMT41S2KB160119",
      "VKKNA82HPNB200045",
      "VKKNC93JQNB300078",
    ],
    status: "pending",
    pdfUrl: null,
    createdAt: "2026-02-25T09:01:00Z",
    steps: [],
  },
];

/* ─── Helpers ──────────────────────────────────────────────────── */

function fmtS(n: number) {
  return `S-${String(n).padStart(7, "0")}`;
}
function fmtR(n: number) {
  return `R-${String(n).padStart(7, "0")}`;
}
function fmtStep(runSeq: number, stepNum: number) {
  return `${fmtR(runSeq)}-${String(stepNum).padStart(4, "0")}`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
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

/** Determine VIN color for a run: green / yellow / red / gray */
function vinColor(
  vin: string,
  status: RunStatus,
  steps: RunStep[]
): "green" | "yellow" | "red" | "gray" {
  if (status === "pending" || status === "running") return "gray";
  const vinSteps = steps.filter((s) => s.vin === vin);
  if (vinSteps.length === 0) return "gray";
  if (vinSteps.some((s) => s.passed === false)) return "red";
  if (vinSteps.every((s) => s.passed === true)) {
    if (vinSteps.some((s) => s.hadManualSpec)) return "yellow";
    return "green";
  }
  return "gray";
}

/* ─── Design Tokens (pure greyscale) ──────────────────────────── */

const C = {
  bg:         "#0d0d0d",
  surface:    "#1a1a1a",
  surfaceAlt: "#141414",
  surfaceHi:  "#222222",
  border:     "#2a2a2a",
  inputBg:    "#1e1e1e",
  inputBdr:   "#333333",
  muted:      "#666666",
  secondary:  "#999999",
  primary:    "#e5e5e5",
  accent:     "#3b82f6",
  success:    "#22c55e",
  danger:     "#ef4444",
  warning:    "#f59e0b",
  pending:    "#6b7280",
};

const mono = "'JetBrains Mono', monospace";
const bodySize = 13;

const VIN_COLOR_STYLE: Record<"green" | "yellow" | "red" | "gray", React.CSSProperties> = {
  green: { color: C.success },
  yellow: { color: C.warning },
  red: { color: C.danger },
  gray: { color: C.muted },
};

const STATUS_CONFIG: Record<
  RunStatus,
  { color: string; bg: string; border: string }
> = {
  pending:  { color: C.pending, bg: "rgba(107,114,128,0.1)", border: C.pending },
  running:  { color: C.warning, bg: "rgba(245,158,11,0.1)",  border: C.warning },
  complete: { color: C.success, bg: "rgba(34,197,94,0.1)",   border: C.success },
  failed:   { color: C.danger,  bg: "rgba(239,68,68,0.1)",   border: C.danger },
};

/* ─── PDF Icon (inline SVG) ───────────────────────────────────── */

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

/* ─── Pagination Component ─────────────────────────────────────── */

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

/* ─── Status Badge (fixed width) ──────────────────────────────── */

function StatusBadge({ status }: { status: RunStatus }) {
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
      }}
    >
      {status === "running" && (
        <span
          className="inline-block w-1.5 h-1.5 mr-1.5 rounded-full animate-pulse"
          style={{ background: cfg.color }}
        />
      )}
      {status}
    </span>
  );
}

/* ─── VIN Legend ────────────────────────────────────────────────── */

function VinLegend() {
  const items: { color: string; line1: string; line2?: string }[] = [
    { color: C.success, line1: "completed", line2: "(all specs pre-populated based on sales codes)" },
    { color: C.warning, line1: "completed", line2: "(one or more specs selected manually, see logs)" },
    { color: C.danger, line1: "not completed", line2: "(see logs)" },
  ];
  return (
    <div
      className="flex items-start gap-6 px-4 py-3 mb-6"
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        fontSize: 11,
      }}
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

/* ─── Shared styles ───────────────────────────────────────────── */

const thStyle: React.CSSProperties = { color: C.secondary };
const thClass = "px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider";
const tdTop: React.CSSProperties = { verticalAlign: "top" };

/* ─── Sort helper ──────────────────────────────────────────────── */

function sortByDateDesc<T extends { createdAt: string }>(arr: T[]): T[] {
  return [...arr].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/* ─── Main Page ────────────────────────────────────────────────── */

export default function MockPage() {
  const [scenarioPage, setScenarioPage] = useState(1);
  const [runPage, setRunPage] = useState(1);

  const scenariosPerPage = 5;
  const runsPerPage = 5;

  const sortedScenarios = sortByDateDesc(SCENARIOS);
  const sortedRuns = sortByDateDesc(RUNS);

  const scenarioTotalPages = Math.ceil(sortedScenarios.length / scenariosPerPage);
  const runTotalPages = Math.ceil(sortedRuns.length / runsPerPage);

  const pagedScenarios = sortedScenarios.slice(
    (scenarioPage - 1) * scenariosPerPage,
    scenarioPage * scenariosPerPage
  );
  const pagedRuns = sortedRuns.slice(
    (runPage - 1) * runsPerPage,
    runPage * runsPerPage
  );

  // Detail section shows the partial-fail run (seqId 3) — has green, yellow, and red VINs
  const detailRun = RUNS.find((r) => r.seqId === 3)!;

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />

      <main
        className="min-h-screen px-6 py-8"
        style={{
          maxWidth: 1200,
          background: C.bg,
          color: C.secondary,
          fontFamily: mono,
          fontSize: bodySize,
        }}
      >
        {/* Mock banner — small amber tag, top-right */}
        <div className="flex justify-end mb-6">
          <span
            className="inline-flex items-center px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider"
            style={{
              borderLeft: `3px solid ${C.warning}`,
              background: "rgba(245,158,11,0.1)",
              color: C.warning,
            }}
          >
            Mock Data
          </span>
        </div>

        {/* ─── Section 1: Scenarios ─────────────────────────────── */}
        <section>
          <h1
            className="mb-2 text-2xl font-bold tracking-tight"
            style={{ color: C.primary }}
          >
            CPQ MRO Runner
          </h1>
          <p
            className="mb-6"
            style={{ color: C.secondary, fontSize: 12, lineHeight: 1.6, maxWidth: 900 }}
          >
            Enter up to 5 VINs for fully automated CPQ Maintenance configuration in the
            background. The bot will execute VIN search, choose Maintenance and Single
            Service, go with any pre-populated options/specs selections (based on the
            VIN&apos;s sales codes) or select random specs if prompted, and select a random
            service interval. After saving the configuration, the bot will download the
            service checklist and parts picklist PDFs, then process the next VIN.
          </p>

          {/* Create form */}
          <div
            className="mb-8 p-6"
            style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
            }}
          >
            <h2
              className="mb-4 text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: C.secondary }}
            >
              Add Scenario
            </h2>
            <form
              onSubmit={(e) => e.preventDefault()}
              className="flex items-start gap-4"
            >
              <div className="flex items-start gap-4 flex-1">
                <div className="flex flex-col gap-1">
                  <label
                    className="text-[10px] font-medium uppercase tracking-wider"
                    style={{ color: C.secondary }}
                  >
                    Description
                  </label>
                  <textarea
                    placeholder="e.g. UK Massey Ferguson single VIN"
                    rows={5}
                    className="px-3 py-2 w-64 resize-y focus:outline-none"
                    style={{
                      background: C.inputBg,
                      border: `1px solid ${C.inputBdr}`,
                      color: C.secondary,
                      borderRadius: 2,
                      fontSize: bodySize,
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = C.accent;
                      e.currentTarget.style.boxShadow = `0 0 0 1px ${C.accent}`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = C.inputBdr;
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    className="text-[10px] font-medium uppercase tracking-wider"
                    style={{ color: C.secondary }}
                  >
                    VINs
                  </label>
                  <textarea
                    placeholder={"One VIN per line, max 5"}
                    rows={5}
                    className="px-3 py-2 w-64 resize-y focus:outline-none"
                    style={{
                      background: C.inputBg,
                      border: `1px solid ${C.inputBdr}`,
                      color: C.secondary,
                      borderRadius: 2,
                      fontSize: bodySize,
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = C.accent;
                      e.currentTarget.style.boxShadow = `0 0 0 1px ${C.accent}`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = C.inputBdr;
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                  <span className="text-[10px]" style={{ color: C.muted }}>
                    0/5 VINs
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label
                  className="text-[10px] font-medium uppercase tracking-wider"
                  style={{ color: "transparent" }}
                >
                  &nbsp;
                </label>
                <button
                  type="submit"
                  className="px-4 font-semibold"
                  style={{
                    background: C.accent,
                    color: "#fff",
                    border: "none",
                    borderRadius: 2,
                    height: 38,
                    width: 140,
                    whiteSpace: "nowrap",
                    fontSize: bodySize,
                  }}
                >
                  Add Scenario
                </button>
              </div>
            </form>
          </div>

          {/* Scenarios table */}
          <div style={{ border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <table className="w-full" style={{ fontSize: bodySize }}>
              <thead>
                <tr style={{ background: C.surfaceHi, borderBottom: `1px solid ${C.border}` }}>
                  <th className={thClass} style={thStyle}>ID</th>
                  <th className={thClass} style={thStyle}>Description</th>
                  <th className={thClass} style={thStyle}>VINs</th>
                  <th className={thClass} style={thStyle}>Created</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {pagedScenarios.map((s, i) => (
                  <tr
                    key={s.seqId}
                    style={{
                      background: i % 2 === 0 ? C.surface : C.surfaceAlt,
                      borderBottom: `1px solid ${C.surfaceHi}`,
                    }}
                  >
                    <td
                      className="px-4 py-3"
                      style={{ ...tdTop, color: C.muted }}
                    >
                      {fmtS(s.seqId)}
                    </td>
                    <td className="px-4 py-3 font-medium" style={{ ...tdTop, color: C.secondary }}>
                      {s.description}
                    </td>
                    <td className="px-4 py-3" style={tdTop}>
                      <div className="flex flex-col gap-0.5">
                        {s.vins.map((v) => (
                          <span key={v} style={{ color: C.secondary }}>
                            {v}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3" style={{ ...tdTop, color: C.secondary }}>
                      {fmtDate(s.createdAt)}
                    </td>
                    <td className="px-4 py-3" style={tdTop}>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          className="px-3 py-1.5 text-xs font-semibold"
                          style={{
                            background: C.success,
                            color: C.bg,
                            border: "none",
                            borderRadius: 2,
                          }}
                        >
                          Run
                        </button>
                        <button
                          className="px-3 py-1.5 text-xs font-medium"
                          style={{
                            background: "transparent",
                            color: C.secondary,
                            border: `1px solid ${C.border}`,
                            borderRadius: 2,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = C.danger;
                            e.currentTarget.style.color = C.danger;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = C.border;
                            e.currentTarget.style.color = C.secondary;
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              page={scenarioPage}
              totalPages={scenarioTotalPages}
              onPrev={() => setScenarioPage((p) => Math.max(1, p - 1))}
              onNext={() =>
                setScenarioPage((p) => Math.min(scenarioTotalPages, p + 1))
              }
            />
          </div>
        </section>

        {/* Section divider */}
        <hr className="my-12" style={{ border: "none", borderTop: `1px solid ${C.border}` }} />

        {/* ─── Section 2: Runs ──────────────────────────────────── */}
        <section>
          <h1
            className="mb-6 text-2xl font-bold tracking-tight"
            style={{ color: C.primary }}
          >
            Runs
          </h1>

          <VinLegend />

          <div style={{ border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <table className="w-full" style={{ tableLayout: "fixed", fontSize: bodySize }}>
              <colgroup>
                <col style={{ width: 130 }} />
                <col />
                <col style={{ width: 175 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 160 }} />
                <col style={{ width: 220 }} />
              </colgroup>
              <thead>
                <tr style={{ background: C.surfaceHi, borderBottom: `1px solid ${C.border}` }}>
                  <th className={thClass} style={thStyle}>Run ID</th>
                  <th className={thClass} style={thStyle}>Scenario</th>
                  <th className={thClass} style={thStyle}>VINs</th>
                  <th className={thClass} style={thStyle}>Status</th>
                  <th className={thClass} style={thStyle}>Started</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {pagedRuns.map((run, i) => (
                  <tr
                    key={run.seqId}
                    style={{
                      background: i % 2 === 0 ? C.surface : C.surfaceAlt,
                      borderBottom: `1px solid ${C.surfaceHi}`,
                    }}
                  >
                    <td
                      className="px-4 py-3 whitespace-nowrap"
                      style={{ ...tdTop, color: C.muted }}
                    >
                      {fmtR(run.seqId)}
                    </td>
                    <td className="px-4 py-3" style={tdTop}>
                      <div className="flex flex-col">
                        <span style={{ color: C.muted }}>
                          {fmtS(run.scenarioSeqId)}
                        </span>
                        <span className="font-medium" style={{ color: C.secondary }}>
                          {run.scenarioDescription}
                        </span>
                      </div>
                    </td>
                    <td
                      className="px-4 py-3"
                      style={tdTop}
                    >
                      <div className="flex flex-col gap-0.5">
                        {run.vins.map((v) => (
                          <span
                            key={v}
                            style={VIN_COLOR_STYLE[vinColor(v, run.status, run.steps)]}
                          >
                            {v}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3" style={tdTop}>
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="px-4 py-3" style={{ ...tdTop, color: C.secondary }}>
                      {fmtDateTime(run.createdAt)}
                    </td>
                    <td className="px-4 py-3" style={tdTop}>
                      <div className="flex items-start" style={{ gap: 12 }}>
                        <span
                          className="font-medium cursor-pointer"
                          style={{ color: C.accent, textDecoration: "underline", width: 56, flexShrink: 0 }}
                        >
                          Details
                        </span>
                        <span style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
                          {run.pdfUrl && (
                            <button
                              className="inline-flex items-center px-3 py-1.5 text-xs font-medium"
                              style={{
                                background: "transparent",
                                color: C.secondary,
                                border: `1px solid ${C.border}`,
                                borderLeft: `3px solid ${C.accent}`,
                                borderRadius: 2,
                                whiteSpace: "nowrap",
                              }}
                            >
                              <PdfIcon />
                              Download PDFs
                            </button>
                          )}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              page={runPage}
              totalPages={runTotalPages}
              onPrev={() => setRunPage((p) => Math.max(1, p - 1))}
              onNext={() => setRunPage((p) => Math.min(runTotalPages, p + 1))}
            />
          </div>
        </section>

        {/* Section divider */}
        <hr className="my-12" style={{ border: "none", borderTop: `1px solid ${C.border}` }} />

        {/* ─── Section 3: Run Details ───────────────────────────── */}
        <section>
          <h1
            className="mb-6 text-2xl font-bold tracking-tight"
            style={{ color: C.primary }}
          >
            Run Details
          </h1>

          <VinLegend />

          {/* Compact single-row header */}
          <div
            className="mb-6 p-6"
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
                <p style={{ color: C.muted }}>
                  {fmtR(detailRun.seqId)}
                </p>
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
                    {fmtS(detailRun.scenarioSeqId)}
                  </span>
                  <span style={{ color: C.secondary }}>
                    {detailRun.scenarioDescription}
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
                  {detailRun.vins.map((v) => (
                    <span
                      key={v}
                      style={
                        VIN_COLOR_STYLE[
                          vinColor(v, detailRun.status, detailRun.steps)
                        ]
                      }
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
                  Status
                </span>
                <p className="mt-0.5">
                  <StatusBadge status={detailRun.status} />
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
                  {fmtDateTime(detailRun.createdAt)}
                </p>
              </div>
              {detailRun.pdfUrl && (
                <div style={{ marginLeft: "auto" }}>
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: "transparent" }}
                  >
                    &nbsp;
                  </span>
                  <p className="mt-0.5">
                    <button
                      className="inline-flex items-center px-3 py-1.5 text-xs font-medium"
                      style={{
                        background: "transparent",
                        color: C.secondary,
                        border: `1px solid ${C.border}`,
                        borderLeft: `3px solid ${C.accent}`,
                        borderRadius: 2,
                        whiteSpace: "nowrap",
                      }}
                    >
                      <PdfIcon />
                      Download PDFs
                    </button>
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Steps list */}
          <div style={{ border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <table className="w-full" style={{ fontSize: bodySize }}>
              <thead>
                <tr style={{ background: C.surfaceHi, borderBottom: `1px solid ${C.border}` }}>
                  <th className={thClass} style={thStyle}>Step ID</th>
                  <th className={`${thClass} w-10`} style={thStyle}>Result</th>
                  <th className={thClass} style={thStyle}>Step</th>
                </tr>
              </thead>
              <tbody>
                {detailRun.steps.map((step, i) => (
                  <tr
                    key={step.stepNum}
                    style={{
                      background: i % 2 === 0 ? C.surface : C.surfaceAlt,
                      borderBottom: `1px solid ${C.surfaceHi}`,
                    }}
                  >
                    <td
                      className="px-4 py-2.5"
                      style={{ ...tdTop, color: C.muted }}
                    >
                      {fmtStep(detailRun.seqId, step.stepNum)}
                    </td>
                    <td className="px-4 py-2.5 text-center" style={tdTop}>
                      {step.passed === true && !step.hadManualSpec && (
                        <span className="text-base" style={{ color: C.success }} title="Passed">
                          &#10003;
                        </span>
                      )}
                      {step.passed === true && step.hadManualSpec && (
                        <span className="text-base" style={{ color: C.warning }} title="Passed (manual spec)">
                          &#10003;
                        </span>
                      )}
                      {step.passed === false && (
                        <span className="text-base" style={{ color: C.danger }} title="Failed">
                          &#10007;
                        </span>
                      )}
                      {step.passed === null && (
                        <span className="text-base" style={{ color: C.muted }} title="Pending">
                          &#8211;
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5" style={{
                      ...tdTop,
                      color: step.passed === true && step.hadManualSpec
                        ? C.warning
                        : step.passed === true
                        ? C.success
                        : step.passed === false
                        ? C.danger
                        : C.muted,
                    }}>
                      {step.text}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Bottom spacing */}
        <div className="h-12" />
      </main>
    </>
  );
}
