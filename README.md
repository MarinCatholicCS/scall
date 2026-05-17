# Scall

Scall stalls scam callers. Forward a suspicious email to `scall@agentmail.to` and we'll classify it, call the scammer's number with an AI agent designed to waste their time, and send you a confirmation.

## How it works

1. Victim forwards a scam email to `scall@agentmail.to`
2. AgentMail fires a webhook to the Vercel endpoint
3. OpenAI (`gpt-4o-mini`) classifies the email and extracts the phone number
4. If it's a scam with a callable number:
   - AgentPhone calls the scammer using a confused elderly persona
   - Victim receives a confirmation email

## Stack

- **Vercel** — serverless function hosting
- **OpenAI** (`gpt-4o-mini`) — scam classification
- **AgentMail** — inbound + outbound email (`scall@agentmail.to`)
- **AgentPhone** — outbound call to scammer

## Project structure

```
api/
  webhook.ts       # Main handler — orchestrates the full flow
lib/
  classify.ts      # OpenAI classification → { is_scam, phone_number, scam_type, ... }
  agentphone.ts    # Triggers outbound call via AgentPhone API
  agentmail.ts     # Sends confirmation email via AgentMail API
```

## Environment variables

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | OpenAI API key |
| `AGENTMAIL_API_KEY` | AgentMail API key |
| `AGENTMAIL_INBOX_ID` | AgentMail inbox ID (`scall@agentmail.to`) |
| `AGENTPHONE_API_KEY` | AgentPhone API key |
| `AGENTPHONE_AGENT_ID` | ID of the pre-configured stalling agent |

Copy `.env.example` to `.env.local` and fill in the values.

## Local development

```bash
npm install
vercel dev --listen 3001
```

Test with:

```bash
curl -X POST http://localhost:3001/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "message.received",
    "message": {
      "message_id": "test-123",
      "inbox_id": "scall@agentmail.to",
      "thread_id": "thread-123",
      "from_": "Victim <victim@example.com>",
      "to": "scall@agentmail.to",
      "subject": "URGENT: IRS Final Notice",
      "text": "You owe $3,200 in back taxes. Call 415-488-3120 or be arrested."
    }
  }'
```

## Deploy

```bash
vercel --prod
```

Set the AgentMail webhook URL to `https://scall-seven.vercel.app/api/webhook` and subscribe to the `message.received` event only.
