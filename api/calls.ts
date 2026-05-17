import type { VercelRequest, VercelResponse } from "@vercel/node";
import { selectScamCalls } from "../lib/supabase";

// GET-only endpoint that returns the most recent scam_calls rows for the
// public-facing dashboard (public/addresses.html). Uses the existing
// service_role key on the server side so no Supabase credentials leak to
// the frontend. Short-cached at the edge to keep things snappy.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const rows = await selectScamCalls(50);
    res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=30");
    return res.status(200).json(rows);
  } catch (err) {
    const e = err as Error;
    console.error("[api/calls] error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
