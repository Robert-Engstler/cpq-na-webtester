import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const { rows } = await sql`SELECT suggestion_text FROM analysis_snapshots WHERE id = ${id}`;
  if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const suggestionText: string = rows[0].suggestion_text;

  const prompt = `You are analyzing an AI-generated retrospective of Playwright E2E test failures for a CPQ web testing tool.

Extract all concrete, actionable code changes from the analysis below. Focus only on changes to the Playwright test script: timeouts, selectors, retries, waits, assertions, navigation logic, etc.

Return ONLY a valid JSON array — no markdown fences, no explanation. Shape:
[{"id":"1","text":"...","status":"pending"}]

Rules:
- Maximum 10 items
- Each item must be ONE specific change, not a category or general recommendation
- Be precise: include the step name, current value, and target value where the analysis mentions them
- Skip generic advice like "improve error handling" — only include changes that map to concrete lines of code
- Skip items about the CPQ application itself; only test script changes

Analysis:
${suggestionText}`;

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = message.content
      .filter(b => b.type === "text")
      .map(b => (b as { type: "text"; text: string }).text)
      .join("").trim();

    let actionItems: Array<{ id: string; text: string; status: string }>;
    try {
      actionItems = JSON.parse(raw);
      if (!Array.isArray(actionItems)) throw new Error("not an array");
    } catch {
      return NextResponse.json({ error: `Failed to parse action items: ${raw.slice(0, 200)}` }, { status: 500 });
    }

    // Normalise and cap at 10
    actionItems = actionItems.slice(0, 10).map((item, i) => ({
      id: String(item.id ?? i + 1),
      text: String(item.text ?? ""),
      status: ["pending", "done", "dismissed"].includes(item.status) ? item.status : "pending",
    }));

    await sql`
      UPDATE analysis_snapshots
      SET action_items = ${JSON.stringify(actionItems)}::jsonb
      WHERE id = ${id}
    `;

    const { rows: updated } = await sql`SELECT * FROM analysis_snapshots WHERE id = ${id}`;
    return NextResponse.json(updated[0]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/analysis/snapshots/[id]/extract-actions]", msg);
    return NextResponse.json({ error: `Claude API call failed: ${msg}` }, { status: 500 });
  }
}
