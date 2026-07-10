import { NextRequest, NextResponse } from "next/server";
import partnersJson from "../../../../data/partners.json";
import reviewsJson from "../../../../data/reviews.json";
import { loadConfig } from "../../../lib/config";
import { diagnosePartner } from "../../../lib/diagnose";
import { gate, POLICY } from "../../../lib/policy";
import { Partner, Review } from "../../../lib/types";

export const maxDuration = 60;

const partners = partnersJson as unknown as Partner[];
const reviews = reviewsJson as unknown as Review[];

/** Diagnose a single partner on demand — same guardrail path as the pipeline. */
export async function POST(req: NextRequest) {
  const { partnerId } = await req.json();
  const partner = partners.find((p) => p.id === partnerId);
  if (!partner) {
    return NextResponse.json({ error: `unknown partner: ${partnerId}` }, { status: 404 });
  }
  const config = loadConfig();
  const diagnosis = await diagnosePartner(
    partner,
    reviews.filter((r) => r.partnerId === partnerId),
    config
  );
  const policy = POLICY[diagnosis.rootCause];
  return NextResponse.json({ diagnosis, policy, gate: gate(policy, diagnosis, config) });
}
