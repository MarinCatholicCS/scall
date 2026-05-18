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

export interface ScamCallStats {
  count: number;
  total_seconds: number;
  total_money: number;
}

export async function selectScamCallStats(): Promise<ScamCallStats> {
  const baseUrl = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const table = process.env.SUPABASE_TABLE ?? "scam_calls";

  if (!baseUrl || !key) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set");
  }

  // Pull only the two numeric fields we need to aggregate.
  // 10k cap is far above any expected volume but cheap; revisit if needed.
  const url = `${baseUrl.replace(/\/$/, "")}/rest/v1/${table}?select=duration_seconds,money_amount&limit=10000`;
  const r = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`Supabase ${r.status}: ${text.slice(0, 300)}`);
  }
  const rows = (await r.json()) as Array<{ duration_seconds: number | null; money_amount: number | null }>;
  const total_seconds = rows.reduce((s, x) => s + (x.duration_seconds ?? 0), 0);
  const total_money = rows.reduce((s, x) => s + (x.money_amount ?? 0), 0);
  return { count: rows.length, total_seconds, total_money };
}

export async function selectScamCalls(
  limit = 50,
  minDurationSeconds = 0
): Promise<ScamCallRow[]> {
  const baseUrl = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const table = process.env.SUPABASE_TABLE ?? "scam_calls";

  if (!baseUrl || !key) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set");
  }

  // `gte` excludes nulls automatically (null comparisons are false in SQL),
  // which is what we want for short / failed calls.
  const durationFilter = minDurationSeconds > 0
    ? `&duration_seconds=gte.${minDurationSeconds}`
    : "";
  const url = `${baseUrl.replace(/\/$/, "")}/rest/v1/${table}?select=*&order=created_at.desc&limit=${limit}${durationFilter}`;
  const r = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`Supabase ${r.status}: ${text.slice(0, 300)}`);
  }

  return (await r.json()) as ScamCallRow[];
}
