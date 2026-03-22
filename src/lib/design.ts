/* ─── Design Tokens (dark monospace theme) ─────────────────────── */

export const C = {
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

export const mono = "'JetBrains Mono', monospace";
export const bodySize = 13;

export const STATUS_CONFIG: Record<
  string,
  { color: string; bg: string; border: string }
> = {
  pending:  { color: C.pending, bg: "rgba(107,114,128,0.1)", border: C.pending },
  complete: { color: C.success, bg: "rgba(34,197,94,0.1)",   border: C.success },
  failed:   { color: C.danger,  bg: "rgba(239,68,68,0.1)",   border: C.danger },
};

export const VIN_COLORS = {
  green:  C.success,
  yellow: C.warning,
  red:    C.danger,
  gray:   C.muted,
} as const;

export type VinColorKey = keyof typeof VIN_COLORS;

/** Shared table header style */
export const thStyle: React.CSSProperties = { color: C.secondary };
export const thClass = "px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider";
export const tdTop: React.CSSProperties = { verticalAlign: "top" };
