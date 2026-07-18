import { NextResponse } from "next/server";
import { logAuditEvent } from "../../../lib/observability";

/**
 * Audit sink for human decisions. The client store mirrors every QM decision, appeal, and appeal
 * resolution here fire-and-forget; with LANGFUSE_* keys set each becomes a durable, immutable
 * trace (name: qm-decision | appeal-filed | appeal-resolved) — the per-decision audit record the
 * PRD §"Audit record" requires. Without keys it degrades to the browser-local demo store only.
 */

const AUDIT_EVENTS = ["qm-decision", "appeal-filed", "appeal-resolved"] as const;
type AuditEventName = (typeof AUDIT_EVENTS)[number];

export async function POST(req: Request) {
  let body: { event?: string; payload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (!body.event || !AUDIT_EVENTS.includes(body.event as AuditEventName) || typeof body.payload !== "object" || body.payload === null) {
    return NextResponse.json({ ok: false, error: "expected { event, payload }" }, { status: 400 });
  }
  const recorded = await logAuditEvent(body.event as AuditEventName, {
    ...body.payload,
    recordedAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true, recorded });
}
