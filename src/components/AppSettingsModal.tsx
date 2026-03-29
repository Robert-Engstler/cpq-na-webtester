"use client";

import { useEffect, useRef, useState } from "react";
import { C, mono } from "@/lib/design";

type AppSettings = {
  gc_default: string;
  annual_duration: number;
  svc_preset: string;
  stage_endpoint: string;
};

const PRESET_DESCRIPTIONS: Record<string, { start: string; last: string; duration: string }> = {
  Minimum: { start: "2nd lowest",      last: "2nd lowest", duration: "12 months" },
  Medium:  { start: "2nd lowest",      last: "6th lowest", duration: "48 months" },
  Maximum: { start: "Lowest",          last: "Highest",    duration: "Highest available" },
};

export function AppSettingsModal({ environment }: { environment?: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({
    gc_default: "Standard",
    annual_duration: 60,
    svc_preset: "Minimum",
    stage_endpoint: "Configuration",
  });
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      fetch("/api/settings/app")
        .then((r) => r.json())
        .then((d) => setSettings((prev) => ({ ...prev, ...d })));
    }
  }, [open]);

  function handleOpen() {
    setOpen(true);
    setError("");
    setSaved(false);
  }

  function handleClose() {
    setOpen(false);
    setError("");
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const res = await fetch("/api/settings/app", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
    } else {
      setError("Failed to save settings");
    }
  }

  const input: React.CSSProperties = {
    fontFamily: mono,
    fontSize: 12,
    background: C.inputBg,
    border: `1px solid ${C.inputBdr}`,
    borderRadius: 4,
    color: C.primary,
    padding: "6px 10px",
    width: "100%",
    outline: "none",
  };

  const selectStyle: React.CSSProperties = { ...input, cursor: "pointer" };

  const labelStyle: React.CSSProperties = {
    fontFamily: mono,
    fontSize: 11,
    color: C.secondary,
    marginBottom: 4,
    display: "block",
  };

  const row: React.CSSProperties = { marginBottom: 16 };

  if (!open) {
    return (
      <button
        onClick={handleOpen}
        className="text-sm font-medium transition-colors"
        style={{ color: C.secondary, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
        onMouseEnter={(e) => { e.currentTarget.style.color = C.accent; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = C.secondary; }}
      >
        Settings
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        ref={overlayRef}
        onClick={(e) => { if (e.target === overlayRef.current) handleClose(); }}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
          zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <div
          style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: 24, width: 420,
            fontFamily: mono,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <span style={{ color: C.primary, fontSize: 13, fontWeight: 600 }}>Scenario Defaults</span>
            <button onClick={handleClose} style={{ color: C.muted, background: "none", border: "none", cursor: "pointer", fontSize: 18 }}>×</button>
          </div>

          <>
              {/* Genuine Care Default */}
              <div style={row}>
                <label style={labelStyle}>Genuine Care Type</label>
                <select
                  value={settings.gc_default}
                  onChange={(e) => setSettings((s) => ({ ...s, gc_default: e.target.value }))}
                  style={selectStyle}
                >
                  {["Annual", "Standard", "Parts-Only"].map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>

              {/* Service Condition */}
              <div style={row}>
                <label style={labelStyle}>Service Condition</label>
                <div style={{ display: "flex", gap: 0, border: `1px solid ${C.border}`, borderRadius: 4, overflow: "hidden" }}>

                  {/* Left: Annual */}
                  <div style={{ flex: "0 0 140px", padding: "10px 12px", borderRight: `1px solid ${C.border}` }}>
                    <div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Annual</div>
                    <select
                      value={settings.annual_duration}
                      onChange={(e) => setSettings((s) => ({ ...s, annual_duration: Number(e.target.value) }))}
                      style={{ ...selectStyle, width: "100%" }}
                    >
                      {[12, 24, 36, 48, 60].map((d) => (
                        <option key={d} value={d}>{d} months</option>
                      ))}
                    </select>
                    <div style={{ color: C.muted, fontSize: 10, marginTop: 6 }}>Duration</div>
                  </div>

                  {/* Right: Standard / Parts-Only */}
                  <div style={{ flex: 1, padding: "10px 12px" }}>
                    <div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Standard / Parts-Only</div>
                    <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                      {["Minimum", "Medium", "Maximum"].map((p) => (
                        <button
                          key={p}
                          onClick={() => setSettings((s) => ({ ...s, svc_preset: p }))}
                          style={{
                            flex: 1, padding: "5px 0", fontFamily: mono, fontSize: 10,
                            border: `1px solid ${settings.svc_preset === p ? C.accent : C.inputBdr}`,
                            background: settings.svc_preset === p ? "rgba(59,130,246,0.15)" : C.inputBg,
                            color: settings.svc_preset === p ? C.accent : C.secondary,
                            borderRadius: 3, cursor: "pointer",
                          }}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                    {(() => {
                      const d = PRESET_DESCRIPTIONS[settings.svc_preset];
                      return (
                        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 6, rowGap: 2 }}>
                          {[["Start", d.start], ["Last", d.last], ["Duration", d.duration]].map(([k, v]) => (
                            <>
                              <span key={k + "-k"} style={{ color: C.muted, fontSize: 10 }}>{k}</span>
                              <span key={k + "-v"} style={{ color: C.secondary, fontSize: 10 }}>{v}</span>
                            </>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                </div>
              </div>

              {/* Stage End-point (only shown when environment is Stage) */}
              {environment === "Stage" && (
                <div style={row}>
                  <label style={labelStyle}>Stage — Test Ends With</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {["Configuration", "Order"].map((ep) => (
                      <button
                        key={ep}
                        onClick={() => setSettings((s) => ({ ...s, stage_endpoint: ep }))}
                        style={{
                          flex: 1, padding: "6px 0", fontFamily: mono, fontSize: 11,
                          border: `1px solid ${settings.stage_endpoint === ep ? C.accent : C.inputBdr}`,
                          background: settings.stage_endpoint === ep ? "rgba(59,130,246,0.15)" : C.inputBg,
                          color: settings.stage_endpoint === ep ? C.accent : C.secondary,
                          borderRadius: 4, cursor: "pointer",
                        }}
                      >
                        {ep}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {error && <p style={{ color: C.danger, fontSize: 11, marginBottom: 12 }}>{error}</p>}
              {saved && <p style={{ color: C.success, fontSize: 11, marginBottom: 12 }}>Settings saved.</p>}

              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  width: "100%", background: C.accent, color: "#fff",
                  border: "none", borderRadius: 4, padding: "8px 0",
                  fontFamily: mono, fontSize: 12, cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? "Saving…" : "Save Settings"}
              </button>
            </>
        </div>
      </div>

      {/* Trigger button (rendered outside modal so nav still shows it) */}
      <button
        onClick={handleOpen}
        className="text-sm font-medium transition-colors"
        style={{ color: C.accent, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
      >
        Settings
      </button>
    </>
  );
}
