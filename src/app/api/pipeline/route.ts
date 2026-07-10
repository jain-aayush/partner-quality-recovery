import { NextResponse } from "next/server";
import { loadConfig } from "../../../lib/config";
import { runPipeline } from "../../../lib/pipeline";

export const maxDuration = 60;

export async function POST() {
  const result = await runPipeline(loadConfig());
  return NextResponse.json(result);
}
