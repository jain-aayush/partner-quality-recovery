import { NextRequest, NextResponse } from "next/server";
import { addAppeal, listAppeals } from "../../../lib/appeals-store";

// In-memory store → never cache; always read/write live.
export const dynamic = "force-dynamic";

/** GET → all appeals (newest first), for the QM dashboard's Appeals tab. */
export async function GET() {
  return NextResponse.json({ appeals: listAppeals() });
}

/** POST → record a partner's appeal from the /partner app. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const partnerId = str(body.partnerId).trim();
  const sku = str(body.sku).trim();
  const reason = str(body.reason).trim();

  if (!partnerId || !sku) return NextResponse.json({ error: "partnerId and sku are required." }, { status: 400 });
  if (reason.length < 3) return NextResponse.json({ error: "Please add a short explanation for your appeal." }, { status: 400 });

  const appeal = addAppeal({
    partnerId,
    partnerName: str(body.partnerName).trim() || partnerId,
    sku,
    cause: str(body.cause),
    action: str(body.action),
    decisionLabel: str(body.decisionLabel),
    reason: reason.slice(0, 2000),
  });
  return NextResponse.json({ appeal });
}
