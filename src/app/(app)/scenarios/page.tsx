"use client";

import { useEffect, useState } from "react";
import { C, bodySize, thStyle, thClass, tdTop, mono } from "@/lib/design";
import { GC_OPTIONS, type GcOption } from "@/lib/cpq-urls";

function fmtS(id: string) {
  return `S-${id.slice(0, 6)}`;
}

type Scenario = {
  id: string;
  name: string;
  vins: string[];
  gc_options: string[];
  created_at: string;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function Pagination({
  page, totalPages, onPrev, onNext,
}: {
  page: number; totalPages: number; onPrev: () => void; onNext: () => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div
      className="flex items-center justify-between px-4 py-3"
      style={{ borderTop: `1px solid ${C.border}`, color: C.secondary, fontSize: bodySize }}
    >
      <button onClick={onPrev} disabled={page <= 1}
        className="px-3 py-1.5 text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed"
        style={{ border: `1px solid ${C.border}`, color: C.secondary, background: "transparent", borderRadius: 2 }}>
        &larr; Previous
      </button>
      <span>Page {page} of {totalPages}</span>
      <button onClick={onNext} disabled={page >= totalPages}
        className="px-3 py-1.5 text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed"
        style={{ border: `1px solid ${C.border}`, color: C.secondary, background: "transparent", borderRadius: 2 }}>
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

  const [name, setName] = useState("Test");
  const [vins, setVins] = useState<string[]>([""]);
  const [gcOptions, setGcOptions] = useState<GcOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [gcDefault, setGcDefault] = useState<GcOption>("Standard");

  const [runningId, setRunningId] = useState<string | null>(null);
  const [runError, setRunError] = useState<{ id: string; message: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function fetchScenarios() {
    try {
      const res = await fetch("/api/scenarios");
      if (!res.ok) throw new Error("Failed to load scenarios");
      setScenarios(await res.json());
    } catch {
      setFetchError("Could not load scenarios. Please refresh.");
    } finally {
      setLoading(false);
    }
  }

  // Load app_settings to get gc_default
  useEffect(() => {
    fetch("/api/settings/app")
      .then((r) => r.json())
      .then((d) => {
        if (d.gc_default && GC_OPTIONS.includes(d.gc_default as GcOption)) {
          setGcDefault(d.gc_default as GcOption);
        }
      })
      .catch(() => {});
    fetchScenarios();
  }, []);

  const filledVins = vins.map((v, i) => ({ vin: v.trim().toUpperCase(), gc: gcOptions[i] ?? gcDefault }))
    .filter(x => x.vin.length > 0);

  function handleVinChange(idx: number, val: string) {
    const upper = val.toUpperCase();
    setVins(prev => {
      const next = [...prev];
      next[idx] = upper;
      const filled = next.filter(v => v.trim()).length;
      if (filled === next.length && filled < 10) next.push("");
      return next;
    });
    setGcOptions(prev => {
      const next = [...prev];
      while (next.length <= idx) next.push(gcDefault);
      return next;
    });
  }

  function handleVinPaste(idx: number, e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    // Split on newlines (Excel uses \r\n, plain text uses \n)
    const lines = text.split(/\r?\n/).map(v => v.trim().toUpperCase()).filter(Boolean);
    if (lines.length <= 1) return; // single value — let default paste handle it
    e.preventDefault();
    setVins(prev => {
      const next = [...prev];
      lines.forEach((line, i) => { if (idx + i < 10) next[idx + i] = line; });
      if (next.filter(v => v.trim()).length === next.length && next.length < 10) next.push("");
      return next;
    });
    setGcOptions(prev => {
      const next = [...prev];
      while (next.length < Math.min(idx + lines.length, 10)) next.push(gcDefault);
      return next;
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (filledVins.length === 0) { setFormError("Enter at least one VIN"); return; }
    const vinArr = filledVins.map(x => x.vin);
    const gc_options = filledVins.map(x => x.gc);

    setSubmitting(true);
    try {
      const res = await fetch("/api/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, vins: vinArr, gc_options }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to create scenario");
      }
      setName("Test");
      setVins([""]);
      setGcOptions([]);
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
      setRunError({ id: scenario.id, message: err instanceof Error ? err.message : "Something went wrong" });
    } finally {
      setRunningId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    await fetch(`/api/scenarios/${id}`, { method: "DELETE" });
    await fetchScenarios();
    setDeletingId(null);
  }

  const totalPages = Math.ceil(scenarios.length / perPage);
  const pagedScenarios = scenarios.slice((page - 1) * perPage, page * perPage);

  const inputBase: React.CSSProperties = {
    background: C.inputBg, border: `1px solid ${C.inputBdr}`,
    color: C.secondary, borderRadius: 2, fontSize: bodySize, fontFamily: mono,
  };

  return (
    <main
      className="flex flex-col px-6 py-4 overflow-hidden"
      style={{ height: "calc(100vh - 49px)", maxWidth: 1200, background: C.bg, color: C.secondary, fontSize: bodySize }}
    >
      <h1 className="mb-1 text-2xl font-bold tracking-tight flex-shrink-0" style={{ color: C.primary }}>
        CPQ NA Runner
      </h1>
      <p className="mb-4 flex-shrink-0" style={{ color: C.secondary, fontSize: 11, lineHeight: 1.5, maxWidth: 900 }}>
        Enter up to 10 VINs per scenario. For each VIN select the Genuine Care type
        (Annual, Standard, or Parts-Only). The bot will execute the full CPQ NA flow,
        download PDFs, and — for Stage + Order endpoint — place an order and capture the Order ID.
        Scenarios and Runs are automatically deleted after 30 days.
      </p>

      {/* Create form */}
      <div className="mb-4 p-4 flex-shrink-0" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
        <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.secondary }}>
          Add Scenario
        </h2>
        <form onSubmit={handleCreate} style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
          {/* Description */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="text-[10px] font-medium uppercase tracking-wider" style={{ color: C.secondary }}>
              Description
            </label>
            <textarea
              value={name}
              onChange={(e) => setName(e.target.value)}
              rows={4}
              required
              style={{ ...inputBase, width: 220, padding: "7px 10px", resize: "vertical" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = C.accent; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = C.inputBdr; }}
            />
          </div>

          {/* VINs — one input per row */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="text-[10px] font-medium uppercase tracking-wider" style={{ color: C.secondary }}>
              VINs
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {vins.map((vin, idx) => (
                <input
                  key={idx}
                  type="text"
                  value={vin}
                  onChange={(e) => handleVinChange(idx, e.target.value)}
                  onPaste={(e) => handleVinPaste(idx, e)}
                  placeholder={idx === 0 ? "Enter or paste VINs" : ""}
                  style={{ ...inputBase, width: 220, height: 28, padding: "0 10px" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = C.accent; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = C.inputBdr; }}
                />
              ))}
            </div>
            <span style={{ color: C.muted, fontSize: 10 }}>{filledVins.length}/10 VINs</span>
          </div>

          {/* Genuine Care Types — aligned row-for-row with VIN inputs */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="text-[10px] font-medium uppercase tracking-wider" style={{ color: C.secondary }}>
              Genuine Care Types
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {vins.map((vin, idx) => {
                const isEmpty = !vin.trim();
                return (
                  <div key={idx} style={{ display: "flex", gap: 5, alignItems: "center", height: 28, opacity: isEmpty ? 0.35 : 1 }}>
                    {GC_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        disabled={isEmpty}
                        onClick={() => setGcOptions(prev => { const next = [...prev]; next[idx] = opt as GcOption; return next; })}
                        style={{
                          padding: "2px 8px", fontFamily: mono, fontSize: 10,
                          border: `1px solid ${(gcOptions[idx] ?? gcDefault) === opt ? C.accent : C.inputBdr}`,
                          background: (gcOptions[idx] ?? gcDefault) === opt ? "rgba(59,130,246,0.15)" : C.inputBg,
                          color: (gcOptions[idx] ?? gcDefault) === opt ? C.accent : C.secondary,
                          borderRadius: 3, cursor: isEmpty ? "default" : "pointer",
                        }}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Submit */}
          <div style={{ paddingTop: 18 }}>
            <button
              type="submit"
              disabled={submitting}
              style={{
                background: C.accent, color: "#fff", border: "none",
                borderRadius: 2, height: 38, width: 140,
                fontFamily: mono, fontSize: bodySize, fontWeight: 600,
                cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting ? "Adding…" : "Add Scenario"}
            </button>
          </div>
        </form>
        {formError && <p className="mt-3 text-sm" style={{ color: C.danger }}>{formError}</p>}
      </div>

      {/* Scenario list */}
      {loading ? (
        <p style={{ color: C.muted }}>Loading…</p>
      ) : fetchError ? (
        <p style={{ color: C.danger }}>{fetchError}</p>
      ) : scenarios.length === 0 ? (
        <p style={{ color: C.muted }}>No scenarios yet. Add one above to get started.</p>
      ) : (
        <div className="flex-1 min-h-0" style={{ border: `1px solid ${C.border}`, overflow: "hidden" }}>
          <table className="w-full" style={{ fontSize: bodySize }}>
            <colgroup>
              <col style={{ width: 90 }} />
              <col />
              <col style={{ width: 280 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 180 }} />
            </colgroup>
            <thead>
              <tr style={{ background: C.surfaceHi, borderBottom: `1px solid ${C.border}` }}>
                <th className={thClass} style={thStyle}>ID</th>
                <th className={thClass} style={thStyle}>Description</th>
                <th className={thClass} style={thStyle}>VINs / Genuine Care</th>
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
                  <td className="px-4 py-3" style={{ ...tdTop, color: C.muted }}>{fmtS(s.id)}</td>
                  <td className="px-4 py-3 font-medium" style={{ ...tdTop, color: C.secondary }}>{s.name}</td>
                  <td className="px-4 py-3" style={tdTop}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {s.vins.map((v, idx) => (
                        <div key={v} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                          <span style={{ color: C.secondary, fontFamily: mono }}>{v}</span>
                          <span style={{
                            color: C.muted, fontSize: 10,
                            border: `1px solid ${C.border}`, borderRadius: 2,
                            padding: "1px 5px",
                          }}>
                            {s.gc_options[idx] ?? "Standard"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3" style={{ ...tdTop, color: C.secondary }}>{fmtDate(s.created_at)}</td>
                  <td className="px-4 py-3" style={tdTop}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                      {runError?.id === s.id && (
                        <span style={{ color: C.danger, fontSize: 11 }}>{runError.message}</span>
                      )}
                      <button
                        onClick={() => handleRun(s)}
                        disabled={runningId === s.id}
                        style={{
                          background: C.success, color: C.bg, border: "none",
                          borderRadius: 2, padding: "5px 14px", fontSize: 11,
                          fontFamily: mono, fontWeight: 600,
                          cursor: runningId === s.id ? "not-allowed" : "pointer",
                          opacity: runningId === s.id ? 0.5 : 1,
                        }}>
                        {runningId === s.id ? "Starting…" : "Run"}
                      </button>
                      <button
                        onClick={() => handleDelete(s.id)}
                        disabled={deletingId === s.id}
                        style={{
                          background: "none", color: C.muted, border: `1px solid ${C.border}`,
                          borderRadius: 2, padding: "5px 10px", fontSize: 11,
                          fontFamily: mono, cursor: "pointer",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = C.danger; e.currentTarget.style.borderColor = C.danger; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border; }}>
                        Delete
                      </button>
                    </div>
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
