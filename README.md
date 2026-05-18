# Scall

Scall stalls scam callers. Forward a suspicious email — or type a quick report — to `scall@agentmail.to` and we'll classify it, call the scammer's number with an AI agent that wastes their time, summarize the call after it ends, and write the results to a Supabase-backed dashboard.

## How it works

1. User emails / forwards a scam to `scall@agentmail.to`
2. AgentMail fires `message.received` → our Next.js route handler (`/api/webhook`)
3. **OpenAI** (`gpt-4o-mini`, strict JSON schema mode) classifies the email and extracts the scammer's phone number — handles both forwarded scams AND user-typed reports
4. If it's a scam with a callable, non-blocklisted number:
   - AgentPhone calls the scammer with the "Marge" persona — a confused widowed grandma running on AgentPhone's built-in audio-native LLM for natural pacing
   - User receives a confirmation email
5. When the call ends, AgentPhone fires `agent.call_ended` → `/api/call-ended`
6. **OpenAI** reads the transcript and extracts structured fields (impersonation target, money amount, payment method, notes)
7. A row is inserted into Supabase. The dashboard at `/addresses` reads from `/api/calls` and renders a searchable card grid.

## Stack

- **Vercel** — Next.js App Router hosting + serverless route handlers
- **OpenAI** (`gpt-4o-mini` by default) — scam classification + post-call transcript summarization, both via strict JSON schema mode
- **AgentMail** — inbound + outbound email (`scall@agentmail.to`)
- **AgentPhone** — outbound voice call with built-in audio-native LLM (persona configured in the AgentPhone dashboard)
- **Supabase** — post-call analytics storage

## Project structure

```
app/
  page.tsx                       # Landing — hero, live counter, "see SCALL in action" transcript demo
  landing.css
  layout.tsx, globals.css
  components/
    TranscriptDemo.tsx           # Animated sample-call transcript on the landing page
    transcriptDemo.css
  addresses/
    page.tsx                     # Searchable dashboard of captured records
    dashboard.css
  api/
    webhook/route.ts             # Inbound: email arrives → classify → trigger call
    call-ended/route.ts          # Inbound: AgentPhone call_ended → summarize → Supabase
    calls/route.ts               # GET: list of records for the dashboard
    stats/route.ts               # GET: aggregated count / seconds / money for the landing counter
lib/
  classify.ts                    # OpenAI classification (gpt-4o-mini, json_schema strict)
  summarize.ts                   # OpenAI post-call extraction
  agentphone.ts                  # triggerCall + isCallableNumber blocklist
  agentmail.ts                   # Sends confirmation emails
  supabase.ts                    # PostgREST insert / select helpers (no @supabase/supabase-js dep)
public/
  animation.min.js, fire-init.js # Ambient ASCII fire animation
```

## Environment variables

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | OpenAI API key — used for classification and summarization |
| `OPENAI_CLASSIFY_MODEL` | Optional, defaults to `gpt-4o-mini` |
| `OPENAI_SUMMARIZE_MODEL` | Optional, defaults to `gpt-4o-mini` |
| `AGENTMAIL_API_KEY` | AgentMail API key |
| `AGENTMAIL_INBOX_ID` | `scall@agentmail.to` |
| `AGENTPHONE_API_KEY` | AgentPhone API key |
| `AGENTPHONE_AGENT_ID` | ID of the pre-configured stalling agent (`cmp1jolov03ivdex6x7qhaqau`) |
| `SUPABASE_URL` | Project URL (e.g. `https://xxxxx.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for inserts (bypasses RLS) |
| `SUPABASE_TABLE` | Optional override, defaults to `scam_calls` |

Copy `.env.example` to `.env.local` and fill in the values.

## Supabase schema

Run this in the Supabase SQL editor:

```sql
create table public.scam_calls (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  call_id              text,                       -- AgentPhone's callId
  phone_number         text not null,              -- E.164
  duration_seconds     integer,
  impersonation_target text,                       -- "IRS", "Amazon", etc.
  money_amount         numeric,                    -- 3200 (null if unspecified)
  money_amount_text    text,                       -- original phrasing
  payment_method       text,                       -- "gift card" / "wire" / null
  notes                text,                       -- LLM-written summary
  transcript           jsonb                       -- raw [{role, content}, ...]
);

create index scam_calls_created_at_idx on public.scam_calls (created_at desc);
create index scam_calls_phone_idx on public.scam_calls (phone_number);

alter table public.scam_calls enable row level security;

-- Read-only public access for the dashboard (use anon key on the frontend)
create policy "scam_calls_read_anon" on public.scam_calls
  for select using (true);
```

## Local development

```bash
npm install
npm run dev    # next dev — opens on :3000
```

## Testing without a real call

```bash
# Trigger end-to-end email → call flow:
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d @sample.md
```

```bash
# Synthetic post-call test (writes a row to Supabase without making a call):
curl -X POST https://scall-seven.vercel.app/api/call-ended \
  -H "Content-Type: application/json" \
  -d '{
    "event": "agent.call_ended",
    "data": {
      "callId": "synthetic-1",
      "to": "+14154883120",
      "direction": "outbound",
      "durationSeconds": 124,
      "transcript": [
        {"role":"agent","content":"Hello?"},
        {"role":"user","content":"This is the IRS. You owe $3,200."}
      ]
    }
  }'
```

## Deploy

```bash
vercel --prod
```

After deploy, make sure these are wired up:

1. **AgentMail webhook**: `https://scall-seven.vercel.app/api/webhook`, subscribed to `message.received` only.
2. **AgentPhone agent webhook**: configured per-agent via:
   ```bash
   curl -X POST https://api.agentphone.ai/v1/agents/$AGENTPHONE_AGENT_ID/webhook \
     -H "Authorization: Bearer $AGENTPHONE_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"url":"https://scall-seven.vercel.app/api/call-ended"}'
   ```
   This fires `agent.call_ended` events to our endpoint when calls end. Confirm with:
   ```bash
   curl https://api.agentphone.ai/v1/agents/$AGENTPHONE_AGENT_ID/webhook \
     -H "Authorization: Bearer $AGENTPHONE_API_KEY"
   ```
