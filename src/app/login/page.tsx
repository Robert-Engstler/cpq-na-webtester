"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { C, bodySize, mono } from "@/lib/design";

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

  // Login form state — combo persisted in localStorage
  const [environment, setEnvironment] = useState("Prod");
  const [brand, setBrand] = useState("FT");
  const [country, setCountry] = useState("US");
  const [cpqUsername, setCpqUsername] = useState("");
  const [cpqPassword, setCpqPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Settings modal state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsStep, setSettingsStep] = useState<"password" | "form">("password");
  const [settingsPassword, setSettingsPassword] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [allDefaults, setAllDefaults] = useState<DefaultRow[]>([]);
  const [defaultIdx, setDefaultIdx] = useState(0);
  const overlayRef = useRef<HTMLDivElement>(null);

  // On mount: restore combo from localStorage, then fetch credentials
  useEffect(() => {
    const env = localStorage.getItem("login_environment") ?? "Prod";
    const br  = localStorage.getItem("login_brand")       ?? "FT";
    const co  = localStorage.getItem("login_country")     ?? "US";
    setEnvironment(env);
    setBrand(br);
    setCountry(co);
    fetchDefaults(env, br, co);
  }, []);

  async function fetchDefaults(env: string, br: string, co: string) {
    // Try localStorage first (set when saving settings)
    const cached = localStorage.getItem(`login_creds_${env}_${br}_${co}`);
    if (cached) {
      try {
        const { username, password } = JSON.parse(cached);
        setCpqUsername(username ?? "");
        setCpqPassword(password ?? "");
        return;
      } catch { /* fall through */ }
    }
    // Fallback to DB
    try {
      const res = await fetch(`/api/settings/login-defaults?environment=${env}&brand=${br}&country=${co}`);
      const d = await res.json();
      setCpqUsername(d.cpq_username ?? "");
      setCpqPassword(d.cpq_password ?? "");
    } catch { /* ignore */ }
  }

  function handleEnvChange(val: string) {
    setEnvironment(val);
    localStorage.setItem("login_environment", val);
    fetchDefaults(val, brand, country);
  }
  function handleBrandChange(val: string) {
    setBrand(val);
    localStorage.setItem("login_brand", val);
    fetchDefaults(environment, val, country);
  }
  function handleCountryChange(val: string) {
    setCountry(val);
    localStorage.setItem("login_country", val);
    fetchDefaults(environment, brand, val);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
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

    // Fetch all saved defaults and merge with the full 8-combo list
    try {
      const allRes = await fetch("/api/settings/login-defaults");
      const saved: { environment: string; brand: string; country: string; cpq_username: string; cpq_password: string }[] = await allRes.json();
      const rows: DefaultRow[] = ALL_COMBOS.map((c) => {
        const found = saved.find((r) => r.environment === c.env && r.brand === c.brand && r.country === c.country);
        return { ...c, username: found?.cpq_username ?? "", password: found?.cpq_password ?? "" };
      });
      setAllDefaults(rows);
    } catch {
      // DB not available — load from localStorage
      setAllDefaults(ALL_COMBOS.map((c) => {
        const cached = localStorage.getItem(`login_creds_${c.env}_${c.brand}_${c.country}`);
        if (cached) { try { const { username, password } = JSON.parse(cached); return { ...c, username: username ?? "", password: password ?? "" }; } catch { /* */ } }
        return { ...c, username: "", password: "" };
      }));
    }
    // Pre-select the current default combo
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
            body: JSON.stringify({
              password: settingsPassword,
              environment: row.env,
              brand: row.brand,
              country: row.country,
              cpq_username: row.username,
              cpq_password: row.password,
            }),
          })
        )
      );
      // Persist all credentials to localStorage so login page works without DB
      allDefaults.forEach((row) => {
        localStorage.setItem(
          `login_creds_${row.env}_${row.brand}_${row.country}`,
          JSON.stringify({ username: row.username, password: row.password })
        );
      });
      setSettingsSaved(true);
      // Apply the selected default combo to the login form and localStorage
      const def = allDefaults[defaultIdx];
      if (def) {
        setEnvironment(def.env);   localStorage.setItem("login_environment", def.env);
        setBrand(def.brand);       localStorage.setItem("login_brand",       def.brand);
        setCountry(def.country);   localStorage.setItem("login_country",     def.country);
        setCpqUsername(def.username);
        setCpqPassword(def.password);
      }
    } catch {
      setSettingsError("Failed to save defaults");
    }
  }

  const inputStyle: React.CSSProperties = {
    background: C.inputBg, border: `1px solid ${C.inputBdr}`,
    color: C.primary, borderRadius: 2, fontSize: bodySize,
    width: "100%", padding: "7px 10px", fontFamily: mono, outline: "none",
  };
  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer" };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 10, fontWeight: 600,
    letterSpacing: "0.05em", textTransform: "uppercase" as const,
    color: C.secondary, marginBottom: 4, fontFamily: mono,
  };

  function onFocus(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    e.currentTarget.style.borderColor = C.accent;
    e.currentTarget.style.boxShadow = `0 0 0 1px ${C.accent}`;
  }
  function onBlur(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    e.currentTarget.style.borderColor = C.inputBdr;
    e.currentTarget.style.boxShadow = "none";
  }

  const smInput: React.CSSProperties = {
    background: C.inputBg, border: `1px solid ${C.inputBdr}`,
    color: C.primary, borderRadius: 2, fontSize: 11,
    width: "100%", padding: "5px 7px", fontFamily: mono, outline: "none",
  };

  return (
    <div className="flex min-h-screen items-center justify-center" style={{ background: C.bg }}>
      <div className="w-full p-8" style={{
        maxWidth: 400, background: C.surface,
        border: `1px solid ${C.border}`, borderRadius: 4, position: "relative",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <h1 className="text-xl font-semibold" style={{ color: C.primary, fontFamily: mono }}>
            CPQ NA Webtester
          </h1>
          <button
            onClick={() => { setSettingsOpen(true); setSettingsStep("password"); setSettingsPassword(""); setSettingsError(""); setSettingsSaved(false); }}
            title="Set login defaults"
            style={{ color: C.secondary, background: "none", border: "none", cursor: "pointer", fontSize: 20, paddingTop: 2 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = C.primary; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = C.secondary; }}
          >
            ⚙
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Environment / Brand / Country */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Environment</label>
              <select value={environment} onChange={(e) => handleEnvChange(e.target.value)} style={selectStyle} onFocus={onFocus} onBlur={onBlur}>
                <option>Prod</option>
                <option>Stage</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Brand</label>
              <select value={brand} onChange={(e) => handleBrandChange(e.target.value)} style={selectStyle} onFocus={onFocus} onBlur={onBlur}>
                <option value="FT">FT (Fendt)</option>
                <option value="MF">MF (Massey)</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Country</label>
              <select value={country} onChange={(e) => handleCountryChange(e.target.value)} style={selectStyle} onFocus={onFocus} onBlur={onBlur}>
                <option>US</option>
                <option>CA</option>
              </select>
            </div>
          </div>

          {/* CPQ Username */}
          <div>
            <label style={labelStyle}>CPQ Username</label>
            <input
              type="text"
              value={cpqUsername}
              onChange={(e) => setCpqUsername(e.target.value)}
              placeholder="user@example.com"
              required
              style={inputStyle}
              onFocus={onFocus}
              onBlur={onBlur}
              autoFocus
            />
          </div>

          {/* CPQ Password */}
          <div>
            <label style={labelStyle}>CPQ Password</label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                value={cpqPassword}
                onChange={(e) => setCpqPassword(e.target.value)}
                placeholder="CPQ login password"
                required
                style={{ ...inputStyle, paddingRight: 34 }}
                onFocus={onFocus}
                onBlur={onBlur}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                title={showPassword ? "Hide password" : "Show password"}
                style={{
                  position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer",
                  color: showPassword ? C.primary : C.muted, padding: 0, lineHeight: 1,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = C.primary; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = showPassword ? C.primary : C.muted; }}
              >
                {showPassword ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && <p style={{ color: C.danger, fontSize: 12, fontFamily: mono }}>{error}</p>}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: C.accent, color: "#fff", border: "none",
              borderRadius: 2, padding: "9px 0", fontFamily: mono,
              fontSize: bodySize, cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1, fontWeight: 600,
            }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>

      {/* Settings Modal — Login Defaults (all 8 combos) */}
      {settingsOpen && (
        <div
          ref={overlayRef}
          onClick={(e) => { if (e.target === overlayRef.current) setSettingsOpen(false); }}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
            zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: 24, width: 580, fontFamily: mono,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <span style={{ color: C.primary, fontSize: 13, fontWeight: 600 }}>Login Defaults</span>
              <button onClick={() => setSettingsOpen(false)} style={{ color: C.muted, background: "none", border: "none", cursor: "pointer", fontSize: 18 }}>×</button>
            </div>

            {settingsStep === "password" ? (
              <>
                <p style={{ color: C.muted, fontSize: 11, marginBottom: 14 }}>
                  Set default credentials per environment/brand/country combination.<br />
                  For password recovery: robert.engstler@agcocorp.com
                </p>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Admin Password</label>
                  <input
                    type="password"
                    value={settingsPassword}
                    onChange={(e) => setSettingsPassword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSettingsVerify(); }}
                    placeholder="Settings password"
                    style={inputStyle}
                    autoFocus
                  />
                </div>
                {settingsError && <p style={{ color: C.danger, fontSize: 11, marginBottom: 10 }}>{settingsError}</p>}
                <button onClick={handleSettingsVerify} style={{
                  width: "100%", background: C.accent, color: "#fff", border: "none",
                  borderRadius: 4, padding: "8px 0", fontFamily: mono, fontSize: 12, cursor: "pointer",
                }}>Unlock</button>
              </>
            ) : (
              <>
                {/* Column headers */}
                <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 1fr 52px", gap: 8, marginBottom: 6 }}>
                  <span style={{ ...labelStyle, marginBottom: 0 }}>Combination</span>
                  <span style={{ ...labelStyle, marginBottom: 0 }}>CPQ Username</span>
                  <span style={{ ...labelStyle, marginBottom: 0 }}>CPQ Password</span>
                  <span style={{ ...labelStyle, marginBottom: 0, textAlign: "center" }}>Default</span>
                </div>

                {/* Divider */}
                <div style={{ borderTop: `1px solid ${C.border}`, marginBottom: 10 }} />

                {/* 8 rows */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
                  {allDefaults.map((row, idx) => (
                    <div key={`${row.env}-${row.brand}-${row.country}`}
                      style={{ display: "grid", gridTemplateColumns: "110px 1fr 1fr 52px", gap: 8, alignItems: "center" }}>
                      <span style={{
                        fontSize: 11, color: row.env === "Stage" ? C.accent : C.secondary,
                        fontFamily: mono, whiteSpace: "nowrap",
                      }}>
                        {row.env} · {row.brand} · {row.country}
                      </span>
                      <input
                        type="text"
                        value={row.username}
                        onChange={(e) => updateDefault(idx, "username", e.target.value)}
                        placeholder="user@example.com"
                        style={smInput}
                      />
                      <input
                        type="text"
                        value={row.password}
                        onChange={(e) => updateDefault(idx, "password", e.target.value)}
                        placeholder="password"
                        style={smInput}
                      />
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        <input
                          type="radio"
                          name="default_combo"
                          checked={defaultIdx === idx}
                          onChange={() => setDefaultIdx(idx)}
                          style={{ accentColor: C.accent, cursor: "pointer", width: 14, height: 14 }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {settingsError && <p style={{ color: C.danger, fontSize: 11, marginBottom: 10 }}>{settingsError}</p>}
                {settingsSaved && <p style={{ color: C.success, fontSize: 11, marginBottom: 10 }}>All defaults saved.</p>}
                <button onClick={handleSettingsSave} style={{
                  width: "100%", background: C.accent, color: "#fff", border: "none",
                  borderRadius: 4, padding: "8px 0", fontFamily: mono, fontSize: 12, cursor: "pointer",
                }}>Save All</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
