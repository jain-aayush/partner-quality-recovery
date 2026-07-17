import { NextRequest, NextResponse } from "next/server";
import { runPipeline2 } from "../../../lib/pipeline2";
import { parseUnifiedCsv, runFromRows } from "../../../lib/unified";

export const maxDuration = 60;

/**
 * Drives the whole console. No body → bundled sample. Body { csv } (unified format, see
 * public/uc-sample.csv) → the upload drives decisions AND progress.
 */
export async function POST(req: NextRequest) {
  let csv: string | undefined;
  try { csv = ((await req.json()) as { csv?: string })?.csv; } catch { /* no body → bundled */ }

  if (csv) {
    const rows = parseUnifiedCsv(csv);
    if (rows.length === 0) return NextResponse.json({ error: "Couldn't read any rows — check the columns match the sample CSV." }, { status: 400 });
    const r = runFromRows(rows);
    return NextResponse.json({ cases: r.cases, partners: r.partners, progress: r.progress, config: r.config, source: "upload", rowCount: rows.length });
  }
  const r = runPipeline2();
  return NextResponse.json({ cases: r.cases, partners: r.partners, progress: r.progress, config: r.config, source: "sample" });
}
