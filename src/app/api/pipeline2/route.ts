import { NextRequest, NextResponse } from "next/server";
import { flushObservability } from "../../../lib/observability";
import { sampleRows } from "../../../lib/pipeline2";
import { buildTagRuntime } from "../../../lib/tagRuntime";
import { parseUnifiedCsv, runFromRows } from "../../../lib/unified";

export const maxDuration = 60;

/**
 * Drives the whole console. No body → bundled sample, which reuses its stored tags and
 * live-tags only what isn't tagged yet. Body { csv } (unified format, see public/uc-sample.csv)
 * → the upload drives decisions AND progress, live-tagged in llm mode (anthropic → openai →
 * rule fallback). The `inference` field tells the UI which engine actually ran.
 */
export async function POST(req: NextRequest) {
  let csv: string | undefined;
  try { csv = ((await req.json()) as { csv?: string })?.csv; } catch { /* no body → bundled */ }

  if (csv) {
    const parsed = parseUnifiedCsv(csv);
    if (parsed.rows.length === 0) {
      return NextResponse.json({ error: parsed.issues[0] ?? "Couldn't read any rows — check the columns match the sample CSV.", issues: parsed.issues }, { status: 400 });
    }
    const { tagFn, summary } = await buildTagRuntime(parsed.rows, "upload");
    const r = runFromRows(parsed.rows, tagFn);
    await flushObservability();
    return NextResponse.json({ cases: r.cases, partners: r.partners, progress: r.progress, config: r.config, source: "upload", rowCount: parsed.rows.length, issues: parsed.issues, backfillCount: parsed.backfillCount, inference: summary() });
  }

  const rows = sampleRows();
  const { tagFn, summary } = await buildTagRuntime(rows, "sample");
  const r = runFromRows(rows, tagFn);
  await flushObservability();
  return NextResponse.json({ cases: r.cases, partners: r.partners, progress: r.progress, config: r.config, source: "sample", inference: summary() });
}
