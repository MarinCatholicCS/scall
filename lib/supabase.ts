// Minimal Supabase PostgREST client. Inserts one row using the service_role
// key (bypasses RLS). Avoids the @supabase/supabase-js npm dep for a smaller
// serverless bundle.

export interface ScamCallRow {
  call_id?: string | null;
  phone_number: string;
  duration_seconds?: number | null;
  impersonation_target?: string | null;
  money_amount?: number | null;
  money_amount_text?: string | null;
  payment_method?: string | null;
  notes?: string | null;
  transcript?: unknown;
}

export async function insertScamCall(row: ScamCallRow): Promise<void> {
  const baseUrl = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const table = process.env.SUPABASE_TABLE ?? "scam_calls";

  if (!baseUrl || !key) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set");
  }

  const url = `${baseUrl.replace(/\/$/, "")}/rest/v1/${table}`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`Supabase ${r.status}: ${text.slice(0, 300)}`);
  }

  console.log(`[supabase] inserted row into ${table}`);
}
