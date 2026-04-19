import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export interface StepStat {
  stepName:      string;   // step label stripped of [VIN] prefix
  totalRuns:     number;
  failures:      number;
  failureRate:   number;   // 0–1
  avgDurationMs: number | null;
  topErrors:     { error: string; errorCategory: string; count: number }[];
  byCombo:       { brand: string; country: string; gcOption: string; runs: number; failures: number }[];
}

export interface AnalysisResult {
  generatedAt:   string;
  totalRuns:     number;
  totalSteps:    number;
  overallFailureRate: number;
  steps:         StepStat[];
  trend:         { date: string; runs: number; failures: number }[];  // last 30 days
}

// Strip [VIN] prefix from step names so we can group across VINs
function normalizeStep(step: string): string {
  return step.replace(/^\[[^\]]+\]\s*/, "").trim();
}

export async function GET() {
  try {
    const { rows: runs } = await sql`
      SELECT
        r.id, r.brand, r.country, r.status, r.result_json, r.created_at
      FROM test_runs r
      WHERE r.result_json IS NOT NULL
      ORDER BY r.created_at DESC
      LIMIT 200
    `;

    if (runs.length === 0) {
      return NextResponse.json({
        generatedAt: new Date().toISOString(),
        totalRuns: 0, totalSteps: 0, overallFailureRate: 0,
        steps: [], trend: [],
      } satisfies AnalysisResult);
    }

    // Aggregate step stats across all runs
    const stepMap = new Map<string, {
      total: number; failures: number; durations: number[];
      errors: Map<string, { category: string; count: number }>;
      combos: Map<string, { brand: string; country: string; gcOption: string; runs: number; failures: number }>;
    }>();

    const trendMap = new Map<string, { runs: number; failures: number }>();

    let totalSteps = 0;
    let totalFailures = 0;

    for (const run of runs) {
      const steps: Record<string, unknown>[] = Array.isArray(run.result_json) ? run.result_json : [];
      const dateKey = new Date(run.created_at).toISOString().slice(0, 10);

      if (!trendMap.has(dateKey)) trendMap.set(dateKey, { runs: 0, failures: 0 });
      const dayBucket = trendMap.get(dateKey)!;
      dayBucket.runs++;
      if (run.status === "failed") dayBucket.failures++;

      for (const step of steps) {
        const name   = normalizeStep(String(step.step ?? ""));
        const passed = Boolean(step.passed);
        const dur    = typeof step.durationMs === "number" ? step.durationMs : null;
        const gcOpt  = String(step.gcOption ?? "unknown");
        const brand  = run.brand;
        const country = run.country;

        totalSteps++;
        if (!passed) totalFailures++;

        if (!stepMap.has(name)) {
          stepMap.set(name, { total: 0, failures: 0, durations: [], errors: new Map(), combos: new Map() });
        }
        const s = stepMap.get(name)!;
        s.total++;
        if (!passed) s.failures++;
        if (dur != null) s.durations.push(dur);

        // Track error patterns
        if (!passed && step.error) {
          const errKey = String(step.error).slice(0, 120);
          const cat    = String(step.errorCategory ?? "other");
          if (!s.errors.has(errKey)) s.errors.set(errKey, { category: cat, count: 0 });
          s.errors.get(errKey)!.count++;
        }

        // Track per-combo breakdown
        const comboKey = `${brand}|${country}|${gcOpt}`;
        if (!s.combos.has(comboKey)) s.combos.set(comboKey, { brand, country, gcOption: gcOpt, runs: 0, failures: 0 });
        const combo = s.combos.get(comboKey)!;
        combo.runs++;
        if (!passed) combo.failures++;
      }
    }

    // Sort steps by failure rate desc, then by name
    const steps: StepStat[] = Array.from(stepMap.entries())
      .map(([stepName, s]) => ({
        stepName,
        totalRuns:     s.total,
        failures:      s.failures,
        failureRate:   s.total > 0 ? s.failures / s.total : 0,
        avgDurationMs: s.durations.length > 0
          ? Math.round(s.durations.reduce((a, b) => a + b, 0) / s.durations.length)
          : null,
        topErrors: Array.from(s.errors.entries())
          .map(([error, { category, count }]) => ({ error, errorCategory: category, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 3),
        byCombo: Array.from(s.combos.values())
          .sort((a, b) => b.failures - a.failures),
      }))
      .filter(s => s.stepName !== "" && s.stepName !== "Login" && s.stepName !== "Accept cookies")
      .sort((a, b) => b.failureRate - a.failureRate || b.failures - a.failures);

    // Build 30-day trend (sorted by date asc)
    const trend = Array.from(trendMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-30)
      .map(([date, v]) => ({ date, ...v }));

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      totalRuns:   runs.length,
      totalSteps,
      overallFailureRate: totalSteps > 0 ? totalFailures / totalSteps : 0,
      steps,
      trend,
    } satisfies AnalysisResult);
  } catch (err) {
    console.error("[GET /api/analysis]", err);
    return NextResponse.json({ error: "Failed to compute analysis" }, { status: 500 });
  }
}
