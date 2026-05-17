import { NextResponse } from "next/server";
import { selectScamCallStats } from "@/lib/supabase";

// Aggregated counters for the landing page: { count, total_seconds, total_money }
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stats = await selectScamCallStats();
    return NextResponse.json(stats, {
      status: 200,
      headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=60" },
    });
  } catch (err) {
    const e = err as Error;
    console.error("[api/stats] error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
