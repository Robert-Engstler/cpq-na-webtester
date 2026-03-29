/**
 * CPQ NA URL matrix.
 * Key format: "{Environment}|{Brand}|{Country}"
 * Environment: Prod | Stage
 * Brand:       FT (Fendt) | MF (Massey Ferguson)
 * Country:     US | CA
 */
export const CPQ_URL_MATRIX: Record<string, string> = {
  "Prod|FT|US":  "https://cpq.agcocorp.com/fendt/dealer/en_US/aftersales/machineselection",
  "Prod|FT|CA":  "https://cpq.agcocorp.com/fendt/dealer/fr_CA/aftersales/machineselection",
  "Prod|MF|US":  "https://cpq.agcocorp.com/masseyferguson/dealer/en_US/aftersales/machineselection",
  "Prod|MF|CA":  "https://cpq.agcocorp.com/masseyferguson/dealer/fr_CA/aftersales/machineselection",
  "Stage|FT|US": "https://www.cpq.staging.aws-ct.agcocorp.com/fendt/dealer/en_US/aftersales/machineselection",
  "Stage|FT|CA": "https://www.cpq.staging.aws-ct.agcocorp.com/fendt/dealer/fr_CA/aftersales/machineselection",
  "Stage|MF|US": "https://www.cpq.staging.aws-ct.agcocorp.com/masseyferguson/dealer/en_US/aftersales/machineselection",
  "Stage|MF|CA": "https://www.cpq.staging.aws-ct.agcocorp.com/masseyferguson/dealer/fr_CA/aftersales/machineselection",
};

export function resolveCpqUrl(environment: string, brand: string, country: string): string {
  return CPQ_URL_MATRIX[`${environment}|${brand}|${country}`] ?? "";
}

export const ENVIRONMENTS = ["Prod", "Stage"] as const;
export const BRANDS = ["FT", "MF"] as const;
export const COUNTRIES = ["US", "CA"] as const;
export const GC_OPTIONS = ["Annual", "Standard", "Parts-Only"] as const;

export type Environment = typeof ENVIRONMENTS[number];
export type Brand = typeof BRANDS[number];
export type Country = typeof COUNTRIES[number];
export type GcOption = typeof GC_OPTIONS[number];
