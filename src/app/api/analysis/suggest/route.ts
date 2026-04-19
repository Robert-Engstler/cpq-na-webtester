import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { AnalysisResult } from "../route";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  let analysis: AnalysisResult;
  try {
    analysis = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const prompt = buildPrompt(analysis);

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content
      .filter(b => b.type === "text")
      .map(b => (b as { type: "text"; text: string }).text)
      .join("\n");

    return NextResponse.json({ suggestion: text, generatedAt: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/analysis/suggest]", msg);
    return NextResponse.json({ error: `Claude API call failed: ${msg}` }, { status: 500 });
  }
}

function buildPrompt(a: AnalysisResult): string {
  const topFailures = a.steps
    .filter(s => s.failures > 0)
    .slice(0, 10)
    .map(s => {
      const rate = (s.failureRate * 100).toFixed(0);
      const combos = s.byCombo
        .filter(c => c.failures > 0)
        .map(c => `${c.brand}/${c.country}/${c.gcOption}: ${c.failures}/${c.runs}`)
        .join(", ");
      const errors = s.topErrors
        .map(e => `"${e.error}" (${e.errorCategory}, ×${e.count})`)
        .join("; ");
      return `- ${s.stepName}: ${rate}% failure rate (${s.failures}/${s.totalRuns} runs)` +
        (combos  ? `\n  Combos: ${combos}` : "") +
        (errors  ? `\n  Errors: ${errors}` : "") +
        (s.avgDurationMs ? `\n  Avg duration: ${s.avgDurationMs}ms` : "");
    })
    .join("\n\n");

  return `You are an expert in Playwright E2E test automation reviewing aggregated test results for a CPQ (Configure Price Quote) web testing tool.

Context:
- The tool tests an AGCO CPQ portal across brands (FT/MF), countries (US/CA), and GenuineCare option types (Standard/Annual/Parts-Only)
- Tests run on GitHub Actions against a staging environment
- Each test has up to 15 steps: VIN search → GenuineCare selection → configuration → apply changes → save config → PDF downloads → create quote → customer search → save quotation → place order → order PDF downloads

Aggregated results from the last ${a.totalRuns} runs (${a.totalSteps} total step executions):
Overall step failure rate: ${(a.overallFailureRate * 100).toFixed(1)}%

Top failing steps:
${topFailures || "No failures recorded."}

Please provide a structured retrospective analysis with:
1. **Key findings** — which steps/combos are most fragile and why (based on error patterns)
2. **Root cause hypotheses** — for each top failure, what is the likely underlying cause
3. **Concrete improvement recommendations** — specific changes to the test script or CPQ interaction logic that would reduce failures (e.g. increase timeout, add retry, change selector, add wait)
4. **Priority order** — which fix would have the biggest impact

Be specific and actionable. Focus on the test script logic, not the CPQ application itself.`;
}
