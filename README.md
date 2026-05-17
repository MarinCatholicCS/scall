# Scall

Scall stalls scam callers. Forward a suspicious email to `scall@agentmail.to` and we'll classify it, call the scammer's number with an AI agent that wastes their time, summarize the call after it ends, and write the results to a Supabase dashboard.

## How it works

1. Victim forwards a scam email to `scall@agentmail.to`
2. AgentMail fires `message.received` → our Vercel webhook (`/api/webhook`)
3. **Gemini** (`gemini-3.1-flash-lite-preview` → `gemini-2.5-flash` fallback) classifies the email and extracts the phone number
4. If it's a scam with a callable number:
   - AgentPhone calls the scammer with the "Marge" persona — a confused widowed grandma running on AgentPhone's built-in audio-native LLM for natural pacing
   - Victim receives a confirmation email
5. When the call ends, AgentPhone fires `agent.call_ended` → our Vercel webhook (`/api/call-ended`)
6. **Gemini** reads the transcript and extracts structured fields (impersonation target, money amount, payment method, notes)
7. A row is inserted into Supabase for a partner-built dashboard to display

## Stack

- **Vercel** — serverless function hosting
- **Gemini** (`gemini-3.1-flash-lite-preview` / `gemini-2.5-flash`) — scam classification + post-call transcript summarization
- **AgentMail** — inbound + outbound email (`scall@agentmail.to`)
- **AgentPhone** — outbound voice call with built-in audio-native LLM (custom `systemPrompt` per call)
- **Supabase** — post-call analytics storage

## Project structure

```
api/
  webhook.ts       # Inbound: email arrives → classify → trigger call
  call-ended.ts    # Inbound: AgentPhone call_ended → summarize → Supabase
  converse.ts      # (Legacy) per-turn webhook — kept as fallback, unused in production
lib/
  classify.ts      # Gemini classification of forwarded emails
  agentphone.ts    # Triggers the outbound call with the Marge systemPrompt
  agentmail.ts     # Sends victim confirmation emails
  summarize.ts     # Gemini extraction of structured fields from transcript
  supabase.ts      # PostgREST insert wrapper (no @supabase/supabase-js dep)
  gemini.ts        # (Legacy) per-turn stall line generator, used by api/converse.ts
```

## Environment variables

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Gemini API key — used for classification and summarization |
| `AGENTMAIL_API_KEY` | AgentMail API key |
| `AGENTMAIL_INBOX_ID` | `scall@agentmail.to` |
| `AGENTPHONE_API_KEY` | AgentPhone API key |
| `AGENTPHONE_AGENT_ID` | ID of the pre-configured stalling agent (`cmp1jolov03ivdex6x7qhaqau`) |
| `SUPABASE_URL` | Project URL (e.g. `https://xxxxx.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for inserts (bypasses RLS) |
| `SUPABASE_TABLE` | Optional override, defaults to `scam_calls` |
| `OPENAI_API_KEY` | Legacy — only kept around for fast rollback if Gemini classify breaks |
| `GEMINI_MODEL`, `GEMINI_CLASSIFY_MODEL`, `GEMINI_SUMMARIZE_MODEL` | Optional model overrides |

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
  notes                text,                       -- Gemini-written summary
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
vercel dev --listen 3001
```

## Testing without a real call

```bash
# Trigger end-to-end email → call flow:
curl -X POST http://localhost:3001/api/webhook \
  -H "Content-Type: application/json" \
  -d @sample.md   # or paste an inline payload
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
