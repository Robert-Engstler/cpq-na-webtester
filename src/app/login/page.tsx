"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { C, bodySize } from "@/lib/design";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push("/scenarios");
      } else {
        setError("Incorrect password. Try again.");
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{ background: C.bg }}
    >
      <div
        className="w-full max-w-sm p-8"
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
        }}
      >
        <h1
          className="mb-6 text-xl font-semibold"
          style={{ color: C.primary }}
        >
          CPQ Webtester
        </h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-[10px] font-medium uppercase tracking-wider"
              style={{ color: C.secondary }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2 focus:outline-none"
              style={{
                background: C.inputBg,
                border: `1px solid ${C.inputBdr}`,
                color: C.primary,
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
          {error && (
            <p className="text-sm" style={{ color: C.danger }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 font-semibold disabled:opacity-50"
            style={{
              background: C.accent,
              color: "#fff",
              border: "none",
              borderRadius: 2,
              fontSize: bodySize,
            }}
          >
            {loading ? "Signing in\u2026" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
