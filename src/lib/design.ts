/* ─── Design Tokens (Cloud Light theme) ─────────────────────── */

export const C = {
  bg:          "#ffffff",
  surface:     "#f6f8fa",
  surfaceAlt:  "#fafafa",
  surfaceHi:   "#f0f2f5",
  border:      "#e5e7eb",
  inputBg:     "#ffffff",
  inputBdr:    "#d1d5db",
  muted:       "#9ca3af",
  secondary:   "#6b7280",
  primary:     "#111827",
  accent:      "#2563eb",
  accentBg:    "#dbeafe",
  success:     "#16a34a",
  successBg:   "#dcfce7",
  danger:      "#dc2626",
  dangerBg:    "#fee2e2",
  warning:     "#d97706",
  warningBg:   "#fef3c7",
  pending:     "#9ca3af",
  pendingBg:   "#f3f4f6",
};

export const mono = "'JetBrains Mono', monospace";
export const sans = "var(--font-inter), 'Inter', sans-serif";
export const bodySize = 13;

export const STATUS_CONFIG: Record<
  string,
  { color: string; bg: string; border: string }
> = {
  pending:  { color: C.accent,   bg: C.accentBg,   border: C.accent },
  complete: { color: C.success,  bg: C.successBg,  border: C.success },
  failed:   { color: C.danger,   bg: C.dangerBg,   border: C.danger },
  stopped:  { color: C.warning,  bg: C.warningBg,  border: C.warning },
};

export const VIN_COLORS = {
  green:  C.success,
  yellow: C.warning,
  red:    C.danger,
  gray:   C.muted,
} as const;

export type VinColorKey = keyof typeof VIN_COLORS;

/** Shared table header style */
export const thStyle: React.CSSProperties = { color: C.muted };
export const thClass = "px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider";
export const tdTop: React.CSSProperties = { verticalAlign: "top" };
