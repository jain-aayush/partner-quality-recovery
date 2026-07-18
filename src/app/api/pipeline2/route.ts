import { NextRequest, NextResponse } from "next/server";
import { getDataset, setDataset } from "../../../lib/dataset-store";
import { runPipeline2 } from "../../../lib/pipeline2";
import { parseUnifiedCsv, runFromRows } from "../../../lib/unified";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Drives the whole console. No body → bundled sample (and resets the active dataset). Body { csv }
 * (unified format, see public/uc-sample.csv) → the upload drives decisions AND progress, and becomes
 * the active dataset both the dashboard and the partner app read.
 */
export async function POST(req: NextRequest) {
  let csv: string | undefined;
  try { csv = ((await req.json()) as { csv?: string })?.csv; } catch { /* no body → bundled */ }

  if (csv) {
    const parsed = parseUnifiedCsv(csv);
    if (parsed.rows.length === 0) {
      return NextResponse.json({ error: parsed.issues[0] ?? "Couldn't read any rows — check the columns match the sample CSV.", issues: parsed.issues }, { status: 400 });
    }
    setDataset(parsed.rows, "upload"); // ← the partner app now reads this same dataset
    const r = runFromRows(parsed.rows);
    return NextResponse.json({ cases: r.cases, partners: r.partners, progress: r.progress, config: r.config, source: "upload", rowCount: parsed.rows.length, issues: parsed.issues, backfillCount: parsed.backfillCount });
  }
  setDataset(null, "sample"); // "Run on sample data" resets the active dataset
  const r = runPipeline2();
  return NextResponse.json({ cases: r.cases, partners: r.partners, progress: r.progress, config: r.config, source: "sample" });
}

/** Read-only: the CURRENT active dataset (uploaded if any, else bundled sample). The partner app uses this. */
export async function GET() {
  const ds = getDataset();
  if (ds.rows) {
    const r = runFromRows(ds.rows);
    return NextResponse.json({ cases: r.cases, partners: r.partners, progress: r.progress, config: r.config, source: "upload", rowCount: ds.rows.length });
  }
  const r = runPipeline2();
  return NextResponse.json({ cases: r.cases, partners: r.partners, progress: r.progress, config: r.config, source: "sample" });
}
