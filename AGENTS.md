# Agents

## AgentPhone — Scam Staller

**Platform:** AgentPhone (`agentphone.ai`)
**Agent ID:** `cmp1jolov03ivdex6x7qhaqau`
**Phone number:** `+14154494819`

Persona: a confused, slow-talking elderly widow named Marge. Friendly but forgetful — asks callers to repeat themselves, brings up her late husband Frank, mentions her cat Mittens and grandson Kevin. Goal is to keep the scammer on the line as long as possible without giving up any real information.

**Runs on AgentPhone's built-in audio-native LLM** (voiceMode `hosted`) for natural pacing and real backchannels. We do NOT use the per-turn conversation webhook — the `systemPrompt` is baked into the call trigger from `lib/agentphone.ts`.

Triggered by `lib/agentphone.ts` via `POST https://api.agentphone.ai/v1/calls` with the Marge persona as `systemPrompt`.

### Post-call event webhook

After each call ends, AgentPhone fires `agent.call_ended` to our endpoint with the full transcript. We summarize it with OpenAI and write a row to Supabase.

**Configured webhook URL:** `https://scall-seven.vercel.app/api/call-ended`

Set or re-set it with:
```bash
curl -X POST https://api.agentphone.ai/v1/agents/cmp1jolov03ivdex6x7qhaqau/webhook \
  -H "Authorization: Bearer $AGENTPHONE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://scall-seven.vercel.app/api/call-ended"}'
```

Verify with `GET https://api.agentphone.ai/v1/agents/cmp1jolov03ivdex6x7qhaqau/webhook`.

---

## AgentMail — scall@agentmail.to

**Platform:** AgentMail (`agentmail.to`)
**Inbox ID:** `scall@agentmail.to`

Receives forwarded scam emails from victims. Fires a `message.received` webhook to the Vercel endpoint. Also used to send confirmation emails back to victims via `lib/agentmail.ts`.

**Webhook URL:** `https://scall-seven.vercel.app/api/webhook`
**Subscribed events:** `message.received` only

---

## OpenAI — Classifier + Summarizer

Used in two places:

- **`lib/classify.ts`** — given a forwarded email or user-typed scam report, returns `{is_scam, confidence, phone_number, scam_type, reasoning}`. Strict JSON schema mode for guaranteed-parseable output.
- **`lib/summarize.ts`** — given a finished call transcript, returns `{impersonation_target, money_amount, money_amount_text, payment_method, notes}` for the Supabase row.

Default model for both: `gpt-4o-mini`. Override per-file via `OPENAI_CLASSIFY_MODEL` / `OPENAI_SUMMARIZE_MODEL`.

**Required env var:** `OPENAI_API_KEY`.

---

## Supabase — scam_calls table

Partner-built dashboard reads from this. Schema in `README.md`. Insert is done from `lib/supabase.ts` via PostgREST + service_role key (bypasses RLS for writes; anon key with a read policy used for the dashboard).

**Required env vars:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (optional `SUPABASE_TABLE`).
