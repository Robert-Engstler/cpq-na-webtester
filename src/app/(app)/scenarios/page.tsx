"use client";

import { useEffect, useState } from "react";

import { C, bodySize, thStyle, thClass, tdTop } from "@/lib/design";

function fmtS(id: string) {
  return `S-${id.slice(0, 6)}`;
}

type Scenario = {
  id: string;
  name: string;
  vins: string[];
  language: string;
  created_at: string;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
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

export default function ScenariosPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 5;

  const [name, setName] = useState("");
  const [vinsText, setVinsText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [runningId, setRunningId] = useState<string | null>(null);
  const [runError, setRunError] = useState<{ id: string; message: string } | null>(null);

  async function fetchScenarios() {
    try {
      const res = await fetch("/api/scenarios");
      if (!res.ok) throw new Error("Failed to load scenarios");
      const data = await res.json();
      setScenarios(data);
    } catch {
      setFetchError("Could not load scenarios. Please refresh.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchScenarios();
  }, []);

  function parseVins(text: string): string[] {
    return text
      .split("\n")
      .map((v) => v.trim().toUpperCase())
      .filter(Boolean);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const vins = parseVins(vinsText);
    if (vins.length === 0) {
      setFormError("Enter at least one VIN");
      return;
    }
    if (vins.length > 5) {
      setFormError("Maximum 5 VINs per scenario");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, vins, language: "en" }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to create scenario");
      }
      setName("");
      setVinsText("");
      await fetchScenarios();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRun(scenario: Scenario) {
    setRunError(null);
    setRunningId(scenario.id);
    try {
      const res = await fetch("/api/runs/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId: scenario.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to trigger run");
      }
      window.location.href = "/runs";
    } catch (err) {
      setRunError({
        id: scenario.id,
        message: err instanceof Error ? err.message : "Something went wrong",
      });
    } finally {
      setRunningId(null);
    }
  }

  // Scenarios are returned from API sorted by created_at DESC already
  const totalPages = Math.ceil(scenarios.length / perPage);
  const pagedScenarios = scenarios.slice(
    (page - 1) * perPage,
    page * perPage
  );

  return (
    <main
      className="flex flex-col px-6 py-4 overflow-hidden"
      style={{ height: "calc(100vh - 49px)", maxWidth: 1200, background: C.bg, color: C.secondary, fontSize: bodySize }}
    >
      <h1
        className="mb-1 text-2xl font-bold tracking-tight flex-shrink-0"
        style={{ color: C.primary }}
      >
        CPQ MRO Runner
      </h1>
      <p
        className="mb-4 flex-shrink-0"
        style={{ color: C.secondary, fontSize: 11, lineHeight: 1.5, maxWidth: 900 }}
      >
        Enter up to 5 VINs for fully automated CPQ Maintenance configuration in the
        background. The bot will execute VIN search, choose Maintenance and Multi
        Service, go with any pre-populated options/specs selections (based on the
        VIN&apos;s sales codes) or select random specs if prompted, and the full range
        to service intervals (from first to last). After saving the configuration,
        the bot will download the service checklist and parts picklist PDFs (for all
        intervals, combined in 2 files), then process the next VIN. Scenarios and
        Runs are automatically deleted after 30 days.
      </p>

      {/* Create form */}
      <div
        className="mb-4 p-4 flex-shrink-0"
        style={{ background: C.surface, border: `1px solid ${C.border}` }}
      >
        <h2
          className="mb-4 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: C.secondary }}
        >
          Add Scenario
        </h2>
        <form onSubmit={handleCreate} className="flex items-start gap-4" style={{ justifyContent: "space-between" }}>
          <div className="flex items-start gap-4">
            <div className="flex flex-col gap-1">
              <label
                className="text-[10px] font-medium uppercase tracking-wider"
                style={{ color: C.secondary }}
              >
                Description
              </label>
              <textarea
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder=""
                rows={4}
                required
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
                value={vinsText}
                onChange={(e) => {
                  const lines = e.target.value.split("\n");
                  if (lines.length <= 5) setVinsText(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && vinsText.split("\n").length >= 5) {
                    e.preventDefault();
                  }
                }}
                placeholder={"One VIN per line, max 5"}
                rows={4}
                required
                className="px-3 py-2 w-64 focus:outline-none"
                style={{
                  background: C.inputBg,
                  border: `1px solid ${C.inputBdr}`,
                  color: C.secondary,
                  borderRadius: 2,
                  fontSize: bodySize,
                  resize: "none",
                  overflow: "hidden",
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
                {parseVins(vinsText).length}/5 VINs
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
              disabled={submitting}
              className="px-4 font-semibold disabled:opacity-50"
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
              {submitting ? "Adding\u2026" : "Add Scenario"}
            </button>
          </div>
        </form>
        {formError && (
          <p className="mt-3 text-sm" style={{ color: C.danger }}>
            {formError}
          </p>
        )}
      </div>

      {/* Scenario list */}
      {loading ? (
        <p style={{ color: C.muted }}>Loading\u2026</p>
      ) : fetchError ? (
        <p style={{ color: C.danger }}>{fetchError}</p>
      ) : scenarios.length === 0 ? (
        <p style={{ color: C.muted }}>
          No scenarios yet. Add one above to get started.
        </p>
      ) : (
        <div className="flex-1 min-h-0" style={{ border: `1px solid ${C.border}`, overflow: "hidden" }}>
          <table className="w-full" style={{ fontSize: bodySize }}>
            <colgroup>
              <col style={{ width: 110 }} />
              <col />
              <col style={{ width: 220 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 172 }} />
            </colgroup>
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
                  key={s.id}
                  style={{
                    background: i % 2 === 0 ? C.surface : C.surfaceAlt,
                    borderBottom: `1px solid ${C.surfaceHi}`,
                  }}
                >
                  <td className="px-4 py-3" style={{ ...tdTop, color: C.muted }}>
                    {fmtS(s.id)}
                  </td>
                  <td className="px-4 py-3 font-medium" style={{ ...tdTop, color: C.secondary }}>
                    {s.name}
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
                    {fmtDate(s.created_at)}
                  </td>
                  <td className="px-4 py-3" style={tdTop}>
                    <div className="flex items-center justify-end gap-2">
                      {runError?.id === s.id && (
                        <span className="text-xs" style={{ color: C.danger }}>
                          {runError.message}
                        </span>
                      )}
                      <button
                        onClick={() => handleRun(s)}
                        disabled={runningId === s.id}
                        className="px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                        style={{
                          background: C.success,
                          color: C.bg,
                          border: "none",
                          borderRadius: 2,
                          width: 140,
                        }}
                      >
                        {runningId === s.id ? "Starting\u2026" : "Run"}
                      </button>
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
