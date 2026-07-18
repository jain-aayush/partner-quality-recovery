import { NextRequest, NextResponse } from "next/server";
import { listDecisions, setDecision } from "../../../lib/decisions-store";
import { OUTCOME, type OutcomeKind } from "../../../lib/outcomes";

export const dynamic = "force-dynamic";

/** GET → every QM decision (newest first). Read by the dashboard and the partner app. */
export async function GET() {
  return NextResponse.json({ decisions: listDecisions() });
}

/** POST → the QM applies / overrides / rejects an action for one partner × SKU. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const partnerId = str(body.partnerId).trim();
  const sku = str(body.sku).trim();
  const outcome = str(body.outcome) as OutcomeKind;
  const note = str(body.note).trim();

  if (!partnerId || !sku) return NextResponse.json({ error: "partnerId and sku are required." }, { status: 400 });
  if (!(outcome in OUTCOME)) return NextResponse.json({ error: "Unknown outcome." }, { status: 400 });
  if (note.length < 3) return NextResponse.json({ error: "Please record a short rationale." }, { status: 400 });

  const decision = setDecision({
    partnerId, sku, outcome,
    label: str(body.label) || OUTCOME[outcome].label(sku),
    note: note.slice(0, 2000),
    status: outcome === "keep_watching" ? "rejected" : "applied",
    decidedBy: str(body.decidedBy) || "qm",
  });
  return NextResponse.json({ decision });
}
