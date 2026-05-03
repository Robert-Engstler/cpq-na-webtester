"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { C, mono } from "@/lib/design";

type DefaultRow = {
  env: string; brand: string; country: string;
  username: string; password: string;
};

const ALL_COMBOS: Pick<DefaultRow, "env" | "brand" | "country">[] = [
  { env: "Prod",  brand: "FT", country: "US" },
  { env: "Prod",  brand: "FT", country: "CA" },
  { env: "Prod",  brand: "MF", country: "US" },
  { env: "Prod",  brand: "MF", country: "CA" },
  { env: "Stage", brand: "FT", country: "US" },
  { env: "Stage", brand: "FT", country: "CA" },
  { env: "Stage", brand: "MF", country: "US" },
  { env: "Stage", brand: "MF", country: "CA" },
];

export default function LoginPage() {
  const router = useRouter();

  const [environment, setEnvironment] = useState("Prod");
  const [brand, setBrand] = useState("FT");
  const [country, setCountry] = useState("US");
  const [cpqUsername, setCpqUsername] = useState("");
  const [cpqPassword, setCpqPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsStep, setSettingsStep] = useState<"password" | "form">("password");
  const [settingsPassword, setSettingsPassword] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [allDefaults, setAllDefaults] = useState<DefaultRow[]>([]);
  const [defaultIdx, setDefaultIdx] = useState(0);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const env = localStorage.getItem("login_environment") ?? "Prod";
    const br  = localStorage.getItem("login_brand")       ?? "FT";
    const co  = localStorage.getItem("login_country")     ?? "US";
    setEnvironment(env); setBrand(br); setCountry(co);
    fetchDefaults(env, br, co);
  }, []);

  async function fetchDefaults(env: string, br: string, co: string) {
    const cached = localStorage.getItem(`login_creds_${env}_${br}_${co}`);
    if (cached) {
      try {
        const { username, password } = JSON.parse(cached);
        setCpqUsername(username ?? ""); setCpqPassword(password ?? "");
        return;
      } catch { /* fall through */ }
    }
    try {
      const res = await fetch(`/api/settings/login-defaults?environment=${env}&brand=${br}&country=${co}`);
      const d = await res.json();
      setCpqUsername(d.cpq_username ?? ""); setCpqPassword(d.cpq_password ?? "");
    } catch { /* ignore */ }
  }

  function handleEnvChange(val: string)     { setEnvironment(val); localStorage.setItem("login_environment", val); fetchDefaults(val, brand, country); }
  function handleBrandChange(val: string)   { setBrand(val);       localStorage.setItem("login_brand", val);       fetchDefaults(environment, val, country); }
  function handleCountryChange(val: string) { setCountry(val);     localStorage.setItem("login_country", val);     fetchDefaults(environment, brand, val); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ environment, brand, country, cpq_username: cpqUsername, cpq_password: cpqPassword }),
      });
      if (res.ok) {
        router.push("/scenarios");
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Login failed. Please try again.");
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSettingsVerify() {
    setSettingsError("");
    const res = await fetch("/api/settings/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: settingsPassword }),
    });
    if (!res.ok) { setSettingsError("Incorrect password"); return; }
    try {
      const allRes = await fetch("/api/settings/login-defaults");
      const saved: { environment: string; brand: string; country: string; cpq_username: string; cpq_password: string }[] = await allRes.json();
      const rows: DefaultRow[] = ALL_COMBOS.map((c) => {
        const found = saved.find((r) => r.environment === c.env && r.brand === c.brand && r.country === c.country);
        return { ...c, username: found?.cpq_username ?? "", password: found?.cpq_password ?? "" };
      });
      setAllDefaults(rows);
    } catch {
      setAllDefaults(ALL_COMBOS.map((c) => {
        const cached = localStorage.getItem(`login_creds_${c.env}_${c.brand}_${c.country}`);
        if (cached) { try { const { username, password } = JSON.parse(cached); return { ...c, username: username ?? "", password: password ?? "" }; } catch { /* */ } }
        return { ...c, username: "", password: "" };
      }));
    }
    const defEnv = localStorage.getItem("login_environment") ?? "Prod";
    const defBr  = localStorage.getItem("login_brand")       ?? "FT";
    const defCo  = localStorage.getItem("login_country")     ?? "US";
    const idx = ALL_COMBOS.findIndex((c) => c.env === defEnv && c.brand === defBr && c.country === defCo);
    setDefaultIdx(idx >= 0 ? idx : 0);
    setSettingsStep("form");
  }

  function updateDefault(idx: number, field: "username" | "password", val: string) {
    setAllDefaults((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
    setSettingsSaved(false);
  }

  async function handleSettingsSave() {
    setSettingsError("");
    try {
      await Promise.all(
        allDefaults.map((row) =>
          fetch("/api/settings/login-defaults", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: settingsPassword, environment: row.env, brand: row.brand, country: row.country, cpq_username: row.username, cpq_password: row.password }),
          })
        )
      );
      allDefaults.forEach((row) => {
        localStorage.setItem(`login_creds_${row.env}_${row.brand}_${row.country}`, JSON.stringify({ username: row.username, password: row.password }));
      });
      setSettingsSaved(true);
      const def = allDefaults[defaultIdx];
      if (def) {
        setEnvironment(def.env);   localStorage.setItem("login_environment", def.env);
        setBrand(def.brand);       localStorage.setItem("login_brand",       def.brand);
        setCountry(def.country);   localStorage.setItem("login_country",     def.country);
        setCpqUsername(def.username); setCpqPassword(def.password);
      }
    } catch {
      setSettingsError("Failed to save defaults");
    }
  }

  const inp: React.CSSProperties = {
    width: "100%", border: `1px solid ${C.border}`, borderRadius: 5,
    padding: "7px 10px", fontSize: 12, color: C.primary,
    background: C.bg, outline: "none", fontFamily: mono,
  };
  const smInp: React.CSSProperties = {
    border: `1px solid ${C.border}`, borderRadius: 4,
    padding: "4px 7px", fontSize: 11, color: C.primary,
    background: C.bg, fontFamily: mono, outline: "none", width: "100%",
  };
  const lbl: React.CSSProperties = {
    display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
    textTransform: "uppercase" as const, color: C.muted, marginBottom: 4,
  };

  return (
    <div style={{ minHeight: "100vh", background: C.surface, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {/* Login card: split layout */}
      <div style={{
        display: "flex", width: 580, borderRadius: 12, overflow: "hidden",
        boxShadow: "0 8px 40px rgba(0,0,0,0.1)", border: `1px solid ${C.border}`,
      }}>
        {/* Left: blue brand panel */}
        <div style={{
          width: 200, flexShrink: 0, padding: "32px 24px",
          background: "linear-gradient(150deg, #1e40af 0%, #2563eb 60%, #3b82f6 100%)",
          display: "flex", flexDirection: "column", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1.3, fontFamily: mono }}>
              CPQ NA<br />Webtester
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 8, lineHeight: 1.5 }}>
              Automated E2E testing<br />for CPQ North America
            </div>
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>AGCO · Internal tool</div>
        </div>

        {/* Right: form */}
        <div style={{ flex: 1, background: C.bg, padding: "32px 28px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.primary, letterSpacing: "-0.02em", marginBottom: 4 }}>Sign in</div>
          <div style={{ fontSize: 12, color: C.secondary, marginBottom: 22 }}>Select environment and enter credentials</div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Env / Brand / Country */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <div>
                <label style={lbl}>Env</label>
                <select value={environment} onChange={(e) => handleEnvChange(e.target.value)}
                  style={{ ...inp, cursor: "pointer" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = C.accent; }}
                  onBlur={(e)  => { e.currentTarget.style.borderColor = C.border; }}>
                  <option>Prod</option><option>Stage</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Brand</label>
                <select value={brand} onChange={(e) => handleBrandChange(e.target.value)}
                  style={{ ...inp, cursor: "pointer" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = C.accent; }}
                  onBlur={(e)  => { e.currentTarget.style.borderColor = C.border; }}>
                  <option value="FT">FT (Fendt)</option>
                  <option value="MF">MF (Massey)</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Country</label>
                <select value={country} onChange={(e) => handleCountryChange(e.target.value)}
                  style={{ ...inp, cursor: "pointer" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = C.accent; }}
                  onBlur={(e)  => { e.currentTarget.style.borderColor = C.border; }}>
                  <option>US</option><option>CA</option>
                </select>
              </div>
            </div>

            {/* Username */}
            <div>
              <label style={lbl}>CPQ Username</label>
              <input type="text" value={cpqUsername} onChange={(e) => setCpqUsername(e.target.value)}
                placeholder="user@example.com" required style={inp} autoFocus
                onFocus={(e) => { e.currentTarget.style.borderColor = C.accent; }}
                onBlur={(e)  => { e.currentTarget.style.borderColor = C.border; }} />
            </div>

            {/* Password */}
            <div>
              <label style={lbl}>CPQ Password</label>
              <div style={{ position: "relative" }}>
                <input type={showPassword ? "text" : "password"} value={cpqPassword}
                  onChange={(e) => setCpqPassword(e.target.value)}
                  placeholder="CPQ login password" required
                  style={{ ...inp, paddingRight: 34 }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = C.accent; }}
                  onBlur={(e)  => { e.currentTarget.style.borderColor = C.border; }} />
                <button type="button" onClick={() => setShowPassword(v => !v)} tabIndex={-1}
                  style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: showPassword ? C.primary : C.muted, padding: 0, lineHeight: 1 }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = C.primary; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = showPassword ? C.primary : C.muted; }}>
                  {showPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && <p style={{ color: C.danger, fontSize: 12, fontFamily: mono }}>{error}</p>}

            <button type="submit" disabled={loading} style={{
              background: C.accent, color: "#fff", border: "none", borderRadius: 6,
              padding: "9px 0", fontSize: 13, fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1,
            }}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <button
            onClick={() => { setSettingsOpen(true); setSettingsStep("password"); setSettingsPassword(""); setSettingsError(""); setSettingsSaved(false); }}
            style={{ marginTop: 16, background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 11, fontFamily: mono, textAlign: "center" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = C.accent; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = C.muted; }}>
            ⚙ Login defaults
          </button>
        </div>
      </div>

      {/* Settings modal */}
      {settingsOpen && (
        <div ref={overlayRef} onClick={(e) => { if (e.target === overlayRef.current) setSettingsOpen(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, width: 560, fontFamily: mono, boxShadow: "0 8px 40px rgba(0,0,0,0.12)", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ color: C.primary, fontSize: 14, fontWeight: 700 }}>Login Defaults</span>
              <button onClick={() => setSettingsOpen(false)} style={{ color: C.muted, background: "none", border: "none", cursor: "pointer", fontSize: 18 }}>×</button>
            </div>

            <div style={{ padding: 20 }}>
              {settingsStep === "password" ? (
                <>
                  <p style={{ color: C.secondary, fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
                    Set default credentials per environment/brand/country combination.<br />
                    For password recovery: robert.engstler@agcocorp.com
                  </p>
                  <label style={lbl}>Admin Password</label>
                  <input type="password" value={settingsPassword}
                    onChange={(e) => setSettingsPassword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSettingsVerify(); }}
                    placeholder="Settings password"
                    style={{ ...inp, marginBottom: 14 }} autoFocus />
                  {settingsError && <p style={{ color: C.danger, fontSize: 11, marginBottom: 10 }}>{settingsError}</p>}
                  <button onClick={handleSettingsVerify} style={{ width: "100%", background: C.accent, color: "#fff", border: "none", borderRadius: 6, padding: "8px 0", fontFamily: mono, fontSize: 12, cursor: "pointer" }}>
                    Unlock
                  </button>
                </>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 1fr 44px", gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
                    {["Combination", "CPQ Username", "CPQ Password", "Def."].map((h, i) => (
                      <span key={h} style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: C.muted, textAlign: i === 3 ? "center" : "left" }}>{h}</span>
                    ))}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 16 }}>
                    {allDefaults.map((row, idx) => (
                      <div key={`${row.env}-${row.brand}-${row.country}`} style={{ display: "grid", gridTemplateColumns: "110px 1fr 1fr 44px", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: row.env === "Stage" ? C.accent : C.secondary, fontFamily: mono, whiteSpace: "nowrap" }}>
                          {row.env} · {row.brand} · {row.country}
                        </span>
                        <input type="text" value={row.username} onChange={(e) => updateDefault(idx, "username", e.target.value)} placeholder="user@example.com" style={smInp} />
                        <input type="text" value={row.password} onChange={(e) => updateDefault(idx, "password", e.target.value)} placeholder="password" style={smInp} />
                        <div style={{ display: "flex", justifyContent: "center" }}>
                          <input type="radio" name="default_combo" checked={defaultIdx === idx} onChange={() => setDefaultIdx(idx)} style={{ accentColor: C.accent, cursor: "pointer", width: 14, height: 14 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  {settingsError && <p style={{ color: C.danger, fontSize: 11, marginBottom: 10 }}>{settingsError}</p>}
                  {settingsSaved && <p style={{ color: C.success, fontSize: 11, marginBottom: 10 }}>All defaults saved.</p>}
                  <button onClick={handleSettingsSave} style={{ width: "100%", background: C.accent, color: "#fff", border: "none", borderRadius: 6, padding: "8px 0", fontFamily: mono, fontSize: 12, cursor: "pointer" }}>
                    Save All
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
