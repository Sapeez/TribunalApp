// GET /api/models — the curated OpenRouter model allowlist. §8/§9.
import { NextResponse } from "next/server";
import { CURATED_MODELS, DEFAULT_MODEL } from "@/lib/constants";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ models: CURATED_MODELS, defaultModel: DEFAULT_MODEL });
}
