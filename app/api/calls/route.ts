import { NextResponse } from "next/server";
import { selectScamCalls } from "@/lib/supabase";

// GET-only endpoint returning the most recent scam_calls rows for the
// public-facing dashboard. Uses the existing service_role key on the
// server side so no Supabase credentials leak to the frontend.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await selectScamCalls(200);
    return NextResponse.json(rows, {
      status: 200,
      headers: { "Cache-Control": "s-maxage=10, stale-while-revalidate=30" },
    });
  } catch (err) {
    const e = err as Error;
    console.error("[api/calls] error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
